/**
 * Synthetic test signals (§49). Generated in-code — no binary fixtures in git.
 * Sample rate 48 kHz, block 2048 to match the production path.
 */
export const SR = 48000;
export const BLOCK = 2048;

/** Pure sine at freq, optional starting phase. */
export function sine(freq: number, amplitude = 0.5, phase = 0): Float32Array {
  const buf = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    buf[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR + phase);
  }
  return buf;
}

/** Sine with vibrato: rate Hz, depth in fractional frequency (±). */
export function vibrato(freq: number, rate = 5.5, depth = 0.015, amplitude = 0.5): Float32Array {
  const buf = new Float32Array(BLOCK);
  let ph = 0;
  for (let i = 0; i < BLOCK; i++) {
    const f = freq * (1 + depth * Math.sin((2 * Math.PI * rate * i) / SR));
    ph += (2 * Math.PI * f) / SR;
    buf[i] = amplitude * Math.sin(ph);
  }
  return buf;
}

/** Linear chirp (slide) from f0 to f1 across the block. */
export function slide(f0: number, f1: number, amplitude = 0.5): Float32Array {
  const buf = new Float32Array(BLOCK);
  let ph = 0;
  for (let i = 0; i < BLOCK; i++) {
    const f = f0 + ((f1 - f0) * i) / BLOCK;
    ph += (2 * Math.PI * f) / SR;
    buf[i] = amplitude * Math.sin(ph);
  }
  return buf;
}

export function silence(): Float32Array {
  return new Float32Array(BLOCK);
}

/** Deterministic pseudo-noise (seeded LCG) for reproducibility. */
export function noise(amplitude = 0.5, seed = 42): Float32Array {
  const buf = new Float32Array(BLOCK);
  let s = seed;
  for (let i = 0; i < BLOCK; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = amplitude * (s / 0x3fffffff - 1);
  }
  return buf;
}
