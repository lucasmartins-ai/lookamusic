"use client";

/**
 * useMicSession — React binding for MicSession (application layer).
 * Throttles worklet observations (~60 Hz max) to UI-meter rate (~12 Hz)
 * and keeps a decimated rolling history for the melody canvas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutotuneConfig, KeyEstimate, PitchObservation } from "@/domain/types";
import { config } from "@/lib/config";
import {
  MicSession,
  type SessionDiagnostics,
  type SessionError,
  type SessionStatus,
} from "./session";

export interface HistoryPoint {
  t: number;
  midi: number; // fractional, -1 unvoiced
  confidence: number;
}

const HISTORY_CAP = 160; // ~13 s at 12 Hz

export function useMicSession(onObservation?: (obs: PitchObservation) => void) {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<SessionError | null>(null);
  const [current, setCurrent] = useState<PitchObservation | null>(null);
  const [diagnostics, setDiagnostics] = useState<SessionDiagnostics | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [autotuneConfig, setAutotuneConfig] = useState<AutotuneConfig>({
    enabled: false,
    speed: "pop",
    snapMode: "chromatic",
    amount: config.autotune.defaultAmount,
    monitorVolume: config.autotune.defaultMonitorVolume,
  });
  const sessionRef = useRef<MicSession | null>(null);
  const latestRef = useRef<PitchObservation | null>(null);
  const runningRef = useRef(false);
  // Phase 2 melody path: raw observations tap straight into the engine
  // pipeline (smoothing → stabilization). UI still renders only throttled
  // meters + domain events, never these samples.
  const tapRef = useRef(onObservation);
  tapRef.current = onObservation;

  // Throttled UI pump: push latest observation at uiThrottleHz.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!runningRef.current) return;
      const obs = latestRef.current;
      if (!obs) return;
      setCurrent(obs);
      setHistory((h) => {
        const next = [...h, { t: obs.timestamp, midi: obs.midiNote, confidence: obs.confidence }];
        return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
      });
      const d = sessionRef.current?.snapshotDiagnostics() ?? null;
      if (d) setDiagnostics(d);
    }, 1000 / config.pitch.uiThrottleHz);
    return () => clearInterval(interval);
  }, []);

  const updateAutotune = useCallback((patch: Partial<AutotuneConfig>) => {
    setAutotuneConfig((prev) => {
      const next = { ...prev, ...patch };
      sessionRef.current?.autotune.updateConfig(next);
      return next;
    });
  }, []);

  const setKey = useCallback((key: KeyEstimate | null) => {
    sessionRef.current?.setKey(key);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    setError(null);
    const session = new MicSession(
      (obs) => {
        latestRef.current = obs;
        tapRef.current?.(obs);
      },
      (s, err) => {
        setStatus(s);
        runningRef.current = s === "running";
        setError(err ?? null);
        if (s === "idle") {
          latestRef.current = null;
        }
      },
    );
    session.autotune.updateConfig(autotuneConfig);
    sessionRef.current = session;
    await session.start();
  }, [autotuneConfig]);

  const stop = useCallback(async () => {
    runningRef.current = false;
    await sessionRef.current?.stop();
    sessionRef.current = null;
    setCurrent(null);
    setDiagnostics(null);
  }, []);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
    };
  }, []);

  return {
    status,
    error,
    current,
    history,
    diagnostics,
    autotune: autotuneConfig,
    updateAutotune,
    setKey,
    start,
    stop,
  };
}
