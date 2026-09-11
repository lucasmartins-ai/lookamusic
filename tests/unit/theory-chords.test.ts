/**
 * Theory engine: chords (Phase 3, §15).
 * Run: npm test -- theory-chords
 */
import { describe, expect, it } from "vitest";
import { chordFromPcs, chordName, chordTones } from "@/features/music/theory/chords";

describe("chordTones", () => {
  it("stacks every quality from the root", () => {
    expect(chordTones({ root: 0, quality: "major" })).toEqual([0, 4, 7]);
    expect(chordTones({ root: 0, quality: "minor" })).toEqual([0, 3, 7]);
    expect(chordTones({ root: 11, quality: "diminished" })).toEqual([11, 2, 5]);
    expect(chordTones({ root: 0, quality: "augmented" })).toEqual([0, 4, 8]);
    expect(chordTones({ root: 7, quality: "dom7" })).toEqual([7, 11, 2, 5]);
    expect(chordTones({ root: 0, quality: "maj7" })).toEqual([0, 4, 7, 11]);
    expect(chordTones({ root: 4, quality: "min7" })).toEqual([4, 7, 11, 2]);
    expect(chordTones({ root: 0, quality: "sus2" })).toEqual([0, 2, 7]);
    expect(chordTones({ root: 0, quality: "sus4" })).toEqual([0, 5, 7]);
  });
});

describe("chordName", () => {
  it("renders display names", () => {
    expect(chordName({ root: 0, quality: "major" })).toBe("C");
    expect(chordName({ root: 4, quality: "minor" })).toBe("Em");
    expect(chordName({ root: 4, quality: "min7" })).toBe("Em7");
    expect(chordName({ root: 0, quality: "sus4" })).toBe("Csus4");
    expect(chordName({ root: 7, quality: "dom7" })).toBe("G7");
    expect(chordName({ root: 0, quality: "maj7" })).toBe("Cmaj7");
  });
});

describe("chordFromPcs", () => {
  it("analyses C–E–G as C major", () => {
    expect(chordFromPcs([0, 4, 7])).toEqual({ root: 0, quality: "major" });
  });

  it("is order-independent and ignores duplicates and inversions", () => {
    expect(chordFromPcs([7, 0, 4])).toEqual({ root: 0, quality: "major" });
    expect(chordFromPcs([4, 7, 0, 0, 4])).toEqual({ root: 0, quality: "major" });
    expect(chordFromPcs([4, 7, 11])).toEqual({ root: 4, quality: "minor" }); // Em 1st inv.
  });

  it("analyses sevenths", () => {
    expect(chordFromPcs([4, 7, 11, 2])).toEqual({ root: 4, quality: "min7" });
    expect(chordFromPcs([7, 11, 2, 5])).toEqual({ root: 7, quality: "dom7" });
  });

  it("returns null for non-vocabulary sets", () => {
    expect(chordFromPcs([0, 1, 2])).toBeNull();
    expect(chordFromPcs([0, 4])).toBeNull();
    expect(chordFromPcs([0, 4, 7, 11, 2])).toBeNull();
  });
});
