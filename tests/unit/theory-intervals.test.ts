/**
 * Theory engine: intervals (Phase 3, §14).
 * Run: npm test -- theory-intervals
 */
import { describe, expect, it } from "vitest";
import { intervalBetweenMidi, semitonesToInterval } from "@/features/music/theory/intervals";

describe("semitonesToInterval", () => {
  it("names the chromatic octave", () => {
    expect(semitonesToInterval(0)).toMatchObject({ name: "perfect unison", short: "P1" });
    expect(semitonesToInterval(1)).toMatchObject({ short: "m2" });
    expect(semitonesToInterval(2)).toMatchObject({ short: "M2" });
    expect(semitonesToInterval(3)).toMatchObject({ short: "m3" });
    expect(semitonesToInterval(4)).toMatchObject({ name: "major third", short: "M3" });
    expect(semitonesToInterval(5)).toMatchObject({ short: "P4" });
    expect(semitonesToInterval(6)).toMatchObject({ name: "tritone", short: "TT" });
    expect(semitonesToInterval(7)).toMatchObject({ name: "perfect fifth", short: "P5" });
    expect(semitonesToInterval(8)).toMatchObject({ short: "m6" });
    expect(semitonesToInterval(9)).toMatchObject({ short: "M6" });
    expect(semitonesToInterval(10)).toMatchObject({ short: "m7" });
    expect(semitonesToInterval(11)).toMatchObject({ short: "M7" });
    expect(semitonesToInterval(12)).toMatchObject({ name: "octave", short: "P8" });
  });

  it("composes compound intervals as octave(s) + simple", () => {
    expect(semitonesToInterval(16)).toMatchObject({ name: "octave + major third", short: "P8+M3" });
    expect(semitonesToInterval(19)).toMatchObject({ name: "octave + perfect fifth", short: "P8+P5" });
    expect(semitonesToInterval(24)).toMatchObject({ name: "2 octaves", short: "2xP8" });
    expect(semitonesToInterval(28)).toMatchObject({ name: "2 octaves + major third" });
  });

  it("rejects negative and non-integer input", () => {
    expect(() => semitonesToInterval(-1)).toThrow();
    expect(() => semitonesToInterval(4.5)).toThrow();
  });
});

describe("intervalBetweenMidi", () => {
  it("measures absolute distance", () => {
    expect(intervalBetweenMidi(60, 64).short).toBe("M3");
    expect(intervalBetweenMidi(64, 60).short).toBe("M3");
    expect(intervalBetweenMidi(67, 67).short).toBe("P1");
  });
});
