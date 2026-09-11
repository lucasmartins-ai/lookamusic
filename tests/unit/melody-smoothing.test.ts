/**
 * PitchSmoother: confidence gate + median window (Phase 2).
 * Run: npm test -- melody-smoothing
 */
import { describe, expect, it } from "vitest";
import { median, passesConfidenceGate, PitchSmoother } from "@/features/music/melody/smoothing";
import { rawObs, rawUnvoiced } from "../fixtures/melody";

describe("median", () => {
  it("handles odd and even windows", () => {
    expect(median([67])).toBe(67);
    expect(median([68, 66, 67])).toBe(67);
    expect(median([67, 67, 67, 68])).toBe(67);
    expect(median([66, 68])).toBe(67);
  });

  it("rejects empty windows", () => {
    expect(() => median([])).toThrow();
  });
});

describe("confidence gate", () => {
  it("passes strong voiced frames", () => {
    expect(passesConfidenceGate(rawObs(67, 0, 0.9))).toBe(true);
  });

  it("blocks low-confidence frames", () => {
    expect(passesConfidenceGate(rawObs(67, 0, 0.2))).toBe(false);
  });

  it("blocks unvoiced frames", () => {
    expect(passesConfidenceGate(rawUnvoiced(0))).toBe(false);
  });
});

describe("PitchSmoother", () => {
  it("emits unvoiced for gated frames", () => {
    const s = new PitchSmoother();
    expect(s.push(rawUnvoiced(0)).voiced).toBe(false);
    expect(s.push(rawObs(67, 20, 0.1)).voiced).toBe(false);
  });

  it("absorbs a single-frame spike inside a stable note", () => {
    const s = new PitchSmoother();
    const mids = [67, 67, 67, 68, 67].map((m, i) => s.push(rawObs(m, i * 20)).midiNote);
    expect(mids).toEqual([67, 67, 67, 67, 67]);
  });

  it("absorbs vibrato wobble around the center", () => {
    const s = new PitchSmoother();
    const wobble = [67, 67.2, 66.8, 67.1, 66.9, 67.2, 67];
    for (const [i, m] of wobble.entries()) {
      const out = s.push(rawObs(m, i * 20));
      expect(out.voiced).toBe(true);
      expect(Math.abs(out.midiNote - 67)).toBeLessThan(0.5);
    }
  });

  it("tracks a real sustained step after the window turns over", () => {
    const s = new PitchSmoother();
    for (let i = 0; i < 5; i++) s.push(rawObs(67, i * 20));
    let out = s.push(rawObs(69, 100));
    expect(out.midiNote).toBe(67); // window still dominated by 67
    for (let i = 1; i <= 5; i++) out = s.push(rawObs(69, 100 + i * 20));
    expect(out.midiNote).toBe(69);
  });

  it("resumes without re-attack lag after a brief dropout", () => {
    const s = new PitchSmoother();
    for (let i = 0; i < 5; i++) s.push(rawObs(67, i * 20));
    expect(s.push(rawUnvoiced(100)).voiced).toBe(false);
    // Window retained: first voiced frame back is already centered.
    expect(s.push(rawObs(67, 120)).midiNote).toBe(67);
  });
});
