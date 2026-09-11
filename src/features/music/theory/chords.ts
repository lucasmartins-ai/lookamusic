/**
 * Chord vocabulary (Phase 3, §15). Pure — no React, no Web Audio.
 * Qualities: major, minor, diminished, augmented, dom7, maj7, min7,
 * sus2, sus4 (extensible union in `src/domain/types.ts`).
 */
import type { Chord, ChordQuality, PitchClass } from "@/domain/types";

/** Semitone stacks per quality, relative to root (sorted). */
export const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

/** Display suffix per quality (sharps; enharmonics deferred to Phase 13). */
const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  diminished: "dim",
  augmented: "aug",
  dom7: "7",
  maj7: "maj7",
  min7: "m7",
  sus2: "sus2",
  sus4: "sus4",
};

export const PC_NAMES: readonly string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

/** Pitch-class set of a chord (root + quality stack, octave-equivalent). */
export function chordTones(chord: Chord): PitchClass[] {
  const stack = CHORD_INTERVALS[chord.quality];
  if (!stack) throw new Error(`unknown chord quality: ${chord.quality}`);
  return stack.map((i) => (((chord.root + i) % 12 + 12) % 12) as PitchClass);
}

/** Display name, e.g. C, Em, Em7, Csus4, Bdim, C7, Cmaj7, Caug. */
export function chordName(chord: Chord): string {
  const suffix = QUALITY_SUFFIX[chord.quality];
  if (suffix === undefined) throw new Error(`unknown chord quality: ${chord.quality}`);
  return `${PC_NAMES[mod12(chord.root)]}${suffix}`;
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/**
 * Analyze a pitch-class set → chord (root + quality) or null when no
 * vocabulary entry matches. Order-independent, duplicates allowed;
 * inversion is ignored (root = acoustic root of the matching stack).
 * 3-note sets try triads/sus, 4-note sets try sevenths; other sizes → null
 * (extensions belong to Phase 4+). Deterministic: candidate roots are
 * tried in ascending pc order, seventh qualities before triads never
 * collide because sizes differ.
 */
export function chordFromPcs(pcs: readonly number[]): Chord | null {
  const uniq = [...new Set(pcs.map(mod12))].sort((a, b) => a - b);
  if (uniq.length !== 3 && uniq.length !== 4) return null;
  const qualities: ChordQuality[] =
    uniq.length === 3
      ? ["major", "minor", "diminished", "augmented", "sus2", "sus4"]
      : ["dom7", "maj7", "min7"];
  for (const root of uniq) {
    const rel = uniq.map((p) => (p - root + 12) % 12);
    for (const q of qualities) {
      if (sameSet(rel, [...CHORD_INTERVALS[q]])) return { root, quality: q };
    }
  }
  return null;
}
