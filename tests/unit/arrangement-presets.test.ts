/**
 * Arrangement presets as data (Phase 7, §55): energy → ensemble/density,
 * style registry with runtime data-only registration.
 * Run: npm test -- arrangement-presets
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { InstrumentId } from "@/domain/types";
import {
  densityForEnergy,
  ensembleForEnergy,
  listStyles,
  registerStyle,
  styleById,
  styleDrums,
  type MusicalStyle,
} from "@/features/music/arrangement/presets";
import { PATTERNS } from "@/features/music/rhythm/patterns";
import { planDrums } from "@/features/instruments/planning";
import { demoPassage } from "../helpers/passage";

describe("energy → ensemble (few → all, nested)", () => {
  it("counts grow low(3) < medium(5) < high(8)", () => {
    expect(ensembleForEnergy("low")).toHaveLength(3);
    expect(ensembleForEnergy("medium")).toHaveLength(5);
    expect(ensembleForEnergy("high")).toHaveLength(8);
  });

  it("levels nest: low ⊂ medium ⊂ high (band only grows)", () => {
    const low = new Set(ensembleForEnergy("low"));
    const medium = new Set(ensembleForEnergy("medium"));
    const high = new Set(ensembleForEnergy("high"));
    for (const id of low) expect(medium.has(id)).toBe(true);
    for (const id of medium) expect(high.has(id)).toBe(true);
  });

  it("rhythm section anchors every level (never a beat-less bar by accident)", () => {
    for (const level of ["low", "medium", "high"] as const) {
      const set = new Set(ensembleForEnergy(level));
      expect(set.has("drums")).toBe(true);
      expect(set.has("bass")).toBe(true);
    }
  });

  it("returns a copy (callers cannot corrupt the data)", () => {
    const a = ensembleForEnergy("low");
    a.push("sax" as InstrumentId);
    expect(ensembleForEnergy("low")).toHaveLength(3);
  });
});

describe("energy → density (matches the Phase 5 renderer semantics)", () => {
  it("density rises low < medium < high", () => {
    expect(densityForEnergy("low")).toBeLessThan(densityForEnergy("medium"));
    expect(densityForEnergy("medium")).toBeLessThan(densityForEnergy("high"));
  });

  it("low reads sparse (ghosts drop), high reads dense (pickup joins)", () => {
    expect(densityForEnergy("low")).toBeLessThan(config.rhythm.densitySparseBelow);
    expect(densityForEnergy("high")).toBeGreaterThan(config.rhythm.densityDenseAbove);
  });
});

describe("builtin style library", () => {
  it("ships neutral + ballad/rock/folk/ambient, all valid", () => {
    const ids = listStyles().map((s) => s.id);
    for (const want of ["neutral", "ballad", "rock", "folk", "ambient"]) {
      expect(ids).toContain(want);
    }
    for (const s of listStyles()) {
      expect(s.drums in PATTERNS).toBe(true);
      expect(s.bpmRange[0]).toBeGreaterThan(0);
      expect(s.bpmRange[1]).toBeGreaterThanOrEqual(s.bpmRange[0]);
      expect(["sparse", "medium", "dense"]).toContain(s.harmonicDensity);
    }
  });

  it("every style boots a sounding trio (drums+bass+piano)", () => {
    for (const s of listStyles()) {
      const active = s.defaults.active;
      expect(active?.drums).toBe(true);
      expect(active?.bass).toBe(true);
      expect(active?.piano).toBe(true);
    }
  });

  it("unknown style id falls back to neutral (UI never crashes)", () => {
    expect(styleById("nope-not-a-style").id).toBe("neutral");
    expect(styleDrums("nope-not-a-style")).toBe(styleDrums("neutral"));
  });
});

describe("acceptance: new preset in data, no code, loads and plays", () => {
  it("registerStyle → styleById → planDrums renders events", () => {
    const forro: MusicalStyle = {
      id: "forro-test",
      label: "Forró (teste)",
      bpmRange: [120, 150],
      harmonicDensity: "dense",
      drums: "latin",
      bass: "root-and-fifth",
      piano: "broken-chord",
      guitar: "strum-drive",
      strings: "pad",
      dynamics: "follow-energy",
      defaults: { energy: 0.8 },
    };
    registerStyle(forro);
    expect(styleById("forro-test").label).toBe("Forró (teste)");
    // Plays through the existing planners untouched: data in, music out.
    const events = planDrums(demoPassage({ style: styleDrums("forro-test") }), 1);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.instrument === "drums")).toBe(true);
  });

  it("duplicate id and unknown drum pattern throw (bad data fails fast)", () => {
    expect(() =>
      registerStyle({
        id: "neutral",
        label: "dup",
        bpmRange: [90, 120],
        harmonicDensity: "medium",
        drums: "rock",
        bass: "x",
        piano: "x",
        guitar: "x",
        strings: "x",
        dynamics: "x",
        defaults: {},
      }),
    ).toThrow();
    expect(() =>
      registerStyle({
        id: "bad-drums-test",
        label: "bad",
        bpmRange: [90, 120],
        harmonicDensity: "medium",
        // @ts-expect-error — contract: drums must exist in the pattern library
        drums: "polka",
        bass: "x",
        piano: "x",
        guitar: "x",
        strings: "x",
        dynamics: "x",
        defaults: {},
      }),
    ).toThrow();
  });
});
