/**
 * useArrangement — application-layer wiring for the Phase 7 arrangement
 * engine (quantized transitions + dynamics + style presets).
 *
 * Engines consume normalized energy and bar positions here (NOT in render
 * components); React state carries only snapshots: lineup, pending queue,
 * energy level, style. Manual instrument toggles quantize like energy
 * changes; a toggle holds until the next energy-level change re-queues the
 * ensemble diff (pinning lands with the Phase 8 conductor).
 *
 * Bar clock honesty: until the Phase 8 conductor owns transport, the bar
 * position derives from wall-clock + live playback tempo (origin = mount).
 * Tempo changes retroactively reshape the grid — tests drive the engine
 * directly, so this affects only the queue display, never correctness.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INSTRUMENTS,
  type ArrangementState,
  type InstrumentId,
  type TempoState,
  type TimeSignature,
} from "@/domain/types";
import { bus } from "@/lib/events";
import { barQuarters } from "../rhythm/meter";
import type { DrumStyleId } from "../rhythm/patterns";
import {
  ArrangementEngine,
  barFloatAt,
  type PendingTransition,
} from "./state";
import { DynamicsTracker, type EnergyLevel } from "./dynamics";
import {
  densityForEnergy,
  ensembleForEnergy,
  listStyles,
  styleById,
  styleDrums,
} from "./presets";

export type EnergyMode = "auto" | EnergyLevel;

export interface ArrangementSnapshot {
  tempo: TempoState;
  meter: TimeSignature;
}

/** Bar-boundary poll (display + queue drain; the engine stays pure). */
const BAR_TICK_MS = 250;

interface Engines {
  arrangement: ArrangementEngine;
  dynamics: DynamicsTracker;
}

function liveBar(nowSec: number, originSec: number, snap: ArrangementSnapshot): number {
  const bpm = snap.tempo.playback > 0 ? snap.tempo.playback : 90;
  return barFloatAt(nowSec, originSec, 60 / bpm, barQuarters(snap.meter));
}

export function useArrangement(snapshot: ArrangementSnapshot) {
  const enginesRef = useRef<Engines | null>(null);
  if (!enginesRef.current) {
    const neutral = styleById("neutral");
    enginesRef.current = {
      arrangement: new ArrangementEngine(bus, {
        active: neutral.defaults.active,
        energy: neutral.defaults.energy ?? 0.5,
      }),
      dynamics: new DynamicsTracker(bus),
    };
  }

  const [arrangement, setArrangement] = useState<ArrangementState>(() =>
    enginesRef.current!.arrangement.snapshot(),
  );
  const [pending, setPending] = useState<PendingTransition[]>([]);
  const [energy01, setEnergy01] = useState(0);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("low");
  const [energyMode, setEnergyModeState] = useState<EnergyMode>("auto");
  const [styleId, setStyleIdState] = useState("neutral");
  const [currentBar, setCurrentBar] = useState(0);
  const [lastFadeSec, setLastFadeSec] = useState<number | null>(null);

  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const modeRef = useRef<EnergyMode>("auto");
  const levelRef = useRef<EnergyLevel>("low");
  const originRef = useRef<number | null>(null);

  const sync = useCallback(() => {
    const e = enginesRef.current;
    if (!e) return;
    setArrangement(e.arrangement.snapshot());
    setPending(e.arrangement.pendingList());
  }, []);

  const barNow = useCallback((): number => {
    if (originRef.current === null && typeof performance !== "undefined") {
      originRef.current = performance.now() / 1000;
    }
    return liveBar(performance.now() / 1000, originRef.current ?? 0, snapRef.current);
  }, []);

  /** Bring the lineup to `level`'s ensemble via quantized requests. */
  const applyLevel = useCallback(
    (level: EnergyLevel) => {
      const e = enginesRef.current;
      if (!e) return;
      const want = new Set<InstrumentId>(ensembleForEnergy(level));
      const bar = barNow();
      const bpm = snapRef.current.tempo.playback;
      const snap = e.arrangement.snapshot();
      e.arrangement.setEnergy(densityForEnergy(level));
      for (const id of INSTRUMENTS) {
        if (want.has(id) !== snap.active[id]) e.arrangement.request(id, want.has(id), bar, bpm);
      }
      sync();
    },
    [barNow, sync],
  );
  const applyLevelRef = useRef(applyLevel);
  applyLevelRef.current = applyLevel;

  // Phrase edges are valid boundaries: drain the queue immediately.
  useEffect(() => {
    const off = bus.on("PhraseEnded", () => {
      const e = enginesRef.current;
      if (!e) return;
      const bar = liveBar(
        performance.now() / 1000,
        originRef.current ?? performance.now() / 1000,
        snapRef.current,
      );
      const applied = e.arrangement.tick(bar, { phraseBoundary: true });
      if (applied.length > 0) setLastFadeSec(applied[0].fadeSec);
      setArrangement(e.arrangement.snapshot());
      setPending(e.arrangement.pendingList());
    });
    return off;
  }, []);

  // Bar-boundary poll: drain due transitions, refresh the display clock.
  useEffect(() => {
    if (originRef.current === null && typeof performance !== "undefined") {
      originRef.current = performance.now() / 1000;
    }
    const id = setInterval(() => {
      const e = enginesRef.current;
      if (!e || typeof performance === "undefined") return;
      const bar = liveBar(performance.now() / 1000, originRef.current ?? 0, snapRef.current);
      setCurrentBar(bar);
      const applied = e.arrangement.tick(bar);
      if (applied.length > 0) setLastFadeSec(applied[0].fadeSec);
      setArrangement(e.arrangement.snapshot());
      setPending(e.arrangement.pendingList());
    }, BAR_TICK_MS);
    return () => clearInterval(id);
  }, []);

  /** Feed one raw mic RMS sample; Auto mode follows the level. */
  const pushEnergy = useCallback((rawRms: number, nowMs: number) => {
    const e = enginesRef.current;
    if (!e) return;
    const before = levelRef.current;
    const snap = e.dynamics.push(rawRms, nowMs);
    setEnergy01(snap.energy01);
    if (snap.level !== before) {
      levelRef.current = snap.level;
      setEnergyLevel(snap.level);
      if (modeRef.current === "auto") applyLevelRef.current(snap.level);
    }
  }, []);

  const setEnergyMode = useCallback((mode: EnergyMode) => {
    modeRef.current = mode;
    setEnergyModeState(mode);
    if (mode !== "auto") applyLevelRef.current(mode);
    else applyLevelRef.current(levelRef.current);
  }, []);

  const setStyle = useCallback((id: string) => {
    setStyleIdState(styleById(id).id);
  }, []);

  const toggleInstrument = useCallback(
    (id: InstrumentId) => {
      const e = enginesRef.current;
      if (!e) return;
      const active = e.arrangement.snapshot().active[id];
      e.arrangement.request(id, !active, barNow(), snapRef.current.tempo.playback);
      sync();
    },
    [barNow, sync],
  );

  const effectiveLevel: EnergyLevel = energyMode === "auto" ? energyLevel : energyMode;
  const drums: DrumStyleId = styleDrums(styleId);

  return {
    arrangement,
    pending,
    energy01,
    energyLevel,
    effectiveLevel,
    energyMode,
    styleId,
    styles: listStyles(),
    drums,
    targetDensity: densityForEnergy(effectiveLevel),
    currentBar,
    lastFadeSec,
    pushEnergy,
    setEnergyMode,
    setStyle,
    toggleInstrument,
  };
}
