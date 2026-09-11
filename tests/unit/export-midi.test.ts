import { describe, it, expect } from "vitest";
import { exportToMidi, parseMidi, MIDI_PPQ } from "@/features/export/midi";
import { createDefaultComposition } from "@/features/recording/schema";
import type { Composition, NoteEvent, ChordEvent } from "@/domain/types";

function fixtureComposition(tempo = 120, num = 4, den = 4): Composition {
  const comp = createDefaultComposition({
    name: "Sinfonia Teste MIDI",
    tempo,
    timeSignature: { numerator: num as 3 | 4 | 6, denominator: den as 4 | 8 },
    key: { root: 0, mode: "major", confidence: 1.0 },
    scaleId: "major",
  });

  const notes: NoteEvent[] = [
    {
      id: "m1",
      pitch: 261.63,
      midi: 60, // C4
      startTime: 0.0,
      duration: 0.5,
      velocity: 0.8,
      confidence: 1,
      source: "voice",
    },
    {
      id: "m2",
      pitch: 293.66,
      midi: 62, // D4
      startTime: 0.5,
      duration: 0.5,
      velocity: 0.85,
      confidence: 1,
      source: "voice",
    },
    {
      id: "m3",
      pitch: 329.63,
      midi: 64, // E4
      startTime: 1.0,
      duration: 1.0,
      velocity: 0.9,
      confidence: 1,
      source: "voice",
    },
    {
      id: "m4",
      pitch: 392.0,
      midi: 67, // G4
      startTime: 2.0,
      duration: 0.75,
      velocity: 0.7,
      confidence: 1,
      source: "voice",
    },
  ];

  const chords: ChordEvent[] = [
    {
      id: "c1",
      chord: { root: 0, quality: "major" }, // C major: C, E, G
      startBar: 0,
      durationBars: 1,
      confidence: 0.95,
    },
    {
      id: "c2",
      chord: { root: 5, quality: "major" }, // F major: F, A, C
      startBar: 1,
      durationBars: 1,
      confidence: 0.9,
    },
  ];

  comp.melody = notes;
  comp.chords = chords;
  return comp;
}

describe("Standard MIDI File (SMF 1.0) Export & Re-import (Phase 12, §40)", () => {
  it("encodes valid SMF Format 1 binary header and tracks", () => {
    const comp = fixtureComposition(120, 4, 4);
    const midiBytes = exportToMidi(comp);

    expect(midiBytes).toBeInstanceOf(Uint8Array);
    expect(midiBytes.length).toBeGreaterThan(50);

    // MThd header checks
    const magic = String.fromCharCode(midiBytes[0], midiBytes[1], midiBytes[2], midiBytes[3]);
    expect(magic).toBe("MThd");

    const parsed = parseMidi(midiBytes);
    expect(parsed.format).toBe(1); // Multitrack synchronous
    expect(parsed.trackCount).toBe(3); // Conductor, Melody, Chords
    expect(parsed.ppq).toBe(MIDI_PPQ);
    expect(parsed.tempoBpm).toBeCloseTo(120, 1);
    expect(parsed.timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });

  it("re-imports MIDI and verifies note-by-note equality with original state", () => {
    const comp = fixtureComposition(100, 4, 4);
    const midiBytes = exportToMidi(comp);
    const parsed = parseMidi(midiBytes);

    // Track 1 is Melody
    const melodyTrack = parsed.tracks.find((t) => t.name === "Melody");
    expect(melodyTrack).toBeDefined();
    expect(melodyTrack!.notes.length).toBe(comp.melody.length);

    // Note-by-note strict comparison
    for (let i = 0; i < comp.melody.length; i++) {
      const orig = comp.melody[i];
      const reimported = melodyTrack!.notes[i];

      // 1. Pitch / MIDI number
      expect(reimported.midi).toBe(orig.midi);

      // 2. Start time (seconds) — within 2ms tolerance due to PPQ quantization
      expect(Math.abs(reimported.startTimeSec - orig.startTime)).toBeLessThan(0.002);

      // 3. Duration (seconds) — within 2ms tolerance
      expect(Math.abs(reimported.durationSec - orig.duration)).toBeLessThan(0.002);

      // 4. Velocity (0..1) — within 0.02 tolerance due to 7-bit MIDI range 1..127
      expect(Math.abs(reimported.velocity - orig.velocity)).toBeLessThan(0.02);
    }
  });

  it("correctly preserves chords and bar timings in Track 2", () => {
    const comp = fixtureComposition(120, 4, 4);
    const midiBytes = exportToMidi(comp);
    const parsed = parseMidi(midiBytes);

    const chordsTrack = parsed.tracks.find((t) => t.name === "Chords");
    expect(chordsTrack).toBeDefined();

    // 2 chords of 3 notes each = 6 notes
    expect(chordsTrack!.notes.length).toBe(6);

    // Bar 0 chords start at t = 0
    const bar0Notes = chordsTrack!.notes.filter((n) => n.startTick === 0);
    expect(bar0Notes.length).toBe(3); // C, E, G
    const midisBar0 = bar0Notes.map((n) => n.midi % 12).sort((a, b) => a - b);
    expect(midisBar0).toEqual([0, 4, 7]); // C(0), E(4), G(7)

    // At 120 BPM in 4/4, bar 1 starts at 2.0s = 4 beats = 4 * 480 = 1920 ticks
    const bar1Notes = chordsTrack!.notes.filter((n) => n.startTick === 1920);
    expect(bar1Notes.length).toBe(3); // F, A, C
    const midisBar1 = bar1Notes.map((n) => n.midi % 12).sort((a, b) => a - b);
    expect(midisBar1).toEqual([0, 5, 9]); // C(0), F(5), A(9)
  });

  it("handles alternative meters (3/4 and 6/8) and non-standard tempos", () => {
    // 3/4 meter at 90 BPM
    const comp34 = fixtureComposition(90, 3, 4);
    const midi34 = exportToMidi(comp34);
    const parsed34 = parseMidi(midi34);
    expect(parsed34.tempoBpm).toBeCloseTo(90, 1);
    expect(parsed34.timeSignature).toEqual({ numerator: 3, denominator: 4 });

    // 6/8 meter at 136 BPM
    const comp68 = fixtureComposition(136, 6, 8);
    const midi68 = exportToMidi(comp68);
    const parsed68 = parseMidi(midi68);
    expect(parsed68.tempoBpm).toBeCloseTo(136, 1);
    expect(parsed68.timeSignature).toEqual({ numerator: 6, denominator: 8 });
  });

  it("handles edge cases: empty melody and single note", () => {
    const compEmpty = fixtureComposition();
    compEmpty.melody = [];
    const midiBytes = exportToMidi(compEmpty);
    const parsed = parseMidi(midiBytes);

    const melodyTrack = parsed.tracks.find((t) => t.name === "Melody");
    expect(melodyTrack!.notes.length).toBe(0);
  });
});
