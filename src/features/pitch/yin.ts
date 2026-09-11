/**
 * YIN pitch detector (de Cheveigné & Kawahara) — accuracy candidate (§8, TDR-03).
 * Cumulative mean normalized difference + parabolic interpolation.
 */
import { UNVOICED, type PitchObservation } from "@/domain/types";
import { config } from "@/lib/config";
import { freqToMidiFloat } from "./conversions";
import { rms as rmsOf, type PitchDetector } from "./detector";

export class YinDetector implements PitchDetector {
  readonly name = "yin";
  private readonly diff: Float32Array;

  constructor(maxBlock = 4096) {
    this.diff = new Float32Array(maxBlock);
  }

  reset(): void {
    // stateless per block
  }

  process(buffer: Float32Array, sampleRate: number): PitchObservation {
    const timestamp = performance.now();
    const unvoiced: PitchObservation = {
      frequency: UNVOICED,
      midiNote: UNVOICED,
      confidence: 0,
      clarity: 0,
      timestamp,
    };
    if (buffer.length > this.diff.length) return unvoiced;
    if (rmsOf(buffer) < config.pitch.rmsGate) return unvoiced;

    const { minFreq, maxFreq, yinThreshold } = config.pitch;
    const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
    const maxLag = Math.min(Math.floor(buffer.length / 2), Math.ceil(sampleRate / minFreq));
    const n = buffer.length;

    // Pass 1: difference function + cumulative mean normalization, fully
    // computed BEFORE any peak search (searching incrementally reads
    // uninitialized/stale lags — measured 119-cent errors on pure C4).
    const diff = this.diff;
    diff[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < n; i++) {
        const d = buffer[i] - buffer[i + lag];
        sum += d * d;
      }
      running += sum;
      diff[lag] = running === 0 ? 0 : (sum * lag) / running;
    }
    if (running === 0) return unvoiced;

    // Pass 2 (aubio-style): first dip below threshold, refined to its minimum.
    let tau = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (diff[lag] < yinThreshold) {
        let local = lag;
        while (local + 1 <= maxLag && diff[local + 1] < diff[local]) local++;
        tau = local;
        break;
      }
    }
    if (tau < 0) {
      // No dip: take global minimum if periodic enough, else unvoiced.
      let best = minLag;
      for (let lag = minLag + 1; lag <= maxLag; lag++) {
        if (diff[lag] < diff[best]) best = lag;
      }
      if (diff[best] > 0.5) return unvoiced;
      tau = best;
    }

    const refined = parabolic(diff, tau);
    const frequency = sampleRate / refined;
    if (frequency < minFreq || frequency > maxFreq) return unvoiced;
    const clarity = 1 - Math.max(0, Math.min(1, diff[tau]));
    return {
      frequency,
      midiNote: freqToMidiFloat(frequency),
      confidence: clarity,
      clarity,
      timestamp,
    };
  }
}

function parabolic(diff: Float32Array, tau: number): number {
  if (tau <= 0 || tau >= diff.length - 1) return tau;
  const x0 = tau - 1;
  const x2 = tau + 1;
  const y0 = diff[x0];
  const y1 = diff[tau];
  const y2 = diff[x2];
  const denom = y0 + y2 - 2 * y1;
  if (denom === 0) return tau;
  return tau + ((y0 - y2) / (2 * denom)) * 0.5;
}
