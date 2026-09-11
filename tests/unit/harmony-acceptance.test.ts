/**
 * Phase 4 acceptance (Objetivo, fase-04.md): top-1, roman analysis,
 * 8-bar generation constraints, seed reproducibility.
 * Run: npm test -- harmony-acceptance
 */
import { describe, expect, it } from "vitest";
import { getFunction } from "@/features/music/theory/functions";
import { generateCandidates, type HarmonyContext } from "@/features/music/harmony/candidates";
import { scoreAndRank } from "@/features/music/harmony/scoring";
import { analyzeProgression, proposeContinuations } from "@/features/music/harmony/progressions";
import { beamSearchVoicings } from "@/features/music/harmony/voice-leading";
import type { Chord, NoteEvent } from "@/domain/types";

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

/** Diatonic walk in C major, one melody slice per bar. */
function eightBars(): NoteEvent[][] {
  return [60, 62, 64, 65, 67, 69, 71, 72].map((m) => [note(m)]);
}

function maxRun(chords: readonly Chord[]): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < chords.length; i++) {
    run =
      chords[i].root === chords[i - 1].root && chords[i].quality === chords[i - 1].quality
        ? run + 1
        : 1;
    best = Math.max(best, run);
  }
  return best;
}

describe("aceite 1 — C–E–G em Dó maior → Dó maior top-1", () => {
  it("ranks C major first", () => {
    const ctx: HarmonyContext = {
      key: C_MAJOR,
      scaleId: "major",
      melody: [note(60), note(64), note(67)],
      barIndex: 0,
      phrasePosition: "middle",
      isDownbeat: true,
      style: "pop",
      recentChords: [],
    };
    const { ranked } = scoreAndRank(generateCandidates(ctx), ctx, { seed: "aceite-1" });
    expect(ranked[0].chord).toEqual({ root: 0, quality: "major" });
  });
});

describe("aceite 2 — G–D–Em–C analisado como I–V–vi–IV em Sol", () => {
  it("analyses the progression", () => {
    const chords: Chord[] = [
      { root: 7, quality: "major" },
      { root: 2, quality: "major" },
      { root: 4, quality: "minor" },
      { root: 0, quality: "major" },
    ];
    expect(analyzeProgression(chords, G_MAJOR)).toEqual(["I", "V", "vi", "IV"]);
  });
});

describe("aceite 3 — 8 compassos gerados", () => {
  const cont = proposeContinuations({
    key: C_MAJOR,
    scaleId: "major",
    melodyPerBar: eightBars(),
    style: "pop",
    seed: "aceite-3",
  });

  it("ends on tonic function", () => {
    expect(getFunction(cont.chords[7], C_MAJOR)).toBe("TONIC");
  });

  it("never repeats > 2 consecutive bars", () => {
    expect(maxRun(cont.chords)).toBeLessThanOrEqual(2);
  });

  it("voice-leads under 4 semitones/voice on average", () => {
    expect(beamSearchVoicings(cont.chords).averageMovement).toBeLessThan(4);
  });
});

describe("regeneração com mesma seed → mesmo resultado", () => {
  it("reproduces chords, analysis and voicings", () => {
    const opts = {
      key: C_MAJOR,
      scaleId: "major",
      melodyPerBar: eightBars(),
      style: "pop" as const,
      seed: "sessao-fixa",
    };
    const a = proposeContinuations(opts);
    const b = proposeContinuations(opts);
    expect(b.chords).toEqual(a.chords);
    expect(b.analysis).toEqual(a.analysis);
    expect(beamSearchVoicings(b.chords).voicings).toEqual(
      beamSearchVoicings(a.chords).voicings,
    );
  });
});
