/**
 * Bar harmony driver (Phase 8). Orchestration only: picks ONE chord per bar
 * by reusing the Phase 4 engines (diatonic pool + 6-dimension scorer +
 * template prior). No scoring logic lives here — only the per-bar context
 * assembly (melody slice, phrase position, history) and the repeat-cap walk
 * (same rule as `progressions.ts`: run < maxConsecutiveRepeats wins).
 */
import { config } from "@/lib/config";
import type { Chord, Confidence, KeyEstimate, NoteEvent } from "@/domain/types";
import {
  chordsEqual,
  degreeOf,
  diatonicPool,
  type HarmonyStyleId,
  type PhrasePosition,
} from "@/features/music/harmony/candidates";
import { scoreAndRank } from "@/features/music/harmony/scoring";
import { makePrior, templatesForStyle } from "@/features/music/harmony/progressions";
import { chordTones } from "@/features/music/theory/chords";
import { scaleContains } from "@/features/music/theory/scales";

export interface BarHarmonyInput {
  key: KeyEstimate;
  scaleId: string;
  melodySlice: NoteEvent[];
  barIndex: number;
  phrasePosition: PhrasePosition;
  style: HarmonyStyleId;
  prevChord?: Chord;
  recentChords: Chord[];
  seed: string | number;
}

export interface BarHarmonyResult {
  chord: Chord;
  confidence: Confidence;
  seed: string;
}

export function scaleIdForKey(key: KeyEstimate): string {
  return key.mode === "minor" ? "natural-minor" : "major";
}

/** First template of the style (deterministic; sessions reproduce). */
export function templateForBar(style: HarmonyStyleId, seed: string | number): string | undefined {
  const templates = templatesForStyle(style);
  if (templates.length === 0) return undefined;
  void seed;
  return templates[0].id;
}

/**
 * Duration-weighted fit (0–1) of `notes` over `chord`: chord tone = 1,
 * in-scale passing tone = `config.harmony.holdScaleToneWeight`, chromatic = 0.
 * Weighting by duration IS the "average" of the voice: vibrato fragments and
 * slides are short, the note the singer actually holds dominates.
 * Returns null with no evidence (silence).
 */
export function chordFit(
  chord: Chord,
  notes: readonly NoteEvent[],
  key: KeyEstimate,
  scaleId: string,
): number | null {
  const tones = new Set<number>(chordTones(chord));
  let total = 0;
  let fit = 0;
  for (const n of notes) {
    const w = Number.isFinite(n.duration) && n.duration > 0 ? n.duration : 0;
    if (w <= 0 || !Number.isFinite(n.midi)) continue;
    const pc = ((Math.round(n.midi) % 12) + 12) % 12;
    total += w;
    if (tones.has(pc)) fit += w;
    else if (scaleContains(key.root, scaleId, pc)) fit += w * config.harmony.holdScaleToneWeight;
  }
  return total > 0 ? fit / total : null;
}

export function chooseChordForBar(input: BarHarmonyInput): BarHarmonyResult {
  // Hold: keep the sounding chord while the voice still fits it (or is
  // silent). The band only moves when the melody clearly leaves the chord —
  // never because a repeat cap or a template says "time to change".
  if (input.prevChord) {
    const fit = chordFit(input.prevChord, input.melodySlice, input.key, input.scaleId);
    if (fit === null || fit >= config.harmony.holdFitMin) {
      return { chord: input.prevChord, confidence: fit ?? 1, seed: String(input.seed) };
    }
  }
  const pool = diatonicPool(input.key);
  const templates = templatesForStyle(input.style);
  const template = templates.find((t) => t.id === templateForBar(input.style, input.seed)) ?? templates[0];
  const prevDegree = input.prevChord ? degreeOf(input.prevChord.root, input.key.root) : null;
  const prior = makePrior({
    template,
    barIndex: input.barIndex,
    style: input.style,
    prevDegree,
    key: input.key,
  });
  const { ranked, seed } = scoreAndRank(
    pool,
    {
      key: input.key,
      scaleId: input.scaleId,
      melody: input.melodySlice,
      barIndex: input.barIndex,
      phrasePosition: input.phrasePosition,
      isDownbeat: true,
      style: input.style,
      prevChord: input.prevChord,
      recentChords: input.recentChords,
    },
    { seed: input.seed, prior },
  );
  const pick = pickWithinRepeatCap(ranked.map((c) => ({ chord: c.chord, score: c.score })), [
    ...input.recentChords,
    ...(input.prevChord ? [input.prevChord] : []),
  ], input.style);
  return { chord: pick.chord, confidence: pick.score, seed };
}

function pickWithinRepeatCap(
  ranked: { chord: Chord; score: number }[],
  history: readonly Chord[],
  style: HarmonyStyleId,
): { chord: Chord; score: number } {
  if (ranked.length === 0) throw new Error("chooseChordForBar needs candidates");
  if ((config.harmony.staticStyles as readonly string[]).includes(style)) return ranked[0];
  const cap = config.harmony.maxConsecutiveRepeats;
  for (const cand of ranked) {
    let run = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (chordsEqual(history[i], cand.chord)) run += 1;
      else break;
    }
    if (run < cap) return cand;
  }
  return ranked[0];
}
