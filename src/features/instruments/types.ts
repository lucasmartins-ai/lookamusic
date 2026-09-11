/**
 * Instrument engine contracts (Phase 6, §23–25). Pure — no React, no Web Audio.
 * Normative companion: docs/instrument-engine-spec.md
 *
 * `InstrumentEngine` + `ScheduleContext` + `MusicalEvent` are verbatim the
 * spec interfaces. `VoiceSink` (audio-sink.ts) is the only seam to sound:
 * engines plan `MusicalEvent → sink calls`, so every engine is fully
 * testable in Node with a fake sink — no AudioContext in tests, ever.
 */
import type {
  InstrumentId,
  NoteEvent,
  TempoState,
  TimeSignature,
} from "@/domain/types";
import type { VoiceSink } from "./audio-sink";

export interface MusicalEvent {
  note: NoteEvent;
  instrument: InstrumentId;
  bar: number;
  beat: number;
}

export interface ScheduleContext {
  audioTime: number;
  tempo: TempoState;
  meter: TimeSignature;
}

export interface InstrumentEngine {
  readonly id: InstrumentId;
  schedule(events: MusicalEvent[], ctx: ScheduleContext): void;
  stop(all?: boolean): void;
  /** 0–1, clamped. */
  setVolume(v: number): void;
  /** -1–1, clamped. */
  setPan(p: number): void;
}

/** Build one engine voice around a sink (volume/pan nodes live in the sink). */
export type EngineFactory = (sink: VoiceSink) => InstrumentEngine;

/** Beat position in quarter-note units from the bar start. */
export function beatToAudioTime(
  barStartAudio: number,
  beatQuarters: number,
  playbackBpm: number,
): number {
  const bpm = Number.isFinite(playbackBpm) && playbackBpm > 0 ? playbackBpm : 90;
  return barStartAudio + beatQuarters * (60 / bpm);
}

/** Clamp helpers shared by every engine (limits pinned by contract tests). */
export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clampPan(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return p < -1 ? -1 : p > 1 ? 1 : p;
}

/** A12: MIDI → Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
