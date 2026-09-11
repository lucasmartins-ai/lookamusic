/**
 * Looka pitch AudioWorklet processor — dependency-free DSP (§7).
 *
 * Mirrors YinDetector (src/features/pitch/yin.ts):
 * RMS gate → YIN cumulative mean normalized difference over 55–1200 Hz →
 * first dip below threshold refined to its local minimum + parabolic
 * refinement → postMessage({frequency, midiNote, confidence, clarity,
 * timestamp, seq, rms}). One message per 2048-sample block (~43 ms @48k).
 */

// Tunables duplicated from src/lib/config.ts (worklets cannot import TS).
const BLOCK = 2048;
const RMS_GATE = 0.008;
const MIN_FREQ = 55;
const MAX_FREQ = 1200;
const YIN_THRESHOLD = 0.1;

class LookaPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._seq = 0;
    this._acc = new Float32Array(BLOCK);
    this._fill = 0;
    this._diff = null;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      const copy = Math.min(ch.length, BLOCK - this._fill);
      this._acc.set(ch.subarray(0, copy), this._fill);
      this._fill += copy;
      if (this._fill >= BLOCK) {
        this._fill = 0;
        this.port.postMessage(this._analyze(this._acc, sampleRate));
      }
    }
    return true;
  }

  _analyze(buf, sampleRate) {
    const seq = this._seq++;
    const base = { seq, timestamp: currentTime * 1000, rms: 0 };
    let energy = 0;
    for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
    const rms = Math.sqrt(energy / buf.length);
    base.rms = rms;
    if (rms < RMS_GATE) return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };

    const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
    const maxLag = Math.min(Math.floor(buf.length / 2), Math.ceil(sampleRate / MIN_FREQ));
    const n = buf.length;

    // YIN Pass 1: difference function + cumulative mean normalized difference
    if (!this._diff || this._diff.length < maxLag + 2) {
      this._diff = new Float32Array(maxLag + 2);
    }
    const diff = this._diff;
    diff[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < n; i++) {
        const d = buf[i] - buf[i + lag];
        sum += d * d;
      }
      running += sum;
      diff[lag] = running === 0 ? 0 : (sum * lag) / running;
    }
    if (running === 0) return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };

    // YIN Pass 2: find first dip below YIN_THRESHOLD, then follow to local minimum (Aubio/de Cheveigne)
    let tau = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (diff[lag] < YIN_THRESHOLD) {
        let local = lag;
        while (local + 1 <= maxLag && diff[local + 1] < diff[local]) local++;
        tau = local;
        break;
      }
    }
    if (tau < 0) {
      let best = minLag;
      for (let lag = minLag + 1; lag <= maxLag; lag++) {
        if (diff[lag] < diff[best]) best = lag;
      }
      if (diff[best] > 0.5) return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };
      tau = best;
    }

    // Parabolic interpolation around tau for sub-sample accuracy
    let refined = tau;
    if (tau > 0 && tau < maxLag) {
      const x0 = tau - 1;
      const x2 = tau + 1;
      const y0 = diff[x0];
      const y1 = diff[tau];
      const y2 = diff[x2];
      const denom = y0 + y2 - 2 * y1;
      if (Math.abs(denom) > 1e-9) {
        refined = tau + ((y0 - y2) / (2 * denom)) * 0.5;
      }
    }

    const frequency = sampleRate / refined;
    if (frequency < MIN_FREQ || frequency > MAX_FREQ) {
      return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };
    }
    const midiNote = 69 + 12 * (Math.log(frequency / 440) / Math.LN2);
    const clarity = Math.max(0, Math.min(1, 1 - diff[tau]));
    return { ...base, frequency, midiNote, confidence: clarity, clarity };
  }
}

registerProcessor("looka-pitch", LookaPitchProcessor);
registerProcessor("luca-pitch", LookaPitchProcessor);
