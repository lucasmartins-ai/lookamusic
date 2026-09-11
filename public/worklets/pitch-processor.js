/**
 * Looka pitch AudioWorklet processor — dependency-free DSP (§7).
 *
 * Mirrors AutocorrelationDetector (src/features/pitch/autocorrelation.ts):
 * RMS gate → normalized autocorrelation over 55–1200 Hz → parabolic
 * refinement → postMessage({frequency, midiNote, confidence, clarity,
 * timestamp, seq, rms}). One message per 2048-sample block (~43 ms @48k).
 */

// Tunables duplicated from src/lib/config.ts (worklets cannot import TS).
const BLOCK = 2048;
const RMS_GATE = 0.008;
const MIN_FREQ = 55;
const MAX_FREQ = 1200;
const MIN_CONF = 0.25;

class LookaPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._seq = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      // Use the first BLOCK samples of the 128-sample quantum accumulation:
      // AudioWorklet gives 128 frames per call, so accumulate until BLOCK.
      if (!this._acc) {
        this._acc = new Float32Array(BLOCK);
        this._fill = 0;
      }
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
    const maxLag = Math.min(buf.length - 2, Math.ceil(sampleRate / MIN_FREQ));
    const e0 = ac(buf, 0);
    if (e0 <= 1e-9) return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };

    // Peak-picking: o primeiro máximo local acima do limiar é o período.
    // (Paridade com AutocorrelationDetector TS: argmax global erra oitava —
    // a quantização faz o 5º múltiplo correlacionar mais que o período,
    // medido: C#4 colapsava p/ lag 866 em vez de 173 → notas pulando rápido.)
    const corr = new Float32Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      corr[lag] = ac(buf, Math.min(lag, buf.length - 1)) / e0;
    }
    let bestLag = -1;
    for (let lag = minLag + 1; lag <= maxLag; lag++) {
      const c = corr[lag];
      if (c >= MIN_CONF && c >= corr[lag - 1] && c >= corr[lag + 1]) {
        bestLag = lag; // first peak wins
        break;
      }
    }
    if (bestLag < 0) {
      return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };
    }
    const bestCorr = corr[bestLag];
    // Parabolic refinement.
    let refined = bestLag;
    if (bestLag > 1 && bestLag < buf.length - 2) {
      const y0 = ac(buf, bestLag - 1) / e0;
      const y1 = bestCorr;
      const y2 = ac(buf, bestLag + 1) / e0;
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > 1e-9) {
        refined = bestLag + Math.max(-1, Math.min(1, ((y0 - y2) / (2 * denom)) * 0.5));
      }
    }
    const frequency = sampleRate / refined;
    if (frequency < MIN_FREQ || frequency > MAX_FREQ) {
      return { ...base, frequency: -1, midiNote: -1, confidence: 0, clarity: 0 };
    }
    const midiNote = 69 + 12 * (Math.log(frequency / 440) / Math.LN2);
    const conf = Math.max(0, Math.min(1, bestCorr));
    return { ...base, frequency, midiNote, confidence: conf, clarity: conf };
  }
}

function ac(buf, lag) {
  let sum = 0;
  const n = buf.length - lag;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i + lag];
  return sum / n;
}

registerProcessor("looka-pitch", LookaPitchProcessor);
registerProcessor("luca-pitch", LookaPitchProcessor);
