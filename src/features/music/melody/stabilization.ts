/**
 * Note stabilization: hysteresis + minimum duration → NoteEvents (Phase 2,
 * §9–10). Pure apart from the injected event bus. Thresholds come from
 * `config.note` only.
 *
 * Pipeline position: SmoothedObservation → NoteStarted/Changed/Ended.
 *
 * Rules:
 * - A candidate pitch must stay within `hysteresisSemitones` of itself and
 *   persist for `stabilityMs` before it becomes a stable note. Brief
 *   excursions (vibrato edge, one-frame G#4 inside G4) never emit.
 * - Leaving the hysteresis band needs `confirmMs` of persistence
 *   (`octaveConfirmMs` for exact ±12 st jumps) before the candidate
 *   switches; unconfirmed wobble never re-arms the window.
 * - Silence (unvoiced) must persist for `stabilityMs + releaseExtraMs`
 *   before the open note closes, so single-frame dropouts and stop
 *   consonants don't split notes. Duration is measured
 *   to the last voiced frame, so it stays exact.
 * - A stable pitch change under continuous voicing is legato: the open note
 *   keeps its id/start and emits NoteChanged. A change after any unvoiced
 *   gap is a re-articulation: NoteEnded + NoteStarted.
 * - Transport seconds = audio-clock ms / 1000. Phase 2 has no separate
 *   transport; the Phase 8 conductor will own the real clock mapping.
 */
import { midiToFreq } from "@/features/pitch/conversions";
import { bus, type EventBus } from "@/lib/events";
import { newId } from "@/lib/ids";
import { config } from "@/lib/config";
import type { Confidence, Hertz, MidiNote, NoteEvent } from "@/domain/types";
import type { SmoothedObservation } from "./smoothing";

interface OpenNote {
  id: string;
  midi: MidiNote;
  startMs: number;
  lastVoicedMs: number;
  /** Mean sounding frequency for the NoteEvent pitch. */
  freqSum: number;
  confSum: number;
  frames: number;
  /** False once any unvoiced frame intervened (re-articulation, not legato). */
  cleanLegato: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class NoteStabilizer {
  private candidateMidi: MidiNote | null = null;
  private candidateSinceMs = 0;
  private candidateConfSum = 0;
  private candidateFrames = 0;
  /**
   * Hotfix voz estável: timestamp do 1º frame consecutivo além da
   * histerese (null dentro da banda). A troca de candidato exige que a
   * excursão persista por `config.note.confirmMs` — vibrato e flicker
   * de oitava breves nunca re-armam a janela, então a nota aberta para
   * de picotar. Em tempo, não em frames: vale em qualquer taxa de
   * observação (worklet ~23 Hz ou testes em 100 ms).
   */
  private awaySinceMs: number | null = null;
  private open: OpenNote | null = null;
  private silenceSinceMs: number | null = null;
  private readonly completed: NoteEvent[] = [];

  constructor(private readonly events: EventBus = bus) {}

  reset(): void {
    this.candidateMidi = null;
    this.awaySinceMs = null;
    this.open = null;
    this.silenceSinceMs = null;
    this.completed.length = 0;
  }

  /** Currently sounding stable note, if any (copy). */
  openNote(): OpenNote | null {
    return this.open ? { ...this.open } : null;
  }

  /** Finished notes, oldest first (copy). */
  completedNotes(): NoteEvent[] {
    return [...this.completed];
  }

  push(sm: SmoothedObservation): void {
    if (!sm.voiced) {
      this.pushSilence(sm.timestamp);
      return;
    }
    this.silenceSinceMs = null;
    const m = Math.round(sm.midiNote);

    if (this.candidateMidi === null) {
      this.startCandidate(m, sm.timestamp, sm.confidence);
    } else if (Math.abs(sm.midiNote - this.candidateMidi) >= config.note.hysteresisSemitones) {
      // Hysteresis trip: needs to persist before it earns its own
      // stability window. The sounding note keeps ringing while the
      // excursion is unconfirmed (no accumulation either side yet).
      if (this.awaySinceMs === null) this.awaySinceMs = sm.timestamp;
      if (this.open) this.open.lastVoicedMs = sm.timestamp;
      if (sm.timestamp - this.awaySinceMs < this.confirmThresholdMs(m)) return;
      this.startCandidate(m, sm.timestamp, sm.confidence);
    } else {
      this.awaySinceMs = null;
      this.candidateConfSum += sm.confidence;
      this.candidateFrames += 1;
    }

    if (this.open) {
      // Sound continues regardless of which candidate is forming.
      this.open.lastVoicedMs = sm.timestamp;
      if (this.candidateMidi === this.open.midi) {
        this.open.freqSum += midiToFreq(sm.midiNote);
        this.open.confSum += sm.confidence;
        this.open.frames += 1;
      } else if (
        this.candidateMidi !== null &&
        sm.timestamp - this.candidateSinceMs >= config.note.stabilityMs
      ) {
        this.commitTransition(sm.timestamp);
      }
    } else if (
      this.candidateMidi !== null &&
      sm.timestamp - this.candidateSinceMs >= config.note.stabilityMs
    ) {
      this.openNote_(
        this.candidateMidi,
        this.candidateSinceMs,
        sm.timestamp,
        this.candidateMeanConf(),
      );
    }
  }

  private startCandidate(m: MidiNote, nowMs: number, conf: Confidence): void {
    this.candidateMidi = m;
    this.candidateSinceMs = nowMs;
    this.candidateConfSum = conf;
    this.candidateFrames = 1;
    this.awaySinceMs = null;
  }

  /**
   * Hotfix voz estável: salto exato de ±12 st contra a nota aberta é o
   * erro de oitava clássico do detector — exige confirmação estendida.
   * Salto cantado de verdade persiste e confirma com atraso; flicker
   * intermitente nunca confirma e a nota se mantém.
   */
  private confirmThresholdMs(m: MidiNote): number {
    const open = this.open?.midi;
    if (open !== undefined && Math.abs(m - open) === 12) {
      return config.note.octaveConfirmMs;
    }
    return config.note.confirmMs;
  }

  private candidateMeanConf(): Confidence {
    return this.candidateFrames > 0 ? this.candidateConfSum / this.candidateFrames : 0;
  }

  /** Open a new stable note backdated to the candidate start (true onset). */
  private openNote_(midi: MidiNote, startMs: number, nowMs: number, conf: Confidence): void {
    const note: OpenNote = {
      id: newId("note"),
      midi,
      startMs,
      lastVoicedMs: nowMs,
      freqSum: midiToFreq(midi),
      confSum: conf,
      frames: 1,
      cleanLegato: true,
    };
    this.open = note;
    // duration 0 = still open; finalized on NoteEnded. Timeline grows the block.
    this.events.emit("NoteStarted", {
      id: note.id,
      pitch: midiToFreq(midi),
      midi,
      startTime: startMs / 1000,
      duration: 0,
      velocity: clamp01(conf),
      confidence: clamp01(conf),
      source: "voice",
    });
  }

  /**
   * A new pitch stabilized while a note is open. Continuous voicing =
   * legato glide (NoteChanged, identity preserved); any unvoiced gap since
   * the open note's last update = re-articulation (Ended + Started).
   */
  private commitTransition(nowMs: number): void {
    const open = this.open;
    const next = this.candidateMidi;
    if (!open || next === null) return;
    const conf = clamp01(this.candidateMeanConf());
    if (open.cleanLegato) {
      open.midi = next;
      open.freqSum += midiToFreq(next);
      open.confSum += conf;
      open.frames += 1;
      this.events.emit("NoteChanged", { id: open.id, midi: next, confidence: conf });
      // Adopt the new pitch as the running candidate so further drift
      // re-arms from here instead of double-firing.
      this.startCandidate(next, nowMs, conf);
    } else {
      const sinceMs = this.candidateSinceMs;
      this.closeOpen(this.silenceAnchorMs(open));
      this.openNote_(next, sinceMs, nowMs, conf);
    }
  }

  /** Close-time anchor: last voiced frame (exact), never before start. */
  private silenceAnchorMs(open: OpenNote): number {
    return Math.max(open.lastVoicedMs, open.startMs);
  }

  private pushSilence(nowMs: number): void {
    // A pending attack interrupted by silence never existed.
    if (!this.open) {
      this.candidateMidi = null;
      return;
    }
    if (this.silenceSinceMs === null) this.silenceSinceMs = nowMs;
    this.open.cleanLegato = false;
    const closeAfterMs = config.note.stabilityMs + config.note.releaseExtraMs;
    if (nowMs - this.silenceSinceMs >= closeAfterMs) {
      this.closeOpen(this.silenceAnchorMs(this.open));
    }
  }

  private closeOpen(endMs: number): void {
    const open = this.open;
    if (!open) return;
    const duration = Math.max((endMs - open.startMs) / 1000, 0.001);
    const meanConf = clamp01(open.frames > 0 ? open.confSum / open.frames : 0);
    const meanFreq: Hertz =
      open.frames > 0 ? open.freqSum / open.frames : midiToFreq(open.midi);
    this.events.emit("NoteEnded", { id: open.id, duration });
    this.completed.push({
      id: open.id,
      pitch: meanFreq,
      midi: open.midi,
      startTime: open.startMs / 1000,
      duration,
      velocity: clamp01(meanConf),
      confidence: meanConf,
      source: "voice",
    });
    const cap = config.conductor.melodyCap;
    if (this.completed.length > cap) {
      this.completed.splice(0, this.completed.length - cap);
    }
    this.open = null;
    this.candidateMidi = null;
    this.silenceSinceMs = null;
  }
}
