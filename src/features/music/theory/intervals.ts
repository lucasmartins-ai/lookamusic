/**
 * Interval names (Phase 3, §14). Pure — no React, no Web Audio.
 * Thresholds: none (fixed music math). All numbers are definitional.
 *
 * `semitonesToInterval(n)`: 0 = unison … 12 = octave. Compound intervals
 * (n > 12) compose as octave(s) + simple interval, e.g. 16 semitones =
 * "octave + major third" (`P8+M3`). Enharmonic spelling is deferred to
 * Phase 13 (education); the engine works on semitone + pitch-class math.
 */
import type { IntervalInfo } from "@/domain/types";

interface SimpleInterval {
  name: string;
  short: string;
}

/** Chromatic table for one octave (index = semitones % 12). */
const SIMPLE: readonly SimpleInterval[] = [
  { name: "perfect unison", short: "P1" }, // 0
  { name: "minor second", short: "m2" }, // 1
  { name: "major second", short: "M2" }, // 2
  { name: "minor third", short: "m3" }, // 3
  { name: "major third", short: "M3" }, // 4
  { name: "perfect fourth", short: "P4" }, // 5
  { name: "tritone", short: "TT" }, // 6
  { name: "perfect fifth", short: "P5" }, // 7
  { name: "minor sixth", short: "m6" }, // 8
  { name: "major sixth", short: "M6" }, // 9
  { name: "minor seventh", short: "m7" }, // 10
  { name: "major seventh", short: "M7" }, // 11
  { name: "octave", short: "P8" }, // 12
] as const;

/**
 * Semitone distance → interval name. `n` must be a non-negative integer.
 * Compound intervals compose octave(s) + simple remainder:
 * `short` joins with `+` octave-first (`P8+M3`), `name` reads
 * `octave + major third` (pluralized beyond one octave).
 *
 * @throws on negative or non-integer input.
 */
export function semitonesToInterval(n: number): IntervalInfo {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`semitonesToInterval expects a non-negative integer, got ${n}`);
  }
  if (n <= 12) {
    const s = SIMPLE[n];
    return { semitones: n, name: s.name, short: s.short };
  }
  const octaves = Math.floor(n / 12);
  const rem = n % 12;
  if (rem === 0) {
    return {
      semitones: n,
      name: octaves === 1 ? "octave" : `${octaves} octaves`,
      short: octaves === 1 ? "P8" : `${octaves}xP8`,
    };
  }
  const simple = SIMPLE[rem];
  const octaveWord = octaves === 1 ? "octave" : `${octaves} octaves`;
  return {
    semitones: n,
    name: `${octaveWord} + ${simple.name}`,
    short: `${Array(octaves).fill("P8").join("+")}+${simple.short}`,
  };
}

/** Absolute distance between two MIDI notes → interval. */
export function intervalBetweenMidi(a: number, b: number): IntervalInfo {
  return semitonesToInterval(Math.abs(Math.round(b) - Math.round(a)));
}
