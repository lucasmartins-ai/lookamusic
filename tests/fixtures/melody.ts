/**
 * Synthetic observation builders for melody-path tests (Phase 2).
 * Observations bypass the detector (tested in Phase 1) and drive
 * smoother → stabilizer → phrases → tempo directly with explicit,
 * deterministic timestamps.
 */
import { midiToFreq } from "@/features/pitch/conversions";
import type { SmoothedObservation } from "@/features/music/melody/smoothing";
import type { PitchObservation } from "@/domain/types";

/** §9 note map: F#4=66, G4=67, G#4=68, A4=69. */
export const F_SHARP_4 = 66;
export const G_4 = 67;
export const G_SHARP_4 = 68;
export const A_4 = 69;

export function rawObs(midiFloat: number, tMs: number, conf = 0.9): PitchObservation {
  return {
    frequency: midiToFreq(midiFloat),
    midiNote: midiFloat,
    confidence: conf,
    clarity: conf,
    timestamp: tMs,
  };
}

export function rawUnvoiced(tMs: number): PitchObservation {
  return { frequency: -1, midiNote: -1, confidence: 0, clarity: 0, timestamp: tMs };
}

export function smObs(midiFloat: number, tMs: number, conf = 0.9): SmoothedObservation {
  return { midiNote: midiFloat, confidence: conf, clarity: conf, timestamp: tMs, voiced: true };
}

export function smUnvoiced(tMs: number): SmoothedObservation {
  return { midiNote: -1, confidence: 0, clarity: 0, timestamp: tMs, voiced: false };
}

/** Feed a constant pitch (or silence when midi is null) every `stepMs`. */
export function feed(
  push: (tMs: number) => void,
  t0: number,
  t1: number,
  stepMs = 20,
): void {
  for (let t = t0; t <= t1; t += stepMs) push(t);
}
