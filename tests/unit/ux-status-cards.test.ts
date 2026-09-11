/**
 * Phase 10 (§43): every non-running mic state renders a recovery card.
 * Never a silent broken screen.
 */
import { describe, expect, it } from "vitest";
import { micStatusCard } from "@/components/statusCards";
import type { SessionStatus } from "@/features/audio/session";

const NON_RUNNING: SessionStatus[] = [
  "idle",
  "requesting",
  "denied",
  "no-mic",
  "suspended",
  "unsupported",
  "error",
];

describe("micStatusCard", () => {
  it("returns null while running (no card steals the stage)", () => {
    expect(micStatusCard("running", null)).toBeNull();
  });

  it("maps every non-running state to a card (never silent)", () => {
    for (const s of NON_RUNNING) {
      const card = micStatusCard(s, null);
      expect(card, s).not.toBeNull();
      expect(card!.title.length).toBeGreaterThan(0);
      expect(card!.body.length).toBeGreaterThan(0);
    }
  });

  it("requesting renders a loading card with no dead-end actions", () => {
    const card = micStatusCard("requesting", null)!;
    expect(card.tone).toBe("loading");
    expect(card.actions).toEqual([]);
  });

  it("error states surface the engine message + guided recovery", () => {
    const card = micStatusCard("denied", {
      status: "denied",
      message: "Microphone permission was denied.",
      recovery: "Allow microphone access in the browser address bar, then press Start again.",
    })!;
    expect(card.tone).toBe("error");
    expect(card.title).toContain("denied");
    expect(card.body).toContain("address bar");
    expect(card.actions.some((a) => a.kind === "retry")).toBe(true);
  });

  it("falls back to built-in copy when SessionError is absent", () => {
    for (const s of ["denied", "no-mic", "suspended", "unsupported", "error"] as const) {
      const card = micStatusCard(s, null)!;
      expect(card.tone).toBe("error");
      expect(card.body.length).toBeGreaterThan(10);
    }
  });

  it("unsupported offers help instead of a retry that cannot succeed", () => {
    const card = micStatusCard("unsupported", null)!;
    expect(card.actions.some((a) => a.kind === "retry")).toBe(false);
    expect(card.actions.some((a) => a.kind === "help")).toBe(true);
  });

  it("idle pre-explains privacy before any permission is requested", () => {
    const card = micStatusCard("idle", null)!;
    expect(card.tone).toBe("info");
    expect(card.body).toMatch(/nunca sai deste dispositivo/);
  });
});
