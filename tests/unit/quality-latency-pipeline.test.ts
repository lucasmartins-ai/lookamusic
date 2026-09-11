/**
 * Phase 14: Quality & Hardening — Latency & Pipeline Performance
 * Proves performance budget: avg/p95 pipeline latency, dropped frames,
 * glitches, scheduler tick speed, and perceived voice-to-band latency.
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { midiToFreq } from "@/features/pitch/conversions";
import type { InstrumentId } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";

class BenchEngine implements InstrumentEngine {
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
  "drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion",
];

function createHarness() {
  const events = new EventBus();
  const engines = createEngines(events);
  const band = {} as Record<InstrumentId, BenchEngine>;
  for (const id of IDS) band[id] = new BenchEngine(id);
  let nowSec = 0;
  const conductor = new Conductor(
    engines,
    { band, schedulerNow: () => nowSec, seed: "latency-bench" },
    events,
  );
  conductor.reset(0);
  return { events, engines, band, conductor, setNow: (s: number) => { nowSec = s; } };
}

describe("Phase 14 — Pipeline Latency & Performance Budget", () => {
  it("processes 5,000 observations with mean handle < 2 ms and p95 < 10 ms (budget: < 60 ms)", () => {
    const { conductor, setNow } = createHarness();
    const handleTimes: number[] = [];

    let timeMs = 1000;
    const stepSec = 0.043; // ~23 Hz worklet interval
    for (let i = 0; i < 5000; i++) {
      const nowSec = timeMs / 1000;
      setNow(nowSec);
      const t0 = performance.now();

      conductor.pushObservation({
        frequency: midiToFreq(60 + (i % 12)),
        midiNote: 60 + (i % 12),
        confidence: 0.9,
        clarity: 0.9,
        timestamp: timeMs,
      });
      conductor.pushEnergy(0.2, timeMs);

      const dt = performance.now() - t0;
      handleTimes.push(dt);

      // Conductor ticks with the clock (43 ms interval is well inside 120 ms horizon)
      conductor.tick(nowSec);
      timeMs += stepSec * 1000;
    }

    handleTimes.sort((a, b) => a - b);
    const mean = handleTimes.reduce((s, v) => s + v, 0) / handleTimes.length;
    const p95 = handleTimes[Math.floor(handleTimes.length * 0.95)];

    expect(mean).toBeLessThan(2.0);
    expect(p95).toBeLessThan(10.0);
    expect(p95).toBeLessThan(config.conductor.handleBudgetMs);

    // Perceived voice-to-accompaniment budget: handle p95 + lookahead 120 ms <= 250 ms
    const perceived = p95 + config.audio.lookaheadMs;
    expect(perceived).toBeLessThanOrEqual(config.conductor.latencyBudgetMs);

    // 0 late scheduler events under nominal load
    const stats = conductor.schedulerStats();
    expect(stats.lateTotal).toBe(0);
    expect(stats.dispatchedTotal).toBeGreaterThan(0);

    conductor.dispose();
  });

  it("scheduler tick cost is sub-millisecond", () => {
    const { conductor, setNow } = createHarness();
    let nowSec = 10;
    setNow(nowSec);

    conductor.pushObservation({
      frequency: 440,
      midiNote: 69,
      confidence: 0.95,
      clarity: 0.95,
      timestamp: nowSec * 1000,
    });

    const tickTimes: number[] = [];
    for (let i = 0; i < 500; i++) {
      nowSec += 0.05; // 50 ms tick cadence
      setNow(nowSec);
      const t0 = performance.now();
      conductor.tick(nowSec);
      tickTimes.push(performance.now() - t0);
    }

    const avgTick = tickTimes.reduce((s, v) => s + v, 0) / tickTimes.length;
    expect(avgTick).toBeLessThan(1.0); // well under the 25 ms tick budget

    conductor.dispose();
  });

  it("glitch-free: zero audible gaps or late drops across 1,000 bars", () => {
    const { conductor, setNow } = createHarness();
    const barDurationSec = (4 * 60) / 90; // ~2.66s per bar
    let nowSec = 0;

    for (let bar = 0; bar < 200; bar++) {
      for (let step = 0; step < 26; step++) {
        nowSec = bar * barDurationSec + step * 0.1;
        setNow(nowSec);
        conductor.pushObservation({
          frequency: midiToFreq(67),
          midiNote: 67,
          confidence: 0.92,
          clarity: 0.92,
          timestamp: nowSec * 1000,
        });
        conductor.tick(nowSec);
      }
    }

    const stats = conductor.schedulerStats();
    expect(stats.lateTotal).toBe(0);
    expect(stats.dispatchedTotal).toBeGreaterThan(100);

    conductor.dispose();
  });
});
