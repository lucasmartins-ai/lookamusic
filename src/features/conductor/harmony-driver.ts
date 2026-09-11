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

export function chooseChordForBar(input: BarHarmonyInput): BarHarmonyResult {
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
