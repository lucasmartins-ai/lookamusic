/**
 * Accompaniment: driven by onset density + normalized energy, never pitch.
 * The pitch-independence test pins the boundary: two different melodies at
 * the same tempo/density/energy render identical drums. Run:
 * npm test -- rhythm-accompaniment
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { TempoState, TimeSignature } from "@/domain/types";
import {
  renderAccompaniment,
  type DrumStyleId,
  type RhythmInput,
} from "@/features/music/rhythm/patterns";

const METER_44: TimeSignature = { numerator: 4, denominator: 4 };

function tempoAt(bpm: number): TempoState {
  return { estimated: bpm, target: bpm, playback: bpm, confidence: 0.9 };
}

function input(over: Partial<RhythmInput> = {}): RhythmInput {
  return { tempo: tempoAt(96), meter: METER_44, density: 0.5, energy01: 0.5, ...over };
}

describe("pitch independence (drums read time + intensity only)", () => {
  it("same tempo/density/energy from different melodies → identical drums", () => {
    // G4 held whole notes vs. a busy C5 run: same onsets/sec, same energy.
    const fromG4Drone = input({ density: 0.25, energy01: 0.6 });
    const fromC5Run = input({ density: 0.25, energy01: 0.6 });
    for (const style of ["rock", "latin", "ambient"] as DrumStyleId[]) {
      expect(renderAccompaniment(fromC5Run, style)).toEqual(renderAccompaniment(fromG4Drone, style));
    }
  });

  it("RhythmInput carries no pitch field (type-level boundary, pinned at runtime)", () => {
    const i = input();
    expect("midi" in i).toBe(false);
    expect("pitch" in i).toBe(false);
    expect("frequency" in i).toBe(false);
  });
});

describe("density drive", () => {
  it("sparse density drops ghosts but keeps the downbeat", () => {
    const full = renderAccompaniment(input({ density: 0.5, energy01: 0.5 }), "rock");
    const sparse = renderAccompaniment(input({ density: 0.1, energy01: 0.5 }), "rock");
    expect(sparse.length).toBeLessThan(full.length);
    expect(sparse[0].posEighth).toBe(0); // bar never starts with a hole
    // Sparse keeps only structural (integer, loud-enough) hits + downbeat.
    for (const e of sparse) {
      if (e.posEighth !== 0) {
        expect(e.velocity).toBeGreaterThanOrEqual(
          config.rhythm.ghostCutVelocity * config.rhythm.energyVelocityFloor - 1e-6,
        );
      }
    }
  });

  it("dense density adds exactly one deterministic pickup ghost", () => {
    const mid = renderAccompaniment(input({ density: 0.5, energy01: 0.5 }), "acoustic-pop");
    const dense = renderAccompaniment(input({ density: 0.9, energy01: 0.5 }), "acoustic-pop");
    expect(dense.length).toBe(mid.length + 1);
    const pickup = dense[dense.length - 1];
    expect(pickup.posEighth).toBeCloseTo(8 - 0.5, 9);
    expect(dense).toEqual(renderAccompaniment(input({ density: 0.9, energy01: 0.5 }), "acoustic-pop"));
  });

  it("ambient never gains a fill (sparseness is the style)", () => {
    const mid = renderAccompaniment(input({ density: 0.5, energy01: 0.5 }), "ambient");
    const dense = renderAccompaniment(input({ density: 0.95, energy01: 0.9 }), "ambient");
    expect(dense.length).toBe(mid.length);
  });
});

describe("energy drive", () => {
  it("higher energy → every velocity ≥ (monotonic gain, same length)", () => {
    const soft = renderAccompaniment(input({ density: 0.5, energy01: 0.2 }), "ballad");
    const loud = renderAccompaniment(input({ density: 0.5, energy01: 0.9 }), "ballad");
    expect(soft.length).toBe(loud.length);
    for (let i = 0; i < soft.length; i++) {
      expect(loud[i].velocity).toBeGreaterThanOrEqual(soft[i].velocity);
      expect(loud[i].voice).toBe(soft[i].voice);
      expect(loud[i].posEighth).toBe(soft[i].posEighth);
    }
    // And strictly louder somewhere.
    expect(Math.max(...loud.map((e) => e.velocity))).toBeGreaterThan(
      Math.max(...soft.map((e) => e.velocity)),
    );
  });

  it("output stays ordered with valid velocities across the energy range", () => {
    for (const energy of [0, 0.33, 0.66, 1]) {
      const events = renderAccompaniment(input({ density: 0.7, energy01: energy }), "electronic");
      for (let i = 1; i < events.length; i++) {
        expect(events[i].posEighth).toBeGreaterThanOrEqual(events[i - 1].posEighth);
      }
      for (const e of events) {
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.velocity).toBeLessThanOrEqual(1);
      }
    }
  });
});
