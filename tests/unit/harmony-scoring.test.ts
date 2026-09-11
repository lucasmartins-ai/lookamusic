/**
 * Harmony scoring (Phase 4, §16–17): rank-order + determinism.
 * Run: npm test -- harmony-scoring
 */
import { describe, expect, it } from "vitest";
import { generateCandidates, type HarmonyContext } from "@/features/music/harmony/candidates";
import { scoreAndRank, scoreChord } from "@/features/music/harmony/scoring";
import type { NoteEvent } from "@/domain/types";

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

function ctx(melody: NoteEvent[]): HarmonyContext {
  return {
    key: { root: 0, mode: "major", confidence: 0.9 },
    scaleId: "major",
    melody,
    barIndex: 0,
    phrasePosition: "middle",
    isDownbeat: true,
    style: "pop",
    recentChords: [],
  };
}

const C = { root: 0 as const, quality: "major" as const };

describe("melody rank-order (chord-tone > passing > chromatic)", () => {
  it("scores E > F > F# over a C major triad", () => {
    const e = scoreChord(C, ctx([note(64)])); // E: chord tone
    const f = scoreChord(C, ctx([note(65)])); // F: scale passing tone
    const fs = scoreChord(C, ctx([note(66)])); // F#: chromatic
    expect(e.score).toBeGreaterThan(f.score);
    expect(f.score).toBeGreaterThan(fs.score);
  });

  it("ranks the containing chord above passing and chromatic rivals", () => {
    const pool = [
      { root: 5 as const, quality: "major" as const }, // F: E is passing
      { root: 6 as const, quality: "major" as const }, // F#: out of key
      C,
    ];
    const { ranked } = scoreAndRank(pool, ctx([note(64)]), { seed: "rank-order" });
    expect(ranked[0].chord).toEqual(C);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  });
});

describe("reasons (Phase 13 feed)", () => {
  it("carries one human-readable reason per dimension", () => {
    const cand = scoreChord(C, ctx([note(64)]));
    expect(cand.reasons).toHaveLength(6);
    for (const r of cand.reasons) expect(r.text.length).toBeGreaterThan(0);
    const melody = cand.reasons.find((r) => r.dimension === "melody")!;
    expect(melody.text).toContain("E");
    expect(melody.text).toContain("major third");
  });
});

describe("seeded determinism", () => {
  it("same pool + context + seed → identical order", () => {
    const pool = generateCandidates(ctx([]));
    const c = ctx([note(60), note(64)]);
    const a = scoreAndRank(pool, c, { seed: "session-42" });
    const b = scoreAndRank(pool, c, { seed: "session-42" });
    expect(a.seed).toBe("session-42");
    expect(b.ranked).toEqual(a.ranked);
  });

  it("scores stay in 0–1", () => {
    const pool = generateCandidates(ctx([]));
    const { ranked } = scoreAndRank(pool, ctx([note(60)]), { seed: "bounds" });
    for (const cand of ranked) {
      expect(cand.score).toBeGreaterThanOrEqual(0);
      expect(cand.score).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});
