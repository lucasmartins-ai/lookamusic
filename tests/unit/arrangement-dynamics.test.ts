/**
 * DynamicsTracker: normalized energy → EnergyChanged (Phase 7, §31).
 * Raw amplitude NEVER drives a gain here — the bus only sees 0–1.
 * Run: npm test -- arrangement-dynamics
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { DynamicsTracker } from "@/features/music/arrangement/dynamics";

function harness() {
  const bus = new EventBus();
  const tracker = new DynamicsTracker(bus);
  const emitted: number[] = [];
  bus.on("EnergyChanged", (p) => emitted.push(p.energy));
  return { tracker, emitted };
}

function drive(t: DynamicsTracker, raw: number, fromMs: number, ms: number, stepMs = 83): number {
  let time = fromMs;
  let last = 0;
  while (time < fromMs + ms) {
    time += stepMs;
    last = t.push(raw, time).energy01;
  }
  return last;
}

describe("normalization (never amplitude → volume)", () => {
  it("silence reads 0 energy, level low", () => {
    const { tracker } = harness();
    const s = tracker.push(0, 0);
    expect(s.energy01).toBe(0);
    expect(s.level).toBe("low");
  });

  it("emitted payload is normalized 0–1, never the raw RMS", () => {
    const { tracker, emitted } = harness();
    tracker.push(50, 0); // absurd mic gain: still ≤ 1 on the bus
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBeLessThanOrEqual(1);
    expect(emitted[0]).toBeGreaterThanOrEqual(0);
    expect(emitted[0]).not.toBe(50);
    expect(emitted[0]).toBe(tracker.snapshot().energy01);
  });

  it("clamps garbage: negative/NaN → silence", () => {
    const { tracker } = harness();
    expect(tracker.push(-0.5, 0).energy01).toBe(0);
    expect(tracker.push(NaN, 83).energy01).toBe(0);
  });
});

describe("levels low/medium/high", () => {
  it("sustained loud converges high; sustained silence falls back to low", () => {
    const { tracker } = harness();
    const loud = drive(tracker, 0.3, 0, 4000);
    expect(loud).toBeGreaterThan(0.8);
    expect(tracker.snapshot().level).toBe("high");
    const quiet = drive(tracker, 0, 4000, 6000);
    expect(quiet).toBe(0);
    expect(tracker.snapshot().level).toBe("low");
  });

  it("level boundaries: low < 1/3 ≤ medium < 2/3 ≤ high", () => {
    expect(DynamicsTracker.levelOf(0)).toBe("low");
    expect(DynamicsTracker.levelOf(0.32)).toBe("low");
    expect(DynamicsTracker.levelOf(0.34)).toBe("medium");
    expect(DynamicsTracker.levelOf(0.65)).toBe("medium");
    expect(DynamicsTracker.levelOf(0.67)).toBe("high");
  });
});

describe("emission discipline (no per-frame spam)", () => {
  it("steady input emits once, then stays quiet", () => {
    const { tracker, emitted } = harness();
    tracker.push(0, 0);
    const n = emitted.length;
    for (let i = 1; i <= 10; i++) tracker.push(0, i * 83);
    expect(emitted.length).toBe(n); // no jitter spam
  });

  it("material movement (≥ energyEmitDelta) re-emits", () => {
    const { tracker, emitted } = harness();
    tracker.push(0, 0);
    const before = emitted.length;
    drive(tracker, 0.3, 83, 4000);
    expect(emitted.length).toBeGreaterThan(before);
    for (const e of emitted) {
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
    expect(config.arrangement.energyEmitDelta).toBeGreaterThan(0);
  });
});
