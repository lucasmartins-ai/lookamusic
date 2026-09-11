/**
 * Theory engine: harmonic function (Phase 3, §15).
 * Run: npm test -- theory-functions
 */
import { describe, expect, it } from "vitest";
import { getFunction } from "@/features/music/theory/functions";

const C_MAJOR = { root: 0 as const, mode: "major" as const, confidence: 1 };
const A_MINOR = { root: 9 as const, mode: "minor" as const, confidence: 1 };

describe("getFunction in major", () => {
  it("maps I–vii° to TONIC/SUBDOMINANT/DOMINANT", () => {
    expect(getFunction({ root: 0, quality: "major" }, C_MAJOR)).toBe("TONIC"); // I
    expect(getFunction({ root: 4, quality: "minor" }, C_MAJOR)).toBe("TONIC"); // iii
    expect(getFunction({ root: 9, quality: "minor" }, C_MAJOR)).toBe("TONIC"); // vi
    expect(getFunction({ root: 2, quality: "minor" }, C_MAJOR)).toBe("SUBDOMINANT"); // ii
    expect(getFunction({ root: 5, quality: "major" }, C_MAJOR)).toBe("SUBDOMINANT"); // IV
    expect(getFunction({ root: 7, quality: "major" }, C_MAJOR)).toBe("DOMINANT"); // V
    expect(getFunction({ root: 7, quality: "dom7" }, C_MAJOR)).toBe("DOMINANT"); // V7
    expect(getFunction({ root: 11, quality: "diminished" }, C_MAJOR)).toBe("DOMINANT"); // vii°
  });

  it("returns UNKNOWN for chromatic chords", () => {
    expect(getFunction({ root: 1, quality: "major" }, C_MAJOR)).toBe("UNKNOWN"); // Db
    expect(getFunction({ root: 0, quality: "minor" }, C_MAJOR)).toBe("UNKNOWN"); // i in major
  });
});

describe("getFunction in minor", () => {
  it("maps the functional minor set", () => {
    expect(getFunction({ root: 9, quality: "minor" }, A_MINOR)).toBe("TONIC"); // i
    expect(getFunction({ root: 0, quality: "major" }, A_MINOR)).toBe("TONIC"); // III
    expect(getFunction({ root: 11, quality: "diminished" }, A_MINOR)).toBe("SUBDOMINANT"); // ii°
    expect(getFunction({ root: 2, quality: "minor" }, A_MINOR)).toBe("SUBDOMINANT"); // iv
    expect(getFunction({ root: 5, quality: "major" }, A_MINOR)).toBe("SUBDOMINANT"); // VI
    expect(getFunction({ root: 4, quality: "major" }, A_MINOR)).toBe("DOMINANT"); // V
    expect(getFunction({ root: 4, quality: "dom7" }, A_MINOR)).toBe("DOMINANT"); // V7
    expect(getFunction({ root: 7, quality: "major" }, A_MINOR)).toBe("DOMINANT"); // VII
  });

  it("returns UNKNOWN off the functional set", () => {
    expect(getFunction({ root: 1, quality: "major" }, A_MINOR)).toBe("UNKNOWN");
  });
});
