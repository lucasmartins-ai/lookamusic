/**
 * Theory engine: key estimation (Phase 3, §12) — acceptance corpus.
 * - C–E–G → C major, conf > 0.6
 * - G–D–Em–C phrase → G-major family (G major or relative E minor)
 * - Estimate revises with evidence, never locks on the first note
 * - KeyUpdated only on top change or Δconf > config.key.updateDelta
 * Run: npm test -- theory-key
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { NoteEvent } from "@/domain/types";
import {
  estimateKeyFromHistogram,
  histogramFromNotes,
  KeyEstimator,
} from "@/features/music/theory/key";

let seq = 0;
function note(midi: number, startTime: number, duration = 0.5, confidence = 0.9): NoteEvent {
  return {
    id: `n${seq++}`,
    pitch: 440,
    midi,
    startTime,
    duration,
    velocity: confidence,
    confidence,
    source: "voice",
  };
}

describe("key acceptance corpus", () => {
  it("C–E–G → C major with conf > 0.6", () => {
    const bus = new EventBus();
    const key = new KeyEstimator(bus);
    key.addNote(note(60, 0.0)); // C4
    key.addNote(note(64, 0.6)); // E4
    key.addNote(note(67, 1.2)); // G4
    const est = key.tick(1700);
    expect(est).not.toBeNull();
    expect(est!.root).toBe(0);
    expect(est!.mode).toBe("major");
    expect(est!.confidence).toBeGreaterThan(0.6);
    key.dispose();
  });

  it("G–D–Em–C phrase → G-major family", () => {
    const bus = new EventBus();
    const key = new KeyEstimator(bus);
    // Arpeggiated G – D – Em – C (F# from D major is the G-family tell).
    const seqNotes: Array<[number, number]> = [
      [67, 0.0], // G4 (G)
      [71, 0.4], // B4
      [74, 0.8], // D5
      [62, 1.2], // D4 (D)
      [66, 1.6], // F#4
      [69, 2.0], // A4
      [64, 2.4], // E4 (Em)
      [67, 2.8], // G4
      [71, 3.2], // B4
      [60, 3.6], // C4 (C)
      [64, 4.0], // E4
      [67, 4.4], // G4
    ];
    for (const [midi, start] of seqNotes) key.addNote(note(midi, start, 0.4));
    const est = key.tick(4800);
    expect(est).not.toBeNull();
    const inFamily =
      (est!.root === 7 && est!.mode === "major") || (est!.root === 4 && est!.mode === "minor");
    expect(inFamily).toBe(true);
    key.dispose();
  });

  it("revises with evidence instead of locking on the first note", () => {
    const bus = new EventBus();
    const key = new KeyEstimator(bus);
    key.addNote(note(60, 0.0, 0.5)); // lone C4
    const first = key.tick(600);
    expect(first).not.toBeNull();
    expect(first!.confidence).toBeLessThan(0.6); // thin evidence → revisable

    // G-major evidence arrives: D, F#, B push away from C.
    key.addNote(note(62, 1.0, 0.5)); // D4
    key.addNote(note(66, 1.6, 0.5)); // F#4
    key.addNote(note(71, 2.2, 0.5)); // B4
    key.addNote(note(67, 2.8, 0.5)); // G4
    const revised = key.tick(3400);
    expect(revised).not.toBeNull();
    const moved =
      revised!.root !== first!.root ||
      revised!.mode !== first!.mode ||
      Math.abs(revised!.confidence - first!.confidence) > 1e-9;
    expect(moved).toBe(true);
    key.dispose();
  });
});

describe("KeyUpdated emission gate", () => {
  it("emits only on top change or Δconf > updateDelta", () => {
    const bus = new EventBus();
    const key = new KeyEstimator(bus);
    let emitted = 0;
    bus.on("KeyUpdated", () => emitted++);

    key.addNote(note(60, 0.0));
    key.addNote(note(64, 0.6));
    key.addNote(note(67, 1.2));
    key.tick(1700);
    expect(emitted).toBe(1);

    key.tick(1700); // identical evidence → silent
    expect(emitted).toBe(1);

    // Same key, tiny extra weight → Δconf stays under the gate.
    key.addNote(note(60, 1.6, 0.1, 0.5));
    key.tick(1800);
    expect(emitted).toBe(1);

    // Contrasting evidence flips the top → emits.
    key.addNote(note(66, 2.0, 0.8)); // F#
    key.addNote(note(62, 2.6, 0.8)); // D
    key.addNote(note(71, 3.2, 0.8)); // B
    key.addNote(note(69, 3.8, 0.8)); // A
    key.addNote(note(67, 4.4, 0.8)); // G
    key.tick(5300);
    expect(emitted).toBe(2);
    key.dispose();
  });

  it("follows the bus: NoteStarted/NoteEnded feed the window", () => {
    const bus = new EventBus();
    const key = new KeyEstimator(bus);
    const seen: string[] = [];
    bus.on("KeyUpdated", (k) => seen.push(`${k.root}:${k.mode}`));
    for (const [i, midi] of [60, 64, 67].entries()) {
      const id = `bus${i}`;
      bus.emit("NoteStarted", {
        id,
        pitch: 440,
        midi,
        startTime: i * 0.6,
        duration: 0,
        velocity: 0.9,
        confidence: 0.9,
        source: "voice",
      });
      bus.emit("NoteEnded", { id, duration: 0.5 });
    }
    const est = key.tick(2000);
    expect(est?.root).toBe(0);
    expect(est?.mode).toBe("major");
    expect(seen.length).toBeGreaterThanOrEqual(1);
    key.dispose();
  });

  it("prunes notes outside the rolling window", () => {
    const bus = new EventBus();
    const key = new KeyEstimator(bus);
    key.addNote(note(60, 0.0, 0.5));
    // 10 s later with a 1 s window the C is long gone → null.
    expect(key.tick(10_000, 1000)).toBeNull();
    key.dispose();
  });

  it("returns null on an empty histogram", () => {
    expect(estimateKeyFromHistogram(new Array(12).fill(0))).toBeNull();
    expect(histogramFromNotes([], 1000)).toEqual(new Array(12).fill(0));
  });
});

describe("theory purity (TDR-04)", () => {
  it("imports zero React/WebAudio in src/features/music/theory", () => {
    const base = fileURLToPath(new URL("../../src/features/music/theory", import.meta.url));
    for (const f of ["intervals.ts", "scales.ts", "chords.ts", "functions.ts", "key.ts"]) {
      const src = readFileSync(`${base}/${f}`, "utf8");
      expect(src).not.toMatch(/from\s+["']react["']/);
      expect(src).not.toMatch(/AudioContext|webkitAudio|navigator\.mediaDevices/);
    }
    expect(config.key.windowMs).toBe(8000);
    expect(config.key.updateDelta).toBe(0.15);
  });
});
