/**
 * stableVoice: tuner dials lock to the open stable note, never raw pitch.
 * Run: npm test -- stable-note
 */
import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@/domain/types";
import { stableVoice } from "@/features/conductor/stable-note";

function note(id: string, overrides: Partial<NoteEvent> = {}): NoteEvent {
  return {
    id,
    pitch: 392,
    midi: 67,
    startTime: 1.0,
    duration: 0,
    velocity: 0.8,
    confidence: 0.9,
    source: "voice",
    ...overrides,
  };
}

describe("stableVoice", () => {
  it("empty melody reads IDLE (no stable pitch)", () => {
    expect(stableVoice([])).toEqual({ frequency: 0, midi: -1, confidence: 0, voiced: false });
  });

  it("open last note (duration 0) locks the readout", () => {
    const v = stableVoice([note("n1", { pitch: 440, midi: 69, confidence: 0.85 })]);
    expect(v).toEqual({ frequency: 440, midi: 69, confidence: 0.85, voiced: true });
  });

  it("closed last note (duration > 0) reads IDLE — dial falls back to raw/IDLE", () => {
    const v = stableVoice([note("n1", { duration: 0.9 })]);
    expect(v.voiced).toBe(false);
    expect(v.frequency).toBe(0);
  });

  it("only the last note matters (earlier open notes are superseded)", () => {
    const v = stableVoice([
      note("n1", { pitch: 440, midi: 69 }),
      note("n2", { pitch: 523.25, midi: 72, confidence: 0.7 }),
    ]);
    expect(v.frequency).toBeCloseTo(523.25, 9);
    expect(v.midi).toBe(72);
    expect(v.voiced).toBe(true);
  });

  it("legato NoteChanged pitch is what the dial shows (no octave jumps)", () => {
    // Stabilizer emits NoteChanged with the new midi; state updates the
    // melody entry in place — the readout follows without re-attack.
    const v = stableVoice([note("n1", { pitch: 415.3, midi: 68, confidence: 0.8 })]);
    expect(v.midi).toBe(68);
    expect(v.voiced).toBe(true);
  });
});
