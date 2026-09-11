/** Latency tracker + 250 ms budget (Phase 8, measurement not guess). */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { LatencyTracker } from "@/features/conductor/latency";

describe("LatencyTracker", () => {
  it("pairs voice → accompaniment deltas", () => {
    const t = new LatencyTracker();
    t.markVoice(1000);
    t.markAccompaniment(1080);
    expect(t.count()).toBe(1);
    expect(t.p50()).toBeCloseTo(80, 9);
    expect(t.max()).toBeCloseTo(80, 9);
  });

  it("ignores accompaniment without a preceding voice", () => {
    const t = new LatencyTracker();
    t.markAccompaniment(500);
    expect(t.count()).toBe(0);
  });

  it("p95 over several samples", () => {
    const t = new LatencyTracker();
    const deltas = [10, 20, 30, 40, 50];
    let now = 0;
    for (const d of deltas) {
      t.markVoice(now);
      t.markAccompaniment(now + d);
      now += 1000;
    }
    expect(t.p95()).toBe(50);
    expect(t.p50()).toBe(30);
  });

  it("budget: handle p95 + 120 ms horizon fits 250 ms", () => {
    const t = new LatencyTracker();
    // Worst measured handle in this repo's unit path is single-digit ms;
    // even a 60 ms handle (the §45 pipeline budget) stays in budget.
    expect(t.withinBudget(60, config.audio.lookaheadMs)).toBe(true);
    expect(t.perceivedMs(60, config.audio.lookaheadMs)).toBeLessThanOrEqual(
      config.conductor.latencyBudgetMs,
    );
    expect(t.withinBudget(200, config.audio.lookaheadMs)).toBe(false);
  });
});
