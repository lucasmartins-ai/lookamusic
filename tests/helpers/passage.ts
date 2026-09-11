/** Shared Phase 6 passage fixture: 2 bars (C → G), 4/4 @96, energy 0.7. */
import type { NoteEvent, TimeSignature } from "@/domain/types";
import type { MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import type { PassageInput } from "@/features/instruments/planning";

export const METER_44: TimeSignature = { numerator: 4, denominator: 4 };

export function demoMelody(): NoteEvent[] {
  return [0, 1].map((k) => ({
    id: `m${k}`,
    pitch: 523.25,
    midi: 72 + k * 2,
    startTime: k * 0.5,
    duration: 0.45,
    velocity: 0.8,
    confidence: 1,
    source: "voice" as const,
  }));
}

export function demoPassage(over: Partial<PassageInput> = {}): PassageInput {
  return {
    chords: [
      { root: 0, quality: "major" },
      { root: 7, quality: "major" },
    ],
    melody: demoMelody(),
    phraseStarts: [0],
    meter: METER_44,
    bpm: 96,
    originSec: 0,
    energy01: 0.7,
    density: 0.5,
    style: "rock",
    ...over,
  };
}

export function scheduleCtx(audioTime = 10, bpm = 96): ScheduleContext {
  return {
    audioTime,
    tempo: { estimated: bpm, target: bpm, playback: bpm, confidence: 1 },
    meter: METER_44,
  };
}

/** Strip nondeterministic note ids for equality assertions. */
export function anon(events: MusicalEvent[]) {
  return events.map((e) => ({ ...e, note: { ...e.note, id: "x" } }));
}
