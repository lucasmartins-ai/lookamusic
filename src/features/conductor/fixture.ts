/**
 * Synthetic voice fixture (Phase 8). Drives the conductor without mic
 * hardware: a stable G4 phrase (the §9 fixture shape) as PitchObservations
 * plus a matching RMS envelope. Used by vitest, the `/session?fixture=g4`
 * path, and Playwright (no mic in CI).
 */
import { midiToFreq } from "@/features/pitch/conversions";
import type { PitchObservation } from "@/domain/types";

export const FIXTURE_G4_MIDI = 67;

/** Stable G4 observations from t0..t1 every stepMs (conf 0.9). */
export function g4Observations(t0Ms: number, t1Ms: number, stepMs = 20): PitchObservation[] {
  const out: PitchObservation[] = [];
  for (let t = t0Ms; t <= t1Ms; t += stepMs) {
    out.push({
      frequency: midiToFreq(FIXTURE_G4_MIDI),
      midiNote: FIXTURE_G4_MIDI,
      confidence: 0.9,
      clarity: 0.9,
      timestamp: t,
    });
  }
  return out;
}

/** Unvoiced gap (silence) observations. */
export function silenceObservations(t0Ms: number, t1Ms: number, stepMs = 20): PitchObservation[] {
  const out: PitchObservation[] = [];
  for (let t = t0Ms; t <= t1Ms; t += stepMs) {
    out.push({ frequency: -1, midiNote: -1, confidence: 0, clarity: 0, timestamp: t });
  }
  return out;
}

/** C–E–G arpeggio (C major tell) for key/chord tests. */
export function cMajorArpeggio(t0Ms: number, noteMs = 500, gapMs = 60): PitchObservation[] {
  const midis = [60, 64, 67];
  const out: PitchObservation[] = [];
  let t = t0Ms;
  for (const m of midis) {
    for (let k = 0; k < noteMs; k += 20) {
      out.push({
        frequency: midiToFreq(m),
        midiNote: m,
        confidence: 0.9,
        clarity: 0.9,
        timestamp: t + k,
      });
    }
    t += noteMs;
    for (let k = 0; k < gapMs; k += 20) {
      out.push({ frequency: -1, midiNote: -1, confidence: 0, clarity: 0, timestamp: t + k });
    }
    t += gapMs;
  }
  return out;
}

/** RMS envelope matching a voiced phrase (0.2) with silence (0.0). */
export function rmsForVoiced(voiced: boolean): number {
  return voiced ? 0.2 : 0.0;
}
