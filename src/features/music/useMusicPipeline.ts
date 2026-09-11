/**
 * useMusicPipeline — application-layer wiring for the melody + rhythm path
 * (smoothing → stabilization → phrases → tempo/meter/energy).
 *
 * The engines consume raw PitchObservations here (NOT in render components);
 * React state is fed exclusively by domain events on the bus (NoteStarted /
 * NoteChanged / NoteEnded, PhraseStarted / PhraseEnded, TempoUpdated,
 * MeterChanged), so components never see samples — only music.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NoteEvent,
  PitchObservation,
  TempoState,
  TimeSignature,
} from "@/domain/types";
import { bus } from "@/lib/events";
import { config } from "@/lib/config";
import { PitchSmoother } from "./melody/smoothing";
import { NoteStabilizer } from "./melody/stabilization";
import { PhraseTracker } from "./melody/phrases";
import { TempoEstimator } from "./rhythm/tempo";
import { METER_44, MeterTracker } from "./rhythm/meter";
import { EnergyNormalizer, type EnergyLevel } from "./rhythm/energy";
import {
  renderAccompaniment,
  type DrumEvent,
  type DrumStyleId,
  type RhythmInput,
} from "./rhythm/patterns";

export interface TimelineNote extends NoteEvent {
  open?: boolean;
}

export interface TimelinePhrase {
  id: string;
  startTime: number;
  endTime: number | null;
}

/** UI ring bounds (rendering caps, not musical thresholds). */
const NOTE_CAP = 64;
const PHRASE_CAP = 16;
/** Slow tick so phrases/tempo/settle after the voice stops. */
const SETTLE_TICK_MS = 500;
/** Energy re-render guard: UI updates only on material change. */
const ENERGY_DELTA = 0.02;

interface Engines {
  smoother: PitchSmoother;
  stabilizer: NoteStabilizer;
  phrases: PhraseTracker;
  tempo: TempoEstimator;
  meter: MeterTracker;
  energy: EnergyNormalizer;
}

function trim<T>(arr: T[], cap: number): T[] {
  return arr.length > cap ? arr.slice(arr.length - cap) : arr;
}

export function useMusicPipeline() {
  const enginesRef = useRef<Engines | null>(null);
  if (!enginesRef.current) {
    enginesRef.current = {
      smoother: new PitchSmoother(),
      stabilizer: new NoteStabilizer(bus),
      phrases: new PhraseTracker(bus),
      tempo: new TempoEstimator(bus),
      meter: new MeterTracker(bus),
      energy: new EnergyNormalizer(),
    };
  }

  const [notes, setNotes] = useState<TimelineNote[]>([]);
  const [phrases, setPhrases] = useState<TimelinePhrase[]>([]);
  const [tempo, setTempo] = useState<TempoState>({
    estimated: config.rhythm.defaultBpm,
    target: config.rhythm.defaultBpm,
    playback: config.rhythm.defaultBpm,
    confidence: 0,
  });
  const [meter, setMeter] = useState<TimeSignature>({ ...METER_44 });
  const [energy01, setEnergy01] = useState(0);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("low");
  const [density, setDensity] = useState(0);

  // UI subscriptions: events only, never samples.
  useEffect(() => {
    const off = [
      bus.on("NoteStarted", (n) =>
        setNotes((ns) => trim([...ns, { ...n, open: true }], NOTE_CAP)),
      ),
      bus.on("NoteChanged", (u) =>
        setNotes((ns) => ns.map((n) => (n.id === u.id ? { ...n, midi: u.midi, confidence: u.confidence } : n))),
      ),
      bus.on("NoteEnded", (e) =>
        setNotes((ns) => ns.map((n) => (n.id === e.id ? { ...n, duration: e.duration, open: false } : n))),
      ),
      bus.on("PhraseStarted", (p) =>
        setPhrases((ps) => trim([...ps, { id: p.id, startTime: p.startTime, endTime: null }], PHRASE_CAP)),
      ),
      bus.on("PhraseEnded", (p) =>
        setPhrases((ps) => ps.map((x) => (x.id === p.id ? { ...x, endTime: p.endTime } : x))),
      ),
      bus.on("TempoUpdated", (t) => setTempo({ ...t })),
      bus.on("MeterChanged", (m) => setMeter({ ...m })),
    ];
    const settle = setInterval(() => {
      const now = performance.now();
      const e = enginesRef.current;
      if (!e) return;
      e.phrases.tick(now);
      const t = e.tempo.tick(now);
      e.meter.evaluate(t.playback > 0 ? 60 / t.playback : 60 / config.rhythm.defaultBpm, now / 1000);
      // Phase 6+: onset density drives drum intensity (guarded like energy).
      const d = e.tempo.onsetDensity();
      setDensity((prev) => (Math.abs(d - prev) >= ENERGY_DELTA ? d : prev));
    }, SETTLE_TICK_MS);
    return () => {
      off.forEach((fn) => fn());
      clearInterval(settle);
    };
  }, []);

  /** Feed one raw observation through the melody path (stable reference). */
  const pushObservation = useCallback((obs: PitchObservation) => {
    const e = enginesRef.current;
    if (!e) return;
    const sm = e.smoother.push(obs);
    e.stabilizer.push(sm);
    e.phrases.tick(obs.timestamp);
    const t = e.tempo.tick(obs.timestamp);
    e.meter.evaluate(t.playback > 0 ? 60 / t.playback : 60 / config.rhythm.defaultBpm, obs.timestamp / 1000);
  }, []);

  /**
   * Feed one raw mic RMS sample (e.g. diagnostics `inputRms` at ~12 Hz).
   * Normalized downstream — raw amplitude never reaches the engines.
   */
  const pushEnergy = useCallback((rawRms: number, nowMs: number) => {
    const e = enginesRef.current;
    if (!e) return;
    const snap = e.energy.push(rawRms, nowMs);
    setEnergy01((prev) => (Math.abs(snap.energy01 - prev) >= ENERGY_DELTA ? snap.energy01 : prev));
    setEnergyLevel((prev) => (prev === snap.level ? prev : snap.level));
  }, []);

  /**
   * Current one-bar drum rendering for `style`, driven by live
   * tempo/meter/density/energy. Phase 6+ engines consume this; the page
   * keeps it out of render output until instruments land.
   */
  const getAccompaniment = useCallback(
    (style: DrumStyleId): DrumEvent[] => {
      const e = enginesRef.current;
      if (!e) return [];
      const input: RhythmInput = {
        tempo: e.tempo.state(),
        meter: e.meter.meter(),
        density: e.tempo.onsetDensity(),
        energy01: e.energy.snapshot().energy01,
      };
      return renderAccompaniment(input, style);
    },
    [],
  );

  return { notes, phrases, tempo, meter, energy01, energyLevel, density, pushObservation, pushEnergy, getAccompaniment };
}
