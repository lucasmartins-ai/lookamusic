/**
 * Phase 17 — anti-feedback advisory (soft, heuristic).
 * Run: npm test -- audio-feedback
 */
import { describe, expect, it } from "vitest";
import { FeedbackWatcher, looksLikeFeedback } from "@/features/audio/feedback";
import { config } from "@/lib/config";

const base = { inputRms: 0, outputActive: true, monitorVolume: 0 };

describe("looksLikeFeedback", () => {
  it("ignores any input while the band is silent", () => {
    expect(looksLikeFeedback({ ...base, outputActive: false, inputRms: 0.9 })).toBe(false);
  });

  it("flags a severe input level even with no monitoring", () => {
    expect(looksLikeFeedback({ ...base, inputRms: config.feedback.inputRmsSevere })).toBe(true);
  });

  it("flags a moderate input level only when direct monitoring is on", () => {
    expect(looksLikeFeedback({ ...base, inputRms: config.feedback.inputRmsRisk })).toBe(false);
    expect(
      looksLikeFeedback({ ...base, inputRms: config.feedback.inputRmsRisk, monitorVolume: 0.5 }),
    ).toBe(true);
  });

  it("stays quiet for a normal singing level", () => {
    expect(looksLikeFeedback({ ...base, inputRms: 0.1, monitorVolume: 0.5 })).toBe(false);
  });
});

describe("FeedbackWatcher streak gate", () => {
  it(`warns only after ${config.feedback.confirmObs} consecutive flagged frames`, () => {
    const w = new FeedbackWatcher();
    const hot = { ...base, inputRms: config.feedback.inputRmsSevere };
    for (let i = 0; i < config.feedback.confirmObs - 1; i++) {
      expect(w.push(hot)).toBeNull();
    }
    const adv = w.push(hot);
    expect(adv?.kind).toBe("feedback-risk");
    expect(w.isActive).toBe(true);
  });

  it("emits once per streak and re-arms after a clean frame", () => {
    const w = new FeedbackWatcher();
    const hot = { ...base, inputRms: config.feedback.inputRmsSevere };
    for (let i = 0; i < config.feedback.confirmObs; i++) w.push(hot);
    // Still hot: no repeated announcement.
    expect(w.push(hot)).toBeNull();
    // Clean frame clears the advisory…
    expect(w.push({ ...base, inputRms: 0.05 })).toBeNull();
    expect(w.isActive).toBe(false);
    // …and the streak restarts.
    for (let i = 0; i < config.feedback.confirmObs - 1; i++) expect(w.push(hot)).toBeNull();
    expect(w.push(hot)?.kind).toBe("feedback-risk");
  });

  it("reset() clears the advisory", () => {
    const w = new FeedbackWatcher();
    const hot = { ...base, inputRms: config.feedback.inputRmsSevere };
    for (let i = 0; i < config.feedback.confirmObs; i++) w.push(hot);
    expect(w.isActive).toBe(true);
    w.reset();
    expect(w.isActive).toBe(false);
  });
});
