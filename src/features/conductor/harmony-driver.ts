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

/** Sung pitch as float MIDI: mean Hz when known (keeps the cents), else midi. */
function sungMidi(n: NoteEvent): number {
  if (!(Number.isFinite(n.pitch) && n.pitch > 0)) return n.midi;
  const mf = 69 + 12 * Math.log2(n.pitch / 440);
  // A pitch that disagrees with the note by ≥ 1 st is a placeholder (old
  // saved songs, fixtures), not cents — trust the note then.
  return Math.abs(mf - n.midi) < 1 ? mf : n.midi;
}

/** Interval class in semitones (0–6), float. */
function intervalClass(a: number, b: number): number {
  const d = (((a - b) % 12) + 12) % 12;
  return Math.min(d, 12 - d);
}

/**
 * How well `chord` sits under the voice (duration-weighted, −1…1), from the
 * REAL sung pitch (cents kept): chord tone (≤ `chordToneSt`) = +1, a
 * semitone rub against any chord tone = −1, other consonant tensions =
 * `holdScaleToneWeight`. Duration weighting is the "average" of the voice:
 * vibrato/slides are short. Returns null with no evidence (silence).
 * Rounding to the nearest semitone was the failure mode on real takes: an
 * amateur singer sits ±50¢ between semitones, and the rounded note picked
 * chords that rubbed against what was actually sung.
 */
export function chordFit(chord: Chord, notes: readonly NoteEvent[]): number | null {
  const tones = chordTones(chord);
  const h = config.harmony;
  let total = 0;
  let fit = 0;
  for (const n of notes) {
    const w = Number.isFinite(n.duration) && n.duration > 0 ? n.duration : 0;
    const m = sungMidi(n);
    if (w <= 0 || !Number.isFinite(m)) continue;
    total += w;
    const ics = tones.map((t) => intervalClass(m, t));
    if (ics.some((ic) => ic <= h.chordToneSt)) fit += w;
    else if (ics.some((ic) => ic >= h.rubMinSt && ic <= h.rubMaxSt)) fit -= w;
    else fit += w * h.holdScaleToneWeight;
  }
  return total > 0 ? fit / total : null;
}

/**
 * Ambiguous evidence (one held note fits I, iii and vii°) should land on the
 * chords a band actually plays: I/IV/V (i/iv/v in minor) get the full bonus,
 * the relative (vi / III) half of it, the rest nothing.
 */
function primaryBonus(chord: Chord, key: KeyEstimate): number {
  const d = degreeOf(chord.root, key.root);
  const primary = [0, 5, 7];
  const relative = key.mode === "minor" ? 3 : 9;
  if (primary.includes(d)) return config.harmony.primaryChordBonus;
  if (d === relative) return config.harmony.primaryChordBonus / 2;
  return 0;
}

export function chooseChordForBar(input: BarHarmonyInput): BarHarmonyResult {
  // Silence: hold the sounding chord (nothing new to follow).
  const evidence = input.melodySlice.some((n) => n.duration > 0);
  if (input.prevChord && !evidence) {
    return { chord: input.prevChord, confidence: 1, seed: String(input.seed) };
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
  if (ranked.length === 0) throw new Error("chooseChordForBar needs candidates");
  if (!evidence) return { chord: ranked[0].chord, confidence: ranked[0].score, seed };
  // The voice decides: fit to the real sung pitch dominates, the Phase 4
  // score breaks ties musically, and the sounding chord gets a hold bonus so
  // the band only moves when another chord is clearly better.
  const h = config.harmony;
  let best = ranked[0];
  let bestTotal = -Infinity;
  for (const cand of ranked) {
    const held = input.prevChord && chordsEqual(cand.chord, input.prevChord) ? h.holdBonus : 0;
    const total =
      (chordFit(cand.chord, input.melodySlice) ?? 0) + h.scorerWeight * cand.score + held + primaryBonus(cand.chord, input.key);
    if (total > bestTotal) {
      bestTotal = total;
      best = cand;
    }
  }
  return { chord: best.chord, confidence: best.score, seed };
}

/**
 * Hindsight harmonization of a finished take (hum-first). Every bar is
 * chosen from the notes actually sung INSIDE it (clipped to the bar) — the
 * live path can only use the past, so its chords lag a bar behind the voice.
 * Same scorer + hold rule as live; `melody` is in composition seconds with
 * bar 0 at t = 0.
 */
export function harmonizeTake(
  melody: readonly NoteEvent[],
  key: KeyEstimate,
  barSec: number,
  style: HarmonyStyleId = "pop",
): Chord[] {
  if (!(barSec > 0) || melody.length === 0) return [];
  const scaleId = scaleIdForKey(key);
  const end = Math.max(...melody.map((n) => n.startTime + Math.max(n.duration, 0)));
  const bars = Math.max(1, Math.ceil(end / barSec));
  const out: Chord[] = [];
  for (let b = 0; b < bars; b++) {
    const s = b * barSec;
    const e = s + barSec;
    const slice = melody
      .filter((n) => n.startTime < e && n.startTime + n.duration > s)
      .map((n) => {
        const from = Math.max(n.startTime, s);
        return { ...n, startTime: from, duration: Math.min(n.startTime + n.duration, e) - from };
      });
    const prev = out[out.length - 1];
    const { chord } = chooseChordForBar({
      key,
      scaleId,
      melodySlice: slice,
      barIndex: b,
      phrasePosition: b === bars - 1 ? "end" : b === 0 ? "start" : "middle",
      style,
      prevChord: prev,
      recentChords: out.slice(-4),
      seed: `take-bar${b}`,
    });
    out.push(chord);
  }
  return out;
}
