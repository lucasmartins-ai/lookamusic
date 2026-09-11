/**
 * Scale registry (Phase 3, §13). Pure — no React, no Web Audio.
 * Data-driven: future modes (dorian…locrian) are new rows in `SCALES`,
 * the API (`scaleContains`, `nearestScaleTone`, `quantizeToScale`,
 * `getScalePcs`) stays unchanged.
 */
import type { MidiNote, PitchClass, Scale } from "@/domain/types";

export const SCALES: readonly Scale[] = [
  { id: "major", name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "natural-minor", name: "Natural minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "harmonic-minor", name: "Harmonic minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: "melodic-minor", name: "Melodic minor (ascending)", intervals: [0, 2, 3, 5, 7, 9, 11] },
] as const;

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

/** Look up a scale by id. @throws on unknown id. */
export function getScale(scaleId: string): Scale {
  const found = SCALES.find((s) => s.id === scaleId);
  if (!found) throw new Error(`unknown scale: ${scaleId}`);
  return { ...found, intervals: [...found.intervals] };
}

/** All registered scales (copies). */
export function listScales(): Scale[] {
  return SCALES.map((s) => ({ ...s, intervals: [...s.intervals] }));
}

/** Pitch-class set of `root` + scale intervals (sorted ascending). */
export function getScalePcs(root: PitchClass, scaleId: string): PitchClass[] {
  const scale = getScale(scaleId);
  return scale.intervals
    .map((i) => (((root + i) % 12 + 12) % 12) as PitchClass)
    .sort((a, b) => a - b);
}

/** True when pitch-class `pc` belongs to the scale on `root`. */
export function scaleContains(root: PitchClass, scaleId: string, pc: number): boolean {
  const pcs = getScalePcs(root, scaleId);
  return pcs.includes(mod12(pc));
}

/**
 * Nearest scale tone to a MIDI note, preserving octave by snapping to the
 * closest scale degree across neighboring octaves. Ties resolve downward
 * (deterministic, no randomness).
 */
export function nearestScaleTone(midi: MidiNote, root: PitchClass, scaleId: string): MidiNote {
  const target = Math.round(midi);
  const pcs = new Set(getScalePcs(root, scaleId));
  if (pcs.has(mod12(target))) return target;
  for (let d = 1; d <= 6; d++) {
    const down = target - d;
    const up = target + d;
    const downHit = pcs.has(mod12(down));
    const upHit = pcs.has(mod12(up));
    if (downHit && upHit) return down; // tie → lower
    if (downHit) return down;
    if (upHit) return up;
  }
  return target; // unreachable for 7-note scales, kept total
}

/**
 * Quantize a MIDI note onto the scale. v1 = snap to `nearestScaleTone`
 * (same deterministic tie rule); later phases may add attraction curves
 * without changing this signature.
 */
export function quantizeToScale(midi: MidiNote, root: PitchClass, scaleId: string): MidiNote {
  return nearestScaleTone(midi, root, scaleId);
}
