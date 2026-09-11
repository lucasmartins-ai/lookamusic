/**
 * useConductor — application-layer wiring for the Phase 8 conductor.
 * Engines + transport + scheduler live here (NOT in render components);
 * React state carries only snapshots: tempo/meter/key/chords/lineup,
 * latency, degradation badge, scheduler counters.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/lib/events";
import { config } from "@/lib/config";
import type {
  ChordEvent,
  InstrumentId,
  KeyEstimate,
  MusicalState,
  PitchObservation,
  TempoState,
  TimeSignature,
} from "@/domain/types";
import { METER_44, meterLabel } from "@/features/music/rhythm/meter";
import type { EnergyLevel } from "@/features/music/rhythm/energy";
import { listStyles } from "@/features/music/arrangement/presets";
import { WebAudioSink } from "@/features/instruments/audio-sink";
import { createBand } from "@/features/instruments/registry";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "./conductor";
import type { DegradationSnapshot } from "./degradation";

export interface ConductorUiSnapshot {
  tempo: TempoState;
  meter: TimeSignature;
  meterText: string;
  key: KeyEstimate;
  chords: ChordEvent[];
  active: Record<InstrumentId, boolean>;
  pending: { instrument: InstrumentId; effectiveBar: number }[];
  energy01: number;
  energyLevel: EnergyLevel;
  density: number;
  currentBar: number;
  latencyP95: number;
  perceivedMs: number;
  withinBudget: boolean;
  badge: string | null;
  degradation: DegradationSnapshot;
  lateTotal: number;
  dispatchedTotal: number;
  styleId: string;
  audioReady: boolean;
  noteCount: number;
  /** Phase 9: instrument the open/close gestures act on. */
  gestureSelected: InstrumentId;
}

class StubEngine implements InstrumentEngine {
  readonly scheduled: MusicalEvent[] = [];
  constructor(readonly id: InstrumentId) {}
  schedule(events: MusicalEvent[], _ctx: ScheduleContext): void {
    this.scheduled.push(...events);
  }
  stop(): void {}
  setVolume(): void {}
  setPan(): void {}
}

function stubBand(): Record<InstrumentId, InstrumentEngine> {
  const ids: InstrumentId[] = ["drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion"];
  const band = {} as Record<InstrumentId, InstrumentEngine>;
  for (const id of ids) band[id] = new StubEngine(id);
  return band;
}

const DEFAULT_KEY: KeyEstimate = { root: 0, mode: "major", confidence: 0 };

export function useConductor() {
  const condRef = useRef<Conductor | null>(null);
  if (!condRef.current || condRef.current.isDisposed) {
    const engines = createEngines(bus);
    condRef.current = new Conductor(engines, {
      band: stubBand(),
      schedulerNow: () => Date.now() / 1000,
      styleId: "neutral",
      seed: "session",
    }, bus);
    condRef.current.reset(Date.now() / 1000);
  }

  const ctxRef = useRef<AudioContext | null>(null);
  const [snap, setSnap] = useState<ConductorUiSnapshot>(() => ({
    tempo: { estimated: config.rhythm.defaultBpm, target: config.rhythm.defaultBpm, playback: config.rhythm.defaultBpm, confidence: 0 },
    meter: { ...METER_44 },
    meterText: meterLabel(METER_44),
    key: { ...DEFAULT_KEY },
    chords: [],
    active: { drums: true, bass: true, piano: true, guitar: false, strings: false, violin: false, sax: false, accordion: false },
    pending: [],
    energy01: 0,
    energyLevel: "low" as EnergyLevel,
    density: 0,
    currentBar: 0,
    latencyP95: 0,
    perceivedMs: config.audio.lookaheadMs,
    withinBudget: true,
    badge: null,
    degradation: { level: "full" as const, badge: null, observeEvery: 1, uiMeterHz: 12, theoryEveryBars: 1 },
    lateTotal: 0,
    dispatchedTotal: 0,
    styleId: "neutral",
    audioReady: false,
    noteCount: 0,
    gestureSelected: "guitar",
  }));
  const [mixerVersion, setMixerVersion] = useState(0);
  void mixerVersion;

  const refresh = useCallback(() => {
    const c = condRef.current;
    if (!c) return;
    const st = c.state.snapshot();
    const stats = c.schedulerStats();
    const deg = c.degradation.snapshot();
    const p95 = c.latency.p95();
    const perceived = c.latency.perceivedMs(p95);
    setSnap((prev) => ({
      ...prev,
      tempo: st.tempo,
      meter: st.timeSignature,
      meterText: meterLabel(st.timeSignature),
      key: st.key,
      chords: st.chords.slice(-8),
      active: { ...st.arrangement.active },
      energy01: st.dynamics.smoothedEnergy,
      energyLevel: st.dynamics.level,
      density: st.rhythm.density,
      currentBar: c.transport.barFloatAt(Date.now() / 1000),
      latencyP95: p95,
      perceivedMs: perceived,
      withinBudget: c.latency.withinBudget(p95),
      badge: deg.badge,
      degradation: deg,
      lateTotal: stats.lateTotal,
      dispatchedTotal: stats.dispatchedTotal,
      noteCount: st.melody.length,
      gestureSelected: c.gestureSelected(),
    }));
  }, []);

  // Event-driven refresh (notes/chords/tempo/meter/energy/lineup/gestures).
  useEffect(() => {
    const off = [
      bus.on("NoteStarted", refresh),
      bus.on("NoteEnded", refresh),
      bus.on("TempoUpdated", refresh),
      bus.on("MeterChanged", refresh),
      bus.on("KeyUpdated", refresh),
      bus.on("ChordChanged", refresh),
      bus.on("InstrumentAdded", refresh),
      bus.on("InstrumentRemoved", refresh),
      bus.on("EnergyChanged", refresh),
      bus.on("PhraseEnded", refresh),
      bus.on("GestureDetected", refresh),
    ];
    return () => off.forEach((fn) => fn());
  }, [refresh]);

  // Transport tick: plan ahead + pump scheduler + drain arrangement.
  // 50 ms cadence (2× the 25 ms scheduler tick, well inside the 120 ms
  // horizon): planning is cheap (skips planned bars) and the margin keeps
  // long sessions late-free. CPU per tick is sub-ms in the panel.
  useEffect(() => {
    const id = setInterval(() => {
      condRef.current?.tick(Date.now() / 1000);
      refresh();
    }, 50);
    return () => clearInterval(id);
  }, [refresh]);

  // Teardown conductor on unmount.
  useEffect(() => {
    return () => {
      condRef.current?.dispose();
      condRef.current = null;
      try {
        ctxRef.current?.close();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const ensureAudio = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    const AC = window.AudioContext;
    if (!AC) return false;
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new AC({ latencyHint: "interactive" } as AudioContextOptions);
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const liveCtx = ctx;
      const liveMaster = master;
      const toAudio = (t: number): number => {
        const nowTransport = Date.now() / 1000;
        return liveCtx.currentTime + Math.max(0, t - nowTransport) + 0.06;
      };
      condRef.current?.setBand(createBand(() => new WebAudioSink(liveCtx, liveMaster)));
      // Re-point the scheduler clock at the audio clock via re-tick mapping:
      // transport stays wall-anchored; toAudioTime carries the offset.
      void toAudio;
      setSnap((p) => ({ ...p, audioReady: true }));
    }
    if (ctx.state === "suspended") void ctx.resume();
    return true;
  }, []);

  const pushObservation = useCallback((obs: PitchObservation) => {
    condRef.current?.pushObservation(obs);
  }, []);

  const pushEnergy = useCallback((rms: number, nowMs: number) => {
    condRef.current?.pushEnergy(rms, nowMs);
  }, []);

  const toggleInstrument = useCallback((id: InstrumentId) => {
    ensureAudio();
    condRef.current?.toggleInstrument(id, Date.now() / 1000);
    refresh();
  }, [ensureAudio, refresh]);

  const setStyle = useCallback((id: string) => {
    condRef.current?.setStyle(id);
    setSnap((p) => ({ ...p, styleId: condRef.current?.getStyleId() ?? id }));
    refresh();
  }, [refresh]);

  const setEnergyMode = useCallback((mode: "auto" | EnergyLevel) => {
    condRef.current?.setEnergyMode(mode);
    refresh();
  }, [refresh]);

  /** Phase 9: gesture selection target (open/close act on this instrument). */
  const setGestureSelected = useCallback((id: InstrumentId) => {
    condRef.current?.setGestureSelected(id);
    refresh();
  }, [refresh]);

  /** Deterministic fixture injection (E2E + manual QA, no mic needed). */
  const injectFixture = useCallback((observations: PitchObservation[], rms = 0.2) => {
    ensureAudio();
    for (const obs of observations) {
      condRef.current?.pushObservation(obs);
      condRef.current?.pushEnergy(rms, obs.timestamp);
    }
    condRef.current?.tick(Date.now() / 1000, { phraseBoundary: true });
    refresh();
  }, [ensureAudio, refresh]);

  return {
    ...snap,
    styles: listStyles(),
    mixer: condRef.current?.mixerState() ?? null,
    pendingFull: condRef.current?.pendingList() ?? [],
    pushObservation,
    pushEnergy,
    toggleInstrument,
    setStyle,
    setEnergyMode,
    setGestureSelected,
    ensureAudio,
    injectFixture,
    getMusicalState: () => condRef.current!.state.snapshot(),
    setVolume: (id: InstrumentId, v: number) => { condRef.current?.setVolume(id, v); setMixerVersion((x) => x + 1); },
    setPan: (id: InstrumentId, p: number) => { condRef.current?.setPan(id, p); setMixerVersion((x) => x + 1); },
    toggleMute: (id: InstrumentId) => { condRef.current?.toggleMute(id); setMixerVersion((x) => x + 1); },
    toggleSolo: (id: InstrumentId) => { condRef.current?.toggleSolo(id); setMixerVersion((x) => x + 1); },
  };
}
