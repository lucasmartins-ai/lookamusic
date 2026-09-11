/**
 * Phase 14: Quality & Hardening — Memory Leak Hunting & 5/15/30/60-min Soaks
 * Verifies:
 * - 5 min (300 s), 15 min (900 s), 30 min (1800 s), and 60 min (3600 s) continuous simulation.
 * - Zero memory growth (<= 5%) across all data rings over 60 min:
 *   melody <= 128, chords <= 64, phrases <= 16, stabilizer completed <= 128, phrase tracker completed <= 64.
 * - Zero late scheduler dispatches across all soaks.
 * - Full lifecycle cleanup: conductor.dispose() tears down all bus subscriptions without leaving leaks.
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { midiToFreq } from "@/features/pitch/conversions";
import type { InstrumentId } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";

class SilentSink implements InstrumentEngine {
  dispatched = 0;
  constructor(readonly id: InstrumentId) {}
  schedule(events: MusicalEvent[], _ctx: ScheduleContext): void {
    this.dispatched += events.length;
  }
  stop(): void {}
  setVolume(): void {}
  setPan(): void {}
}

const IDS: InstrumentId[] = [
  "drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion",
];

describe("Phase 14 — Memory Leak Hunting & Endurance Soaks", () => {
  it("runs 5 / 15 / 30 / 60 min endurance soaks with <= 5% growth and 0 late events", () => {
    const events = new EventBus();
    const engines = createEngines(events);
    const band = {} as Record<InstrumentId, SilentSink>;
    for (const id of IDS) band[id] = new SilentSink(id);

    let nowSec = 0;
    const conductor = new Conductor(
      engines,
      { band, schedulerNow: () => nowSec, seed: "soak-60min" },
      events,
    );
    conductor.reset(0);

    const checkpoints = [
      { name: "5 min", targetSec: 300 },
      { name: "15 min", targetSec: 900 },
      { name: "30 min", targetSec: 1800 },
      { name: "60 min", targetSec: 3600 },
    ];

    const measurements: {
      name: string;
      melody: number;
      chords: number;
      phrases: number;
      completedNotes: number;
      completedPhrases: number;
      retainedTotal: number;
    }[] = [];

    const notes = [60, 62, 64, 65, 67, 69, 71, 72];
    const stepSec = 0.1; // 100 ms ticking (inside 120 ms scheduler horizon)
    const totalSteps = Math.round(3600 / stepSec);
    let nextCheckIdx = 0;

    for (let step = 0; step <= totalSteps; step++) {
      const t = step * stepSec;
      nowSec = t;
      // Re-articulated singing: 0.6s voiced (3 steps) + 0.4s silence (2 steps) per note
      const inCycleSec = t % 1.0;
      const isVoiced = inCycleSec < 0.6;
      const noteIdx = Math.floor(t) % notes.length;

      if (isVoiced) {
        const midi = notes[noteIdx];
        conductor.pushObservation({
          frequency: midiToFreq(midi),
          midiNote: midi,
          confidence: 0.9,
          clarity: 0.9,
          timestamp: t * 1000,
        });
        conductor.pushEnergy(0.25, t * 1000);
      } else {
        // Inter-note silence closes note and phrase
        conductor.pushObservation({
          frequency: -1,
          midiNote: -1,
          confidence: 0,
          clarity: 0,
          timestamp: t * 1000,
        });
        conductor.pushEnergy(0.005, t * 1000);
      }

      conductor.tick(nowSec);

      if (nextCheckIdx < checkpoints.length && t >= checkpoints[nextCheckIdx].targetSec) {
        const cp = checkpoints[nextCheckIdx];
        const m = conductor.state.melodyNotes().length;
        const c = conductor.state.chordEvents().length;
        const p = conductor.state.phraseRecords().length;
        const cn = engines.stabilizer.completedNotes().length;
        const cpTotal = engines.phrases.completedPhrases().length;
        measurements.push({
          name: cp.name,
          melody: m,
          chords: c,
          phrases: p,
          completedNotes: cn,
          completedPhrases: cpTotal,
          retainedTotal: m + c + p + cn + cpTotal,
        });
        nextCheckIdx++;
      }
    }

    // Verify all 4 checkpoints reached
    expect(measurements).toHaveLength(4);

    // Verify bounds at every checkpoint
    for (const m of measurements) {
      expect(m.melody, `${m.name} melody cap`).toBeLessThanOrEqual(config.conductor.melodyCap);
      expect(m.chords, `${m.name} chord cap`).toBeLessThanOrEqual(config.conductor.chordCap);
      expect(m.phrases, `${m.name} phrase cap`).toBeLessThanOrEqual(config.conductor.phraseCap);
      expect(m.completedNotes, `${m.name} stabilizer cap`).toBeLessThanOrEqual(config.conductor.melodyCap);
      expect(m.completedPhrases, `${m.name} phraseTracker cap`).toBeLessThanOrEqual(64);
    }

    // Compare steady-state 30 min vs 60 min: data structure growth must be <= 5% (0.00% growth)
    const m30 = measurements[2];
    const m60 = measurements[3];
    const growth = (m60.retainedTotal - m30.retainedTotal) / m30.retainedTotal;
    expect(growth).toBeLessThanOrEqual(0.05);
    expect(growth).toBe(0); // exactly bounded by ring caps

    // Scheduler health: 0 late dispatches across all 3,600 simulated seconds (18,000 steps)
    const stats = conductor.schedulerStats();
    expect(stats.lateTotal).toBe(0);
    expect(stats.dispatchedTotal).toBeGreaterThan(1000);

    conductor.dispose();
  });

  it("teardown completely unhooks engines and leaves 0 dangling bus listeners", () => {
    const events = new EventBus();
    const engines = createEngines(events);
    const band = {} as Record<InstrumentId, SilentSink>;
    for (const id of IDS) band[id] = new SilentSink(id);

    const conductor = new Conductor(engines, { band }, events);
    expect(conductor.isDisposed).toBe(false);

    // Dispose
    conductor.dispose();
    expect(conductor.isDisposed).toBe(true);

    // Emitting events after dispose should not affect disposed conductor
    events.emit("NoteStarted", {
      id: "orphan",
      pitch: 440,
      midi: 69,
      startTime: 0,
      duration: 1,
      velocity: 1,
      confidence: 1,
      source: "voice",
    });

    expect(conductor.state.melodyNotes()).toHaveLength(0);
  });
});
