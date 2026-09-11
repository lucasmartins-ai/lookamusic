/** Bar harmony driver: one chord per bar via the Phase 4 scorer (Phase 8). */
import { describe, expect, it } from "vitest";
import type { Chord, KeyEstimate, PitchClass } from "@/domain/types";
import { chooseChordForBar, scaleIdForKey } from "@/features/conductor/harmony-driver";

function key(root: PitchClass, mode: "major" | "minor"): KeyEstimate {
  return { root, mode, confidence: 0.9 };
}

function melody(midis: number[]): { id: string; pitch: number; midi: number; startTime: number; duration: number; velocity: number; confidence: number; source: "voice" }[] {
  return midis.map((midi, k) => ({
    id: `m${k}`, pitch: 440, midi, startTime: k * 0.5, duration: 0.45,
    velocity: 0.8, confidence: 0.9, source: "voice" as const,
  }));
}

describe("chooseChordForBar", () => {
  it("C–E–G melody in C major → C major top-1", () => {
    const { chord, confidence } = chooseChordForBar({
      key: key(0, "major"),
      scaleId: "major",
      melodySlice: melody([60, 64, 67]),
      barIndex: 0,
      phrasePosition: "middle",
      style: "pop",
      recentChords: [],
      seed: "test-c-major",
    });
    expect(chord.root).toBe(0);
    expect(chord.quality).toBe("major");
    expect(confidence).toBeGreaterThan(0.5);
  });

  it("deterministic: same inputs + seed → same chord", () => {
    const input = {
      key: key(7, "major"),
      scaleId: "major",
      melodySlice: melody([67, 69, 71]),
      barIndex: 2,
      phrasePosition: "middle" as const,
      style: "pop" as const,
      recentChords: [{ root: 0, quality: "major" } as Chord],
      seed: "fixed-seed",
    };
    expect(chooseChordForBar(input)).toEqual(chooseChordForBar(input));
  });

  it("repeat cap: never a 3rd identical bar in a row (non-static style)", () => {
    const tonic: Chord = { root: 0 as PitchClass, quality: "major" };
    const { chord } = chooseChordForBar({
      key: key(0, "major"),
      scaleId: "major",
      melodySlice: [],
      barIndex: 5,
      phrasePosition: "middle",
      style: "pop",
      prevChord: tonic,
      recentChords: [tonic, tonic],
      seed: "repeat-cap",
    });
    // History already holds run=2 (recent + prev); the pick must break it.
    const run = [tonic, tonic, tonic].filter(
      (c) => c.root === chord.root && c.quality === chord.quality,
    ).length;
    expect(run < 3 || chord.root !== 0).toBe(true);
  });

  it("scaleIdForKey maps mode → scale registry id", () => {
    expect(scaleIdForKey({ root: 0, mode: "major", confidence: 1 })).toBe("major");
    expect(scaleIdForKey({ root: 9, mode: "minor", confidence: 1 })).toBe("natural-minor");
  });
});
