/**
 * Pattern library: every style × meter renders ordered, gap-free bars.
 * Run: npm test -- rhythm-patterns
 */
import { describe, expect, it } from "vitest";
import type { TimeSignature } from "@/domain/types";
import {
  DRUM_STYLES,
  PATTERNS,
  expandPattern,
  patternFor,
  type DrumStyleId,
} from "@/features/music/rhythm/patterns";
import { SUPPORTED_METERS, barEighths, meterKey } from "@/features/music/rhythm/meter";

const STYLES = DRUM_STYLES.map((s) => s.id);

function meterOf(key: string): TimeSignature {
  const [n, d] = key.split("/").map(Number);
  return { numerator: n, denominator: d } as TimeSignature;
}

describe("library shape", () => {
  it("covers 9 styles × 3 meters", () => {
    expect(STYLES).toHaveLength(9);
    expect(SUPPORTED_METERS).toHaveLength(3);
    for (const style of STYLES) {
      for (const m of SUPPORTED_METERS) {
        const hits = patternFor(style, m);
        expect(hits.length, `${style} ${meterKey(m)}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(Object.keys(PATTERNS)).toHaveLength(9);
  });

  it("rock 4/4 carries the backbeat (kick downbeat + snare)", () => {
    const hits = patternFor("rock", meterOf("4/4"));
    const voicesAt = (pos: number) => hits.filter((h) => h.pos === pos).map((h) => h.voice);
    expect(voicesAt(0)).toContain("kick");
    expect(voicesAt(2)).toContain("snare");
    expect(voicesAt(6)).toContain("snare");
  });

  it("ambient stays soft by design (all velocities ≤ 0.6)", () => {
    for (const m of SUPPORTED_METERS) {
      for (const h of patternFor("ambient", m)) {
        expect(h.velocity).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe("single-bar rendering", () => {
  for (const style of STYLES) {
    for (const m of SUPPORTED_METERS) {
      const key = `${style} ${meterKey(m)}`;
      it(`${key}: ordered, downbeat-first, in-range, valid velocities`, () => {
        const events = expandPattern(style as DrumStyleId, m, 1);
        const barLen = barEighths(m);
        expect(events.length).toBeGreaterThanOrEqual(3);
        // Ordered by absolute position.
        for (let i = 1; i < events.length; i++) {
          expect(events[i].posEighth).toBeGreaterThanOrEqual(events[i - 1].posEighth);
        }
        // Downbeat present — the bar never starts with a hole.
        expect(events[0].posEighth).toBe(0);
        for (const e of events) {
          expect(e.posEighth).toBeGreaterThanOrEqual(0);
          expect(e.posEighth).toBeLessThan(barLen);
          expect(e.velocity).toBeGreaterThan(0);
          expect(e.velocity).toBeLessThanOrEqual(1);
          expect(e.bar).toBe(0);
          expect(e.timeQuarters).toBeCloseTo(e.posEighth / 2, 6);
        }
      });
    }
  }

  it("is deterministic: same call twice → identical events", () => {
    const a = expandPattern("latin", meterOf("6/8"), 1);
    const b = expandPattern("latin", meterOf("6/8"), 1);
    expect(a).toEqual(b);
  });
});

describe("multi-bar continuity (no audible logic gaps)", () => {
  for (const style of STYLES) {
    for (const m of SUPPORTED_METERS) {
      it(`${style} ${meterKey(m)}: 2 bars = periodic tiling, boundary-exact`, () => {
        const barLen = barEighths(m);
        const one = expandPattern(style as DrumStyleId, m, 1);
        const two = expandPattern(style as DrumStyleId, m, 2);
        expect(two.length).toBe(one.length * 2);
        const first = two.slice(0, one.length);
        const second = two.slice(one.length);
        expect(first.map((e) => [e.voice, e.pos, e.velocity])).toEqual(
          one.map((e) => [e.voice, e.pos, e.velocity]),
        );
        // Second bar is the first shifted by exactly one bar length.
        for (let i = 0; i < one.length; i++) {
          expect(second[i].voice).toBe(one[i].voice);
          expect(second[i].posEighth).toBeCloseTo(one[i].posEighth + barLen, 9);
          expect(second[i].bar).toBe(1);
        }
        // Globally ordered across the boundary.
        for (let i = 1; i < two.length; i++) {
          expect(two[i].posEighth).toBeGreaterThanOrEqual(two[i - 1].posEighth);
        }
        // Nothing leaks past the end of bar 2.
        expect(two[two.length - 1].posEighth).toBeLessThan(2 * barLen);
      });
    }
  }
});
