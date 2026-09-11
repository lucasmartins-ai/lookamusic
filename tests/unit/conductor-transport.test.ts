/** Conductor transport: single bar/beat clock (Phase 8). */
import { describe, expect, it } from "vitest";
import { MusicalTransport } from "@/features/conductor/transport";

describe("MusicalTransport", () => {
  it("bar 0 at origin, advances one bar per barSec @90bpm 4/4", () => {
    const t = new MusicalTransport(100, 90, { numerator: 4, denominator: 4 });
    expect(t.barFloatAt(100)).toBeCloseTo(0, 9);
    // barSec = 4 * 60/90 = 2.6667s
    expect(t.barSec()).toBeCloseTo(2.6667, 3);
    expect(t.barFloatAt(100 + t.barSec())).toBeCloseTo(1, 6);
    expect(t.barStartSec(2)).toBeCloseTo(100 + 2 * t.barSec(), 9);
  });

  it("beat clock: 4 beats per bar in 4/4", () => {
    const t = new MusicalTransport(0, 120, { numerator: 4, denominator: 4 });
    expect(t.beatSec()).toBeCloseTo(0.5, 9);
    expect(t.beatFloatAt(1)).toBeCloseTo(2, 9);
  });

  it("nextBoundary quantizes mid-bar up, on-boundary stays", () => {
    const t = new MusicalTransport(0, 90, { numerator: 4, denominator: 4 });
    expect(t.nextBoundary(2.5, 1)).toBe(3);
    expect(t.nextBoundary(3, 1)).toBe(3);
    expect(t.nextBoundary(0.1, 1)).toBe(1);
  });

  it("tempo/meter updates reshape the grid from the same origin", () => {
    const t = new MusicalTransport(0, 90, { numerator: 4, denominator: 4 });
    const before = t.barFloatAt(10);
    t.setTempo(180);
    expect(t.barFloatAt(10)).toBeCloseTo(before * 2, 6);
  });

  it("guards garbage to safe defaults (never NaN/negative)", () => {
    const t = new MusicalTransport(NaN, -5, { numerator: 4, denominator: 4 });
    expect(t.barFloatAt(NaN)).toBe(0);
    expect(t.barStartSec(-3)).toBeGreaterThanOrEqual(0);
  });
});
