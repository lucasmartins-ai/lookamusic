/**
 * PitchDetector interface (§8). Replaceable, pure, synchronous.
 * Implementations must not allocate on the hot path beyond small locals.
 */
import type { PitchObservation } from "@/domain/types";

export interface PitchDetector {
  readonly name: string;
  process(buffer: Float32Array, sampleRate: number): PitchObservation;
  reset(): void;
}

/** Shared RMS helper for voicing gates. */
export function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}
