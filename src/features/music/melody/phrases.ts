/**
 * Phrase tracking: silence-delimited musical sentences (Phase 2, §10).
 * Pure apart from the injected event bus. The only threshold is
 * `config.rhythm.phraseSilenceMs`.
 *
 * Pipeline position: NoteStarted/NoteEnded → PhraseStarted/PhraseEnded.
 * A phrase opens on the first note after silence and closes once no voice
 * has sounded for `phraseSilenceMs`. Density (notes/sec) and contour
 * (rising/falling/arch/flat) are tracked per phrase for the Phase 4/7
 * consumers (harmony re-score, arrangement transitions); the v1 boundary
 * rule is silence, deliberately simple and documented.
 */
import { bus, type EventBus } from "@/lib/events";
import { newId } from "@/lib/ids";
import { config } from "@/lib/config";
import type { MidiNote } from "@/domain/types";

export type PhraseContour = "rising" | "falling" | "arch" | "flat" | "undecided";

export interface PhraseSnapshot {
  id: string;
  /** Transport seconds of the first note. */
  startTime: number;
  /** Transport seconds of the last sound; null while open. */
  endTime: number | null;
  noteCount: number;
  /** Notes per sounding second (0 while empty). */
  density: number;
  contour: PhraseContour;
  startMidi: MidiNote | null;
  lastMidi: MidiNote | null;
}

interface OpenPhrase {
  id: string;
  startTime: number;
  lastSoundMs: number;
  sounding: number;
  noteCount: number;
  startMidi: MidiNote | null;
  lastMidi: MidiNote | null;
  peakMidi: number;
  troughMidi: number;
}

export function describeContour(
  noteCount: number,
  startMidi: MidiNote | null,
  lastMidi: MidiNote | null,
  peakMidi: number,
  troughMidi: number,
): PhraseContour {
  if (noteCount < 1 || startMidi === null || lastMidi === null) return "undecided";
  if (noteCount < 2 || peakMidi - troughMidi < 1) return "flat";
  if (lastMidi > startMidi && peakMidi === lastMidi) return "rising";
  if (lastMidi < startMidi && troughMidi === lastMidi) return "falling";
  return "arch";
}

export class PhraseTracker {
  private open: OpenPhrase | null = null;
  private readonly completed: PhraseSnapshot[] = [];
  private off: (() => void)[] = [];

  constructor(private readonly events: EventBus = bus) {
    this.off = [
      events.on("NoteStarted", (n) => this.onNoteStart(n.startTime, n.midi)),
      events.on("NoteEnded", () => this.onNoteEnd()),
    ];
  }

  /** Detach bus subscriptions (tests / teardown). */
  dispose(): void {
    this.off.forEach((fn) => fn());
    this.off = [];
  }

  reset(): void {
    this.open = null;
    this.completed.length = 0;
  }

  openPhrase(): PhraseSnapshot | null {
    return this.open ? this.snapshot(this.open, null) : null;
  }

  completedPhrases(): PhraseSnapshot[] {
    return [...this.completed];
  }

  /**
   * Advance the silence clock. Call on every observation and on a slow UI
   * tick so an ended session still closes its phrase. While any note is
   * sounding, the silence anchor follows `nowMs`; once all notes ended,
   * silence accumulates until `phraseSilenceMs` closes the phrase with
   * endTime = last sounding moment.
   */
  tick(nowMs: number): void {
    const p = this.open;
    if (!p) return;
    if (p.sounding > 0) {
      p.lastSoundMs = nowMs;
      return;
    }
    if (nowMs - p.lastSoundMs >= config.rhythm.phraseSilenceMs) {
      const endTime = p.lastSoundMs / 1000;
      this.events.emit("PhraseEnded", { id: p.id, startTime: p.startTime, endTime });
      this.completed.push(this.snapshot(p, endTime));
      const cap = config.conductor.phraseCap * 4;
      if (this.completed.length > cap) {
        this.completed.splice(0, this.completed.length - cap);
      }
      this.open = null;
    }
  }

  private onNoteStart(startTime: number, midi: MidiNote): void {
    if (!this.open) {
      const id = newId("phrase");
      this.open = {
        id,
        startTime,
        lastSoundMs: Math.round(startTime * 1000),
        sounding: 0,
        noteCount: 0,
        startMidi: midi,
        lastMidi: midi,
        peakMidi: midi,
        troughMidi: midi,
      };
      this.events.emit("PhraseStarted", { id, startTime });
    }
    const p = this.open;
    p.sounding += 1;
    p.noteCount += 1;
    p.lastMidi = midi;
    if (midi > p.peakMidi) p.peakMidi = midi;
    if (midi < p.troughMidi) p.troughMidi = midi;
  }

  private onNoteEnd(): void {
    const p = this.open;
    if (!p) return;
    p.sounding = Math.max(0, p.sounding - 1);
    // The silence anchor keeps following tick(nowMs) while sounding > 0 and
    // freezes on the last sounding moment afterwards — no timestamp needed
    // in the NoteEnded payload.
  }

  private snapshot(p: OpenPhrase, endTime: number | null): PhraseSnapshot {
    const spanSec = Math.max((this.spanEndMs(p, endTime) - p.startTime * 1000) / 1000, 0.001);
    return {
      id: p.id,
      startTime: p.startTime,
      endTime,
      noteCount: p.noteCount,
      density: p.noteCount / spanSec,
      contour: describeContour(p.noteCount, p.startMidi, p.lastMidi, p.peakMidi, p.troughMidi),
      startMidi: p.startMidi,
      lastMidi: p.lastMidi,
    };
  }

  private spanEndMs(p: OpenPhrase, endTime: number | null): number {
    if (endTime !== null) return endTime * 1000;
    return Math.max(p.lastSoundMs, p.startTime * 1000);
  }
}
