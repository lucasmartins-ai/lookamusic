/**
 * Harmony candidates (Phase 4, §16).
 * Run: npm test -- harmony-candidates
 */
import { describe, expect, it } from "vitest";
import {
  chordsEqual,
  degreeOf,
  diatonicPool,
  generateCandidates,
  type HarmonyContext,
} from "@/features/music/harmony/candidates";

const C_MAJOR = { root: 0 as const, mode: "major" as const, confidence: 0.9 };

function ctx(): HarmonyContext {
  return {
    key: C_MAJOR,
    scaleId: "major",
    melody: [],
    barIndex: 0,
    phrasePosition: "middle",
    isDownbeat: true,
    style: "pop",
    recentChords: [],
  };
}

describe("diatonicPool", () => {
  it("yields 7 triads + V7 in major", () => {
    const pool = diatonicPool(C_MAJOR);
    expect(pool).toHaveLength(8);
    expect(pool).toContainEqual({ root: 0, quality: "major" }); // I
    expect(pool).toContainEqual({ root: 7, quality: "major" }); // V
    expect(pool).toContainEqual({ root: 7, quality: "dom7" }); // V7
    expect(pool).toContainEqual({ root: 11, quality: "diminished" }); // vii°
  });

  it("yields the functional minor set + V7 in minor", () => {
    const pool = diatonicPool({ root: 9 as const, mode: "minor", confidence: 0.9 });
    expect(pool).toHaveLength(10);
    expect(pool).toContainEqual({ root: 9, quality: "minor" }); // i
    expect(pool).toContainEqual({ root: 4, quality: "minor" }); // v
    expect(pool).toContainEqual({ root: 4, quality: "major" }); // V
    expect(pool).toContainEqual({ root: 4, quality: "dom7" }); // V7
  });
});

describe("generateCandidates", () => {
  it("is deterministic and diatonic", () => {
    const a = generateCandidates(ctx());
    const b = generateCandidates(ctx());
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("degreeOf measures semitones above the key root", () => {
    expect(degreeOf(7, 0)).toBe(7);
    expect(degreeOf(0, 7)).toBe(5); // C above G = IV
  });

  it("chordsEqual ignores extensions/inversion", () => {
    expect(chordsEqual({ root: 0, quality: "major" }, { root: 0, quality: "major", inversion: 1 })).toBe(true);
    expect(chordsEqual({ root: 0, quality: "major" }, { root: 0, quality: "minor" })).toBe(false);
  });
});
