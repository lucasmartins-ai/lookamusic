import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { SessionRecorder } from "@/features/recording/capture";

describe("session capture", () => {
  it("starts and stops a recording session emitting domain events", () => {
    const bus = new EventBus();
    const recorder = new SessionRecorder({ bus });

    const started: string[] = [];
    const stopped: string[] = [];

    bus.on("RecordingStarted", (e) => started.push(e.sessionId));
    bus.on("RecordingStopped", (e) => stopped.push(e.sessionId));

    expect(recorder.isRecording).toBe(false);

    const sid = recorder.start("session-123");
    expect(recorder.isRecording).toBe(true);
    expect(sid).toBe("session-123");
    expect(started).toEqual(["session-123"]);

    const comp = recorder.stop("user-action");
    expect(recorder.isRecording).toBe(false);
    expect(stopped).toEqual(["session-123"]);
    expect(comp.id).toBe("session-123");
  });

  it("captures notes, chords, tempo and key during recording", () => {
    const bus = new EventBus();
    const recorder = new SessionRecorder({ bus, name: "Sessão Gravada" });

    recorder.start("rec-abc", 0);

    // Emit notes
    bus.emit("NoteStarted", {
      id: "n1",
      pitch: 440,
      midi: 69,
      startTime: 1.0,
      duration: 0,
      velocity: 0.85,
      confidence: 0.9,
      source: "voice",
    });

    bus.emit("NoteChanged", { id: "n1", midi: 70, confidence: 0.95 });
    bus.emit("NoteEnded", { id: "n1", duration: 0.75 });

    // Emit tempo and meter
    bus.emit("TempoUpdated", {
      estimated: 110,
      target: 110,
      playback: 110,
      confidence: 1,
    });

    bus.emit("MeterChanged", { numerator: 3, denominator: 4 });

    // Emit key
    bus.emit("KeyUpdated", { root: 7, mode: "major", confidence: 0.9 });

    // Emit chord
    bus.emit("ChordChanged", {
      id: "c1",
      chord: { root: 7, quality: "major" },
      startBar: 0,
      durationBars: 1,
      confidence: 0.85,
    });

    const comp = recorder.stop();

    expect(comp.name).toBe("Sessão Gravada");
    expect(comp.tempo).toBe(110);
    expect(comp.timeSignature.numerator).toBe(3);
    expect(comp.key.root).toBe(7);
    expect(comp.melody.length).toBe(1);
    expect(comp.melody[0].id).toBe("n1");
    expect(comp.melody[0].midi).toBe(70);
    expect(comp.melody[0].duration).toBe(0.75);
    expect(comp.chords.length).toBe(1);
    expect(comp.chords[0].chord.root).toBe(7);
  });

  it("safely finalizes open notes if recording stops abruptly", () => {
    const bus = new EventBus();
    const recorder = new SessionRecorder({ bus });

    recorder.start("open-notes-test", 0);

    bus.emit("NoteStarted", {
      id: "n-unclosed",
      pitch: 261.63,
      midi: 60,
      startTime: 0.5,
      duration: 0,
      velocity: 0.7,
      confidence: 0.8,
      source: "voice",
    });

    // Recording stops without NoteEnded
    const comp = recorder.stop();
    expect(comp.melody.length).toBe(1);
    expect(comp.melody[0].duration).toBeGreaterThan(0);
  });
});
