/**
 * Looka Autotune AudioWorklet Processor — Low-latency real-time pitch corrector.
 * Dependency-free DSP running on the Web Audio render thread.
 *
 * Implements a phase-aligned dual-delay crossfading pitch shifter.
 * Window size: 1024–2048 samples (~20–40ms @48kHz) for ultra-low latency.
 */

const BUFFER_SIZE = 4096;
const WINDOW_SIZE = 1024;
const HALF_WINDOW = WINDOW_SIZE / 2;

class LookaAutotuneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BUFFER_SIZE);
    this.writeIndex = 0;
    this.offset1 = 0;
    this.offset2 = HALF_WINDOW;
    this.currentRatio = 1.0;
    this.targetRatio = 1.0;
    this.enabled = false;
    this.amount = 0.85;
    this.speedAlpha = 0.1; // smoothing coefficient

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (typeof data.enabled === "boolean") {
        this.enabled = data.enabled;
      }
      if (typeof data.targetRatio === "number" && Number.isFinite(data.targetRatio)) {
        // Clamp pitch ratio between 0.5 (octave down) and 2.0 (octave up)
        this.targetRatio = Math.max(0.5, Math.min(2.0, data.targetRatio));
      }
      if (typeof data.amount === "number") {
        this.amount = Math.max(0, Math.min(1, data.amount));
      }
      if (typeof data.speedMs === "number") {
        // Compute one-pole smoothing alpha based on speedMs and sampleRate
        if (data.speedMs <= 0) {
          this.speedAlpha = 1.0; // instantaneous (hard robot snap)
        } else {
          const dt = 128 / sampleRate;
          const tau = data.speedMs / 1000;
          this.speedAlpha = Math.min(1.0, dt / (tau + dt));
        }
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inputChannel = input[0];
    const outputChannel = output[0];
    const blockSize = inputChannel.length;

    // Direct passthrough if autotune is disabled
    if (!this.enabled) {
      outputChannel.set(inputChannel);
      return true;
    }

    // Smooth ratio towards target ratio according to speed
    this.currentRatio += (this.targetRatio - this.currentRatio) * this.speedAlpha;

    // Apply pitch correction amount (blend ratio towards 1.0 if amount < 1)
    const effectiveRatio = 1.0 + (this.currentRatio - 1.0) * this.amount;
    const rateDelta = effectiveRatio - 1.0;

    const buf = this.buffer;
    const bufLen = BUFFER_SIZE;

    for (let i = 0; i < blockSize; i++) {
      const sample = inputChannel[i];
      buf[this.writeIndex] = sample;

      // Advance read offsets by rateDelta
      this.offset1 = (this.offset1 + rateDelta) % WINDOW_SIZE;
      if (this.offset1 < 0) this.offset1 += WINDOW_SIZE;

      this.offset2 = (this.offset2 + rateDelta) % WINDOW_SIZE;
      if (this.offset2 < 0) this.offset2 += WINDOW_SIZE;

      // Triangular crossfade window
      const w1 = 1.0 - Math.abs((this.offset1 / HALF_WINDOW) - 1.0);
      const w2 = 1.0 - Math.abs((this.offset2 / HALF_WINDOW) - 1.0);

      // Read positions in circular buffer
      let rPos1 = this.writeIndex - this.offset1;
      while (rPos1 < 0) rPos1 += bufLen;

      let rPos2 = this.writeIndex - this.offset2;
      while (rPos2 < 0) rPos2 += bufLen;

      // Linear interpolation for fractional read index
      const idx1 = Math.floor(rPos1);
      const frac1 = rPos1 - idx1;
      const s1 = buf[idx1] * (1 - frac1) + buf[(idx1 + 1) % bufLen] * frac1;

      const idx2 = Math.floor(rPos2);
      const frac2 = rPos2 - idx2;
      const s2 = buf[idx2] * (1 - frac2) + buf[(idx2 + 1) % bufLen] * frac2;

      outputChannel[i] = s1 * w1 + s2 * w2;

      this.writeIndex = (this.writeIndex + 1) % bufLen;
    }

    return true;
  }
}

registerProcessor("looka-autotune", LookaAutotuneProcessor);
registerProcessor("luca-autotune", LookaAutotuneProcessor);
