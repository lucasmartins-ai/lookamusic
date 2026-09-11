/**
 * GestureRecognizer: hold / confidence / hysteresis / cooldown / decay
 * (Phase 9, §27–28). Pure math — no camera. Run:
 * npm test -- gestures-recognition
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { GestureRecognizer } from "@/features/gestures/recognition";
import type { GestureKind } from "@/domain/types";

const HOLD = config.gesture.holdMs;
const COOLDOWN = config.gesture.cooldownMs;
const THRESHOLD = config.gesture.confidenceThreshold;

/** Feed `kind` at `conf` every 50 ms over [from, to]; return fire times. */
function sustain(
  r: GestureRecognizer,
  kind: GestureKind | null,
  conf: number,
  from: number,
  to: number,
  step = 50,
) {
  const fired: number[] = [];
  for (let t = from; t <= to; t += step) {
    const e = r.push({ kind, confidence: conf }, t);
    if (e) fired.push(t);
  }
  return fired;
}

describe("normative tunables", () => {
  it("matches the spec (§28): 0.7 confidence, 400 ms hold, 1200 ms cooldown", () => {
    expect(THRESHOLD).toBe(0.7);
    expect(HOLD).toBe(400);
    expect(COOLDOWN).toBe(1200);
  });
});

describe("hold gate", () => {
  it("fires exactly when the hold completes, once", () => {
    const r = new GestureRecognizer();
    expect(sustain(r, "OPEN_HAND", 0.95, 0, HOLD - 50)).toEqual([]);
    const event = r.push({ kind: "OPEN_HAND", confidence: 0.95 }, HOLD);
    expect(event).not.toBeNull();
    expect(event?.kind).toBe("OPEN_HAND");
    expect(event?.confidence).toBeCloseTo(0.95, 9);
    expect(event?.timestamp).toBe(HOLD);
  });

  it("below-threshold poses never fire, however long they are held", () => {
    const r = new GestureRecognizer();
    expect(sustain(r, "OPEN_HAND", THRESHOLD - 0.01, 0, 2000)).toEqual([]);
  });

  it("snapshot reports hold progress for the indicator", () => {
    const r = new GestureRecognizer();
    expect(r.snapshot(0).progress01).toBe(0);
    r.push({ kind: "CLOSED_HAND", confidence: 0.9 }, 0);
    expect(r.snapshot(HOLD / 2).current).toBe("CLOSED_HAND");
    expect(r.snapshot(HOLD / 2).progress01).toBeCloseTo(0.5, 9);
  });
});

describe("hysteresis + decay", () => {
  it("a one-frame dip inside the hysteresis band does not restart the hold", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, 300);
    // Dip to threshold − margin/2: tolerated, hold continues.
    expect(r.push({ kind: "OPEN_HAND", confidence: THRESHOLD - config.gesture.hysteresisMargin / 2 }, 350)).toBeNull();
    expect(r.snapshot(350).current).toBe("OPEN_HAND");
    const event = r.push({ kind: "OPEN_HAND", confidence: 0.95 }, HOLD);
    expect(event?.kind).toBe("OPEN_HAND");
  });

  it("a dip below release restarts the hold from zero", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, 300);
    r.push({ kind: "OPEN_HAND", confidence: 0.2 }, 350);
    expect(r.snapshot(350).current).toBeNull();
    // Full re-hold required: HOLD − 50 more ms is not enough.
    expect(sustain(r, "OPEN_HAND", 0.95, 400, 400 + HOLD - 50)).toEqual([]);
    expect(r.push({ kind: "OPEN_HAND", confidence: 0.95 }, 400 + HOLD)?.kind).toBe("OPEN_HAND");
  });

  it("lost tracking decays the hold and never fires", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, 300);
    expect(r.push({ kind: null, confidence: 0 }, 350)).toBeNull();
    expect(r.snapshot(350).current).toBeNull();
    expect(sustain(r, "OPEN_HAND", 0.95, 400, 400 + HOLD - 50)).toEqual([]);
  });

  it("switching pose restarts the hold for the new pose", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, 300);
    expect(r.push({ kind: "CLOSED_HAND", confidence: 0.95 }, 350)).toBeNull();
    expect(r.snapshot(350).current).toBe("CLOSED_HAND");
    expect(r.push({ kind: "OPEN_HAND", confidence: 0.95 }, 400)).toBeNull();
  });
});

describe("cooldown", () => {
  it("the same gesture cannot double-fire inside the cooldown", () => {
    const r = new GestureRecognizer();
    const first = sustain(r, "OPEN_HAND", 0.95, 0, 2000);
    expect(first[0]).toBe(HOLD);
    // Re-hold completes at first[0]+50+HOLD but cooldown mutes until +COOLDOWN.
    expect(first[1]).toBe(first[0] + COOLDOWN);
  });

  it("cooldown is per-gesture: OPEN never blocks CLOSED", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, HOLD);
    const fired = sustain(r, "CLOSED_HAND", 0.95, HOLD + 50, HOLD + 50 + HOLD);
    expect(fired).toEqual([HOLD + 50 + HOLD]);
  });

  it("cooldownRemaining reports the mute window for the indicator", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, HOLD);
    expect(r.cooldownRemaining("OPEN_HAND", HOLD)).toBe(COOLDOWN);
    expect(r.cooldownRemaining("OPEN_HAND", HOLD + COOLDOWN)).toBe(0);
    expect(r.cooldownRemaining("CLOSED_HAND", HOLD)).toBe(0);
  });
});

describe("discrete gate (swipes)", () => {
  it("fires immediately at threshold, without a hold", () => {
    const r = new GestureRecognizer();
    expect(r.pushDiscrete("SWIPE_UP", 0.9, 1000)?.kind).toBe("SWIPE_UP");
  });

  it("below threshold → nothing; cooldown blocks repeats", () => {
    const r = new GestureRecognizer();
    expect(r.pushDiscrete("SWIPE_UP", THRESHOLD - 0.01, 0)).toBeNull();
    expect(r.pushDiscrete("SWIPE_UP", 0.9, 100)).not.toBeNull();
    expect(r.pushDiscrete("SWIPE_UP", 0.9, 200)).toBeNull();
    expect(r.pushDiscrete("SWIPE_UP", 0.9, 100 + COOLDOWN)?.kind).toBe("SWIPE_UP");
  });
});

describe("garbage guards", () => {
  it("NaN confidence, NaN time, and unknown kinds decay without firing", () => {
    const r = new GestureRecognizer();
    sustain(r, "OPEN_HAND", 0.95, 0, 200);
    expect(r.push({ kind: "OPEN_HAND", confidence: Number.NaN }, 250)).toBeNull();
    expect(r.push({ kind: "OPEN_HAND", confidence: 0.95 }, Number.NaN)).toBeNull();
    expect(r.snapshot(250).current).toBeNull();
    expect(
      r.push(
        // @ts-expect-error — hostile input probe
        { kind: "WAVE_HELLO", confidence: 0.99 },
        300,
      ),
    ).toBeNull();
    expect(r.pushDiscrete("SWIPE_UP", 0.9, Number.NaN)).toBeNull();
  });
});
