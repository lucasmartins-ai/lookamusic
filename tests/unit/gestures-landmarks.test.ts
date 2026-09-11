/**
 * Landmark classification + swipe gate (Phase 9, §27–28). Synthetic
 * 21-point hands — no model download, no camera. Run:
 * npm test -- gestures-landmarks
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  classifyStaticGesture,
  fingerRatios,
  loadHandLandmarker,
  SwipeDetector,
  thumbOpen,
  type HandPoint,
} from "@/features/gestures/landmarks";

/** Wrist at (0.5, 0.9); fingers rise from y=0.55. Extended tips reach y≈0.1. */
function makeHand(extended: [boolean, boolean, boolean, boolean]): HandPoint[] {
  const pts: HandPoint[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9 }));
  pts[0] = { x: 0.5, y: 0.9 };
  const xs = [0.38, 0.46, 0.54, 0.62];
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  const mcps = [5, 9, 13, 17];
  for (let f = 0; f < 4; f++) {
    pts[mcps[f]] = { x: xs[f], y: 0.55 };
    pts[pips[f]] = { x: xs[f], y: 0.4 };
    pts[tips[f]] = extended[f] ? { x: xs[f], y: 0.1 } : { x: xs[f], y: 0.72 };
  }
  // Thumb: extended outward for the open hand, curled for the fist.
  const anyOpen = extended.some(Boolean);
  pts[3] = { x: 0.3, y: 0.6 };
  pts[4] = anyOpen ? { x: 0.18, y: 0.45 } : { x: 0.32, y: 0.62 };
  return pts;
}

describe("static vocabulary", () => {
  it("open hand reads OPEN_HAND with firing confidence", () => {
    const pose = classifyStaticGesture(makeHand([true, true, true, true]));
    expect(pose.kind).toBe("OPEN_HAND");
    expect(pose.confidence).toBeGreaterThanOrEqual(config.gesture.confidenceThreshold);
  });

  it("fist reads CLOSED_HAND with firing confidence", () => {
    const pose = classifyStaticGesture(makeHand([false, false, false, false]));
    expect(pose.kind).toBe("CLOSED_HAND");
    expect(pose.confidence).toBeGreaterThanOrEqual(config.gesture.confidenceThreshold);
  });

  it("1/2/3 extended fingers read ONE/TWO/THREE_FINGERS", () => {
    expect(classifyStaticGesture(makeHand([true, false, false, false])).kind).toBe("ONE_FINGER");
    expect(classifyStaticGesture(makeHand([true, true, false, false])).kind).toBe("TWO_FINGERS");
    expect(
      classifyStaticGesture(makeHand([true, true, true, false])).kind,
    ).toBe("THREE_FINGERS");
  });

  it("half-curled hands read low confidence (held out, never fire)", () => {
    // Tips parked almost exactly on the extension boundary.
    const pts = makeHand([false, false, false, false]);
    const pips = [6, 10, 14, 18];
    const tips = [8, 12, 16, 20];
    const extend = config.gesture.fingerExtendRatio;
    for (let f = 0; f < 4; f++) {
      const pip = pts[pips[f]];
      const wrist = pts[0];
      const pipDist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
      pts[tips[f]] = { x: pip.x, y: wrist.y - pipDist * extend };
    }
    const ratios = fingerRatios(pts);
    expect(ratios.every((r) => r !== null && Math.abs(r - extend) < 0.05)).toBe(true);
    const pose = classifyStaticGesture(pts);
    expect(pose.confidence).toBeLessThan(config.gesture.confidenceThreshold);
  });

  it("unusable landmarks decay (null kind, zero confidence, never throws)", () => {
    expect(classifyStaticGesture([])).toEqual({ kind: null, confidence: 0 });
    expect(classifyStaticGesture(makeHand([true, true, true, true]).slice(0, 10))).toEqual({
      kind: null,
      confidence: 0,
    });
    const bad = makeHand([true, true, true, true]);
    bad[8] = { x: Number.NaN, y: 0.1 };
    expect(classifyStaticGesture(bad).confidence).toBe(0);
  });

  it("thumb openness follows the hand (diagnostics helper)", () => {
    expect(thumbOpen(makeHand([true, true, true, true]))).toBe(true);
    expect(thumbOpen(makeHand([false, false, false, false]))).toBe(false);
    expect(thumbOpen([])).toBe(false);
  });
});

describe("swipe gate", () => {
  function travel(points: [number, number][], stepMs = 100): ReturnType<SwipeDetector["push"]> {
    const s = new SwipeDetector();
    let out: ReturnType<SwipeDetector["push"]> = null;
    points.forEach(([x, y], i) => {
      out = s.push({ x, y }, i * stepMs) ?? out;
    });
    return out;
  }

  it("fast rightward travel fires SWIPE_RIGHT with firing confidence", () => {
    const hit = travel([
      [0.2, 0.5],
      [0.32, 0.5],
      [0.5, 0.5],
    ]);
    expect(hit?.kind).toBe("SWIPE_RIGHT");
    expect(hit!.confidence).toBeGreaterThanOrEqual(config.gesture.confidenceThreshold);
  });

  it("upward travel fires SWIPE_UP; downward fires SWIPE_DOWN; left fires SWIPE_LEFT", () => {
    expect(
      travel([
        [0.5, 0.7],
        [0.5, 0.4],
      ])?.kind,
    ).toBe("SWIPE_UP");
    expect(
      travel([
        [0.5, 0.3],
        [0.5, 0.6],
      ])?.kind,
    ).toBe("SWIPE_DOWN");
    expect(
      travel([
        [0.7, 0.5],
        [0.4, 0.5],
      ])?.kind,
    ).toBe("SWIPE_LEFT");
  });

  it("slow drift inside the window never fires", () => {
    const s = new SwipeDetector();
    let fired = 0;
    // 0.02/frame for 3 s: the 600 ms window never holds ≥ 0.25 travel.
    for (let i = 0; i < 30; i++) {
      if (s.push({ x: 0.2 + i * 0.02, y: 0.5 }, i * 100)) fired++;
    }
    expect(fired).toBe(0);
  });

  it("jitter below the gate never fires; one push cannot double-fire", () => {
    const s = new SwipeDetector();
    expect(s.push({ x: 0.5, y: 0.5 }, 0)).toBeNull();
    expect(s.push({ x: 0.52, y: 0.5 }, 100)).toBeNull();
    expect(s.push({ x: 0.5, y: 0.5 }, 200)).toBeNull();
    const first = s.push({ x: 0.8, y: 0.5 }, 300);
    const second = s.push({ x: 0.45, y: 0.5 }, 350);
    expect(first?.kind).toBe("SWIPE_RIGHT");
    // Re-armed at the new anchor: same point again → nothing.
    expect(s.push({ x: 0.45, y: 0.5 }, 400)).toBeNull();
    expect(second?.kind).toBe("SWIPE_LEFT");
  });

  it("garbage resets without throwing", () => {
    const s = new SwipeDetector();
    s.push({ x: 0.2, y: 0.5 }, 0);
    expect(s.push({ x: Number.NaN, y: 0.5 }, 100)).toBeNull();
    expect(s.push({ x: 0.5, y: 0.5 }, Number.NaN)).toBeNull();
    s.reset();
    expect(s.push({ x: 0.5, y: 0.5 }, 0)).toBeNull();
  });
});

describe("MediaPipe loader", () => {
  it("resolves null off-browser (Node) instead of throwing", async () => {
    await expect(loadHandLandmarker()).resolves.toBeNull();
  });
});
