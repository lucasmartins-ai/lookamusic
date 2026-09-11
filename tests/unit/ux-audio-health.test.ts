/**
 * Phase 10 (§43): poor-audio + CPU-overload advisory flags.
 */
import { describe, expect, it } from "vitest";
import { AUDIO_HEALTH_COPY, detectAudioHealth, type AudioHealthInput } from "@/components/audioHealth";
import { config } from "@/lib/config";

const HEALTHY: AudioHealthInput = {
  obsCount: 120,
  voicedCount: 80,
  avgConfidence: 0.85,
  inputRms: 0.05,
  droppedFrames: 0,
  p95HandleMs: 1.5,
};

describe("detectAudioHealth", () => {
  it("stays silent with insufficient evidence (no flicker on startup)", () => {
    expect(detectAudioHealth({ ...HEALTHY, obsCount: config.ux.audioHealthMinObs - 1 })).toEqual([]);
  });

  it("reports nothing when healthy", () => {
    expect(detectAudioHealth(HEALTHY)).toEqual([]);
  });

  it("flags quiet when the mic is open but only silence arrives", () => {
    const flags = detectAudioHealth({
      ...HEALTHY,
      voicedCount: 0,
      inputRms: config.rhythm.energyNoiseFloor,
    });
    expect(flags).toContain("quiet");
  });

  it("does not flag quiet when voice is present, even if soft", () => {
    const flags = detectAudioHealth({ ...HEALTHY, voicedCount: 12, inputRms: 0.004 });
    expect(flags).not.toContain("quiet");
  });

  it("flags unclear on sustained low confidence", () => {
    const flags = detectAudioHealth({
      ...HEALTHY,
      avgConfidence: config.ux.unclearConfidenceBelow - 0.01,
    });
    expect(flags).toContain("unclear");
  });

  it("flags overload on handle p95 above budget", () => {
    expect(
      detectAudioHealth({ ...HEALTHY, p95HandleMs: config.ux.cpuOverloadP95Ms + 1 }),
    ).toContain("overload");
  });

  it("flags overload on accumulated dropped frames", () => {
    expect(
      detectAudioHealth({ ...HEALTHY, droppedFrames: config.ux.cpuOverloadDroppedFrames + 1 }),
    ).toContain("overload");
  });

  it("can report multiple flags at once", () => {
    const flags = detectAudioHealth({
      ...HEALTHY,
      voicedCount: 0,
      inputRms: 0,
      p95HandleMs: 99,
    });
    expect(flags).toEqual(expect.arrayContaining(["quiet", "overload"]));
  });

  it("every flag has actionable pt-BR copy", () => {
    for (const flag of ["quiet", "unclear", "overload"] as const) {
      expect(AUDIO_HEALTH_COPY[flag].title.length).toBeGreaterThan(0);
      expect(AUDIO_HEALTH_COPY[flag].body.length).toBeGreaterThan(30);
    }
  });
});
