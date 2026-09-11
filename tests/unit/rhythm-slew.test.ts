/**
 * Phase 5 slew contract: violent estimate jumps (82→105→71→96) must reach
 * playback as glides — every tick moves ≤ tempoSlewPerSec × dt on BOTH
 * stages (estimated→target→playback). Run: npm test -- rhythm-slew
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { TempoState } from "@/domain/types";
import { TempoEstimator } from "@/features/music/rhythm/tempo";

const SLEW = config.rhythm.tempoSlewPerSec; // 8 BPM/s
const STEP_MS = 50;
const EPS = 1e-9;

function harness() {
  const bus = new EventBus();
  const tempo = new TempoEstimator(bus);
  const updates: TempoState[] = [];
  bus.on("TempoUpdated", (t) => updates.push({ ...t }));
  return { tempo, updates };
}

/** Hold one estimate for `ms`, ticking every STEP_MS; returns playbacks. */
function hold(h: ReturnType<typeof harness>, estimate: number, fromMs: number, ms: number): { playbacks: number[]; targets: number[]; endMs: number } {
  h.tempo.injectEstimate(estimate);
  const playbacks: number[] = [];
  const targets: number[] = [];
  let t = fromMs;
  const end = fromMs + ms;
  while (t < end) {
    t += STEP_MS;
    const s = h.tempo.tick(t);
    playbacks.push(s.playback);
    targets.push(s.target);
  }
  return { playbacks, targets, endMs: t };
}

function assertSlewBound(values: number[], stepSec: number): void {
  for (let i = 1; i < values.length; i++) {
    expect(Math.abs(values[i] - values[i - 1])).toBeLessThanOrEqual(SLEW * stepSec + EPS);
  }
}

describe("violent estimate sequence never snaps", () => {
  it("82→105→71→96: every playback step respects the slew bound", () => {
    const h = harness();
    h.tempo.tick(0);
    // Settle at 82 first.
    let now = hold(h, 82, 0, 2000).endMs;
    expect(h.tempo.state().playback).toBeCloseTo(82, 0);

    const all: number[] = [h.tempo.state().playback];
    for (const est of [105, 71, 96]) {
      const r = hold(h, est, now, 2000);
      now = r.endMs;
      all.push(...r.playbacks);
    }
    assertSlewBound(all, STEP_MS / 1000);
    // No single jump anywhere near the raw estimate gaps (23–34 BPM).
    let maxJump = 0;
    for (let i = 1; i < all.length; i++) maxJump = Math.max(maxJump, Math.abs(all[i] - all[i - 1]));
    expect(maxJump).toBeLessThanOrEqual(SLEW * (STEP_MS / 1000) + EPS);
  });

  it("a single 50 ms tick after inject(105) moves playback ≤ one step", () => {
    const h = harness();
    h.tempo.tick(0);
    hold(h, 82, 0, 2000);
    const before = h.tempo.state().playback;
    h.tempo.injectEstimate(105);
    const after = h.tempo.tick(2050).playback;
    expect(after - before).toBeLessThanOrEqual(SLEW * 0.05 + EPS);
    expect(after).toBeLessThan(90); // nowhere near 105
  });

  it("playback chases target (second damper): target leads, playback follows", () => {
    const h = harness();
    h.tempo.tick(0);
    hold(h, 82, 0, 2000);
    h.tempo.injectEstimate(120);
    const s = h.tempo.tick(2050);
    // Both moved toward 120, target at least as far as playback.
    expect(s.target).toBeGreaterThan(82);
    expect(s.playback).toBeGreaterThanOrEqual(82);
    expect(s.playback).toBeLessThanOrEqual(s.target);
  });

  it("converges to the final estimate when held", () => {
    const h = harness();
    h.tempo.tick(0);
    let now = hold(h, 82, 0, 2000).endMs;
    for (const est of [105, 71, 96]) now = hold(h, est, now, 2000).endMs;
    now = hold(h, 96, now, 15000).endMs;
    expect(h.tempo.state().playback).toBeCloseTo(96, 0);
    expect(h.tempo.state().target).toBeCloseTo(96, 0);
    void now;
  });
});

describe("injectEstimate + helpers", () => {
  it("clamps to the musical range and ignores NaN", () => {
    const h = harness();
    h.tempo.injectEstimate(400);
    expect(h.tempo.state().estimated).toBe(config.rhythm.maxBpm);
    h.tempo.injectEstimate(-20);
    expect(h.tempo.state().estimated).toBe(config.rhythm.minBpm);
    h.tempo.injectEstimate(NaN);
    expect(h.tempo.state().estimated).toBe(config.rhythm.minBpm);
  });

  it("beatSec follows playback (60 / playback)", () => {
    const h = harness();
    h.tempo.tick(0);
    hold(h, 120, 0, 12000);
    expect(h.tempo.beatSec()).toBeCloseTo(0.5, 1);
  });

  it("onsetDensity: 0 without data, ~0.5 at 2 onsets/sec, 1 at full rate", () => {
    const h = harness();
    expect(h.tempo.onsetDensity()).toBe(0);
    // 2 onsets/sec for 4 s → 2/3 of full rate.
    for (let i = 0; i < 9; i++) h.tempo.addOnset(i * 0.5);
    expect(h.tempo.onsetDensity()).toBeCloseTo(2 / 3, 1);
    h.tempo.reset();
    // ~3.3 onsets/sec (above the flam guard, below maxBpm) → full density.
    for (let i = 0; i < 14; i++) h.tempo.addOnset(i * 0.3);
    expect(h.tempo.onsetDensity()).toBeCloseTo(1, 1);
  });
});
