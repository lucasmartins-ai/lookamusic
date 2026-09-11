/**
 * Progressions: templates, transition matrix, roman analysis (Phase 4, §18).
 * Run: npm test -- harmony-progressions
 */
import { describe, expect, it } from "vitest";
import { getFunction } from "@/features/music/theory/functions";
import {
  analyzeProgression,
  chordToRoman,
  generateAccompaniment,
  proposeContinuations,
  templatesForStyle,
  transitionPrior,
} from "@/features/music/harmony/progressions";
import type { NoteEvent } from "@/domain/types";

const C_MAJOR = { root: 0 as const, mode: "major" as const, confidence: 0.9 };
const G_MAJOR = { root: 7 as const, mode: "major" as const, confidence: 0.9 };

let n = 0;
function note(midi: number): NoteEvent {
  n += 1;
  return {
    id: `m${n}`,
    pitch: 440,
    midi,
    startTime: 0,
    duration: 0.4,
    velocity: 0.8,
    confidence: 0.9,
    source: "voice",
  };
}

describe("chordToRoman / analyzeProgression", () => {
  it("analyses G–D–Em–C as I–V–vi–IV in G", () => {
    const chords = [
      { root: 7 as const, quality: "major" as const },
      { root: 2 as const, quality: "major" as const },
      { root: 4 as const, quality: "minor" as const },
      { root: 0 as const, quality: "major" as const },
    ];
    expect(analyzeProgression(chords, G_MAJOR)).toEqual(["I", "V", "vi", "IV"]);
  });

  it("spells vii° and unknowns", () => {
    expect(chordToRoman({ root: 11, quality: "diminished" }, C_MAJOR)).toBe("vii°");
    expect(chordToRoman({ root: 1, quality: "major" }, C_MAJOR)).toBe("?");
  });
});

describe("templates & transitions", () => {
  it("offers I–V–vi–IV to pop and sustain to ambient", () => {
    expect(templatesForStyle("pop").map((t) => t.id)).toContain("pop-punk");
    expect(templatesForStyle("ambient").map((t) => t.id)).toContain("static");
  });

  it("expects V → I above all", () => {
    expect(transitionPrior("pop", 7, 0)).toBe(1);
    expect(transitionPrior("pop", 7, 0)).toBeGreaterThan(transitionPrior("pop", 7, 2));
    expect(transitionPrior("pop", null, 0)).toBe(0.5);
  });
});

describe("proposeContinuations", () => {
  it("proposes 1–4 bars ending on tonic function", () => {
    const cont = proposeContinuations({
      key: C_MAJOR,
      scaleId: "major",
      melodyPerBar: [[note(60)], [note(62)], [note(64)], [note(67)]],
      style: "pop",
      seed: "cont-1",
    });
    expect(cont.chords).toHaveLength(4);
    expect(cont.seeds).toHaveLength(4);
    expect(getFunction(cont.chords[3], C_MAJOR)).toBe("TONIC");
    expect(cont.analysis).toHaveLength(4);
  });

  it("is reproducible under the same seed", () => {
    const opts = {
      key: G_MAJOR,
      scaleId: "major",
      melodyPerBar: [[note(67)], [note(62)]],
      style: "pop" as const,
      seed: "repeat-me",
    };
    const a = proposeContinuations(opts);
    const b = proposeContinuations(opts);
    expect(b.chords).toEqual(a.chords);
    expect(b.seeds).toEqual(a.seeds);
  });
});

describe("generateAccompaniment", () => {
  it("stamps bars, durations and unique ids", () => {
    const events = generateAccompaniment({
      key: C_MAJOR,
      scaleId: "major",
      melodyPerBar: [[note(60)], [note(64)]],
      style: "folk",
      seed: "acc-1",
      startBar: 4,
    });
    expect(events).toHaveLength(2);
    expect(events[0].startBar).toBe(4);
    expect(events[1].startBar).toBe(5);
    expect(events[0].durationBars).toBe(1);
    expect(events[0].id).not.toBe(events[1].id);
  });
});
