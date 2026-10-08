/**
 * The mic worklet (plain JS, public/worklets/pitch-processor.js) duplicates
 * YinDetector. Runs the real worklet file in a sandbox and checks: one
 * message per 512-sample hop, and the same pitch as YinDetector on the same
 * 2048 window (TDR-22).
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { YinDetector } from "@/features/pitch/yin";

const SR = 48000;

interface Msg { frequency: number; midiNote: number; clarity: number }

function loadWorklet(): { process: (input: Float32Array) => void; messages: Msg[] } {
  const src = readFileSync("public/worklets/pitch-processor.js", "utf8");
  const messages: Msg[] = [];
  let Ctor: (new () => { process(i: Float32Array[][]): boolean }) | null = null;
  class AudioWorkletProcessor {
    port = { postMessage: (m: Msg) => messages.push(m) };
  }
  vm.runInNewContext(src, {
    AudioWorkletProcessor,
    registerProcessor: (_: string, c: typeof Ctor) => { Ctor = Ctor ?? c; },
    sampleRate: SR,
    currentTime: 0,
    Math, Float32Array, Float64Array,
  });
  const proc = new Ctor!();
  return { process: (q) => proc.process([[q]]), messages };
}

function tone(hz: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.4 * Math.sin((2 * Math.PI * hz * i) / SR) + 0.15 * Math.sin((4 * Math.PI * hz * i) / SR);
  return x;
}

describe("pitch worklet ↔ YinDetector parity", () => {
  it("emits one analysis per 512-sample hop once the 2048 window is full", () => {
    const w = loadWorklet();
    const x = tone(220, 4096);
    for (let i = 0; i < x.length; i += 128) w.process(x.subarray(i, i + 128));
    // Full at 2048, then every 512: 2048, 2560, 3072, 3584, 4096 → 5.
    expect(w.messages.length).toBe(5);
  });

  it.each([110, 196, 261.63, 440, 659.25])("same pitch as YinDetector at %s Hz", (hz) => {
    const w = loadWorklet();
    const x = tone(hz, 2048);
    for (let i = 0; i < x.length; i += 128) w.process(x.subarray(i, i + 128));
    const ref = new YinDetector().process(x, SR);
    const got = w.messages[w.messages.length - 1];
    expect(Math.abs(got.frequency - ref.frequency)).toBeLessThan(1e-3);
    expect(Math.abs(1200 * Math.log2(got.frequency / hz))).toBeLessThan(5);
  });
});
