/**
 * useBand — application-layer wiring for the Phase 6 instrument engines.
 * The engines + scheduler + mixer live here (NOT in render components);
 * React state carries only mixer levels and diagnostics.
 *
 * Audition model (honest placeholder until the Phase 8 conductor): pressing
 * an instrument previews a 2-bar C→G loop voiced by that engine, planned
 * from the LIVE tempo/meter/density and energy floored at
 * `auditionEnergyFloor` (so energy-gated voices like sax still preview).
 * Mute/solo/volume/pan ride the real engine params live.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import {
  INSTRUMENTS,
  type Chord,
  type InstrumentId,
  type NoteEvent,
  type TempoState,
  type TimeSignature,
} from "@/domain/types";
import { createMasterBus } from "./audio-sink";
import { createInstrumentSink } from "./sample-voice";
import { getSampleCache } from "./sample-store";
import {
  defaultMixer,
  effectiveVolume,
  setChannelPan,
  setChannelVolume,
  toggleMute,
  toggleSolo,
  type MixerState,
} from "./mixer";
import { LookaheadScheduler } from "./scheduler";
import { createBand } from "./registry";
import {
  barQuarters,
  planAccordion,
  planBass,
  planDrums,
  planGuitar,
  planPiano,
  planSax,
  planStrings,
  planViolao,
  planViolin,
  type PassageInput,
} from "./planning";
import type { InstrumentEngine, MusicalEvent } from "./types";

export interface BandSnapshot {
  tempo: TempoState;
  meter: TimeSignature;
  energy01: number;
  density: number;
}

interface QueuedBar {
  audioTime: number;
  bar: number;
  events: MusicalEvent[];
  engine: InstrumentEngine;
}

const PLAN_OF: Record<InstrumentId, (input: PassageInput, bars: number) => MusicalEvent[]> = {
  drums: planDrums,
  bass: planBass,
  piano: planPiano,
  guitar: planGuitar,
  violao: planViolao,
  strings: planStrings,
  violin: planViolin,
  sax: planSax,
  accordion: planAccordion,
};

function demoMelody(): NoteEvent[] {
  // Two-bar C-major demo phrase (transport seconds at 90 BPM, origin 0).
  const spq = 60 / 90;
  const midis = [72, 74, 76, 77, 76, 74];
  return midis.map((midi, k) => ({
    id: `f6-demo-${k}`,
    pitch: 440 * Math.pow(2, (midi - 69) / 12),
    midi,
    startTime: k * spq,
    duration: spq * 0.9,
    velocity: 0.8,
    confidence: 1,
    source: "generated" as const,
  }));
}

export function useBand(snapshot: BandSnapshot) {
  const [mixer, setMixerState] = useState<MixerState>(defaultMixer);
  const [audioReady, setAudioReady] = useState(false);
  const [lateTotal, setLateTotal] = useState(0);
  const [auditioning, setAuditioning] = useState<InstrumentId | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const bandRef = useRef<Record<string, InstrumentEngine> | null>(null);
  const schedRef = useRef<LookaheadScheduler<QueuedBar> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const mixerRef = useRef(mixer);
  mixerRef.current = mixer;

  const ensureAudio = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    let ctx = ctxRef.current;
    if (!ctx) {
      const AC = window.AudioContext;
      if (!AC) return false;
      ctx = new AC({ latencyHint: "interactive" } as AudioContextOptions);
      ctxRef.current = ctx;
      const master = createMasterBus(ctx, ctx.destination).input;
      const liveCtx = ctx;
      const liveMaster = master;
      // Phase 16: piano/violão/bateria resolve real samples when the pack is
      // cached (shared SampleCache, consent-gated downloads); anything else
      // — or any miss — is the procedural WebAudioSink, invisibly.
      const cache = getSampleCache();
      bandRef.current = createBand((id) => createInstrumentSink(liveCtx, liveMaster, id, cache));
      setAudioReady(true);
    }
    if (ctx.state === "suspended") void ctx.resume();
    const band = bandRef.current;
    if (band) {
      for (const id of INSTRUMENTS) {
        band[id]?.setVolume(effectiveVolume(mixerRef.current, id));
        band[id]?.setPan(mixerRef.current[id].pan);
      }
    }
    return true;
  }, []);

  const stopAll = useCallback(() => {
    if (stopTimerRef.current !== null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    schedRef.current?.stop();
    schedRef.current?.flush();
    schedRef.current = null;
    const band = bandRef.current;
    if (band) for (const id of Object.keys(band)) band[id]?.stop();
    setAuditioning(null);
  }, []);

  useEffect(() => stopAll, [stopAll]);

  // Mixer → engine params, live.
  useEffect(() => {
    const band = bandRef.current;
    if (!band) return;
    for (const id of INSTRUMENTS) {
      band[id]?.setVolume(effectiveVolume(mixer, id));
      band[id]?.setPan(mixer[id].pan);
    }
  }, [mixer]);

  const audition = useCallback(
    (id: InstrumentId) => {
      if (!ensureAudio()) return;
      const ctx = ctxRef.current;
      const band = bandRef.current;
      const engine = band?.[id];
      if (!ctx || !engine) return;
      stopAll();
      const snap = snapRef.current;
      const bpm = snap.tempo.playback > 0 ? snap.tempo.playback : 90;
      const bars = config.instruments.auditionBars;
      const style = config.instruments.auditionStyle;
      const chords: Chord[] = config.instruments.auditionRoots.map((root) => ({
        root: root as Chord["root"],
        quality: "major" as const,
      }));
      const input: PassageInput = {
        chords,
        melody: demoMelody(),
        phraseStarts: [0],
        meter: snap.meter,
        bpm,
        originSec: 0,
        energy01: Math.max(snap.energy01, config.instruments.auditionEnergyFloor),
        density: snap.density,
        style,
      };
      const events = PLAN_OF[id](input, bars);
      const t0 = ctx.currentTime + 0.08;
      const barQ = barQuarters(snap.meter);
      const barSec = (barQ * 60) / bpm;
      const byBar = new Map<number, MusicalEvent[]>();
      for (const e of events) {
        const list = byBar.get(e.bar) ?? [];
        list.push(e);
        byBar.set(e.bar, list);
      }
      const sched = new LookaheadScheduler<QueuedBar>(
        (hit) => {
          hit.engine.schedule(hit.events, {
            // Bar start: engine voices each event's bar-relative beat from here.
            audioTime: hit.audioTime,
            tempo: snapRef.current.tempo,
            meter: snapRef.current.meter,
          });
        },
        { now: () => ctx.currentTime },
      );
      sched.push(
        [...byBar.entries()].map(([bar, barEvents]) => ({
          audioTime: t0 + bar * barSec,
          bar,
          events: barEvents,
          engine,
        })),
      );
      schedRef.current = sched;
      sched.start();
      setAuditioning(id);
      const totalSec = bars * barSec;
      stopTimerRef.current = setTimeout(
        () => {
          setLateTotal(sched.lateTotal);
          stopAll();
        },
        totalSec * 1000 + 900,
      );
    },
    [ensureAudio, stopAll],
  );

  const setVolume = useCallback((id: InstrumentId, v: number) => {
    setMixerState((m) => setChannelVolume(m, id, v));
  }, []);

  const setPan = useCallback((id: InstrumentId, p: number) => {
    setMixerState((m) => setChannelPan(m, id, p));
  }, []);

  const flipMute = useCallback((id: InstrumentId) => {
    ensureAudio();
    setMixerState((m) => toggleMute(m, id));
  }, [ensureAudio]);

  const flipSolo = useCallback((id: InstrumentId) => {
    ensureAudio();
    setMixerState((m) => toggleSolo(m, id));
  }, [ensureAudio]);

  return {
    mixer,
    audioReady,
    lateTotal,
    auditioning,
    audition,
    stopAll,
    setVolume,
    setPan,
    toggleMute: flipMute,
    toggleSolo: flipSolo,
  };
}
