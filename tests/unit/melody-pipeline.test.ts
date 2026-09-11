/**
 * Melody pipeline integration (Phase 2 acceptance): synthetic observations
 * → ordered NoteEvents + phrase boundaries + stable BPM on one bus.
 * Scenario: G4 (300 ms) — breath (80 ms) — A4 (300 ms) — silence.
 * Run: npm test -- melody-pipeline
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import type { DomainEvents } from "@/domain/events";
import { PitchSmoother } from "@/features/music/melody/smoothing";
import { NoteStabilizer } from "@/features/music/melody/stabilization";
import { PhraseTracker } from "@/features/music/melody/phrases";
import { TempoEstimator } from "@/features/music/rhythm/tempo";
import { A_4, G_4, feed, rawObs, rawUnvoiced } from "../fixtures/melody";

describe("melody pipeline", () => {
  it("sung phrase → ordered notes + phrase + stable tempo", () => {
    const bus = new EventBus();
    const smoother = new PitchSmoother();
    const stab = new NoteStabilizer(bus);
    const phrases = new PhraseTracker(bus);
    const tempo = new TempoEstimator(bus);

    const order: string[] = [];
    (["NoteStarted", "NoteChanged", "NoteEnded", "PhraseStarted", "PhraseEnded", "TempoUpdated"] as const).forEach(
      (name) => bus.on(name, () => order.push(name)),
    );

    const push = (t: number, midi: number | null) => {
      const sm = smoother.push(midi === null ? rawUnvoiced(t) : rawObs(midi, t));
      stab.push(sm);
      phrases.tick(t);
      tempo.tick(t);
    };

    feed((t) => push(t, G_4), 0, 300); // G4
    feed((t) => push(t, null), 320, 400); // breath: too short to split anything
    feed((t) => push(t, A_4), 420, 720); // A4 (re-articulated: gap seen)
    feed((t) => push(t, null), 740, 1600); // silence: closes note + phrase
    phrases.tick(3000);
    tempo.tick(3000);

    // Event choreography on the bus.
    expect(order.filter((n) => n === "NoteStarted")).toHaveLength(2);
    expect(order.filter((n) => n === "NoteEnded")).toHaveLength(2);
    expect(order.filter((n) => n === "PhraseStarted")).toHaveLength(1);
    expect(order.filter((n) => n === "PhraseEnded")).toHaveLength(1);
    expect(order.indexOf("NoteStarted")).toBeLessThan(order.indexOf("NoteEnded"));
    expect(order.indexOf("PhraseStarted")).toBeLessThan(order.indexOf("PhraseEnded"));
    expect(order.filter((n) => n === "TempoUpdated").length).toBeGreaterThan(0);

    // Completed notes: ordered, one phrase worth of music.
    const done = stab.completedNotes();
    expect(done.map((n) => n.midi)).toEqual([G_4, A_4]);
    expect(done[0].startTime).toBeLessThan(done[1].startTime);
    for (const n of done) expect(n.duration).toBeGreaterThan(0);

    const sung = phrases.completedPhrases()[0];
    expect(sung.noteCount).toBe(2);
    expect(sung.endTime).not.toBeNull();

    // Tempo: two onsets ~0.46 s apart → allegro-ish estimate, target chases
    // monotonically without ever snapping past the estimate.
    const state = tempo.state();
    expect(state.estimated).toBeGreaterThan(90);
    expect(state.target).toBeGreaterThanOrEqual(90);
    expect(state.target).toBeLessThanOrEqual(state.estimated + 1e-9);
    expect(state.playback).toBe(state.target);
    expect(state.confidence).toBeGreaterThan(0);

    phrases.dispose();
    tempo.dispose();
  });

  it("§9 wobble inside one phrase never splits notes or phrases", () => {
    const bus = new EventBus();
    const smoother = new PitchSmoother();
    const stab = new NoteStabilizer(bus);
    const phrases = new PhraseTracker(bus);
    const tempo = new TempoEstimator(bus);

    let started = 0;
    let ended = 0;
    let changed = 0;
    bus.on("NoteStarted", () => started++);
    bus.on("NoteEnded", () => ended++);
    bus.on("NoteChanged", () => changed++);

    // G4 with vibrato + single-frame G#4/F#4 intrusions, 600 ms straight.
    const seq = [67, 67.2, 66.8, 68, 67, 66, 67.1, 66.9, 67, 67];
    for (let r = 0; r < 3; r++) seq.forEach((m, i) => {
      const t = (r * seq.length + i) * 20;
      stab.push(smoother.push(rawObs(m, t)));
      phrases.tick(t);
      tempo.tick(t);
    });

    expect(started).toBe(1);
    expect(changed).toBe(0);
    expect(ended).toBe(0);
    expect(phrases.openPhrase()?.noteCount).toBe(1);

    phrases.dispose();
    tempo.dispose();
  });
});
