import { describe, expect, it } from "vitest";
import {
  AutotuneController,
  computePitchRatio,
  computeTargetMidi,
  speedToMs,
} from "@/features/audio/autotune";
import type { KeyEstimate, PitchObservation } from "@/domain/types";

describe("Autotune Engine", () => {
  describe("computeTargetMidi", () => {
    it("snaps to nearest integer semitone in chromatic mode", () => {
      expect(computeTargetMidi(69.2, "chromatic")).toBe(69);
      expect(computeTargetMidi(68.8, "chromatic")).toBe(69);
      expect(computeTargetMidi(60.4, "chromatic")).toBe(60);
      expect(computeTargetMidi(-1, "chromatic")).toBe(-1);
    });

    it("snaps to active scale degree in key mode", () => {
      const cMajorKey: KeyEstimate = { root: 0, mode: "major", confidence: 0.8 };
      // 66 is F#4 (not in C Major: C=60, D=62, E=64, F=65, G=67, A=69, B=71)
      // Nearest scale tone to F#4 (66) resolves to F4 (65)
      const target = computeTargetMidi(66, "key", cMajorKey);
      expect(target === 65 || target === 67).toBe(true);

      // In-scale note (E4 = 64) stays 64
      expect(computeTargetMidi(64.1, "key", cMajorKey)).toBe(64);
    });

    it("falls back to chromatic if key confidence is too low", () => {
      const weakKey: KeyEstimate = { root: 0, mode: "major", confidence: 0.1 };
      expect(computeTargetMidi(66.2, "key", weakKey)).toBe(66);
    });
  });

  describe("computePitchRatio", () => {
    it("returns 1.0 when current equals target or unvoiced", () => {
      expect(computePitchRatio(69, 69)).toBe(1.0);
      expect(computePitchRatio(-1, 69)).toBe(1.0);
      expect(computePitchRatio(69, -1)).toBe(1.0);
    });

    it("returns ratio > 1.0 when pitching up (flat note corrected up)", () => {
      // Current is 68.7 (flat A4), target is 69 (A4)
      const ratio = computePitchRatio(68.7, 69);
      expect(ratio).toBeGreaterThan(1.0);
      expect(ratio).toBeLessThan(1.05);
    });

    it("returns ratio < 1.0 when pitching down (sharp note corrected down)", () => {
      // Current is 69.3 (sharp A4), target is 69 (A4)
      const ratio = computePitchRatio(69.3, 69);
      expect(ratio).toBeLessThan(1.0);
      expect(ratio).toBeGreaterThan(0.95);
    });
  });

  describe("speedToMs", () => {
    it("maps speeds to transition milliseconds", () => {
      expect(speedToMs("hard")).toBe(0);
      expect(speedToMs("pop")).toBe(25);
      expect(speedToMs("natural")).toBe(80);
    });
  });

  describe("AutotuneController", () => {
    it("initializes disabled by default with safe volume", () => {
      const ctrl = new AutotuneController();
      const cfg = ctrl.getConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.monitorVolume).toBe(0.0);
    });

    it("updates configuration dynamically", () => {
      const ctrl = new AutotuneController();
      ctrl.updateConfig({ enabled: true, speed: "hard", monitorVolume: 0.5 });
      const cfg = ctrl.getConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.speed).toBe("hard");
      expect(cfg.monitorVolume).toBe(0.5);
    });

    it("processes pitch observations and computes target when enabled", () => {
      const ctrl = new AutotuneController();
      ctrl.updateConfig({ enabled: true });

      const obs: PitchObservation = {
        frequency: 432, // flat A4
        midiNote: 68.7,
        confidence: 0.9,
        clarity: 0.9,
        timestamp: 1000,
      };

      const res = ctrl.processObservation(obs);
      expect(res.targetMidi).toBe(69);
      expect(res.ratio).toBeGreaterThan(1.0);
    });

    it("resets ratio to 1.0 when observation is unvoiced or disabled", () => {
      const ctrl = new AutotuneController();
      ctrl.updateConfig({ enabled: false });

      const obs: PitchObservation = {
        frequency: 440,
        midiNote: 69,
        confidence: 0.9,
        clarity: 0.9,
        timestamp: 1000,
      };

      const res = ctrl.processObservation(obs);
      expect(res.ratio).toBe(1.0);
      expect(res.targetMidi).toBe(-1);
    });
  });
});
