/**
 * TempoEstimator: median-IOI estimate + slew-limited target (Phase 2, §20–22).
 * The contract: gradual 82→84 convergence, single-onset spikes never snap
 * the target (never 82→105→71), confidence grows with regular evidence.
 * Run: npm test -- tempo-estimator
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { TempoState } from "@/domain/types";
import { TempoEstimator } from "@/features/music/rhythm/tempo";

const SLEW = config.rhythm.tempoSlewPerSec; // 8 BPM/s

function harness() {
  const bus = new EventBus();
  const tempo = new TempoEstimator(bus);
  const updates: TempoState[] = [];
  bus.on("TempoUpdated", (t) => updates.push({ ...t }));
  return { tempo, updates };
}

/** Onsets at a fixed IOI starting at t=0. */
function steady(h: ReturnType<typeof harness>, bpm: number, count: number): void {
  const ioi = 60 / bpm;
  for (let i = 0; i < count; i++) h.tempo.addOnset(i * ioi);
}

/** Advance the slew clock in steps, collecting target values. */
function advance(h: ReturnType<typeof harness>, fromMs: number, toMs: number, stepMs: number): number[] {
  const targets: number[] = [];
  for (let t = fromMs; t <= toMs; t += stepMs) targets.push(h.tempo.tick(t).target);
  return targets;
}

describe("estimation", () => {
  it("rests at defaultBpm with zero confidence before evidence", () => {
    const { tempo } = harness();
    const s = tempo.state();
    expect(s.estimated).toBe(config.rhythm.defaultBpm);
    expect(s.target).toBe(config.rhythm.defaultBpm);
    expect(s.playback).toBe(s.target); // split exists from day one
    expect(s.confidence).toBe(0);
  });

  it("estimates ~120 BPM from steady half-second onsets", () => {
    const h = harness();
    steady(h, 120, 8);
    const s = h.tempo.tick(10_000);
    expect(s.estimated).toBeCloseTo(120, 0);
    expect(s.confidence).toBeGreaterThan(0.5);
  });

  it("ignores flam double-triggers closer than the fastest beat", () => {
    const h = harness();
    steady(h, 120, 8);
    const before = h.tempo.state().estimated;
    h.tempo.addOnset(7 * 0.5 + 0.05); // 50 ms after the last onset
    expect(h.tempo.state().estimated).toBe(before);
  });
});

describe("slew limiter (no violent snaps)", () => {
  it("glides 82→84 gradually and never overshoots", () => {
    const h = harness();
    steady(h, 82, 8);
    advance(h, 0, 2000, 100); // converge down from default 90
    expect(h.tempo.state().target).toBeCloseTo(82, 6);

    // Singer settles at 84: continue the onset grid at the new pace.
    const ioi82 = 60 / 82;
    const ioi84 = 60 / 84;
    const base = 7 * ioi82;
    for (let i = 1; i <= 8; i++) h.tempo.addOnset(base + i * ioi84);

    const targets = advance(h, 2100, 7100, 100);
    // Gradual: ≤ slew × dt per step (+ float epsilon).
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i] - targets[i - 1]).toBeLessThanOrEqual(SLEW * 0.1 + 1e-9);
    }
    // First step moves only slightly toward 84.
    expect(targets[0]).toBeLessThanOrEqual(82 + SLEW * 0.1 + 1e-9);
    // Converges exactly, never exceeds the estimate.
    expect(targets[targets.length - 1]).toBeCloseTo(84, 6);
    expect(Math.max(...targets)).toBeLessThanOrEqual(84 + 1e-9);
  });

  it("rides through a single onset spike without snapping (never 82→105→71)", () => {
    const h = harness();
    steady(h, 82, 8);
    advance(h, 0, 2000, 100);
    expect(h.tempo.state().target).toBeCloseTo(82, 6);

    const ioi = 60 / 82;
    let t = 7 * ioi;
    // One rushed onset (≈105 BPM momentary pace), then back on grid.
    t += 60 / 105;
    h.tempo.addOnset(t);
    const during = h.tempo.tick(2100).target;
    for (let i = 0; i < 7; i++) {
      t += ioi;
      h.tempo.addOnset(t);
    }
    const after = advance(h, 2200, 3200, 100);
    for (const v of [during, ...after]) {
      expect(Math.abs(v - 82)).toBeLessThan(2); // median rejects the spike
    }
  });

  it("rides through a single late onset (dropout) the same way", () => {
    const h = harness();
    steady(h, 100, 8);
    advance(h, 0, 2000, 100);
    const ioi = 60 / 100;
    let t = 7 * ioi + 2.0; // missed beats: 2 s gap
    h.tempo.addOnset(t);
    const v = h.tempo.tick(2100).target;
    expect(Math.abs(v - 100)).toBeLessThan(4);
  });
});

describe("TempoUpdated emissions", () => {
  it("emits on material change, stays quiet when settled", () => {
    const h = harness();
    steady(h, 120, 8);
    h.tempo.tick(0);
    const first = h.updates.length;
    expect(first).toBeGreaterThanOrEqual(1);
    advance(h, 100, 5000, 100); // converge…
    const settled = h.updates.length;
    advance(h, 5100, 8000, 100); // …then silence: no more emissions
    expect(h.updates.length).toBe(settled);
  });
});
