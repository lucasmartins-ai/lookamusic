/**
 * YIN pitch detector (de Cheveigné & Kawahara) — accuracy candidate (§8, TDR-03).
 * Cumulative mean normalized difference + parabolic interpolation.
 */
import { UNVOICED, type PitchObservation } from "@/domain/types";
import { config } from "@/lib/config";
import { freqToMidiFloat } from "./conversions";
import { rms as rmsOf, type PitchDetector } from "./detector";

/**
 * In-place iterative radix-2 complex FFT (re/im split arrays, length = 2^k).
 * `inverse` uses conjugate symmetry; caller divides by n.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k + half] * cr - im[i + k + half] * ci;
        const ai = re[i + k + half] * ci + im[i + k + half] * cr;
        re[i + k + half] = re[i + k] - ar;
        im[i + k + half] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/**
 * YIN difference d(τ) = Σ_{i<n−τ} (x_i − x_{i+τ})², computed exactly as
 * E(head) + E(tail) − 2·acf(τ) with the autocorrelation from one FFT pair:
 * O(n log n) instead of O(n·maxLag) (~20× faster at 2048 — needed to run
 * at hop 512 on the audio thread, TDR-22). Writes d into `out[0..maxLag]`.
 */
export function yinDifference(x: Float32Array, maxLag: number, out: Float32Array, re: Float64Array, im: Float64Array): void {
  const n = x.length;
  re.fill(0);
  im.fill(0);
  for (let i = 0; i < n; i++) re[i] = x[i];
  fft(re, im);
  for (let k = 0; k < re.length; k++) {
    re[k] = re[k] * re[k] + im[k] * im[k];
    im[k] = 0;
  }
  fft(re, im, true);
  const m = re.length;
  // Prefix energy: S[k] = Σ_{i<k} x_i².
  let total = 0;
  for (let i = 0; i < n; i++) total += x[i] * x[i];
  let head = total; // Σ_{i<n−τ} x_i²
  let tailCut = 0; // Σ_{i<τ} x_i²  → tail = total − tailCut
  out[0] = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    head -= x[n - lag] * x[n - lag];
    tailCut += x[lag - 1] * x[lag - 1];
    const d = head + (total - tailCut) - (2 * re[lag]) / m;
    out[lag] = d > 0 ? d : 0;
  }
}

export class YinDetector implements PitchDetector {
  readonly name = "yin";
  private readonly diff: Float32Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(maxBlock = 4096) {
    this.diff = new Float32Array(maxBlock);
    // Zero-padded to ≥ 2× the block so the circular correlation is linear.
    this.re = new Float64Array(maxBlock * 2);
    this.im = new Float64Array(maxBlock * 2);
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
    let size = 1;
    while (size < 2 * n) size <<= 1;
    const re = size === this.re.length ? this.re : new Float64Array(size);
    const im = size === this.im.length ? this.im : new Float64Array(size);
    yinDifference(buffer, maxLag, diff, re, im);
    diff[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      const sum = diff[lag];
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
  // Vertex of the parabola through (τ−1, τ, τ+1). (Was × 0.5 — half the
  // correction, a few cents of bias on every note.)
  return tau + (y0 - y2) / (2 * denom);
}
