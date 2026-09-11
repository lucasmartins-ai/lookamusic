/**
 * PhraseTracker: silence boundaries + density + contour (Phase 2, §10).
 * Run: npm test -- melody-phrases
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { DomainEvents } from "@/domain/events";
import { PhraseTracker } from "@/features/music/melody/phrases";
import { newId } from "@/lib/ids";

type NoteStarted = DomainEvents["NoteStarted"];

function note(midi: number, startTime: number): NoteStarted {
  return {
    id: newId("note"),
    pitch: 440,
    midi,
    startTime,
    duration: 0,
    velocity: 0.9,
    confidence: 0.9,
    source: "voice",
  };
}

function harness() {
  const bus = new EventBus();
  const tracker = new PhraseTracker(bus);
  const seen: { name: string; payload: unknown }[] = [];
  bus.on("PhraseStarted", (p) => seen.push({ name: "PhraseStarted", payload: p }));
  bus.on("PhraseEnded", (p) => seen.push({ name: "PhraseEnded", payload: p }));
  return { bus, tracker, seen };
}

const SILENCE = config.rhythm.phraseSilenceMs; // 600

describe("phrase boundaries", () => {
  it("opens on the first note and closes after phraseSilenceMs of silence", () => {
    const { bus, tracker, seen } = harness();
    bus.emit("NoteStarted", note(67, 1.0));
    expect(seen).toHaveLength(1);
    expect((seen[0].payload as { startTime: number }).startTime).toBe(1.0);

    tracker.tick(1100); // sounding: anchor follows
    tracker.tick(1200);
    bus.emit("NoteEnded", { id: "x", duration: 0.2 });
    tracker.tick(1200 + SILENCE - 1); // 1 ms too early: still open
    expect(seen).toHaveLength(1);
    tracker.tick(1200 + SILENCE); // boundary
    expect(seen).toHaveLength(2);
    const ended = seen[1].payload as DomainEvents["PhraseEnded"];
    expect(ended.endTime).toBeCloseTo(1.2, 6);
    expect(tracker.openPhrase()).toBeNull();
    expect(tracker.completedPhrases()).toHaveLength(1);
  });

  it("starts a new phrase after the previous one closed", () => {
    const { bus, tracker, seen } = harness();
    bus.emit("NoteStarted", note(67, 0));
    tracker.tick(100);
    bus.emit("NoteEnded", { id: "a", duration: 0.1 });
    tracker.tick(100 + SILENCE);
    const firstId = (seen[0].payload as { id: string }).id;
    bus.emit("NoteStarted", note(69, 2.0));
    expect(seen.filter((s) => s.name === "PhraseStarted")).toHaveLength(2);
    const secondId = (seen[2].payload as { id: string }).id;
    expect(secondId).not.toBe(firstId);
    tracker.dispose();
  });

  it("keeps one phrase across a sub-threshold breath gap", () => {
    const { bus, tracker, seen } = harness();
    bus.emit("NoteStarted", note(67, 0));
    tracker.tick(200);
    bus.emit("NoteEnded", { id: "a", duration: 0.2 });
    tracker.tick(200 + SILENCE - 100); // short breath
    bus.emit("NoteStarted", note(69, 0.7));
    tracker.tick(900);
    bus.emit("NoteEnded", { id: "b", duration: 0.2 });
    tracker.tick(900 + SILENCE);
    expect(seen.filter((s) => s.name === "PhraseStarted")).toHaveLength(1);
    expect(seen.filter((s) => s.name === "PhraseEnded")).toHaveLength(1);
    expect(tracker.completedPhrases()[0].noteCount).toBe(2);
  });
});

describe("density and contour", () => {
  function sing(midis: number[]): ReturnType<typeof harness> {
    const h = harness();
    let t = 0;
    for (const m of midis) {
      h.bus.emit("NoteStarted", note(m, t / 1000));
      h.tracker.tick(t + 100);
      h.bus.emit("NoteEnded", { id: `n${t}`, duration: 0.1 });
      t += 400;
    }
    h.tracker.tick(t + SILENCE);
    return h;
  }

  it("reports density in notes/sec over the phrase span", () => {
    const h = sing([67, 69, 71, 72]);
    const done = h.tracker.completedPhrases()[0];
    expect(done.noteCount).toBe(4);
    expect(done.density).toBeGreaterThan(1);
  });

  it("classifies rising / falling / arch / flat contours", () => {
    expect(sing([60, 62, 64]).tracker.completedPhrases()[0].contour).toBe("rising");
    expect(sing([64, 62, 60]).tracker.completedPhrases()[0].contour).toBe("falling");
    expect(sing([60, 67, 64]).tracker.completedPhrases()[0].contour).toBe("arch");
    expect(sing([67]).tracker.completedPhrases()[0].contour).toBe("flat");
  });
});
