/**
 * Phase 10: onboarding step machine.
 */
import { describe, expect, it } from "vitest";
import { deriveOnboardingStep, ONBOARDING_COPY } from "@/components/onboarding";

describe("deriveOnboardingStep", () => {
  it("starts at step 1 before the mic ever lives", () => {
    expect(deriveOnboardingStep({ micLive: false, hasNote: false, dismissed: false })).toBe(1);
  });

  it("advances to step 2 once the mic lives, before any stable note", () => {
    expect(deriveOnboardingStep({ micLive: true, hasNote: false, dismissed: false })).toBe(2);
  });

  it("advances to step 3 once a stable note exists", () => {
    expect(deriveOnboardingStep({ micLive: true, hasNote: true, dismissed: false })).toBe(3);
  });

  it("stays at step 3 even if the mic stops (progress never regresses)", () => {
    expect(deriveOnboardingStep({ micLive: false, hasNote: true, dismissed: false })).toBe(3);
  });

  it("dismissal always resolves to done, from any state", () => {
    for (const s of [
      { micLive: false, hasNote: false },
      { micLive: true, hasNote: false },
      { micLive: true, hasNote: true },
    ] as const) {
      expect(deriveOnboardingStep({ ...s, dismissed: true })).toBe("done");
    }
  });

  it("copy covers all three steps with non-empty pt-BR text", () => {
    for (const step of [1, 2, 3] as const) {
      expect(ONBOARDING_COPY[step].title).toMatch(/Passo [123] de 3/);
      expect(ONBOARDING_COPY[step].body.length).toBeGreaterThan(20);
    }
  });
});
