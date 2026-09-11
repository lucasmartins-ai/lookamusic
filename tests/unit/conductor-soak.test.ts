/**
 * Conductor soak: simulated 15 min without degradation (Phase 8).
 * Drives transport + observations across 900 s; asserts bounded memory
 * (rings + planned set), zero late dispatches, monotonic clock.
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { midiToFreq } from "@/features/pitch/conversions";
import type { InstrumentId } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";

class NullEngine implements InstrumentEngine {
  constructor(readonly id: InstrumentId) {}
  schedule(_e: MusicalEvent[], _c: ScheduleContext): void {}
  stop(): void {}
  setVolume(): void {}
  setPan(): void {}
}

const IDS: InstrumentId[] = ["drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion"];

describe("Conductor 15-min soak (simulated)", () => {
  it("900 s clean: bounded rings, 0 late, monotonic bars", () => {
    const events = new EventBus();
    const engines = createEngines(events);
    const band = {} as Record<InstrumentId, InstrumentEngine>;
    for (const id of IDS) band[id] = new NullEngine(id);
    let nowSec = 0;
    const c = new Conductor(engines, { band, schedulerNow: () => nowSec, seed: "soak" }, events);
    const t0Ms = 5_000_000;
    c.reset(t0Ms / 1000);

    const seen: number[] = [];
    let lastBar = -1;
    // ~337 bars @90bpm 4/4, ticked at the production 100 ms cadence so the
    // 120 ms scheduler horizon always sees its dispatch window (coarse time
    // jumps would manufacture false lates — real hook ticks every 100 ms).
    const barSec = (4 * 60) / 90;
    const totalSec = 900;
    const stepSec = 0.1;
    const steps = Math.ceil(totalSec / stepSec);
    let obsMs = t0Ms;
    for (let k = 0; k <= steps; k++) {
      nowSec = t0Ms / 1000 + k * stepSec;
      // One voiced frame per tick (~10 Hz singing) + energy.
      c.pushObservation({
        frequency: midiToFreq(67), midiNote: 67, confidence: 0.9, clarity: 0.9, timestamp: obsMs,
      });
      c.pushEnergy(0.2, obsMs);
      obsMs += stepSec * 1000;
      c.tick(nowSec);
      const bar = Math.floor(c.transport.barFloatAt(nowSec));
      expect(bar).toBeGreaterThanOrEqual(lastBar);
      lastBar = bar;
      if (k % 10 === 0) seen.push(bar);
    }

    expect(c.state.melodyNotes().length).toBeLessThanOrEqual(config.conductor.melodyCap);
    expect(c.state.chordEvents().length).toBeLessThanOrEqual(config.conductor.chordCap);
    expect(c.schedulerStats().lateTotal).toBe(0);
    expect(c.degradation.snapshot().level).toBe("full");
    c.dispose();
  }, 30_000);
});
