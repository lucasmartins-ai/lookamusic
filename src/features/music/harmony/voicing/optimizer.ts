/**
 * Voicing optimizer — reserved upgrade path (Phase 4, §19). Pure.
 *
 * Today this delegates to the rule-based beam search in
 * `../voice-leading.ts`. A future LP/DP optimizer lands HERE, behind this
 * exact signature — callers (arrangement, instruments, editor) never change.
 */
import {
  beamSearchVoicings,
  type BeamResult,
} from "../voice-leading";
import type { Chord } from "@/domain/types";

export type { BeamResult };

/** Optimal voicings for a chord passage (see `../voice-leading.ts`). */
export function optimizeVoicings(
  chords: readonly Chord[],
  opts: { width?: number } = {},
): BeamResult {
  return beamSearchVoicings(chords, opts);
}
