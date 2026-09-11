/**
 * Phase 10: help system covers every shortcut the app listens to.
 */
import { describe, expect, it } from "vitest";
import { GLOSSARY, SHORTCUTS } from "@/components/helpContent";
import { GESTURE_KEYBOARD } from "@/features/gestures/mapping";

describe("help content", () => {
  it("documents the global keys the app handles (D, ?, Esc)", () => {
    const keys = SHORTCUTS.filter((s) => s.scope === "global").map((s) => s.keys);
    expect(keys.some((k) => k.includes("D"))).toBe(true);
    expect(keys.some((k) => k.includes("?"))).toBe(true);
    expect(keys.some((k) => k.includes("Esc"))).toBe(true);
  });

  it("documents every gesture keyboard binding from the mapping", () => {
    const sessionKeys = SHORTCUTS.filter((s) => s.scope === "session").map((s) => s.keys);
    for (const bound of Object.values(GESTURE_KEYBOARD)) {
      const needle = bound.startsWith("Arrow") ? bound.replace("Arrow", "") : bound;
      expect(sessionKeys.some((k) => k.includes(needle)), bound).toBe(true);
    }
  });

  it("glossary covers the minimal musical vocabulary", () => {
    const terms = GLOSSARY.map((g) => g.term.toLowerCase());
    for (const t of ["nota", "acorde", "tom", "bpm", "compasso", "energia", "frase"]) {
      expect(terms, t).toContain(t);
    }
    for (const g of GLOSSARY) expect(g.definition.length).toBeGreaterThan(10);
  });
});
