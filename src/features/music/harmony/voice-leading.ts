/**
 * Voice leading (Phase 4, §19). Pure — no React, no Web Audio.
 * Thresholds and range come from `config.harmony` only.
 *
 * Model: 3 voices, close position, inside the instrument tessitura
 * (`voicingMinMidi`–`voicingMaxMidi`). Seventh chords drop the fifth (standard
 * 3-voice reduction), so every voicing has the same voice count and voices
 * align by index. Cost = movement (`movementCostPerSemitone` per semitone) +
 * `parallelPenalty` per parallel 5th/octave pair. Search is greedy for one
 * bar and beam search (width `beamWidth`) for passages; `voicing/optimizer.ts`
 * reserves the upgrade path (LP/DP) behind the same interface.
 */
import { config } from "@/lib/config";
import { chordTones } from "../theory/chords";
import type { Chord } from "@/domain/types";

/** Three MIDI notes, ascending, close position (span < 12 semitones). */
export type Voicing = [number, number, number];

export interface VoicingCost {
  cost: number;
  movement: number;
  parallels: number;
}

function range(): { min: number; max: number } {
  return { min: config.harmony.voicingMinMidi, max: config.harmony.voicingMaxMidi };
}

/**
 * Three pitch-classes to voice: triads as-is; sevenths drop the fifth
 * (keep root color + third + seventh).
 */
function voicePcs(chord: Chord): [number, number, number] {
  const tones = chordTones(chord);
  if (tones.length === 3) return [tones[0], tones[1], tones[2]];
  const root = chord.root % 12;
  const third = tones.find((t) => (t - root + 12) % 12 === 3 || (t - root + 12) % 12 === 4);
  const seventh = tones.find((t) => (t - root + 12) % 12 === 10 || (t - root + 12) % 12 === 11);
  return [root, third ?? tones[1], seventh ?? tones[tones.length - 1]];
}

/**
 * Every close-position voicing of a chord in range. Deterministic order:
 * root position → inversions, low octaves first.
 */
export function voicingCandidates(chord: Chord): Voicing[] {
  const { min, max } = range();
  const [p0, p1, p2] = voicePcs(chord);
  // Inversion rotations as ascending semitone offsets from the bass.
  const rotations: [number, number, number][] = [
    [0, (p1 - p0 + 12) % 12, (p2 - p0 + 12) % 12],
    [0, (p2 - p1 + 12) % 12, (p0 - p1 + 12) % 12],
    [0, (p0 - p2 + 12) % 12, (p1 - p2 + 12) % 12],
  ];
  const bassPcs = [p0, p1, p2];
  const out: Voicing[] = [];
  const seen = new Set<string>();
  rotations.forEach(([o0, o1, o2], inv) => {
    const bassPc = bassPcs[inv];
    // Lowest bass octave whose bass note lands in range.
    for (let bass = min; bass <= max; bass++) {
      if (bass % 12 !== ((bassPc % 12) + 12) % 12) continue;
      const notes: Voicing = [bass + o0, bass + o1, bass + o2];
      if (notes[2] > max) break;
      const key = notes.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(notes);
      }
    }
  });
  return out;
}

/** True when the pair moves in parallel 5ths/octaves (same direction). */
export function isParallelPair(
  prevLow: number,
  prevHigh: number,
  nextLow: number,
  nextHigh: number,
): boolean {
  const pc = (a: number, b: number): number => (((b - a) % 12) + 12) % 12;
  const before = pc(prevLow, prevHigh);
  const after = pc(nextLow, nextHigh);
  if (before !== after || (before !== 0 && before !== 7)) return false;
  const dLow = nextLow - prevLow;
  const dHigh = nextHigh - prevHigh;
  return dLow !== 0 && dHigh !== 0 && Math.sign(dLow) === Math.sign(dHigh);
}

/** Parallel 5th/octave pairs between two voicings (3 pairs for 3 voices). */
export function countParallels(prev: Voicing, next: Voicing): number {
  let n = 0;
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (const [i, j] of pairs) {
    if (isParallelPair(prev[i], prev[j], next[i], next[j])) n += 1;
  }
  return n;
}

/** Cost of moving from `prev` (null = first bar) to `next`. */
export function voicingCost(next: Voicing, prev: Voicing | null): VoicingCost {
  if (!prev) return { cost: 0, movement: 0, parallels: 0 };
  const movement =
    Math.abs(next[0] - prev[0]) + Math.abs(next[1] - prev[1]) + Math.abs(next[2] - prev[2]);
  const parallels = countParallels(prev, next);
  return {
    cost: movement * config.harmony.movementCostPerSemitone + parallels * config.harmony.parallelPenalty,
    movement,
    parallels,
  };
}

/** Greedy: cheapest voicing after `prev` (first minimum in pool order). */
export function chooseVoicing(chord: Chord, prev: Voicing | null): Voicing {
  const pool = voicingCandidates(chord);
  if (pool.length === 0) throw new Error("no voicing in range (check config.harmony tessitura)");
  let best = pool[0];
  let bestCost = voicingCost(best, prev).cost;
  for (let i = 1; i < pool.length; i++) {
    const c = voicingCost(pool[i], prev).cost;
    if (c < bestCost) {
      best = pool[i];
      bestCost = c;
    }
  }
  return best;
}

export interface BeamResult {
  voicings: Voicing[];
  totalCost: number;
  totalMovement: number;
  /** Mean semitone movement per voice per transition (acceptance: < 4). */
  averageMovement: number;
}

/**
 * Beam search (width `beamWidth`) over a chord passage. Same inputs →
 * same voicings (expansion order + first-minimum ties are deterministic).
 */
export function beamSearchVoicings(
  chords: readonly Chord[],
  opts: { width?: number } = {},
): BeamResult {
  if (chords.length === 0) throw new Error("beamSearchVoicings needs at least 1 chord");
  const width = opts.width ?? config.harmony.beamWidth;
  interface State {
    voicings: Voicing[];
    cost: number;
    movement: number;
  }
  let beam: State[] = voicingCandidates(chords[0]).map((v) => ({
    voicings: [v],
    cost: 0,
    movement: 0,
  }));
  beam = beam.slice(0, Math.max(1, width));
  for (let i = 1; i < chords.length; i++) {
    const pool = voicingCandidates(chords[i]);
    const next: State[] = [];
    for (const s of beam) {
      const prev = s.voicings[s.voicings.length - 1];
      for (const v of pool) {
        const c = voicingCost(v, prev);
        next.push({
          voicings: [...s.voicings, v],
          cost: s.cost + c.cost,
          movement: s.movement + c.movement,
        });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    beam = next.slice(0, Math.max(1, width));
  }
  const winner = beam[0];
  const transitions = Math.max(1, chords.length - 1);
  return {
    voicings: winner.voicings,
    totalCost: winner.cost,
    totalMovement: winner.movement,
    averageMovement: chords.length < 2 ? 0 : winner.movement / (transitions * 3),
  };
}
