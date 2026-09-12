/**
 * Hum-first melody cleanup: pattern/repetition understanding.
 * The user report: "uma música que tem umas 6 notas identificou mais de 14".
 * Run: npm test -- recording-hum-cleanup
 */
import { describe, expect, it } from "vitest";
import type { MusicalState, NoteEvent } from "@/domain/types";
import { cleanupHummedMelody } from "@/features/recording/hum-cleanup";
import { buildPlayAlongComposition, lastPlayAlongNotes } from "@/features/recording/playalong";

let seq = 0;

function note(
  midi: number,
  startTime: number,
  duration: number,
  confidence = 0.9,
): NoteEvent {
  seq += 1;
  return {
    id: `n${seq}`,
    pitch: 440 * Math.pow(2, (midi - 69) / 12),
    midi,
    startTime,
    duration,
    velocity: confidence,
    confidence,
    source: "voice",
  };
}

describe("cleanupHummedMelody", () => {
  it("funde fragmentos da mesma nota (respiração/oclusiva) numa nota só", () => {
    const raw = [note(60, 0, 0.5), note(60, 0.55, 0.45), note(60, 1.0, 0.1)];
    const { notes, stats } = cleanupHummedMelody(raw);
    expect(notes).toHaveLength(1);
    expect(stats.merged).toBe(2);
    expect(notes[0].duration).toBeCloseTo(1.1, 3);
  });

  it("descarta o flicker de semitom entre duas notas iguais (G4 → G#4 → G4)", () => {
    const raw = [note(67, 0, 0.5), note(68, 0.55, 0.1), note(67, 0.7, 0.6)];
    const { notes, stats } = cleanupHummedMelody(raw);
    expect(stats.flickers).toBe(1);
    // Os dois G4 ficaram vizinhos com um buraco de 0,2 s → fundidos numa nota
    // sustentada (o G#4 de 0,1 s entre eles era ruído do detector).
    expect(stats.merged).toBe(1);
    expect(notes).toHaveLength(1);
    expect(notes[0].midi).toBe(67);
    expect(notes[0].duration).toBeCloseTo(1.3, 3);
  });

  it("descarta blip curto e pouco confiável", () => {
    const raw = [note(60, 0, 0.5), note(64, 0.55, 0.05, 0.2), note(67, 0.7, 0.5)];
    const { notes, stats } = cleanupHummedMelody(raw);
    expect(stats.blips).toBe(1);
    expect(notes.map((n) => n.midi)).toEqual([60, 67]);
  });

  it("repetição dentro da janela continua sendo a mesma nota sustentada", () => {
    const raw = [note(62, 0, 0.3), note(62, 0.7, 0.3)];
    const { notes, stats } = cleanupHummedMelody(raw);
    expect(stats.repeats).toBe(1);
    expect(notes).toHaveLength(1);
    expect(notes[0].duration).toBeCloseTo(1.0, 3);
  });

  it("notas distintas passam intactas (limpeza não inventa nem apaga melodia)", () => {
    const raw = [note(60, 0, 1), note(62, 1.2, 1), note(64, 2.4, 1), note(65, 3.6, 1), note(67, 4.8, 1), note(69, 6.0, 1)];
    const { notes, stats } = cleanupHummedMelody(raw);
    expect(notes).toHaveLength(6);
    expect(stats.merged + stats.repeats + stats.flickers + stats.blips).toBe(0);
  });

  it("ignora entradas inválidas sem lançar", () => {
    const raw: NoteEvent[] = [
      { ...note(60, 0, 0.5), midi: -1 },
      { ...note(60, 0, 0.5), startTime: Number.NaN },
      note(60, 1, 0.5),
    ];
    const { notes } = cleanupHummedMelody(raw);
    expect(notes).toHaveLength(1);
  });
});

function baseState(melody: NoteEvent[]): MusicalState {
  return {
    tempo: { estimated: 90, target: 90, playback: 90, confidence: 1 },
    timeSignature: { numerator: 4, denominator: 4 },
    key: { root: 0, mode: "major", confidence: 0.9 },
    scale: { id: "major", name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    melody,
    chords: [],
    rhythm: {
      tempo: { estimated: 90, target: 90, playback: 90, confidence: 1 },
      meter: { numerator: 4, denominator: 4 },
      density: 0.5,
      onsets: [],
    },
    arrangement: {
      active: { drums: true, bass: false, piano: true, guitar: false, violao: true, strings: false, violin: false, sax: false, accordion: false },
      energy: 0.5,
    },
    dynamics: { inputEnergy: 0.5, smoothedEnergy: 0.5, level: "medium" },
  };
}

describe("buildPlayAlongComposition + limpeza", () => {
  it("18 fragmentos de 6 notas cantadas viram uma música de 6 notas", () => {
    const raw: NoteEvent[] = [];
    const pitches = [60, 62, 64, 65, 67, 69];
    pitches.forEach((midi, i) => {
      const base = i * 1.0;
      // Cada nota cantada chega picotada em 3 fragmentos (respiração + ataque).
      raw.push(note(midi, base, 0.4), note(midi, base + 0.44, 0.4), note(midi, base + 0.88, 0.12));
    });
    expect(raw).toHaveLength(18);

    const comp = buildPlayAlongComposition(baseState(raw), "Cantarolada");
    expect(comp).not.toBeNull();
    expect(comp!.melody).toHaveLength(6);
    expect(comp!.melody.map((n) => n.midi)).toEqual(pitches);

    const clean = lastPlayAlongNotes();
    expect(clean?.rawCount).toBe(18);
    expect(clean?.cleanCount).toBe(6);
    expect(clean?.stats.merged).toBe(12);
    expect(comp!.metadata.rawNoteCount).toBe(18);
  });

  it("não gera música quando só sobraram artefatos", () => {
    const raw = [note(64, 0, 0.04, 0.1)];
    expect(buildPlayAlongComposition(baseState(raw))).toBeNull();
  });
});
