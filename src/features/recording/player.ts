/**
/**
 * Composition Player — real-time Web Audio playback & auditioning for the Editor.
 * Voices melody + band accompaniment bit-faithfully from a Composition model.
 */
import { config } from "@/lib/config";
import {
  INSTRUMENTS,
  type Chord,
  type Composition,
  type InstrumentId,
  type PitchClass,
} from "@/domain/types";
import { createMasterBus, type VoiceSink } from "@/features/instruments/audio-sink";
import { createInstrumentSink } from "@/features/instruments/sample-voice";
import { getSampleCache } from "@/features/instruments/sample-store";
import { createBand } from "@/features/instruments/registry";
import { barQuarters, METER_44 } from "@/features/music/rhythm/meter";
import {
  planAccordion,
  planBass,
  planDrums,
  planGuitar,
  planPiano,
  planSax,
  planStrings,
  planViolao,
  planViolin,
  type PassageInput,
} from "@/features/instruments/planning";
import { styleDrums } from "@/features/music/arrangement/presets";
import { midiToFreq } from "@/features/pitch/conversions";
import type { InstrumentEngine, MusicalEvent } from "@/features/instruments/types";

const PLAN_OF: Record<InstrumentId, (input: PassageInput, bars: number) => MusicalEvent[]> = {
  drums: planDrums,
  bass: planBass,
  piano: planPiano,
  guitar: planGuitar,
  violao: planViolao,
  strings: planStrings,
  violin: planViolin,
  sax: planSax,
  accordion: planAccordion,
};

export class CompositionPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private band: Record<InstrumentId, InstrumentEngine> | null = null;
  private melodySink: VoiceSink | null = null;
  private isPlaying = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private playStartAudioTime = 0;
  private playDurationSec = 0;

  private ensureAudio(): boolean {
    if (typeof window === "undefined") return false;
    const AC = window.AudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      this.ctx = new AC({ latencyHint: "interactive" } as AudioContextOptions);
      this.master = createMasterBus(this.ctx, this.ctx.destination).input;
      const liveCtx = this.ctx;
      const liveMaster = this.master;
      // Same real-sound path as the live band (samples first, native model
      // as automatic fallback). Before, the hum-first loop was 100% synth.
      const cache = getSampleCache();
      this.band = createBand((id) => createInstrumentSink(liveCtx, liveMaster, id, cache));
      // Guide melody on the real piano, under the singer (was a sawtooth lead).
      this.melodySink = createInstrumentSink(liveCtx, liveMaster, "piano", cache);
      this.melodySink.setVolume(config.recording.guideMelodyVolume);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return true;
  }

  /**
   * Preview a single note instantly (for timeline clicking, pitch editing).
   */
  previewNote(midi: number, durSec = 0.35): void {
    if (!this.ensureAudio() || !this.melodySink || !this.ctx) return;
    const at = this.ctx.currentTime + 0.01;
    const freq = midiToFreq(midi);
    this.melodySink.tone({
      freq,
      at,
      dur: durSec,
      velocity: 0.85,
      type: "triangle",
      attack: 0.01,
      release: 0.08,
      cutoff: 2400,
      detune: 4,
      octaveGain: 0.2,
    });
  }

  /**
   * Play the full composition (melody + band accompaniment).
   * `opts.melody=false` (hum-first loop): band only — the singer IS the
   * melody, and replaying the captured notes over the live voice doubled every
   * detection slip as "notas sem relação" (TDR-23).
   */
  play(
    comp: Composition,
    onProgress: (currentSec: number) => void,
    onEnded: () => void,
    opts: { melody?: boolean; loop?: boolean } = {},
  ): boolean {
    if (!this.ensureAudio() || !this.ctx || !this.band || !this.melodySink) return false;
    this.stop();

    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.08;
    this.playStartAudioTime = t0;
    this.isPlaying = true;
    this.playDurationSec = this.scheduleOnce(comp, t0, opts.melody !== false);

    // Loop (hum-first): the next pass is scheduled on the AUDIO clock exactly
    // where this one ends, ahead of time — no stop(), no gap. Before, a 40 ms
    // timer stopped everything (cutting cymbal tails) and restarted
    // ~40–120 ms late on every lap: a rhythm stumble each loop (TDR-23).
    let nextStart = t0 + this.playDurationSec;
    this.progressInterval = setInterval(() => {
      if (!this.isPlaying) return;
      const elapsed = Math.max(0, ctx.currentTime - this.playStartAudioTime);
      if (opts.loop) {
        if (ctx.currentTime >= nextStart - config.recording.loopScheduleAheadSec) {
          this.scheduleOnce(comp, nextStart, opts.melody !== false);
          nextStart += this.playDurationSec;
        }
        onProgress(elapsed % this.playDurationSec);
        return;
      }
      onProgress(elapsed);
      if (elapsed >= this.playDurationSec) {
        this.stop();
        onEnded();
      }
    }, 40);

    if (!opts.loop) {
      // Stop timer safety guard
      this.stopTimer = setTimeout(() => {
        if (this.isPlaying) {
          this.stop();
          onEnded();
        }
      }, (this.playDurationSec + 0.6) * 1000);
    }

    return true;
  }

  /** Schedule one pass of the song at audio time `t0`; returns its length (s). */
  private scheduleOnce(comp: Composition, t0: number, withMelody: boolean): number {
    if (!this.band || !this.melodySink) return 0;
    const bpm = comp.tempo > 0 ? comp.tempo : config.rhythm.defaultBpm;
    const meter = comp.timeSignature ?? METER_44;
    const barQ = barQuarters(meter);
    const barSec = (barQ * 60) / bpm;

    let maxTime = 4.0;
    for (const note of comp.melody) {
      const end = note.startTime + note.duration;
      if (end > maxTime) maxTime = end;
    }
    const lastChordBar = comp.chords.reduce((m, c) => Math.max(m, c.startBar + c.durationBars), 0);
    // Whole bars only: the loop seam lands on a downbeat.
    const totalBars = Math.max(lastChordBar, Math.ceil(maxTime / barSec));
    const durationSec = totalBars * barSec;

    // 1. Schedule Melody
    for (const note of withMelody ? comp.melody : []) {
      const at = t0 + note.startTime;
      this.melodySink.tone({
        freq: midiToFreq(note.midi),
        at,
        dur: Math.max(0.08, note.duration),
        velocity: note.velocity ?? 0.8,
        type: "triangle", // fallback only — samples play when decoded
        attack: 0.02,
        release: 0.08,
        cutoff: 2800,
        detune: 3,
        octaveGain: 0.25,
      });
    }

    // 2. Schedule Accompaniment per Bar
    const chordMap = new Map<number, Chord>();
    for (const c of comp.chords) {
      for (let b = 0; b < c.durationBars; b++) {
        chordMap.set(c.startBar + b, c.chord);
      }
    }

    const fallbackChord: Chord = { root: (comp.key?.root ?? 0) as PitchClass, quality: comp.key?.mode === "minor" ? "minor" : "major" };

    for (let bar = 0; bar < totalBars; bar++) {
      const chord = chordMap.get(bar) ?? fallbackChord;
      const barStartAudio = t0 + bar * barSec;
      const input: PassageInput = {
        chords: [chord],
        melody: comp.melody.filter((n) => n.startTime >= bar * barSec && n.startTime < (bar + 1) * barSec),
        phraseStarts: [0],
        meter,
        bpm,
        originSec: 0,
        energy01: 0.6,
        density: 0.5,
        style: styleDrums("neutral"),
        barIndex: bar,
      };

      for (const id of INSTRUMENTS) {
        const ch = comp.instruments[id];
        if (ch && ch.muted) continue;
        // Only the song's lineup plays. Before, every instrument without an
        // explicit mute played — the hum-first loop came out as 8 voices
        // (accordion, sax, strings on synth) instead of the core trio.
        if (comp.arrangement?.active && comp.arrangement.active[id] !== true) continue;
        const engine = this.band[id];
        if (!engine) continue;

        if (ch) {
          engine.setVolume(ch.volume);
          engine.setPan(ch.pan);
        }

        const events = PLAN_OF[id](input, 1);
        engine.schedule(events, {
          audioTime: barStartAudio,
          tempo: { estimated: bpm, target: bpm, playback: bpm, confidence: 1 },
          meter,
        });
      }
    }

    return durationSec;
  }

  stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.melodySink?.cancel();
    if (this.band) {
      for (const id of INSTRUMENTS) {
        this.band[id]?.stop();
      }
    }
    this.isPlaying = false;
  }

  dispose(): void {
    this.stop();
    try {
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
