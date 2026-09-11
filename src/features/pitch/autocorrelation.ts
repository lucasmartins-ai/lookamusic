/**
 * Baseline time-domain autocorrelation detector (§8, TDR-03).
 * Simple + cheap; known octave-error tendency — that is why it is the
 * baseline, not the default. Mirrored in the AudioWorklet (dependency-free).
 */
import { UNVOICED, type PitchObservation } from "@/domain/types";
import { config } from "@/lib/config";
import { freqToMidiFloat } from "./conversions";
import { rms as rmsOf, type PitchDetector } from "./detector";

export class AutocorrelationDetector implements PitchDetector {
  readonly name = "autocorrelation";

  reset(): void {
    // stateless
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
    if (rmsOf(buffer) < config.pitch.rmsGate) return unvoiced;

    const { minFreq, maxFreq } = config.pitch;
    const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
    const maxLag = Math.min(buffer.length - 2, Math.ceil(sampleRate / minFreq));

    // Normalized autocorrelation per lag, computed once.
    // NOTE: global argmax is WRONG here — sample quantization can make the
    // 5th multiple of the period correlate higher than the period itself
    // (measured: C#4 collapsed to lag 866 instead of 173). Peak-picking:
    // the first local maximum above threshold is the period.
    const energy0 = autocorrAt(buffer, 0);
    if (energy0 <= 1e-9) return unvoiced;
    const corr = new Float32Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      corr[lag] = autocorrAt(buffer, Math.min(lag, buffer.length - 1)) / energy0;
    }
    let peakLag = -1;
    for (let lag = minLag + 1; lag <= maxLag; lag++) {
      const c = corr[lag];
      if (c >= config.pitch.minConfidence && c >= corr[lag - 1] && c >= corr[lag + 1]) {
        peakLag = lag; // first peak wins (plateau: its first lag)
        break;
      }
    }
    if (peakLag < 0) return unvoiced;
    const bestCorr = corr[peakLag];

    // Parabolic interpolation around the peak for sub-sample accuracy.
    const refined = refinePeak(buffer, peakLag, energy0);
    const frequency = sampleRate / refined;
    if (frequency < minFreq || frequency > maxFreq) return unvoiced;
    return {
      frequency,
      midiNote: freqToMidiFloat(frequency),
      confidence: clamp01(bestCorr),
      clarity: clamp01(bestCorr),
      timestamp,
    };
  }
}

function autocorrAt(buffer: Float32Array, lag: number): number {
  let sum = 0;
  const n = buffer.length - lag;
  for (let i = 0; i < n; i++) sum += buffer[i] * buffer[i + lag];
  return sum / n;
}

function refinePeak(buffer: Float32Array, lag: number, energy0: number): number {
  if (lag <= 1 || lag >= buffer.length - 2) return lag;
  const y0 = autocorrAt(buffer, lag - 1) / energy0;
  const y1 = autocorrAt(buffer, lag) / energy0;
  const y2 = autocorrAt(buffer, lag + 1) / energy0;
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-9) return lag;
  const shift = ((y0 - y2) / (2 * denom)) * 0.5;
  return lag + Math.max(-1, Math.min(1, shift));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
