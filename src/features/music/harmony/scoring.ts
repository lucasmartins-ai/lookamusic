/**
 * Harmony scoring (Phase 4, §16–17). Pure — no React, no Web Audio.
 * All numbers come from `config.harmony`; styles only override weights.
 *
 * Six dimensions (weights via `getHarmonyWeights(style)`):
 * 1. scale — chord tones inside the key scale (hard penalty out-of-key,
 *    halved for chromatic-tolerant styles such as jazz).
 * 2. melody — per melody pc: chord-tone `melodyChordTone`, scale passing
 *    tone `melodyPassingTone`, chromatic `melodyChromaticPenalty`.
 * 3. function — cadential motion (V→I, vii°→I…) at phrase ends plus an
 *    optional template prior injected by `progressions.ts` (param, so the
 *    dependency stays one-directional: progressions → scoring).
 * 4. voiceLeading — common-tone approximation (exact movement/parallel
 *    costs live in `voice-leading.ts`, which re-ranks voicings, not chords).
 * 5. style — repetition penalty past `maxConsecutiveRepeats` (static styles
 *    such as ambient are exempt).
 * 6. phrase — positional arc: establish tonic at start, cadential arrival
 *    (tonic, half on dominant) at end.
 *
 * Ties break via a seeded PRNG (mulberry32); the seed travels in the result
 * so sessions reproduce exactly. Every candidate carries human-readable
 * `reasons` for the Phase 13 education layer.
 */
import { config } from "@/lib/config";
import { chordName, chordTones, PC_NAMES } from "../theory/chords";
import { getScalePcs } from "../theory/scales";
import { getFunction } from "../theory/functions";
import { semitonesToInterval } from "../theory/intervals";
import type { Chord, PitchClass } from "@/domain/types";
import {
  chordsEqual,
  melodyPcs,
  type ChordCandidate,
  type HarmonyContext,
  type HarmonyDimension,
  type HarmonyReason,
  type HarmonyStyleId,
} from "./candidates";

export interface HarmonyWeights {
  scale: number;
  melody: number;
  function: number;
  voiceLeading: number;
  style: number;
  phrase: number;
}

export interface RankOptions {
  /** Tie-break seed (string or number). Defaults to a deterministic bar key. */
  seed?: string | number;
  /** Template prior from progressions.ts: chord → 0–1 expectation. */
  prior?: (chord: Chord) => number;
}

export interface RankResult {
  ranked: ChordCandidate[];
  /** The seed that produced this order (log it for reproducible sessions). */
  seed: string;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

/** Base weights merged with the per-style override (still sums ≈ 1). */
export function getHarmonyWeights(style: HarmonyStyleId): HarmonyWeights {
  const base = config.harmony.weights;
  const override = config.harmony.styleWeights[style] as Partial<HarmonyWeights>;
  return { ...base, ...override };
}

/** 32-bit hash for string seeds (xmur3-style, deterministic). */
export function hashSeed(seed: string | number): number {
  if (typeof seed === "number") return seed | 0;
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h | 0;
}

/** Seeded PRNG (mulberry32): same seed → same sequence, forever. */
export function createRng(seed: string | number): () => number {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function reason(dimension: HarmonyDimension, text: string): HarmonyReason {
  return { dimension, text };
}

/** Dimension 1: chord tones inside the key scale. */
function scaleDimension(
  chord: Chord,
  ctx: HarmonyContext,
): { score: number; reason: HarmonyReason } {
  const scalePcs = new Set(getScalePcs(ctx.key.root, ctx.scaleId));
  const tones = chordTones(chord);
  const out = tones.filter((t) => !scalePcs.has(t)).length;
  const tolerant = (config.harmony.chromaticTolerantStyles as readonly string[]).includes(
    ctx.style,
  );
  const penalty = config.harmony.outOfKeyPenalty * (tolerant ? 0.5 : 1);
  const score = clamp01(1 - out * penalty);
  const name = chordName(chord);
  return {
    score,
    reason:
      out === 0
        ? reason("scale", `${name} uses only ${ctx.scaleId} tones`)
        : reason(
            "scale",
            `${name} has ${out} tone${out > 1 ? "s" : ""} outside ${ctx.scaleId} (−${(out * penalty).toFixed(2)})`,
          ),
  };
}

type MelodyClass = "chord-tone" | "passing" | "chromatic";

function classifyMelodyPc(
  pc: PitchClass,
  tones: Set<number>,
  scalePcs: Set<number>,
): MelodyClass {
  if (tones.has(pc)) return "chord-tone";
  if (scalePcs.has(pc)) return "passing";
  return "chromatic";
}

/** Dimension 2: melody pcs vs chord tones (+0.3 / +0.1 / −0.2 per note). */
function melodyDimension(
  chord: Chord,
  ctx: HarmonyContext,
): { score: number; reason: HarmonyReason } {
  const pcs = melodyPcs(ctx.melody);
  const name = chordName(chord);
  if (pcs.length === 0) {
    return { score: 0.5, reason: reason("melody", `${name}: no melody yet (neutral)`) };
  }
  const tones = new Set<number>(chordTones(chord));
  const scalePcs = new Set<number>(getScalePcs(ctx.key.root, ctx.scaleId));
  let raw = 0;
  let counts: Record<MelodyClass, number> = { "chord-tone": 0, passing: 0, chromatic: 0 };
  for (const pc of pcs) {
    const cls = classifyMelodyPc(pc, tones, scalePcs);
    counts[cls] += 1;
    raw +=
      cls === "chord-tone"
        ? config.harmony.melodyChordTone
        : cls === "passing"
          ? config.harmony.melodyPassingTone
          : config.harmony.melodyChromaticPenalty;
  }
  const score = clamp01(0.5 + raw / pcs.length);
  // Highlight: first melody chord-tone as interval ("E is the major third of C").
  const hit = pcs.find((pc) => tones.has(pc));
  const detail =
    hit === undefined
      ? `${counts.passing} passing, ${counts.chromatic} chromatic`
      : `melody tone ${PC_NAMES[hit]} is the ${semitonesToInterval((hit - chord.root + 12) % 12).name} of ${name}`;
  return {
    score,
    reason: reason(
      "melody",
      `${name}: ${counts["chord-tone"]}/${pcs.length} melody tones in chord — ${detail}`,
    ),
  };
}

/** Dimension 3: cadential motion + tonic arrival + template prior. */
function functionDimension(
  chord: Chord,
  ctx: HarmonyContext,
  prior?: (chord: Chord) => number,
): { score: number; reason: HarmonyReason } {
  const fn = getFunction(chord, ctx.key);
  const name = chordName(chord);
  let s = 0.5;
  const notes: string[] = [];
  if (ctx.prevChord) {
    const prevFn = getFunction(ctx.prevChord, ctx.key);
    if (prevFn === "DOMINANT" && fn === "TONIC") {
      const bonus =
        config.harmony.cadenceBonus * (ctx.phrasePosition === "end" ? 1 : 0.5);
      s += bonus;
      notes.push(`resolves ${chordName(ctx.prevChord)} (+${bonus.toFixed(2)})`);
    }
  }
  if (ctx.phrasePosition === "end" && fn === "TONIC") {
    s += config.harmony.tonicEndBonus;
    notes.push(`tonic arrival at phrase end (+${config.harmony.tonicEndBonus.toFixed(2)})`);
  }
  if (prior !== undefined) {
    const p = clamp01(prior(chord));
    s = 0.6 * s + 0.4 * p;
    notes.push(`template prior ${p.toFixed(2)}`);
  }
  return {
    score: clamp01(s),
    reason: reason(
      "function",
      notes.length > 0 ? `${name} [${fn}]: ${notes.join("; ")}` : `${name} [${fn}]: no cadential pull`,
    ),
  };
}

/** Dimension 4: common-tone approximation (exact costs: voice-leading.ts). */
function voiceLeadingDimension(
  chord: Chord,
  ctx: HarmonyContext,
): { score: number; reason: HarmonyReason } {
  const name = chordName(chord);
  if (!ctx.prevChord) {
    return { score: 0.5, reason: reason("voiceLeading", `${name}: first chord (neutral)`) };
  }
  const prev = new Set<number>(chordTones(ctx.prevChord));
  const common = chordTones(chord).filter((t) => prev.has(t)).length;
  return {
    score: clamp01(0.5 + common * config.harmony.commonToneBonus),
    reason: reason(
      "voiceLeading",
      common > 0
        ? `${common} common tone${common > 1 ? "s" : ""} with ${chordName(ctx.prevChord)} (smooth)`
        : `no common tones with ${chordName(ctx.prevChord)} (all voices move)`,
    ),
  };
}

/** Dimension 5: repetition penalty past the consecutive-repeat cap. */
function styleDimension(
  chord: Chord,
  ctx: HarmonyContext,
): { score: number; reason: HarmonyReason } {
  const name = chordName(chord);
  if ((config.harmony.staticStyles as readonly string[]).includes(ctx.style)) {
    return { score: 1, reason: reason("style", `${ctx.style} sustains repetition (exempt)`) };
  }
  const history = ctx.prevChord
    ? [...ctx.recentChords, ctx.prevChord]
    : [...ctx.recentChords];
  let run = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (chordsEqual(history[i], chord)) run += 1;
    else break;
  }
  if (run >= config.harmony.maxConsecutiveRepeats) {
    const score = clamp01(1 - config.harmony.repeatPenalty * run);
    return {
      score,
      reason: reason(
        "style",
        `${name} already rang ${run}× in a row (−${(config.harmony.repeatPenalty * run).toFixed(2)})`,
      ),
    };
  }
  return {
    score: 1,
    reason: reason("style", run === 0 ? `${name} is fresh here` : `${name} rang ${run}× (within cap)`),
  };
}

/** Dimension 6: phrase arc — tonic establishment, cadential arrival. */
function phraseDimension(
  chord: Chord,
  ctx: HarmonyContext,
): { score: number; reason: HarmonyReason } {
  const fn = getFunction(chord, ctx.key);
  const name = chordName(chord);
  if (ctx.phrasePosition === "start") {
    const score = fn === "TONIC" ? 0.8 : 0.4;
    return {
      score,
      reason: reason(
        "phrase",
        fn === "TONIC"
          ? `${name} establishes the key at phrase start`
          : `${name} opens away from tonic (color, not anchor)`,
      ),
    };
  }
  if (ctx.phrasePosition === "end") {
    const score = fn === "TONIC" ? 0.9 : fn === "DOMINANT" ? 0.7 : 0.3;
    return {
      score,
      reason: reason(
        "phrase",
        fn === "TONIC"
          ? `${name} closes the phrase on tonic`
          : fn === "DOMINANT"
            ? `${name} leaves the phrase half-closed (semicadence color)`
            : `${name} ends the phrase off-function (weak close)`,
      ),
    };
  }
  return { score: 0.5, reason: reason("phrase", `${name} mid-phrase (neutral)`) };
}

/**
 * Score one chord (unranked). Pure; same inputs → same candidate (the seed
 * only matters for tie-breaks in `scoreAndRank`).
 */
export function scoreChord(
  chord: Chord,
  ctx: HarmonyContext,
  prior?: (chord: Chord) => number,
): ChordCandidate {
  const w = getHarmonyWeights(ctx.style);
  const dims = [
    { w: w.scale, ...scaleDimension(chord, ctx) },
    { w: w.melody, ...melodyDimension(chord, ctx) },
    { w: w.function, ...functionDimension(chord, ctx, prior) },
    { w: w.voiceLeading, ...voiceLeadingDimension(chord, ctx) },
    { w: w.style, ...styleDimension(chord, ctx) },
    { w: w.phrase, ...phraseDimension(chord, ctx) },
  ];
  const score = clamp01(dims.reduce((s, d) => s + d.w * d.score, 0));
  return { chord, score, reasons: dims.map((d) => d.reason) };
}

/**
 * Score + rank a pool, ties broken by the seeded PRNG in deterministic pool
 * order. Same pool + context + seed → identical order, always.
 */
export function scoreAndRank(
  pool: readonly Chord[],
  ctx: HarmonyContext,
  opts: RankOptions = {},
): RankResult {
  const seed = String(opts.seed ?? `harmony-bar${ctx.barIndex}-${ctx.style}`);
  const rng = createRng(seed);
  const scored = pool.map((chord) => ({
    candidate: scoreChord(chord, ctx, opts.prior),
    tie: rng(),
  }));
  scored.sort((a, b) => b.candidate.score - a.candidate.score || b.tie - a.tie);
  return { ranked: scored.map((s) => s.candidate), seed };
}
