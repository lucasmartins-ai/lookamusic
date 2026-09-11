/**
 * Harmony candidates (Phase 4, §16). Pure — no React, no Web Audio.
 *
 * Pipeline position: key + scale + recent melody + phrase position + style
 * + previous chord → diatonic pool → `scoring.ts` ranks → `ChordCandidate[]`.
 *
 * The pool is deliberately diatonic (never random): 7 triads + V7 in major,
 * the functional minor set (i, ii°, III, iv, v/V, VI, VII, vii°) + V7 in
 * minor. Chromatic extensions (secondary dominants, sus colors) are reserved
 * as pool additions — the scoring dimensions already handle out-of-key tones
 * (functional V in natural minor is the live case), so no interface change
 * is needed when the pool grows.
 */
import type { Chord, ChordQuality, KeyEstimate, NoteEvent, PitchClass } from "@/domain/types";

/** Phase 4 style ids (presets become data in Phase 7; ids are stable). */
export type HarmonyStyleId = "pop" | "folk" | "jazz" | "ambient";

export const HARMONY_STYLES: readonly HarmonyStyleId[] = [
  "pop",
  "folk",
  "jazz",
  "ambient",
] as const;

export const DEFAULT_HARMONY_STYLE: HarmonyStyleId = "pop";

export type HarmonyDimension =
  | "scale"
  | "melody"
  | "function"
  | "voiceLeading"
  | "style"
  | "phrase";

/** Human-readable scoring justification; feeds the Phase 13 education layer. */
export interface HarmonyReason {
  dimension: HarmonyDimension;
  text: string;
}

/** Ranked chord proposal: score ∈ 0–1, higher is better. */
export interface ChordCandidate {
  chord: Chord;
  score: number;
  reasons: HarmonyReason[];
}

export type PhrasePosition = "start" | "middle" | "end";

export interface HarmonyContext {
  key: KeyEstimate;
  scaleId: string;
  /** Recent melody for the bar(s) being harmonized (may be empty). */
  melody: NoteEvent[];
  barIndex: number;
  phrasePosition: PhrasePosition;
  isDownbeat: boolean;
  style: HarmonyStyleId;
  prevChord?: Chord;
  /** Oldest → newest, for repetition tracking (may be empty). */
  recentChords: Chord[];
}

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

/** Semitone offset of a chord root above the key root (0–11). */
export function degreeOf(chordRoot: number, keyRoot: number): number {
  return (((Math.round(chordRoot) - Math.round(keyRoot)) % 12) + 12) % 12;
}

/** Structural equality on root + quality (extensions/inversion ignored). */
export function chordsEqual(a: Chord, b: Chord): boolean {
  return mod12(a.root) === mod12(b.root) && a.quality === b.quality;
}

/** Diatonic triad pool for a key (plus the V7 color). */
export function diatonicPool(key: KeyEstimate): Chord[] {
  const r = key.root;
  const at = (offset: number): PitchClass => mod12(r + offset);
  if (key.mode === "major") {
    const triads: Chord[] = [
      { root: at(0), quality: "major" }, // I
      { root: at(2), quality: "minor" }, // ii
      { root: at(4), quality: "minor" }, // iii
      { root: at(5), quality: "major" }, // IV
      { root: at(7), quality: "major" }, // V
      { root: at(9), quality: "minor" }, // vi
      { root: at(11), quality: "diminished" }, // vii°
    ];
    triads.push({ root: at(7), quality: "dom7" }); // V7 color
    return triads;
  }
  const chords: Chord[] = [
    { root: at(0), quality: "minor" }, // i
    { root: at(2), quality: "diminished" }, // ii°
    { root: at(3), quality: "major" }, // III
    { root: at(5), quality: "minor" }, // iv
    { root: at(7), quality: "minor" }, // v (natural)
    { root: at(7), quality: "major" }, // V (harmonic)
    { root: at(8), quality: "major" }, // VI
    { root: at(10), quality: "major" }, // VII
    { root: at(11), quality: "diminished" }, // vii° (harmonic)
  ];
  chords.push({ root: at(7), quality: "dom7" }); // V7 color
  return chords;
}

/**
 * Candidate pool for a context. v1 = the diatonic pool (style shapes the
 * scores, not the pool); deterministic order (scale degrees ascending, V7
 * last) so seeded tie-breaks are reproducible.
 */
export function generateCandidates(ctx: HarmonyContext): Chord[] {
  return diatonicPool(ctx.key);
}

/** Melody pitch-classes in the context window (order preserved). */
export function melodyPcs(melody: readonly NoteEvent[]): PitchClass[] {
  return melody
    .filter((n) => Number.isFinite(n.midi))
    .map((n) => mod12(n.midi));
}

/** True when `quality` on `degree` is the diatonic spelling (major key). */
export function isDiatonicSpelling(
  degree: number,
  quality: ChordQuality,
  mode: "major" | "minor",
): boolean {
  if (mode === "major") {
    switch (degree) {
      case 0:
      case 5:
      case 7:
        return quality === "major" || quality === "dom7";
      case 2:
      case 4:
      case 9:
        return quality === "minor" || quality === "min7";
      case 11:
        return quality === "diminished";
      default:
        return false;
    }
  }
  switch (degree) {
    case 0:
      return quality === "minor" || quality === "min7";
    case 2:
    case 11:
      return quality === "diminished";
    case 3:
    case 8:
    case 10:
      return quality === "major";
    case 5:
      return quality === "minor" || quality === "min7";
    case 7:
      return quality === "minor" || quality === "major" || quality === "dom7";
    default:
      return false;
  }
}
