/**
 * Stabilized voice readout: which melody note the tuner dials lock to.
 * Pure — no React, no AudioContext. The NoteStabilizer only appends to
 * `melody` on NoteStarted and finalizes duration on NoteEnded, so the last
 * entry with `duration === 0` is the currently sounding stable note.
 * Anything else (empty melody, last note closed) means "no stable pitch" —
 * callers fall back to the raw mic observation or IDLE.
 */
import type { NoteEvent } from "@/domain/types";

export interface StableVoice {
  frequency: number;
  midi: number;
  confidence: number;
  voiced: boolean;
}

const IDLE: StableVoice = { frequency: 0, midi: -1, confidence: 0, voiced: false };

export function stableVoice(melody: readonly NoteEvent[]): StableVoice {
  if (melody.length === 0) return { ...IDLE };
  const last = melody[melody.length - 1];
  if (!last || last.duration !== 0) return { ...IDLE };
  return {
    frequency: last.pitch,
    midi: last.midi,
    confidence: last.confidence,
    voiced: true,
  };
}
