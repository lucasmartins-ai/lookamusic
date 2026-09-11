import { describe, expect, it } from "vitest";
import type { Chord, KeyEstimate, MusicalState, NoteEvent, PitchClass } from "@/domain/types";
import { getScale } from "@/features/music/theory/scales";
import {
  explainCadence,
  explainChord,
  explainFunctions,
  explainInterval,
  explainMelodyPcs,
  explainModulation,
  explainNote,
  explainProgression,
  explainRhythm,
  explainScale,
  explainState,
  explainVoiceLeading,
  friendlyNoteName,
} from "@/features/learn/explain";
import { getLearnLevels, keyDisplayName } from "@/features/learn/i18n";

function mockNote(midi: number, startTime = 0, duration = 0.5): NoteEvent {
  return {
    id: `note-${midi}-${startTime}`,
    pitch: 440,
    midi,
    startTime,
    duration,
    velocity: 0.8,
    confidence: 0.95,
    source: "voice",
  };
}

describe("Phase 15 / I18N — Educational Mode Localization (pt-BR and en-US)", () => {
  it("formats friendly note names with respective solfège in pt-BR and en-US", () => {
    expect(friendlyNoteName(60, "pt-BR")).toBe("C (Dó)");
    expect(friendlyNoteName(60, "en-US")).toBe("C (Do)");
    expect(friendlyNoteName(67, "pt-BR")).toBe("G (Sol)");
    expect(friendlyNoteName(67, "en-US")).toBe("G (Sol)");
    expect(friendlyNoteName(71, "pt-BR")).toBe("B (Si)");
    expect(friendlyNoteName(71, "en-US")).toBe("B (Ti)");
  });

  it("formats key display names correctly in both languages", () => {
    expect(keyDisplayName(0, "major", "pt-BR")).toBe("C Maior");
    expect(keyDisplayName(0, "major", "en-US")).toBe("C Major");
    expect(keyDisplayName(9, "minor", "pt-BR")).toBe("A Menor");
    expect(keyDisplayName(9, "minor", "en-US")).toBe("A Minor");
  });

  it("translates note explanations into English (en-US)", () => {
    const key: KeyEstimate = { root: 0, mode: "major", confidence: 1 };
    const note = mockNote(60);

    const pt = explainNote(note, key, "pt-BR");
    expect(pt.title).toBe("Nota C4");
    expect(pt.summary).toContain("Nota cantada: C (Dó)");
    expect(pt.details).toContain("É a tônica (centro de repouso) de C Maior");

    const en = explainNote(note, key, "en-US");
    expect(en.title).toBe("Note C4");
    expect(en.summary).toContain("Sung note: C (Do)");
    expect(en.details).toContain("It is the tonic (home resting pitch) of C Major");
  });

  it("translates intervals into English", () => {
    const n1 = mockNote(60, 0, 0.5); // C4
    const n2 = mockNote(67, 0.5, 0.5); // G4

    const en = explainInterval(n1, n2, "en-US");
    expect(en.title).toContain("Interval: perfect fifth (P5)");
    expect(en.summary).toContain("ascending leap of perfect fifth (7 semitones) between C (Do) and G (Sol)");
    expect(en.details).toContain("the most stable supporting interval in harmony");
  });

  it("translates scale explanations into English", () => {
    const key: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
    const en = explainScale(key, undefined, "en-US");

    expect(en.title).toBe("C Major Scale");
    expect(en.summary).toContain("C Major scale: the governing notes of this musical landscape");
    expect(en.details).toContain("Tone – Tone – Semitone – Tone – Tone – Tone – Semitone");
  });

  it("translates chord explanations into English", () => {
    const chord: Chord = { root: 0, quality: "major" };
    const key: KeyEstimate = { root: 0, mode: "major", confidence: 1 };

    const en = explainChord(chord, key, "en-US");
    expect(en.title).toBe("Chord C");
    expect(en.summary).toContain("C major triad (Degree I in C major)");
    expect(en.summary).toContain("formed by pitches C (Do), E (Mi), G (Sol)");
    expect(en.details).toContain("Harmonic combination built on root C (Do)");
  });

  it("translates melody arpeggio C–E–G in English", () => {
    const en = explainMelodyPcs([0, 4, 7], undefined, "en-US");
    expect(en.title).toBe("C major Triad");
    expect(en.summary).toContain("You sang the notes C, E, G, forming the C major triad");
    expect(en.details).toContain("Recognized arpeggio: melodic notes in sequence assemble the chord C");
  });

  it("translates harmonic functions into English", () => {
    const chord: Chord = { root: 0, quality: "major" };
    const key: KeyEstimate = { root: 0, mode: "major", confidence: 1 };

    const en = explainFunctions(chord, key, "en-US");
    expect(en.title).toBe("Tonic Function (I)");
    expect(en.summary).toContain("Chord C acts as Tonic (I) in the key of C Major");
    expect(en.details).toContain("Point of rest, home stability, and feeling of complete resolution");
  });

  it("translates progressions (G–D–Em–C in G) into English", () => {
    const key: KeyEstimate = { root: 7, mode: "major", confidence: 1 };
    const chords: Chord[] = [
      { root: 7, quality: "major" },
      { root: 2, quality: "major" },
      { root: 4, quality: "minor" },
      { root: 0, quality: "major" },
    ];

    const en = explainProgression(chords, key, "en-US");
    expect(en.title).toBe("Progression I–V–vi–IV");
    expect(en.summary).toContain("expresses I–V–vi–IV functions in G");
    expect(en.details).toContain("Displays I–V–vi–IV functions in G: the most famous pop/folk progression in music history");
  });

  it("translates cadences into English", () => {
    const cadence = {
      type: "authentic" as const,
      from: { root: 7 as PitchClass, quality: "major" as const },
      to: { root: 0 as PitchClass, quality: "major" as const },
    };

    const en = explainCadence(cadence, undefined, "en-US");
    expect(en.title).toBe("Authentic Cadence");
    expect(en.summary).toContain("Authentic Cadence (G → C): Authentic cadence: dominant chord resolves to tonic");
    expect(en.details).toContain("Harmonic resolution closing the musical phrase: from G to C");
  });

  it("translates voice leading into English", () => {
    const from: Chord = { root: 0, quality: "major" }; // C-E-G
    const to: Chord = { root: 9, quality: "minor" }; // A-C-E

    const en = explainVoiceLeading(from, to, undefined, "en-US");
    expect(en.title).toBe("Voice Leading");
    expect(en.summary).toContain("Smooth transition from C to Am: seamless voice leading across ensemble instruments");
    expect(en.details).toContain("Shared pitch C, E remains stationary, acting as an acoustic bridge");
  });

  it("translates modulation into English", () => {
    const fromKey: KeyEstimate = { root: 0, mode: "major", confidence: 1 };
    const toKey: KeyEstimate = { root: 7, mode: "major", confidence: 1 };

    const en = explainModulation(fromKey, toKey, "en-US");
    expect(en.title).toBe("Key Modulation");
    expect(en.summary).toContain("Modulation from C Major to G Major: the tonal center moved");
    expect(en.details).toContain("dominant center (perfect fifth up)");
  });

  it("translates rhythm into English", () => {
    const en = explainRhythm(
      { estimated: 125, target: 125, playback: 125, confidence: 0.95 },
      { numerator: 4, denominator: 4 },
      "en-US",
    );
    expect(en.title).toBe("Rhythm 4/4 at 125 BPM");
    expect(en.summary).toContain("Time signature 4/4 at 125 BPM: steady quadruple pulse (4 beats per bar) with brisk and upbeat tempo");
  });

  it("translates explainState with English level titles and primary snippets", () => {
    const state: MusicalState = {
      tempo: { estimated: 100, target: 100, playback: 100, confidence: 1 },
      timeSignature: { numerator: 4, denominator: 4 },
      key: { root: 0, mode: "major", confidence: 1 },
      scale: getScale("major"),
      melody: [
        mockNote(60, 0, 0.3),
        mockNote(64, 0.4, 0.3),
        mockNote(67, 0.8, 0.3),
      ],
      chords: [
        {
          id: "c-1",
          chord: { root: 0, quality: "major" },
          startBar: 0,
          durationBars: 1,
          confidence: 1,
        },
      ],
      rhythm: {
        tempo: { estimated: 100, target: 100, playback: 100, confidence: 1 },
        meter: { numerator: 4, denominator: 4 },
        density: 0.5,
        onsets: [],
      },
      arrangement: {
        active: {
          drums: true,
          bass: true,
          piano: true,
          guitar: false,
          violao: false,
          strings: false,
          violin: false,
          sax: false,
          accordion: false,
        },
        energy: 0.5,
      },
      dynamics: { inputEnergy: 0.6, smoothedEnergy: 0.6, level: "medium" },
    };

    const expPt = explainState(state, "chords", "pt-BR");
    expect(expPt.activeLevelTitle).toBe("Acordes");

    const expEn = explainState(state, "chords", "en-US");
    expect(expEn.activeLevelTitle).toBe("Chords");
    expect(expEn.primary.title).toBe("C major Triad");
    expect(expEn.primary.summary).toContain("forming the C major triad");
  });

  it("retrieves the 9 progressive levels in both languages", () => {
    const pt = getLearnLevels("pt-BR");
    const en = getLearnLevels("en-US");

    expect(pt).toHaveLength(9);
    expect(en).toHaveLength(9);
    expect(pt[0].title).toBe("Notas");
    expect(en[0].title).toBe("Notes");
    expect(pt[7].title).toBe("Condução de Vozes");
    expect(en[7].title).toBe("Voice Leading");
  });
});
