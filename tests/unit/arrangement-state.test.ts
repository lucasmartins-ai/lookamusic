/**
 * ArrangementEngine: quantized bar/phrase transitions with fades (Phase 7).
 * Run: npm test -- arrangement-state
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import {
  ArrangementEngine,
  barFloatAt,
  effectiveBarFor,
  fadeGain,
  fadeSecFor,
} from "@/features/music/arrangement/state";

function harness() {
  const bus = new EventBus();
  const engine = new ArrangementEngine(bus);
  const added: string[] = [];
  const removed: string[] = [];
  bus.on("InstrumentAdded", (p) => added.push(p.instrument));
  bus.on("InstrumentRemoved", (p) => removed.push(p.instrument));
  return { bus, engine, added, removed };
}

describe("effectiveBarFor (quantization)", () => {
  it("mid-bar requests wait for the next bar", () => {
    expect(effectiveBarFor(0.625, 1)).toBe(1); // beat 2.5 of 4/4
    expect(effectiveBarFor(2.1, 1)).toBe(3);
  });

  it("requests exactly on a boundary apply there (no wait)", () => {
    expect(effectiveBarFor(0, 1)).toBe(0);
    expect(effectiveBarFor(2, 1)).toBe(2);
  });

  it("quantizes to transitionBars multiples", () => {
    expect(effectiveBarFor(0.5, 2)).toBe(2);
    expect(effectiveBarFor(2, 2)).toBe(2);
    expect(effectiveBarFor(2.5, 2)).toBe(4);
  });

  it("clamps garbage to bar 0", () => {
    expect(effectiveBarFor(NaN, 1)).toBe(0);
    expect(effectiveBarFor(-3, 1)).toBe(0);
  });
});

describe("acceptance: beat 2.5 → next bar, with fade", () => {
  it("queues mid-bar, holds before the boundary, applies on it with fadeSec > 0", () => {
    const { engine, added } = harness();
    const atBeat25 = 0.625; // beat 2.5 of bar 0 in 4/4
    const req = engine.request("sax", true, atBeat25, 120);
    expect(req.queued).not.toBeNull();
    expect(req.applied).toBeNull();
    expect(req.queued?.effectiveBar).toBe(1);
    expect(req.queued?.fadeSec).toBeGreaterThan(0);
    expect(added).toHaveLength(0);
    expect(engine.snapshot().active.sax).toBe(false);

    expect(engine.tick(0.99)).toHaveLength(0); // still mid-bar: nothing
    expect(added).toHaveLength(0);

    const applied = engine.tick(1.0); // downbeat: boundary
    expect(applied).toHaveLength(1);
    expect(applied[0].instrument).toBe("sax");
    expect(applied[0].fadeSec).toBeGreaterThan(0);
    expect(added).toEqual(["sax"]);
    expect(engine.snapshot().active.sax).toBe(true);
    expect(engine.pendingList()).toHaveLength(0);
  });

  it("removals quantize too and emit InstrumentRemoved", () => {
    const { engine, removed } = harness();
    engine.request("bass", true, 0, 120);
    expect(engine.snapshot().active.bass).toBe(true);
    const req = engine.request("bass", false, 1.5, 120);
    expect(req.queued?.effectiveBar).toBe(2);
    expect(engine.snapshot().active.bass).toBe(true); // still sounding
    engine.tick(2.0);
    expect(removed).toEqual(["bass"]);
    expect(engine.snapshot().active.bass).toBe(false);
  });
});

describe("phrase-boundary fast path", () => {
  it("PhraseEnded applies queued transitions before the next bar", () => {
    const { engine, added } = harness();
    engine.request("violin", true, 0.5, 120);
    expect(engine.pendingList()).toHaveLength(1);
    const applied = engine.tick(0.5, { phraseBoundary: true });
    expect(applied).toHaveLength(1);
    expect(added).toEqual(["violin"]);
    expect(engine.pendingList()).toHaveLength(0);
  });
});

describe("coalescing + guards", () => {
  it("no-op when already in the wanted state (cancels stale queue)", () => {
    const { engine, added } = harness();
    engine.request("piano", true, 0.5, 120);
    expect(engine.pendingList()).toHaveLength(1);
    const noop = engine.request("piano", false, 0.7, 120); // still inactive → cancel
    expect(noop.applied).toBeNull();
    expect(noop.queued).toBeNull();
    expect(engine.pendingList()).toHaveLength(0);
    expect(added).toHaveLength(0);
  });

  it("latest request for an instrument wins", () => {
    const { engine } = harness();
    engine.request("guitar", true, 0.2, 120);
    engine.request("guitar", true, 0.4, 120);
    expect(engine.pendingList()).toHaveLength(1);
    expect(engine.pendingList()[0].requestedBar).toBeCloseTo(0.4, 9);
  });

  it("unknown instrument throws (never a silent hole in the band)", () => {
    const { engine } = harness();
    // @ts-expect-error — contract: only canonical ids
    expect(() => engine.request("kazoo", true, 0.5, 120)).toThrow();
  });
});

describe("fade helpers", () => {
  it("fadeSecFor scales with tempo (faster song → shorter fade)", () => {
    const slow = fadeSecFor(60);
    const fast = fadeSecFor(120);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeCloseTo(slow / 2, 9);
    expect(fadeSecFor(NaN)).toBeGreaterThan(0);
  });

  it("fadeGain ramps 0→1 in and 1→0 out, clamped past the fade", () => {
    expect(fadeGain(0, 0.5, "in")).toBe(0);
    expect(fadeGain(0.25, 0.5, "in")).toBeCloseTo(0.5, 9);
    expect(fadeGain(0.5, 0.5, "in")).toBe(1);
    expect(fadeGain(99, 0.5, "in")).toBe(1);
    expect(fadeGain(0, 0.5, "out")).toBe(1);
    expect(fadeGain(0.25, 0.5, "out")).toBeCloseTo(0.5, 9);
    expect(fadeGain(0.5, 0.5, "out")).toBe(0);
    expect(fadeGain(0, 0, "in")).toBe(1); // no fade → full gain
  });

  it("barFloatAt guards garbage and never goes negative", () => {
    expect(barFloatAt(1.25, 0, 0.5, 4)).toBeCloseTo(0.625, 9);
    expect(barFloatAt(-5, 0, 0.5, 4)).toBe(0);
    expect(barFloatAt(NaN, 0, 0.5, 4)).toBe(0);
    expect(barFloatAt(1, 0, 0, 4)).toBe(0);
  });

  it("fade length honors config.arrangement.fadeBeats", () => {
    expect(fadeSecFor(60)).toBeCloseTo(config.arrangement.fadeBeats * 1, 9);
  });
});
