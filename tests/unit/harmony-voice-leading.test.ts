/**
 * Voice leading: voicings, parallels, beam search (Phase 4, §19).
 * Run: npm test -- harmony-voice-leading
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  beamSearchVoicings,
  chooseVoicing,
  countParallels,
  voicingCandidates,
} from "@/features/music/harmony/voice-leading";
import { optimizeVoicings } from "@/features/music/harmony/voicing/optimizer";

const C = { root: 0 as const, quality: "major" as const };
const G = { root: 7 as const, quality: "major" as const };
const AM = { root: 9 as const, quality: "minor" as const };
const F = { root: 5 as const, quality: "major" as const };

describe("voicingCandidates", () => {
  it("stays in tessitura, ascending, close position, with chord pcs", () => {
    const pool = voicingCandidates(C);
    expect(pool.length).toBeGreaterThan(0);
    for (const v of pool) {
      expect(v[0]).toBeGreaterThanOrEqual(config.harmony.voicingMinMidi);
      expect(v[2]).toBeLessThanOrEqual(config.harmony.voicingMaxMidi);
      expect(v[0]).toBeLessThan(v[1]);
      expect(v[1]).toBeLessThan(v[2]);
      expect(v[2] - v[0]).toBeLessThan(12);
      const pcs = new Set(v.map((m) => ((m % 12) + 12) % 12));
      expect(pcs).toEqual(new Set([0, 4, 7]));
    }
  });
});

describe("chooseVoicing (greedy)", () => {
  it("holds common tones between C and Am", () => {
    const first = chooseVoicing(C, null);
    const next = chooseVoicing(AM, first);
    const movement =
      Math.abs(next[0] - first[0]) + Math.abs(next[1] - first[1]) + Math.abs(next[2] - first[2]);
    expect(movement).toBeLessThanOrEqual(2);
  });
});

describe("parallels", () => {
  it("detects parallel 5ths/octaves moving together", () => {
    // C–G–C → D–A–D: 5th + octave pairs, same direction.
    expect(countParallels([48, 55, 60], [50, 57, 62])).toBe(2);
  });

  it("ignores contrary motion and non-perfect intervals", () => {
    // C–G → C–A: 5th → 6th (interval changes), contrary-ish third motion.
    expect(countParallels([48, 55, 60], [48, 57, 60])).toBe(0);
  });
});

describe("beamSearchVoicings", () => {
  const PASSAGE = [C, G, AM, F];

  it("moves < 4 semitones/voice on average", () => {
    const res = beamSearchVoicings(PASSAGE);
    expect(res.voicings).toHaveLength(4);
    expect(res.averageMovement).toBeLessThan(4);
  });

  it("is deterministic", () => {
    const a = beamSearchVoicings(PASSAGE);
    const b = beamSearchVoicings(PASSAGE);
    expect(b.voicings).toEqual(a.voicings);
  });

  it("optimizer delegates behind the same interface", () => {
    expect(optimizeVoicings(PASSAGE).voicings).toEqual(beamSearchVoicings(PASSAGE).voicings);
  });
});
