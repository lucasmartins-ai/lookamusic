/**
 * Hand-landmark classification (Phase 9, §27–28). Pure — no React, no
 * Web Audio, no network, no instrument imports. Tunables from
 * `config.gesture`.
 *
 * Two layers:
 * 1. `classifyStaticGesture(landmarks)` — 21 MediaPipe-style points →
 *    OPEN_HAND / CLOSED_HAND / ONE–THREE_FINGERS + confidence. Static
 *    poses only; motion goes through `SwipeDetector`.
 * 2. `SwipeDetector` — palm-travel over `swipeWindowMs` → SWIPE_* with
 *    confidence from overshoot past `swipeMinDisplacement`. Slow drift
 *    never fires (the window is the swipe's hold equivalent).
 *
 * MediaPipe wiring (`loadHandLandmarker`, below) is an OPTIONAL runtime
 * loader: it dynamic-imports `@mediapipe/tasks-vision` (local inference,
 * never uploaded) and resolves null when unavailable (SSR, Node tests,
 * package not installed) so the build never depends on the model. Camera
 * preview + synthetic injection keep full UI parity without it.
 */
import { config } from "@/lib/config";
import type { Confidence, GestureKind } from "@/domain/types";

/** One hand landmark in normalized image coords (MediaPipe convention). */
export interface HandPoint {
  x: number;
  y: number;
  z?: number;
}

export type StaticGestureKind =
  | "OPEN_HAND"
  | "CLOSED_HAND"
  | "ONE_FINGER"
  | "TWO_FINGERS"
  | "THREE_FINGERS";

export interface ClassifiedPose {
  kind: StaticGestureKind | null;
  confidence: Confidence;
}

/** MediaPipe hand topology (21 points): [tip, pip] per finger + wrist. */
const WRIST = 0;
const FINGERS: readonly (readonly [number, number])[] = [
  [8, 6], // index: tip, pip
  [12, 10], // middle
  [16, 14], // ring
  [20, 18], // pinky
] as const;
const THUMB_TIP = 4;
const THUMB_IP = 3;

function dist(a: HandPoint, b: HandPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function finitePoint(p: HandPoint | undefined): p is HandPoint {
  return (
    !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.z === undefined || Number.isFinite(p.z))
  );
}

/**
 * Extension ratio per finger: dist(tip, wrist) / dist(pip, wrist).
 * > `fingerExtendRatio` reads as extended (rotation-invariant).
 * Returns null when the landmarks are unusable (never throws).
 */
export function fingerRatios(landmarks: readonly HandPoint[]): (number | null)[] {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return [null, null, null, null];
  const wrist = landmarks[WRIST];
  if (!finitePoint(wrist)) return [null, null, null, null];
  return FINGERS.map(([tip, pip]) => {
    const t = landmarks[tip];
    const p = landmarks[pip];
    if (!finitePoint(t) || !finitePoint(p)) return null;
    const denom = dist(p, wrist);
    if (!(denom > 1e-9)) return null;
    const r = dist(t, wrist) / denom;
    return Number.isFinite(r) ? r : null;
  });
}

/**
 * Static-pose classifier. Counts extended fingers (index…pinky; thumb
 * breaks ties toward OPEN but never decides 1–3 alone):
 * 0 → CLOSED_HAND, 4 (+thumb aware) → OPEN_HAND, 1–3 → N_FINGERS.
 * Confidence is the smallest per-finger margin from the extension
 * boundary, scaled to 0.5–1 — ambiguous half-curled hands read
 * low-confidence (the recognizer then holds them out, never fires).
 */
export function classifyStaticGesture(landmarks: readonly HandPoint[]): ClassifiedPose {
  const ratios = fingerRatios(landmarks);
  if (ratios.some((r) => r === null)) return { kind: null, confidence: 0 };
  const extend = config.gesture.fingerExtendRatio;
  const rs = ratios as number[];
  const extended = rs.filter((r) => r > extend).length;
  // Margin of the closest finger to the boundary decides confidence.
  const margin = Math.min(...rs.map((r) => Math.abs(r - extend)));
  // margin 0 → 0.5 (coin flip), margin ≥ 0.3 → 1.0 (decisive).
  const confidence = Math.min(1, 0.5 + margin / 0.6);

  if (extended === 0) return { kind: "CLOSED_HAND", confidence };
  if (extended >= 4) return { kind: "OPEN_HAND", confidence };
  if (extended === 1) return { kind: "ONE_FINGER", confidence };
  if (extended === 2) return { kind: "TWO_FINGERS", confidence };
  return { kind: "THREE_FINGERS", confidence };
}

/** Thumb openness (display/diagnostics helper; not part of the vocab). */
export function thumbOpen(landmarks: readonly HandPoint[]): boolean {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return false;
  const wrist = landmarks[WRIST];
  const tip = landmarks[THUMB_TIP];
  const ip = landmarks[THUMB_IP];
  if (!finitePoint(wrist) || !finitePoint(tip) || !finitePoint(ip)) return false;
  const denom = dist(ip, wrist);
  if (!(denom > 1e-9)) return false;
  return dist(tip, wrist) / denom > config.gesture.fingerExtendRatio;
}

export type SwipeKind = "SWIPE_UP" | "SWIPE_DOWN" | "SWIPE_LEFT" | "SWIPE_RIGHT";

export interface SwipeDetection {
  kind: SwipeKind;
  confidence: Confidence;
}

function swipeKindFor(dx: number, dy: number): SwipeKind {
  // Image coords: y grows downward — negative dy is an upward swipe.
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "SWIPE_RIGHT" : "SWIPE_LEFT";
  return dy > 0 ? "SWIPE_DOWN" : "SWIPE_UP";
}

/**
 * Palm-travel swipe gate. Feed the palm centroid (or wrist) per frame;
 * when travel inside `swipeWindowMs` exceeds `swipeMinDisplacement` on
 * the dominant axis, fires once and re-arms from the new anchor (a long
 * drag yields repeated swipes, a slow drift yields none). Garbage points
 * reset the anchor without firing.
 */
export class SwipeDetector {
  private trail: { x: number; y: number; t: number }[] = [];

  reset(): void {
    this.trail = [];
  }

  push(palm: HandPoint, nowMs: number): SwipeDetection | null {
    if (!finitePoint(palm) || !Number.isFinite(nowMs)) {
      this.trail = [];
      return null;
    }
    const windowMs = config.gesture.swipeWindowMs;
    this.trail.push({ x: palm.x, y: palm.y, t: nowMs });
    while (this.trail.length > 0 && nowMs - this.trail[0].t > windowMs) this.trail.shift();
    if (this.trail.length < 2) return null;
    const first = this.trail[0];
    const dx = palm.x - first.x;
    const dy = palm.y - first.y;
    const travel = Math.hypot(dx, dy);
    const min = config.gesture.swipeMinDisplacement;
    if (travel < min) return null;
    const kind = swipeKindFor(dx, dy);
    // Overshoot past the gate → confidence (gate = 0.7, 2× gate = 1.0).
    const confidence = Math.min(1, 0.7 + 0.3 * Math.min(1, (travel - min) / min));
    // Re-arm from here so one push can't double-fire.
    this.trail = [{ x: palm.x, y: palm.y, t: nowMs }];
    return { kind, confidence };
  }
}

/** Minimal surface of the MediaPipe HandLandmarker we drive. */
export interface HandLandmarkerLike {
  detectForVideo(
    video: HTMLVideoElement,
    nowMs: number,
  ): { landmarks: HandPoint[][] };
  close(): void;
}

const VISION_PKG = "@mediapipe/" + "tasks-vision";
const VISION_WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/**
 * Load the local MediaPipe HandLandmarker (one hand, VIDEO mode).
 * Dynamic import is deliberately indirect so bundlers skip it
 * (`webpackIgnore`): the model loads at runtime, on-device, and only
 * after the user enables the camera. Resolves null when unavailable —
 * callers fall back to preview-only + synthetic injection (full UI
 * parity, no crash). Frames are classified in memory and never
 * uploaded, recorded, or persisted.
 */
export async function loadHandLandmarker(): Promise<HandLandmarkerLike | null> {
  if (typeof window === "undefined") return null;
  try {
    const vision = (await import(/* webpackIgnore: true */ VISION_PKG)) as {
      FilesetResolver?: {
        forVisionTasks(wasmRoot: string): Promise<unknown>;
      };
      HandLandmarker?: {
        createFromOptions(wasm: unknown, opts: Record<string, unknown>): Promise<{
          detectForVideo(video: HTMLVideoElement, nowMs: number): { landmarks: HandPoint[][] };
          close(): void;
        }>;
      };
    };
    if (!vision?.FilesetResolver || !vision?.HandLandmarker) return null;
    const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM_CDN);
    const marker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    return {
      detectForVideo: (video, nowMs) => marker.detectForVideo(video, nowMs),
      close: () => marker.close(),
    };
  } catch {
    return null;
  }
}
