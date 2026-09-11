/**
 * useGestures — application-layer wiring for Phase 9 gestures.
 *
 * Funnels THREE input paths into ONE event (`GestureDetected` on the
 * bus, consumed by the conductor → arrangement only):
 * 1. vision: camera preview → MediaPipe landmarks → static classifier +
 *    swipe gate → `GestureRecognizer` (hold/cooldown) → event;
 * 2. buttons: `send(kind)` emits the same event (full UI parity);
 * 3. keyboard: `gestureForKey` → `send` (full parity, §44).
 *
 * Off-DOM discipline: the vision loop runs in `requestAnimationFrame`
 * and never calls setState per frame — React state updates only on
 * camera status changes, on fired gestures, and on an 8 Hz indicator
 * poll. Frames are classified in memory and never leave the device.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/lib/events";
import type { Confidence, GestureEvent, GestureKind } from "@/domain/types";
import { GestureRecognizer } from "./recognition";
import {
  classifyStaticGesture,
  loadHandLandmarker,
  SwipeDetector,
  type HandLandmarkerLike,
  type HandPoint,
} from "./landmarks";
import { gestureForKey } from "./mapping";
import { CameraSession, type CameraError, type CameraStatus } from "./camera";

/** Indicator poll rate (display only — never the recognition clock). */
const INDICATOR_POLL_MS = 125;

export interface GesturesApi {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camera: CameraStatus;
  cameraError: CameraError | null;
  /** Rationale card acknowledged (pre-explain precedes the request, §43). */
  acknowledged: boolean;
  /** Model loaded and classifying (false = preview-only, parity intact). */
  visionReady: boolean;
  lastGesture: GestureEvent | null;
  liveKind: GestureKind | null;
  liveProgress01: number;
  liveConfidence: number;
  acknowledge: () => void;
  startCamera: () => void;
  stopCamera: () => void;
  /** Emit a gesture event (buttons / demo / E2E — same path as vision). */
  send: (kind: GestureKind, confidence?: Confidence) => void;
  /** Feed one landmark set (vision loop + tests). */
  feedLandmarks: (landmarks: readonly HandPoint[], nowMs: number) => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useGestures(): GesturesApi {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const markerRef = useRef<HandLandmarkerLike | null>(null);
  const rafRef = useRef<number>(0);
  const loopOnRef = useRef(false);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  if (!recognizerRef.current) recognizerRef.current = new GestureRecognizer();
  const swipeRef = useRef<SwipeDetector | null>(null);
  if (!swipeRef.current) swipeRef.current = new SwipeDetector();

  const [camera, setCamera] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [visionReady, setVisionReady] = useState(false);
  const [lastGesture, setLastGesture] = useState<GestureEvent | null>(null);
  const [liveKind, setLiveKind] = useState<GestureKind | null>(null);
  const [liveProgress01, setLiveProgress01] = useState(0);
  const [liveConfidence, setLiveConfidence] = useState(0);

  const fire = useCallback((event: GestureEvent) => {
    bus.emit("GestureDetected", event);
    setLastGesture(event);
  }, []);

  const send = useCallback(
    (kind: GestureKind, confidence: Confidence = 1) => {
      const conf = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 1;
      fire({ kind, confidence: conf, timestamp: Date.now() });
    },
    [fire],
  );

  const feedLandmarks = useCallback(
    (landmarks: readonly HandPoint[], nowMs: number) => {
      const recognizer = recognizerRef.current;
      const swipe = swipeRef.current;
      if (!recognizer || !swipe) return;
      // Static pose → hold gate.
      const pose = classifyStaticGesture(landmarks);
      if (pose.kind !== null) {
        const event = recognizer.push({ kind: pose.kind, confidence: pose.confidence }, nowMs);
        if (event) fire(event);
      } else {
        // Nothing pose-like: decay the hold (never latch on garbage).
        recognizer.push({ kind: null, confidence: 0 }, nowMs);
      }
      // Palm travel → swipe gate → discrete gate (shared cooldown).
      const wrist = landmarks[0];
      if (wrist && Number.isFinite(wrist.x) && Number.isFinite(wrist.y)) {
        const hit = swipe.push(wrist, nowMs);
        if (hit) {
          const event = recognizer.pushDiscrete(hit.kind, hit.confidence, nowMs);
          if (event) fire(event);
        }
      }
    },
    [fire],
  );

  const stopLoop = useCallback(() => {
    loopOnRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    if (loopOnRef.current || typeof window === "undefined") return;
    loopOnRef.current = true;
    const tick = () => {
      if (!loopOnRef.current) return;
      const marker = markerRef.current;
      const video = videoRef.current;
      if (marker && video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const nowMs = performance.now();
          const found = marker.detectForVideo(video, nowMs);
          const hand = found.landmarks[0];
          if (hand) feedLandmarks(hand, nowMs);
          else {
            // Tracking lost mid-stream → decay, never latch.
            recognizerRef.current?.push({ kind: null, confidence: 0 }, nowMs);
            swipeRef.current?.reset();
          }
        } catch {
          // One bad frame never kills the loop.
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [feedLandmarks]);

  const stopCamera = useCallback(() => {
    stopLoop();
    const marker = markerRef.current;
    markerRef.current = null;
    try {
      marker?.close();
    } catch {
      // ignore
    }
    setVisionReady(false);
    recognizerRef.current?.reset();
    swipeRef.current?.reset();
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
    else {
      setCamera("idle");
      setCameraError(null);
    }
  }, [stopLoop]);

  const startCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video || sessionRef.current) return;
    setAcknowledged(true);
    setCameraError(null);
    const session = new CameraSession((status, err) => {
      setCamera(status);
      setCameraError(err ?? null);
      if (status !== "running" && status !== "requesting") stopLoop();
    });
    sessionRef.current = session;
    void session
      .start(video)
      .then(() => {
        if (!session.active) return;
        startLoop();
        // Model loads lazily AFTER the preview flows: the camera is
        // usable (preview + parity controls) even while it downloads,
        // and fully usable without it.
        void loadHandLandmarker().then((marker) => {
          if (!session.active) {
            try {
              marker?.close();
            } catch {
              // ignore
            }
            return;
          }
          if (marker) {
            markerRef.current = marker;
            setVisionReady(true);
          }
        });
      })
      .catch(() => {
        sessionRef.current = null;
      });
  }, [startLoop, stopLoop]);

  const acknowledge = useCallback(() => setAcknowledged(true), []);

  // Indicator poll (display only): hold progress + confidence at 8 Hz.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setInterval(() => {
      const snap = recognizerRef.current?.snapshot(performance.now());
      if (!snap) return;
      setLiveKind((prev) => (prev === snap.current ? prev : snap.current));
      setLiveProgress01(snap.progress01);
      setLiveConfidence(snap.confidence);
    }, INDICATOR_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Keyboard equivalents (§44): same event path as vision — never direct.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      const kind = gestureForKey(e.key);
      if (kind) {
        e.preventDefault();
        send(kind, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);

  // Mirror bus events fired elsewhere (e.g. E2E injection) in the indicator.
  useEffect(() => bus.on("GestureDetected", (g) => setLastGesture({ ...g })), []);

  useEffect(() => () => {
    loopOnRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try {
      markerRef.current?.close();
    } catch {
      // ignore
    }
    void sessionRef.current?.stop();
  }, []);

  return {
    videoRef,
    camera,
    cameraError,
    acknowledged,
    visionReady,
    lastGesture,
    liveKind,
    liveProgress01,
    liveConfidence,
    acknowledge,
    startCamera,
    stopCamera,
    send,
    feedLandmarks,
  };
}
