/**
 * Gesture recognition debounce (Phase 9, §27–28). Pure — no React, no
 * Web Audio, no camera, no instrument imports. All tunables from
 * `config.gesture`.
 *
 * Anti-misfire contract (normative, `docs/gesture-architecture.md`):
 * - A static pose fires only while the SAME kind stays ≥
 *   `confidenceThreshold` for ≥ `holdMs` (entry always needs the full
 *   threshold; while held, dips down to threshold − `hysteresisMargin`
 *   are tolerated so one noisy frame doesn't restart the hold).
 * - After a fire, the same kind is muted for `cooldownMs` (per-gesture
 *   cooldown: OPEN→CLOSED stays fast, OPEN→OPEN can't double-fire).
 * - Lost tracking (`kind: null`, confidence below release, garbage input)
 *   DECAYS the hold — never latches, never fires.
 * - Swipes are velocity-gated transients, not holdable poses: they enter
 *   through `pushDiscrete` (threshold + shared per-gesture cooldown, no
 *   hold). The swipe's own gate (displacement inside `swipeWindowMs`,
 *   see `landmarks.ts`) is its hold equivalent.
 *
 * One recognizer instance = one hand track. Feed classifier output per
 * frame; a non-null return is a `GestureEvent` ready for the bus
 * (`GestureDetected` → arrangement only).
 */
import { config } from "@/lib/config";
import type { Confidence, GestureEvent, GestureKind } from "@/domain/types";

export interface GestureCandidate {
  kind: GestureKind | null;
  confidence: Confidence;
}

const KINDS: readonly GestureKind[] = [
  "OPEN_HAND",
  "CLOSED_HAND",
  "ONE_FINGER",
  "TWO_FINGERS",
  "THREE_FINGERS",
  "SWIPE_UP",
  "SWIPE_DOWN",
  "SWIPE_LEFT",
  "SWIPE_RIGHT",
];

function isKind(k: unknown): k is GestureKind {
  return typeof k === "string" && (KINDS as readonly string[]).includes(k);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface RecognizerSnapshot {
  /** Pose currently accumulating hold, if any. */
  current: GestureKind | null;
  /** 0–1 hold progress for `current` (1 = will fire this frame). */
  progress01: number;
  /** Last confidence seen for `current`. */
  confidence: number;
}

export class GestureRecognizer {
  private candidate: GestureKind | null = null;
  private holdStartMs = 0;
  private lastConfidence = 0;
  private readonly lastFireMs = new Map<GestureKind, number>();

  reset(): void {
    this.candidate = null;
    this.lastConfidence = 0;
    this.holdStartMs = 0;
  }

  /** UI indicator state at `nowMs` (never drives logic, display only). */
  snapshot(nowMs: number): RecognizerSnapshot {
    if (this.candidate === null || !Number.isFinite(nowMs)) {
      return { current: null, progress01: 0, confidence: 0 };
    }
    const hold = config.gesture.holdMs;
    const elapsed = nowMs - this.holdStartMs;
    return {
      current: this.candidate,
      progress01: hold > 0 ? Math.min(1, Math.max(0, elapsed / hold)) : 1,
      confidence: this.lastConfidence,
    };
  }

  /** ms until `kind` may fire again (0 = ready). */
  cooldownRemaining(kind: GestureKind, nowMs: number): number {
    const last = this.lastFireMs.get(kind);
    if (last === undefined || !Number.isFinite(nowMs)) return 0;
    return Math.max(0, last + config.gesture.cooldownMs - nowMs);
  }

  /**
   * Push one classifier frame. Returns a `GestureEvent` on the exact frame
   * the hold completes (and cooldown allows), else null. Garbage input
   * (NaN time/confidence, unknown kind) decays the hold and returns null.
   */
  push(candidate: GestureCandidate, nowMs: number): GestureEvent | null {
    if (!Number.isFinite(nowMs)) {
      this.candidate = null;
      this.lastConfidence = 0;
      return null;
    }
    const threshold = config.gesture.confidenceThreshold;
    const release = threshold - config.gesture.hysteresisMargin;
    const conf = clamp01(candidate.confidence);
    const kind = isKind(candidate.kind) ? candidate.kind : null;

    // Lost tracking or deep dip → decay, never latch.
    if (kind === null || conf < release) {
      this.candidate = null;
      this.lastConfidence = 0;
      return null;
    }
    // New pose (or switch) → entry needs the FULL threshold, restart hold.
    if (this.candidate === null || kind !== this.candidate) {
      if (conf < threshold) {
        this.candidate = null;
        this.lastConfidence = 0;
        return null;
      }
      this.candidate = kind;
      this.holdStartMs = nowMs;
      this.lastConfidence = conf;
      return null;
    }
    // Same pose continuing (hysteresis already tolerated the dip band).
    this.lastConfidence = conf;
    if (nowMs - this.holdStartMs < config.gesture.holdMs) return null;
    if (this.cooldownRemaining(kind, nowMs) > 0) return null;
    this.lastFireMs.set(kind, nowMs);
    this.candidate = null;
    this.lastConfidence = 0;
    return { kind, confidence: conf, timestamp: nowMs };
  }

  /**
   * Transient gate for swipes (no hold — the motion window in
   * `landmarks.ts` already gates them). Applies the confidence threshold
   * plus the same per-gesture cooldown. Returns the event or null.
   */
  pushDiscrete(kind: GestureKind, confidence: Confidence, nowMs: number): GestureEvent | null {
    if (!isKind(kind) || !Number.isFinite(nowMs)) return null;
    const conf = clamp01(confidence);
    if (conf < config.gesture.confidenceThreshold) return null;
    if (this.cooldownRemaining(kind, nowMs) > 0) return null;
    this.lastFireMs.set(kind, nowMs);
    return { kind, confidence: conf, timestamp: nowMs };
  }
}
