/**
 * Hum-first melody cleanup (pedido do usuário: "uma música de 6 notas
 * identificou mais de 14").
 *
 * The stabilizer emits one note per stable attack — musically correct, but a
 * hummed take is full of *artifacts*: a breath inside a long note, a stop
 * consonant re-articulating the same pitch, one frame of G#4 inside G4.
 * Left alone they turn 6 hummed notes into 14 detected notes, and the band
 * plays things nobody sang.
 *
 * This pass reads the *pattern* of the take (repetition, same-pitch
 * neighbours, short enclosures) and returns the musical count. It is pure —
 * no React, no Web Audio — and only runs on the hum-first path (the reactive
 * live path keeps every note it hears).
 *
 * Pipeline: raw melody → valid/sorted → blips → enclosed flickers →
 * same-pitch fragments → repeated same-pitch notes → musical melody.
 */
import { config } from "@/lib/config";
import type { NoteEvent } from "@/domain/types";

export interface HumCleanupStats {
  /** Notes received. */
  input: number;
  /** Closed notes dropped as too-short/unconvincing flicker. */
  blips: number;
  /** Short notes dropped as a semitone enclosure between equal neighbours. */
  flickers: number;
  /** Same-pitch fragments glued into the note they belong to. */
  merged: number;
  /** Repeated same-pitch re-articulations folded into one sustained note. */
  repeats: number;
  /** Musical notes kept. */
  output: number;
}

export interface HumCleanupResult {
  notes: NoteEvent[];
  stats: HumCleanupStats;
}

/** Duration assumed for a still-open note when it must be measured. */
const OPEN_NOTE_DUR_SEC = 0.25;

function durOf(n: NoteEvent): number {
  return Number.isFinite(n.duration) && n.duration > 0 ? n.duration : 0;
}

function samePitch(a: NoteEvent, b: NoteEvent): boolean {
  return Math.abs(a.midi - b.midi) <= config.recording.humCleanup.samePitchToleranceSt;
}

/**
 * Clean `notes` (raw capture order) into the melody that should become music.
 * Always returns a new array; the input is never mutated.
 */
export function cleanupHummedMelody(notes: readonly NoteEvent[]): HumCleanupResult {
  const opts = config.recording.humCleanup;
  const stats: HumCleanupStats = {
    input: notes.length,
    blips: 0,
    flickers: 0,
    merged: 0,
    repeats: 0,
    output: 0,
  };

  // 1. Valid, ordered. Garbage from a bad frame never reaches the band.
  let list: NoteEvent[] = notes
    .filter((n) => Number.isFinite(n.startTime) && n.startTime >= 0)
    .filter((n) => Number.isFinite(n.midi) && n.midi >= 0 && n.midi <= 127)
    .map((n) => ({ ...n }))
    .sort((a, b) => a.startTime - b.startTime);

  // 2. Blips: a closed note too short to be sung and too weak to be trusted.
  list = list.filter((n) => {
    const d = durOf(n);
    const drop = d > 0 && d < opts.minNoteSec && n.confidence < opts.flickerMinConfidence;
    if (drop) stats.blips += 1;
    return !drop;
  });

  // 3. Enclosed flicker: a short note a semitone away from two equal
  //    neighbours is the classic octave/confusion artifact (G4 → G#4 → G4),
  //    never a deliberate note. Structural evidence, so confidence is moot.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < list.length - 1; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const next = list[i + 1];
      const d = durOf(cur);
      if (!(d > 0 && d <= opts.flickerMaxSec)) continue;
      if (!samePitch(prev, next)) continue;
      const awayFromPrev = Math.abs(cur.midi - prev.midi) > opts.samePitchToleranceSt;
      const awayFromNext = Math.abs(cur.midi - next.midi) > opts.samePitchToleranceSt;
      if (!awayFromPrev || !awayFromNext) continue;
      list.splice(i, 1);
      stats.flickers += 1;
      changed = true;
      break;
    }
  }

  // 4. Glue pass: same pitch re-attacked after a breath/fragment gap is one
  //    musical event. Tight window first (artifact), then the looser
  //    repetition window (the singer simply repeated the note — still one).
  const glue = (entries: NoteEvent[], windowSec: number, bump: () => void): NoteEvent[] => {
    const out: NoteEvent[] = [];
    for (const n of entries) {
      const prev = out[out.length - 1];
      if (prev && samePitch(prev, n)) {
        const prevEnd = prev.startTime + durOf(prev);
        const gap = n.startTime - prevEnd;
        if (gap <= windowSec) {
          const nEnd = n.startTime + (durOf(n) || OPEN_NOTE_DUR_SEC);
          prev.duration = Math.max(durOf(prev), nEnd - prev.startTime);
          prev.velocity = Math.max(prev.velocity, n.velocity);
          prev.confidence = Math.max(prev.confidence, n.confidence);
          bump();
          continue;
        }
      }
      out.push(n);
    }
    return out;
  };

  list = glue(list, opts.mergeGapSec, () => {
    stats.merged += 1;
  });
  list = glue(list, opts.repeatWindowSec, () => {
    stats.repeats += 1;
  });

  // 5. Repositioned to a clean timeline (the play-along builder rebases).
  stats.output = list.length;
  return { notes: list, stats };
}
