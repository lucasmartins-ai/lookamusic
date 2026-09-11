/**
 * Theory engine: scales (Phase 3, §13).
 * Run: npm test -- theory-scales
 */
import { describe, expect, it } from "vitest";
import {
  getScale,
  getScalePcs,
  listScales,
  nearestScaleTone,
  quantizeToScale,
  scaleContains,
} from "@/features/music/theory/scales";

describe("scale registry", () => {
  it("ships major + three minors as data rows", () => {
    expect(listScales().map((s) => s.id).sort()).toEqual(
      ["harmonic-minor", "major", "melodic-minor", "natural-minor"].sort(),
    );
    expect(getScale("major").intervals).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(getScale("natural-minor").intervals).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(getScale("harmonic-minor").intervals).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(getScale("melodic-minor").intervals).toEqual([0, 2, 3, 5, 7, 9, 11]);
  });

  it("rejects unknown scales", () => {
    expect(() => getScale("dorian")).toThrow();
  });
});

describe("getScalePcs / scaleContains", () => {
  it("builds C major and A minor sets", () => {
    expect(getScalePcs(0, "major")).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(getScalePcs(9, "natural-minor")).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("tests membership on pitch-classes", () => {
    expect(scaleContains(0, "major", 4)).toBe(true); // E in C
    expect(scaleContains(0, "major", 3)).toBe(false); // Eb not in C
    expect(scaleContains(9, "natural-minor", 7)).toBe(true); // G in Am
    expect(scaleContains(9, "natural-minor", 8)).toBe(false); // G# not natural
    expect(scaleContains(9, "harmonic-minor", 8)).toBe(true); // G# harmonic
  });
});

describe("nearestScaleTone / quantizeToScale", () => {
  it("leaves scale tones untouched", () => {
    expect(quantizeToScale(60, 0, "major")).toBe(60);
    expect(quantizeToScale(64, 0, "major")).toBe(64);
  });

  it("snaps chromatics to the nearest degree, ties downward", () => {
    expect(quantizeToScale(61, 0, "major")).toBe(60); // C# between C/D
    expect(quantizeToScale(63, 0, "major")).toBe(62); // Eb between D/E
    expect(quantizeToScale(66, 0, "major")).toBe(65); // F# between F/G
    expect(nearestScaleTone(61, 0, "major")).toBe(60);
  });
});
