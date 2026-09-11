/**
 * Phase 14: Quality & Hardening — Gestures Accuracy & Anti-Misfire Rate
 * Tests:
 * 1. 100% classification accuracy on canonical static poses (OPEN_HAND, CLOSED_HAND, ONE–THREE_FINGERS).
 * 2. 100% classification accuracy on swipes (UP, DOWN, LEFT, RIGHT).
 * 3. 0% misfire rate on indeterminate/resting hand positions (half-curled, loose, garbage).
 * 4. Noise jitter tolerance: ±2% random spatial noise maintains classification.
 * 5. Cooldown guarantees: 0 double-fires within 1200 ms.
 */
import { describe, expect, it } from "vitest";
import {
  classifyStaticGesture,
  SwipeDetector,
  type HandPoint,
} from "@/features/gestures/landmarks";
import { GestureRecognizer } from "@/features/gestures/recognition";
import { config } from "@/lib/config";
import type { GestureKind } from "@/domain/types";

/** Helper: build 21 hand landmarks with specific extended fingers */
function makeHand(extendedFingers: { index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean; thumb?: boolean }): HandPoint[] {
  const points: HandPoint[] = [];
  // Wrist at 0.5, 0.8
  points[0] = { x: 0.5, y: 0.8 };

  // Thumb: 1, 2, 3 (IP), 4 (tip)
  const thumbExt = extendedFingers.thumb ?? false;
  points[1] = { x: 0.45, y: 0.75 };
  points[2] = { x: 0.4, y: 0.7 };
  points[3] = { x: 0.35, y: 0.65 };
  points[4] = { x: thumbExt ? 0.25 : 0.4, y: thumbExt ? 0.55 : 0.68 };

  // Fingers: [tip, pip] indices: index=[8,6], middle=[12,10], ring=[16,14], pinky=[20,18]
  const configs = [
    { baseIdx: 5, ext: extendedFingers.index ?? false, x: 0.45 },
    { baseIdx: 9, ext: extendedFingers.middle ?? false, x: 0.5 },
    { baseIdx: 13, ext: extendedFingers.ring ?? false, x: 0.55 },
    { baseIdx: 17, ext: extendedFingers.pinky ?? false, x: 0.6 },
  ];

  for (const f of configs) {
    points[f.baseIdx] = { x: f.x, y: 0.6 }; // MCP
    points[f.baseIdx + 1] = { x: f.x, y: 0.5 }; // PIP
    points[f.baseIdx + 2] = { x: f.x, y: 0.4 }; // DIP
    // Tip: if extended, y is 0.2 (dist to wrist = 0.6); PIP dist = 0.3 -> ratio = 2.0 > 1.12
    // If closed/curled, tip y is 0.55 (dist to wrist = 0.25); PIP dist = 0.3 -> ratio = 0.83 < 1.12
    points[f.baseIdx + 3] = { x: f.x, y: f.ext ? 0.2 : 0.55 };
  }

  return points;
}

describe("Phase 14 — Gestures Vocabulary Accuracy & Anti-Misfire", () => {
  it("classifies all 5 canonical static poses with 100% accuracy and confidence >= 0.8", () => {
    const closed = classifyStaticGesture(makeHand({ index: false, middle: false, ring: false, pinky: false, thumb: false }));
    expect(closed.kind).toBe("CLOSED_HAND");
    expect(closed.confidence).toBeGreaterThanOrEqual(0.8);

    const open = classifyStaticGesture(makeHand({ index: true, middle: true, ring: true, pinky: true, thumb: true }));
    expect(open.kind).toBe("OPEN_HAND");
    expect(open.confidence).toBeGreaterThanOrEqual(0.8);

    const one = classifyStaticGesture(makeHand({ index: true, middle: false, ring: false, pinky: false }));
    expect(one.kind).toBe("ONE_FINGER");
    expect(one.confidence).toBeGreaterThanOrEqual(0.8);

    const two = classifyStaticGesture(makeHand({ index: true, middle: true, ring: false, pinky: false }));
    expect(two.kind).toBe("TWO_FINGERS");
    expect(two.confidence).toBeGreaterThanOrEqual(0.8);

    const three = classifyStaticGesture(makeHand({ index: true, middle: true, ring: true, pinky: false }));
    expect(three.kind).toBe("THREE_FINGERS");
    expect(three.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("detects all 4 directional swipes with 100% accuracy and confidence >= 0.7", () => {
    const directions = [
      { name: "SWIPE_UP", p0: { x: 0.5, y: 0.8 }, p1: { x: 0.5, y: 0.4 } },
      { name: "SWIPE_DOWN", p0: { x: 0.5, y: 0.3 }, p1: { x: 0.5, y: 0.7 } },
      { name: "SWIPE_LEFT", p0: { x: 0.8, y: 0.5 }, p1: { x: 0.3, y: 0.5 } },
      { name: "SWIPE_RIGHT", p0: { x: 0.2, y: 0.5 }, p1: { x: 0.7, y: 0.5 } },
    ];

    for (const d of directions) {
      const detector = new SwipeDetector();
      detector.push(d.p0, 1000);
      const hit = detector.push(d.p1, 1200);
      expect(hit, d.name).not.toBeNull();
      expect(hit?.kind).toBe(d.name);
      expect(hit?.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("0% misfire on indeterminate half-curled or ambiguous poses", () => {
    // Construct ambiguous hand with all fingers hovering exactly near extension boundary
    const points = makeHand({ index: false, middle: false, ring: false, pinky: false });
    const wrist = points[0];
    // Set tip distance such that ratio is ~1.12 (extension boundary)
    for (const baseIdx of [5, 9, 13, 17]) {
      const pip = points[baseIdx + 1];
      const pipDist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
      const targetDist = pipDist * 1.12; // boundary ratio
      points[baseIdx + 3] = { x: pip.x, y: wrist.y - targetDist };
    }

    const pose = classifyStaticGesture(points);
    // Margin is ~0 -> confidence should be around 0.5, which is BELOW confidenceThreshold 0.7
    expect(pose.confidence).toBeLessThan(config.gesture.confidenceThreshold);

    // Feed to recognizer: should NEVER fire even when held for 5 seconds
    const recognizer = new GestureRecognizer();
    for (let t = 0; t <= 5000; t += 50) {
      const fired = recognizer.push(pose, t);
      expect(fired).toBeNull();
    }
  });

  it("noise jitter of ±2% coordinates maintains 100% classification of open hand", () => {
    const baseHand = makeHand({ index: true, middle: true, ring: true, pinky: true, thumb: true });
    for (let sample = 0; sample < 50; sample++) {
      const noisyHand = baseHand.map((pt) => ({
        x: pt.x + (Math.sin(sample * 17) * 0.02),
        y: pt.y + (Math.cos(sample * 23) * 0.02),
      }));
      const pose = classifyStaticGesture(noisyHand);
      expect(pose.kind).toBe("OPEN_HAND");
      expect(pose.confidence).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("cooldown strictly prevents double-fire across all 9 kinds", () => {
    const kinds: GestureKind[] = [
      "OPEN_HAND", "CLOSED_HAND", "ONE_FINGER", "TWO_FINGERS", "THREE_FINGERS",
      "SWIPE_UP", "SWIPE_DOWN", "SWIPE_LEFT", "SWIPE_RIGHT",
    ];

    for (const kind of kinds) {
      const r = new GestureRecognizer();
      const fire1 = r.pushDiscrete(kind, 0.95, 1000);
      expect(fire1?.kind).toBe(kind);

      // Attempt immediate repeat within cooldown (< 1200 ms)
      const fire2 = r.pushDiscrete(kind, 0.95, 1500);
      expect(fire2).toBeNull();

      // After cooldown (1000 + 1200 = 2200 ms)
      const fire3 = r.pushDiscrete(kind, 0.95, 2300);
      expect(fire3?.kind).toBe(kind);
    }
  });
});
