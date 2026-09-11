import { describe, expect, it } from "vitest";
import { createDefaultComposition } from "@/features/recording/schema";
import {
  addNote,
  changeChord,
  changeKey,
  changeNoteDuration,
  changeNotePitch,
  changeTempo,
  deleteNote,
  moveNote,
  quantizeMelody,
  regenerateAccompaniment,
  setInstrumentControl,
  toggleInstrumentMute,
} from "@/features/recording/editor";

describe("composition timeline editor", () => {
  it("moves note start time safely and non-destructively", () => {
    const comp = createDefaultComposition({
      melody: [
        {
          id: "n1",
          pitch: 440,
          midi: 69,
          startTime: 1.0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    const moved = moveNote(comp, "n1", 2.25);
    expect(moved.melody[0].startTime).toBe(2.25);
    expect(moved.melody[0].source).toBe("edited");
    // Original composition remains unchanged (immutability)
    expect(comp.melody[0].startTime).toBe(1.0);

    const clamped = moveNote(comp, "n1", -5);
    expect(clamped.melody[0].startTime).toBe(0);
  });

  it("changes note pitch and updates frequency", () => {
    const comp = createDefaultComposition({
      melody: [
        {
          id: "n1",
          pitch: 440,
          midi: 69, // A4
          startTime: 0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    const edited = changeNotePitch(comp, "n1", 60); // C4
    expect(edited.melody[0].midi).toBe(60);
    expect(edited.melody[0].pitch).toBeCloseTo(261.63, 1);
    expect(edited.melody[0].source).toBe("edited");
  });

  it("changes note duration with floor", () => {
    const comp = createDefaultComposition({
      melody: [
        {
          id: "n1",
          pitch: 440,
          midi: 69,
          startTime: 0,
          duration: 1.0,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    const edited = changeNoteDuration(comp, "n1", 2.5);
    expect(edited.melody[0].duration).toBe(2.5);

    const floored = changeNoteDuration(comp, "n1", -0.2);
    expect(floored.melody[0].duration).toBe(0.05);
  });

  it("deletes note from melody", () => {
    const comp = createDefaultComposition({
      melody: [
        {
          id: "n1",
          pitch: 440,
          midi: 69,
          startTime: 0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
        {
          id: "n2",
          pitch: 493.88,
          midi: 71,
          startTime: 0.5,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    const afterDel = deleteNote(comp, "n1");
    expect(afterDel.melody.length).toBe(1);
    expect(afterDel.melody[0].id).toBe("n2");
  });

  it("adds note and maintains chronological ordering", () => {
    const comp = createDefaultComposition({
      melody: [
        {
          id: "n2",
          pitch: 440,
          midi: 69,
          startTime: 2.0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    const withAdded = addNote(comp, {
      pitch: 261.63,
      midi: 60,
      startTime: 0.5,
      duration: 1.0,
      velocity: 0.9,
      confidence: 1,
      source: "edited",
    });

    expect(withAdded.melody.length).toBe(2);
    expect(withAdded.melody[0].midi).toBe(60);
    expect(withAdded.melody[0].startTime).toBe(0.5);
    expect(withAdded.melody[1].midi).toBe(69);
    expect(withAdded.melody[1].startTime).toBe(2.0);
  });

  it("quantizes melody to grid", () => {
    // At 120 BPM: 1 beat = 0.5s. Grid of 0.5 beat (8th note) = 0.25s.
    const comp = createDefaultComposition({
      tempo: 120,
      melody: [
        {
          id: "n1",
          pitch: 440,
          midi: 69,
          startTime: 0.23, // should snap to 0.25
          duration: 0.48, // should snap to 0.50
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
        {
          id: "n2",
          pitch: 440,
          midi: 69,
          startTime: 0.77, // should snap to 0.75
          duration: 0.26, // should snap to 0.25
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    const quantized = quantizeMelody(comp, 0.5);
    expect(quantized.melody[0].startTime).toBe(0.25);
    expect(quantized.melody[0].duration).toBe(0.5);
    expect(quantized.melody[1].startTime).toBe(0.75);
    expect(quantized.melody[1].duration).toBe(0.25);
  });

  it("changes tempo and key within musical bounds", () => {
    const comp = createDefaultComposition({ tempo: 90 });
    const newTempo = changeTempo(comp, 128);
    expect(newTempo.tempo).toBe(128);

    const clampedTempo = changeTempo(comp, 500);
    expect(clampedTempo.tempo).toBe(240);

    const newKey = changeKey(comp, { root: 9, mode: "minor", confidence: 0.9 });
    expect(newKey.key.root).toBe(9);
    expect(newKey.key.mode).toBe("minor");
    expect(newKey.scaleId).toBe("natural-minor");
  });

  it("edits chords and instrument mixer controls", () => {
    const comp = createDefaultComposition({
      chords: [
        {
          id: "c1",
          chord: { root: 0, quality: "major" },
          startBar: 0,
          durationBars: 1,
          confidence: 1,
        },
      ],
    });

    const changedChord = changeChord(comp, 0, { root: 7, quality: "dom7" });
    expect(changedChord.chords[0].chord.root).toBe(7);
    expect(changedChord.chords[0].chord.quality).toBe("dom7");

    const changedMixer = setInstrumentControl(comp, "piano", { volume: 0.6, pan: -0.3 });
    expect(changedMixer.instruments.piano.volume).toBe(0.6);
    expect(changedMixer.instruments.piano.pan).toBe(-0.3);

    const muted = toggleInstrumentMute(changedMixer, "piano");
    expect(muted.instruments.piano.muted).toBe(true);
  });

  it("regenerates accompaniment using harmony engine over edited melody", () => {
    // 4/4 @ 120 BPM: 1 bar = 2.0s.
    // Melody notes C4, E4, G4 in bar 0, then G4, B4, D5 in bar 1
    const comp = createDefaultComposition({
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      key: { root: 0, mode: "major", confidence: 1 },
      melody: [
        {
          id: "n1",
          pitch: 261.63,
          midi: 60, // C4
          startTime: 0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "edited",
        },
        {
          id: "n2",
          pitch: 329.63,
          midi: 64, // E4
          startTime: 0.5,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "edited",
        },
        {
          id: "n3",
          pitch: 392.0,
          midi: 67, // G4
          startTime: 1.0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "edited",
        },
        {
          id: "n4",
          pitch: 392.0,
          midi: 67, // G4 in bar 1
          startTime: 2.2,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "edited",
        },
      ],
      chords: [],
    });

    const regen = regenerateAccompaniment(comp);
    expect(regen.chords.length).toBeGreaterThanOrEqual(2);
    expect(regen.chords[0].startBar).toBe(0);
    expect(regen.chords[1].startBar).toBe(1);
    // Bar 0 has C, E, G: harmony scorer ranks C major top
    expect(regen.chords[0].chord.root).toBe(0); // C
    expect(regen.chords[0].chord.quality).toBe("major");
  });
});
