/**
 * Progression engine (Phase 4, §18). Pure — no React, no Web Audio.
 *
 * Templates are *priors, never cages*: they bias the scorer toward familiar
 * motion (I–V–vi–IV…) but melody evidence can always outvote them. The
 * per-style transition matrix captures the same idea step-by-step
 * (V wants I, vii° wants I). Generation proposes 1–4+ bar continuations and
 * re-harmonizes recorded melodies (the editor's "regenerate accompaniment"
 * calls `generateAccompaniment`).
 *
 * Depends on candidates + scoring (one-directional; scoring never imports
 * here — it receives priors as a callback).
 */
import { newId } from "@/lib/ids";
import { config } from "@/lib/config";
import { getFunction } from "../theory/functions";
import type { Chord, ChordEvent, Confidence, KeyEstimate, NoteEvent } from "@/domain/types";
import {
  chordsEqual,
  degreeOf,
  diatonicPool,
  generateCandidates,
  type HarmonyStyleId,
} from "./candidates";
import { createRng, scoreAndRank } from "./scoring";

/** Familiar motion as bias: scale-degree offsets (semitones above key root). */
export interface ProgressionTemplate {
  id: string;
  name: string;
  styles: readonly HarmonyStyleId[];
  degrees: readonly number[];
}

export const TEMPLATES: readonly ProgressionTemplate[] = [
  { id: "pop-punk", name: "I–V–vi–IV", styles: ["pop", "folk"], degrees: [0, 7, 9, 5] },
  { id: "sensitive", name: "vi–IV–I–V", styles: ["pop"], degrees: [9, 5, 0, 7] },
  { id: "folk-fall", name: "I–iii–IV–V", styles: ["folk"], degrees: [0, 4, 5, 7] },
  { id: "jazz-turn", name: "ii–V–I–vi", styles: ["jazz"], degrees: [2, 7, 0, 9] },
  { id: "static", name: "I (sustained)", styles: ["ambient"], degrees: [0] },
] as const;

/**
 * Transition matrix per style: current degree → next degrees, most expected
 * first. Data, not thresholds (like SCALES/CHORD_INTERVALS in theory).
 */
export const TRANSITION_MATRIX: Record<HarmonyStyleId, Record<number, readonly number[]>> = {
  pop: {
    0: [0, 5, 7, 4, 9, 2],
    2: [7, 5],
    4: [5, 9],
    5: [0, 7, 4, 2],
    7: [0, 9, 5, 4],
    9: [5, 2, 4, 7],
    11: [0],
  },
  folk: {
    0: [0, 5, 7, 4, 9],
    2: [7, 5],
    4: [5, 7],
    5: [0, 7, 4],
    7: [0, 4, 5],
    9: [5, 4],
    11: [0],
  },
  jazz: {
    0: [2, 4, 9, 5],
    2: [7, 0],
    4: [2, 5],
    5: [7, 0, 2],
    7: [0, 9, 2],
    9: [2, 5],
    11: [0, 7],
  },
  ambient: {
    0: [0, 5, 9],
    2: [0],
    4: [0],
    5: [0, 5],
    7: [0],
    9: [0, 9],
    11: [0],
  },
};

/** Templates available to a style (fallback: every template). */
export function templatesForStyle(style: HarmonyStyleId): ProgressionTemplate[] {
  const mine = TEMPLATES.filter((t) => (t.styles as readonly string[]).includes(style));
  return mine.length > 0 ? [...mine] : [...TEMPLATES];
}

const MAJOR_ROMAN: Record<string, string> = {
  "0:major": "I",
  "2:minor": "ii",
  "4:minor": "iii",
  "5:major": "IV",
  "7:major": "V",
  "7:dom7": "V7",
  "9:minor": "vi",
  "11:diminished": "vii°",
};

const MINOR_ROMAN: Record<string, string> = {
  "0:minor": "i",
  "0:min7": "i7",
  "2:diminished": "ii°",
  "3:major": "III",
  "5:minor": "iv",
  "7:minor": "v",
  "7:major": "V",
  "7:dom7": "V7",
  "8:major": "VI",
  "10:major": "VII",
  "11:diminished": "vii°",
};

/** Chord → roman numeral in a key ("?" when the spelling is non-diatonic). */
export function chordToRoman(chord: Chord, key: KeyEstimate): string {
  const table = key.mode === "major" ? MAJOR_ROMAN : MINOR_ROMAN;
  return table[`${degreeOf(chord.root, key.root)}:${chord.quality}`] ?? "?";
}

/** Chord sequence → roman analysis (e.g. G–D–Em–C in G → I–V–vi–IV). */
export function analyzeProgression(chords: readonly Chord[], key: KeyEstimate): string[] {
  return chords.map((c) => chordToRoman(c, key));
}

/** Transition expectation 0–1: listed early → high, unlisted → low. */
export function transitionPrior(
  style: HarmonyStyleId,
  prevDegree: number | null,
  degree: number,
): number {
  if (prevDegree === null) return 0.5;
  const list = TRANSITION_MATRIX[style][prevDegree];
  if (!list) return 0.3;
  const idx = list.indexOf(degree);
  if (idx === 0) return 1;
  if (idx === 1) return 0.7;
  if (idx === 2) return 0.5;
  if (idx > 2) return 0.4;
  return 0.2;
}

/**
 * Combined prior: template expectation for this bar position × transition
 * expectation from the previous degree. Both are advice; the scorer (with
 * melody + repetition) makes the call.
 */
export function makePrior(opts: {
  template: ProgressionTemplate;
  barIndex: number;
  style: HarmonyStyleId;
  prevDegree: number | null;
  key: KeyEstimate;
}): (chord: Chord) => number {
  const expected = opts.template.degrees[opts.barIndex % opts.template.degrees.length];
  return (chord: Chord) => {
    const degree = degreeOf(chord.root, opts.key.root);
    const templateScore = degree === expected ? 1 : 0.4;
    const transitionScore = transitionPrior(opts.style, opts.prevDegree, degree);
    return (templateScore + transitionScore) / 2;
  };
}

export interface ContinuationOptions {
  key: KeyEstimate;
  scaleId: string;
  /** Melody slices per bar (index 0 = first generated bar). */
  melodyPerBar: NoteEvent[][];
  style: HarmonyStyleId;
  /** Chords before the generated passage (repetition + transition context). */
  precedingChords?: Chord[];
  /** Template override (default: seeded pick among the style's templates). */
  templateId?: string;
  seed?: string | number;
  startBar?: number;
}

export interface Continuation {
  chords: Chord[];
  /** Per-bar confidence (top candidate score). */
  confidences: Confidence[];
  template: ProgressionTemplate;
  /** Seed per bar (log for reproducible sessions). */
  seeds: string[];
  analysis: string[];
}

/**
 * Propose a 1–4+ bar continuation. Rules that hold unconditionally:
 * - the final bar is restricted to tonic-function chords (finalis);
 * - no pick may exceed `maxConsecutiveRepeats` (next-best wins instead),
 *   except in static styles (ambient sustains by design).
 * Same inputs + seed → identical continuation.
 */
export function proposeContinuations(opts: ContinuationOptions): Continuation {
  const bars = opts.melodyPerBar.length;
  if (bars < 1) throw new Error("proposeContinuations needs at least 1 bar");
  const style = opts.style;
  const fullPool = diatonicPool(opts.key);
  const templates = templatesForStyle(style);
  const template =
    templates.find((t) => t.id === opts.templateId) ??
    templates[Math.floor(createRng(`template-${String(opts.seed ?? "default")}`)() * templates.length)];
  const seedRoot = String(opts.seed ?? `progression-${style}`);
  const history: Chord[] = [...(opts.precedingChords ?? [])];
  const chords: Chord[] = [];
  const confidences: Confidence[] = [];
  const seeds: string[] = [];

  for (let i = 0; i < bars; i++) {
    const isLast = i === bars - 1;
    // Finalis: the closing bar must arrive on tonic function.
    const barPool = isLast
      ? fullPool.filter((c) => getFunction(c, opts.key) === "TONIC")
      : fullPool;
    const effective = barPool.length > 0 ? barPool : fullPool;
    const prevChord = history.length > 0 ? history[history.length - 1] : undefined;
    const prior = makePrior({
      template,
      barIndex: i,
      style,
      prevDegree: prevChord ? degreeOf(prevChord.root, opts.key.root) : null,
      key: opts.key,
    });
    const barSeed = `${seedRoot}-bar${i}`;
    const { ranked, seed } = scoreAndRank(effective, {
      key: opts.key,
      scaleId: opts.scaleId,
      melody: opts.melodyPerBar[i],
      barIndex: (opts.startBar ?? 0) + i,
      phrasePosition: i === 0 ? "start" : isLast ? "end" : "middle",
      isDownbeat: true,
      style,
      prevChord,
      recentChords: history,
    }, { seed: barSeed, prior });
    seeds.push(seed);
    const pick = pickWithinRepeatCap(
      ranked.map((c) => ({ chord: c.chord, score: c.score })),
      history,
      style,
    );
    chords.push(pick.chord);
    confidences.push(pick.score);
    history.push(pick.chord);
  }

  return {
    chords,
    confidences,
    template,
    seeds,
    analysis: analyzeProgression(chords, opts.key),
  };
}

/**
 * First-ranked candidate that does not breach the consecutive-repeat cap.
 * Static styles skip the check (sustain is the idiom). Deterministic: walks
 * the ranked order, so the same ranking always yields the same pick.
 */
function pickWithinRepeatCap(
  ranked: { chord: Chord; score: number }[],
  history: readonly Chord[],
  style: HarmonyStyleId,
): { chord: Chord; score: number } {
  if (ranked.length === 0) throw new Error("pickWithinRepeatCap needs candidates");
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
  return ranked[0]; // degenerate (single-chord pool): cap unenforceable
}

export interface AccompanimentOptions extends ContinuationOptions {
  startBar?: number;
  durationBars?: number;
}

/**
 * Full accompaniment pass over N bars → `ChordEvent[]` (confidence = score).
 * Thin wrapper over `proposeContinuations` that stamps bar numbers + ids;
 * voicings are chosen downstream (`voice-leading.ts`), never here.
 */
export function generateAccompaniment(opts: AccompanimentOptions): ChordEvent[] {
  const startBar = opts.startBar ?? 0;
  const durationBars = opts.durationBars ?? 1;
  const cont = proposeContinuations(opts);
  return cont.chords.map((chord, i) => ({
    id: newId("chord"),
    chord,
    startBar: startBar + i,
    durationBars,
    confidence: cont.confidences[i],
  }));
}

/** Re-export for callers that only need the pool (tests, editor previews). */
export { generateCandidates };
