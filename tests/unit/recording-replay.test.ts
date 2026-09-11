import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { createDefaultComposition } from "@/features/recording/schema";
import { saveComposition, loadComposition, clearAllCompositions } from "@/features/recording/storage";
import { reconstructSessionEvents, ReplayEngine } from "@/features/recording/replay";

describe("recording and replay bit-identical round-trip", () => {
  it("records, saves, loads and replays bit-identical events", async () => {
    await clearAllCompositions();

    const original = createDefaultComposition({
      id: "comp-roundtrip-1",
      name: "Round-trip Verification",
      tempo: 96,
      timeSignature: { numerator: 4, denominator: 4 },
      key: { root: 0, mode: "major", confidence: 1 },
      melody: [
        {
          id: "n-1",
          pitch: 261.63,
          midi: 60,
          startTime: 0.5,
          duration: 1.0,
          velocity: 0.8,
          confidence: 0.95,
          source: "voice",
        },
        {
          id: "n-2",
          pitch: 329.63,
          midi: 64,
          startTime: 1.75,
          duration: 0.5,
          velocity: 0.85,
          confidence: 0.98,
          source: "voice",
        },
      ],
      chords: [
        {
          id: "c-1",
          chord: { root: 0, quality: "major" },
          startBar: 0,
          durationBars: 1,
          confidence: 0.9,
        },
        {
          id: "c-2",
          chord: { root: 7, quality: "major" },
          startBar: 1,
          durationBars: 1,
          confidence: 0.85,
        },
      ],
    });

    // 1. Save
    await saveComposition(original);

    // 2. Load
    const loaded = await loadComposition("comp-roundtrip-1");
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    // 3. Reconstruct events from both
    const origEvents = reconstructSessionEvents(original);
    const loadedEvents = reconstructSessionEvents(loaded);

    // 4. Assert bit-identical events
    expect(loadedEvents).toEqual(origEvents);

    // Verify ordering
    for (let i = 1; i < loadedEvents.length; i++) {
      expect(loadedEvents[i].timeSec).toBeGreaterThanOrEqual(loadedEvents[i - 1].timeSec);
    }

    // Verify notes match note-for-note
    const noteStartedEvents = loadedEvents.filter((e) => e.name === "NoteStarted");
    expect(noteStartedEvents.length).toBe(2);
    expect(noteStartedEvents[0].timeSec).toBe(0.5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((noteStartedEvents[0].payload as any).midi).toBe(60);
    expect(noteStartedEvents[1].timeSec).toBe(1.75);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((noteStartedEvents[1].payload as any).midi).toBe(64);

    // Verify chords match bar-for-bar
    const chordEvents = loadedEvents.filter((e) => e.name === "ChordChanged");
    expect(chordEvents.length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((chordEvents[0].payload as any).chord.root).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((chordEvents[1].payload as any).chord.root).toBe(7);

    // 5. Replay via ReplayEngine into an EventBus
    const bus = new EventBus();
    const emitted: string[] = [];
    bus.on("NoteStarted", (n) => emitted.push(`NoteStarted:${n.id}`));
    bus.on("ChordChanged", (c) => emitted.push(`ChordChanged:${c.id}`));

    const replayEngine = new ReplayEngine(loaded, bus);
    replayEngine.emitSynchronous();

    expect(emitted).toContain("NoteStarted:n-1");
    expect(emitted).toContain("NoteStarted:n-2");
    expect(emitted).toContain("ChordChanged:c-1");
    expect(emitted).toContain("ChordChanged:c-2");
  });
});
