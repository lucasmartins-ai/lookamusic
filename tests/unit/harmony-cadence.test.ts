/**
 * Cadences: authentic/plagal/deceptive/half + tracker emission (Phase 4).
 * Run: npm test -- harmony-cadence
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import {
  CadenceTracker,
  detectCadenceInKey,
  educationString,
  transitionHint,
} from "@/features/music/harmony/cadence";
import type { Chord, ChordEvent } from "@/domain/types";

const C_MAJOR = { root: 0 as const, mode: "major" as const, confidence: 0.9 };
const C = { root: 0 as const, quality: "major" as const };
const G = { root: 7 as const, quality: "major" as const };
const F = { root: 5 as const, quality: "major" as const };
const AM = { root: 9 as const, quality: "minor" as const };

describe("detectCadenceInKey", () => {
  it("names the four cadences", () => {
    expect(detectCadenceInKey(G, C, C_MAJOR)?.type).toBe("authentic");
    expect(detectCadenceInKey(F, C, C_MAJOR)?.type).toBe("plagal");
    expect(detectCadenceInKey(G, AM, C_MAJOR)?.type).toBe("deceptive");
    expect(detectCadenceInKey(C, G, C_MAJOR)?.type).toBe("half");
  });

  it("returns null off-cadence and carries hint + education", () => {
    expect(detectCadenceInKey(C, F, C_MAJOR)).toBeNull();
    const cad = detectCadenceInKey(G, C, C_MAJOR)!;
    expect(transitionHint(cad.type).length).toBeGreaterThan(0);
    expect(educationString(cad.type).length).toBeGreaterThan(0);
  });

  it("hears authentic in minor (E → Am)", () => {
    const aMinor = { root: 9 as const, mode: "minor" as const, confidence: 0.9 };
    const E = { root: 4 as const, quality: "major" as const };
    expect(detectCadenceInKey(E, AM, aMinor)?.type).toBe("authentic");
  });
});

describe("CadenceTracker", () => {
  function chordEvent(chord: Chord, bar: number): ChordEvent {
    return { id: `ch-${bar}`, chord, startBar: bar, durationBars: 1, confidence: 0.8 };
  }

  it("resolves authentic on PhraseEnded and re-affirms via ChordChanged", () => {
    const events = new EventBus();
    const tracker = new CadenceTracker(events);
    tracker.observeKey(C_MAJOR);
    const changed: ChordEvent[] = [];
    events.on("ChordChanged", (e) => changed.push(e));

    events.emit("ChordChanged", chordEvent(G, 6));
    events.emit("ChordChanged", chordEvent(C, 7));
    events.emit("PhraseEnded", { id: "ph1", startTime: 0, endTime: 8 });

    expect(tracker.lastCadence()?.type).toBe("authentic");
    expect(tracker.lastCadence()?.education).toContain("autêntica");
    // 2 observed + 1 re-affirmation from the tracker.
    expect(changed).toHaveLength(3);
    expect(changed[2].chord).toEqual(C);
    tracker.dispose();
  });

  it("stays silent without a key or without cadential motion", () => {
    const events = new EventBus();
    const tracker = new CadenceTracker(events);
    const changed: ChordEvent[] = [];
    events.on("ChordChanged", (e) => changed.push(e));
    events.emit("ChordChanged", chordEvent(C, 0));
    events.emit("ChordChanged", chordEvent(F, 1));
    events.emit("PhraseEnded", { id: "ph2", startTime: 0, endTime: 8 });
    expect(tracker.lastCadence()).toBeNull();
    expect(changed).toHaveLength(2);
    tracker.dispose();
  });
});
