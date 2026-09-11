/** ConductorState: central MusicalState via events (Phase 8). */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { ConductorState } from "@/features/conductor/state";

function note(id: string, midi: number, startTime: number) {
  return {
    id, pitch: 440, midi, startTime, duration: 0.5,
    velocity: 0.8, confidence: 0.9, source: "voice" as const,
  };
}

describe("ConductorState", () => {
  it("tracks notes/chords/tempo/meter/key into one snapshot", () => {
    const events = new EventBus();
    const st = new ConductorState(events);
    events.emit("NoteStarted", note("n1", 67, 1));
    events.emit("TempoUpdated", { estimated: 96, target: 96, playback: 96, confidence: 0.8 });
    events.emit("MeterChanged", { numerator: 3, denominator: 4 });
    events.emit("KeyUpdated", { root: 7, mode: "major", confidence: 0.7 });
    events.emit("ChordChanged", {
      id: "c1", chord: { root: 0, quality: "major" as const },
      startBar: 0, durationBars: 1, confidence: 0.8,
    });
    const snap = st.snapshot();
    expect(snap.melody).toHaveLength(1);
    expect(snap.tempo.playback).toBe(96);
    expect(snap.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(snap.key.root).toBe(7);
    expect(snap.chords).toHaveLength(1);
    expect(snap.scale.id).toBe("major");
    st.dispose();
  });

  it("NoteChanged updates the open note; NoteEnded closes with duration", () => {
    const events = new EventBus();
    const st = new ConductorState(events);
    events.emit("NoteStarted", note("n1", 67, 1));
    events.emit("NoteChanged", { id: "n1", midi: 69, confidence: 0.8 });
    events.emit("NoteEnded", { id: "n1", duration: 0.9 });
    const snap = st.snapshot();
    expect(snap.melody[0].midi).toBe(69);
    expect(snap.melody[0].duration).toBeCloseTo(0.9, 9);
    st.dispose();
  });

  it("InstrumentAdded/Removed flip the lineup; EnergyChanged moves energy", () => {
    const events = new EventBus();
    const st = new ConductorState(events);
    events.emit("InstrumentRemoved", { instrument: "piano" });
    events.emit("InstrumentAdded", { instrument: "guitar" });
    events.emit("EnergyChanged", { energy: 0.8 });
    const snap = st.snapshot();
    expect(snap.arrangement.active.piano).toBe(false);
    expect(snap.arrangement.active.guitar).toBe(true);
    expect(snap.arrangement.energy).toBeCloseTo(0.8, 9);
    st.dispose();
  });

  it("rings are memory-bounded (melody/chord caps from config)", () => {
    const events = new EventBus();
    const st = new ConductorState(events);
    for (let i = 0; i < config.conductor.melodyCap + 20; i++) {
      events.emit("NoteStarted", note(`n${i}`, 60 + (i % 12), i * 0.5));
      events.emit("NoteEnded", { id: `n${i}`, duration: 0.4 });
    }
    for (let i = 0; i < config.conductor.chordCap + 10; i++) {
      events.emit("ChordChanged", {
        id: `c${i}`, chord: { root: 0, quality: "major" as const },
        startBar: i, durationBars: 1, confidence: 0.5,
      });
    }
    expect(st.melodyNotes().length).toBeLessThanOrEqual(config.conductor.melodyCap);
    expect(st.chordEvents().length).toBeLessThanOrEqual(config.conductor.chordCap);
    st.dispose();
  });
});
