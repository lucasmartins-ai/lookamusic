/**
 * Confidence gate + median smoothing (Phase 2, §9–10).
 * Pure — no React, no Web Audio. Thresholds come from `config.note` only.
 *
 * Pipeline position: PitchObservation (raw, ~23 Hz from the Worklet)
 * → SmoothedObservation → stabilization. The gate drops low-confidence
 * frames so vibrato/wobble never reach the stabilizer as fake movement;
 * the median over `config.note.smoothingWindow` absorbs single-frame
 * spikes (e.g. one G#4 frame inside a G4 note).
 */
import { UNVOICED, type Confidence, type PitchObservation } from "@/domain/types";
import { config } from "@/lib/config";

export interface SmoothedObservation {
  /** Median-filtered fractional MIDI; UNVOICED while the gate is closed. */
  midiNote: number;
  /** Mean confidence of the voiced frames in the window; 0 when unvoiced. */
  confidence: Confidence;
  /** Mean clarity of the voiced frames in the window; 0 when unvoiced. */
  clarity: Confidence;
  /** Passthrough of the input timestamp (audio-clock ms). */
  timestamp: number;
  voiced: boolean;
}

/** Gate: voiced frequency + musical confidence floor. */
export function passesConfidenceGate(obs: PitchObservation): boolean {
  return (
    obs.frequency > 0 &&
    obs.midiNote !== UNVOICED &&
    obs.confidence >= config.note.confidenceThreshold
  );
}

/** Median of a non-empty array (even lengths average the two middles). */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error("median of empty window");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface WindowFrame {
  midi: number;
  confidence: number;
  clarity: number;
}

export class PitchSmoother {
  private window: WindowFrame[] = [];

  get windowSize(): number {
    return config.note.smoothingWindow;
  }

  reset(): void {
    this.window = [];
  }

  /**
   * Push one raw observation. Low-confidence/unvoiced frames close the
   * gate (returned as unvoiced) but do NOT flush the window, so a brief
   * dropout resumes without re-attack latency; a real pitch change still
   * has to survive both the median and the stabilizer's min-duration.
   */
  push(obs: PitchObservation): SmoothedObservation {
    const unvoiced: SmoothedObservation = {
      midiNote: UNVOICED,
      confidence: 0,
      clarity: 0,
      timestamp: obs.timestamp,
      voiced: false,
    };
    if (!passesConfidenceGate(obs)) return unvoiced;
    this.window.push({
      midi: obs.midiNote,
      confidence: obs.confidence,
      clarity: obs.clarity,
    });
    if (this.window.length > this.windowSize) this.window.shift();
    return {
      midiNote: median(this.window.map((f) => f.midi)),
      confidence: mean(this.window.map((f) => f.confidence)),
      clarity: mean(this.window.map((f) => f.clarity)),
      timestamp: obs.timestamp,
      voiced: true,
    };
  }
}
