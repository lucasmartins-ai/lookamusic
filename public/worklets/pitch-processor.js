/**
 * Looka pitch AudioWorklet processor — dependency-free DSP (§7).
 *
 * Mirrors YinDetector (src/features/pitch/yin.ts):
 * RMS gate → YIN cumulative mean normalized difference over 55–1200 Hz →
 * first dip below threshold refined to its local minimum + parabolic
 * refinement → postMessage({frequency, midiNote, confidence, clarity,
 * timestamp, seq, rms}). One message per 512-sample hop over a sliding
 * 2048-sample window (~11 ms @48k); difference function via FFT.
 */

// Tunables duplicated from src/lib/config.ts (worklets cannot import TS).
const BLOCK = 2048;
// Analysis hop (TDR-22): a 2048 window every 512 samples (~11 ms @48k).
// Non-overlapping 2048 blocks (43 ms) could not see notes under ~200 ms:
// Vocadito note-time accuracy 48.5% → 74.4% with hop 512 + faster stabilizer.
const HOP = 512;
const RMS_GATE = 0.008;
const MIN_FREQ = 55;
const MAX_FREQ = 1200;
const YIN_THRESHOLD = 0.1;
const FFT_SIZE = 4096; // ≥ 2 × BLOCK → linear (not circular) correlation

// In-place radix-2 complex FFT (mirrors fft() in src/features/pitch/yin.ts).
function fft(re, im, inverse) {
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

class LookaPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._seq = 0;
    this._ring = new Float32Array(BLOCK);
    this._write = 0;
    this._filled = 0;
    this._sinceHop = 0;
    this._win = new Float32Array(BLOCK);
    this._diff = new Float32Array(BLOCK);
    this._re = new Float64Array(FFT_SIZE);
    this._im = new Float64Array(FFT_SIZE);
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this._ring[this._write] = ch[i];
        this._write = (this._write + 1) % BLOCK;
      }
      this._filled = Math.min(BLOCK, this._filled + ch.length);
      this._sinceHop += ch.length;
      if (this._filled >= BLOCK && this._sinceHop >= HOP) {
        this._sinceHop = 0;
        // Unroll the ring oldest → newest into the analysis window.
        const head = BLOCK - this._write;
        this._win.set(this._ring.subarray(this._write), 0);
        this._win.set(this._ring.subarray(0, this._write), head);
        this.port.postMessage(this._analyze(this._win, sampleRate));
      }
    }
    return true;
  }

  _analyze(buf, sampleRate) {
    const seq = this._seq++;
    const base = { seq, timestamp: currentTime * 1000, rms: 0 };
    const n = buf.length;
    let energy = 0;
    for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
    const rms = Math.sqrt(energy / n);
    base.rms = rms;
    if (rms < RMS_GATE) return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };

    const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
    const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / MIN_FREQ));

    // YIN difference via FFT autocorrelation: d(τ) = head + tail − 2·acf(τ).
    const re = this._re;
    const im = this._im;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n; i++) re[i] = buf[i];
    fft(re, im, false);
    for (let k = 0; k < FFT_SIZE; k++) {
      re[k] = re[k] * re[k] + im[k] * im[k];
      im[k] = 0;
    }
    fft(re, im, true);
    const diff = this._diff;
    let head = energy;
    let tailCut = 0;
    let running = 0;
    diff[0] = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
      head -= buf[n - lag] * buf[n - lag];
      tailCut += buf[lag - 1] * buf[lag - 1];
      let d = head + (energy - tailCut) - (2 * re[lag]) / FFT_SIZE;
      if (d < 0) d = 0;
      running += d;
      diff[lag] = running === 0 ? 0 : (d * lag) / running;
    }
    if (running === 0) return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };

    // First dip below YIN_THRESHOLD, followed to its local minimum.
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

    // Parabolic vertex for sub-sample accuracy.
    let refined = tau;
    if (tau > 0 && tau < maxLag) {
      const y0 = diff[tau - 1];
      const y1 = diff[tau];
      const y2 = diff[tau + 1];
      const denom = y0 + y2 - 2 * y1;
      if (Math.abs(denom) > 1e-9) refined = tau + (y0 - y2) / (2 * denom);
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
