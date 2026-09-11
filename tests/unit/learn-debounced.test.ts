import { describe, expect, it } from "vitest";
import type { KeyEstimate, MusicalState, NoteEvent } from "@/domain/types";
import { getScale } from "@/features/music/theory/scales";
import { ExplanationStabilizer } from "@/features/learn/useContextualExplanation";

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

function mockState(melodyMidi: number[] = [60]): MusicalState {
  const defaultKey: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
  return {
    tempo: { estimated: 90, target: 90, playback: 90, confidence: 0.8 },
    timeSignature: { numerator: 4, denominator: 4 },
    key: defaultKey,
    scale: getScale("major"),
    melody: melodyMidi.map((m, idx) => mockNote(m, idx * 0.2, 0.2)),
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
      tempo: { estimated: 90, target: 90, playback: 90, confidence: 0.8 },
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
        strings: false,
        violin: false,
        sax: false,
        accordion: false,
      },
      energy: 0.5,
    },
    dynamics: { inputEnergy: 0.5, smoothedEnergy: 0.5, level: "medium" },
  };
}

describe("Phase 13 Hardening (Risk 1) — Melodic Phrasing Stabilization & Debounce", () => {
  it("processes initial state immediately without debouncing", () => {
    const stabilizer = new ExplanationStabilizer({ debounceMs: 250, rapidThresholdMs: 150 });
    const state = mockState([60]);
    const res = stabilizer.process(state, "notes", "pt-BR", 1000);

    expect(res.debounced).toBe(false);
    expect(res.explanation.primary.title).toBe("Nota C4");
    expect(res.nextDeadline).toBeNull();
  });

  it("retains previous explanation during rapid melodic runs (< 150 ms)", () => {
    const stabilizer = new ExplanationStabilizer({ debounceMs: 250, rapidThresholdMs: 150 });

    // Note 1 at t = 1000 ms
    const s1 = mockState([60]);
    stabilizer.process(s1, "notes", "pt-BR", 1000);

    // Note 2 arrives at t = 1080 ms (delta = 80 ms, rapid phrase underway)
    const s2 = mockState([60, 62]);
    const res2 = stabilizer.process(s2, "notes", "pt-BR", 1080);

    expect(res2.debounced).toBe(true);
    // Retains previous note C4 explanation rather than churning text
    expect(res2.explanation.primary.title).toBe("Nota C4");
    expect(res2.nextDeadline).toBe(1080 + 250);

    // Note 3 arrives at t = 1150 ms (delta = 70 ms, still running)
    const s3 = mockState([60, 62, 64]);
    const res3 = stabilizer.process(s3, "notes", "pt-BR", 1150);

    expect(res3.debounced).toBe(true);
    expect(res3.explanation.primary.title).toBe("Nota C4");
    expect(res3.nextDeadline).toBe(1150 + 250);

    // Once phrase settles (now = 1450 ms > 1150 + 250 = 1400 ms)
    const resSettle = stabilizer.process(s3, "notes", "pt-BR", 1450);
    expect(resSettle.debounced).toBe(false);
    // Displays the stabilized note E4
    expect(resSettle.explanation.primary.title).toBe("Nota E4");
  });

  it("updates immediately (0 ms lag) when user switches learning level", () => {
    const stabilizer = new ExplanationStabilizer({ debounceMs: 250, rapidThresholdMs: 150 });
    const s = mockState([60, 64, 67]);

    stabilizer.process(s, "notes", "pt-BR", 1000);

    // User switches tab from 'notes' to 'chords' at t = 1050 ms
    const switchRes = stabilizer.process(s, "chords", "pt-BR", 1050);
    expect(switchRes.debounced).toBe(false);
    expect(switchRes.explanation.level).toBe("chords");
    expect(switchRes.explanation.primary.title).toContain("Tríade de C maior");
  });

  it("updates immediately (0 ms lag) when user toggles language", () => {
    const stabilizer = new ExplanationStabilizer({ debounceMs: 250, rapidThresholdMs: 150 });
    const s = mockState([60]);

    stabilizer.process(s, "notes", "pt-BR", 1000);

    // User toggles language to en-US at t = 1050 ms
    const langRes = stabilizer.process(s, "notes", "en-US", 1050);
    expect(langRes.debounced).toBe(false);
    expect(langRes.explanation.primary.title).toBe("Note C4");
  });

  it("updates normally for stable or spaced singing (>= 150 ms)", () => {
    const stabilizer = new ExplanationStabilizer({ debounceMs: 250, rapidThresholdMs: 150 });

    const s1 = mockState([60]);
    stabilizer.process(s1, "notes", "pt-BR", 1000);

    // Note 2 arrives at t = 1300 ms (delta = 300 ms >= 150 ms)
    const s2 = mockState([60, 67]);
    const res2 = stabilizer.process(s2, "notes", "pt-BR", 1300);

    expect(res2.debounced).toBe(false);
    expect(res2.explanation.primary.title).toBe("Nota G4");
  });

  it("flushes latest explanation on demand", () => {
    const stabilizer = new ExplanationStabilizer({ debounceMs: 250, rapidThresholdMs: 150 });
    const s = mockState([60, 62, 64]);
    stabilizer.process(s, "notes", "pt-BR", 1000);

    const flushed = stabilizer.flush(s, "notes", "pt-BR");
    expect(flushed.primary.title).toBe("Nota E4");
  });
});
