/**
 * Phase 14: Quality & Hardening — CPU & Overload Behavior (§26, §45)
 * Tests degradation order under load:
 * posted observation rate → UI meter rate → theory cadence.
 * Asserts "reduced" badge and "minimal" badge (drums + bass, NEVER silence).
 * Asserts hysteresis recovery without flapping.
 */
import { describe, expect, it } from "vitest";
import { DegradationController } from "@/features/conductor/degradation";
import { config } from "@/lib/config";
import { Conductor, createEngines } from "@/features/conductor/conductor";
import { EventBus } from "@/lib/events";
import type { InstrumentId } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";

class TrackingEngine implements InstrumentEngine {
  scheduledCount = 0;
  constructor(readonly id: InstrumentId) {}
  schedule(events: MusicalEvent[], _ctx: ScheduleContext): void {
    this.scheduledCount += events.length;
  }
  stop(): void {}
  setVolume(): void {}
  setPan(): void {}
}

const IDS: InstrumentId[] = [
  "drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion",
];

describe("Phase 14 — CPU Overload & Graceful Degradation", () => {
  it("controller follows strictly documented degradation order (§45)", () => {
    const d = new DegradationController();
    const full = d.snapshot();
    expect(full.level).toBe("full");
    expect(full.observeEvery).toBe(1);
    expect(full.uiMeterHz).toBe(12);
    expect(full.theoryEveryBars).toBe(1);
    expect(full.badge).toBeNull();

    // Trigger reduced
    const red = d.evaluate({ lateTotal: config.conductor.degradeLateThreshold, tickAvgMs: 2 });
    expect(red.level).toBe("reduced");
    expect(red.badge).toMatch(/REDUZIDA/i);
    expect(red.observeEvery).toBe(2); // posted observation rate reduced (60 -> 30 Hz proxy)
    expect(red.uiMeterHz).toBe(6); // UI meter rate reduced
    expect(red.theoryEveryBars).toBe(2); // theory cadence slowed

    // Trigger minimal under extreme load
    const min = d.evaluate({
      lateTotal: config.conductor.degradeLateThreshold * 3,
      tickAvgMs: config.conductor.degradeTickMs * 2,
    });
    expect(min.level).toBe("minimal");
    expect(min.badge).toMatch(/nunca silêncio/i);
    expect(min.observeEvery).toBe(3);
    expect(min.uiMeterHz).toBe(4);
    expect(min.theoryEveryBars).toBe(4);
  });

  it("conductor under minimal mode maintains drums + bass and NEVER silences the band", () => {
    const events = new EventBus();
    const engines = createEngines(events);
    const band = {} as Record<InstrumentId, TrackingEngine>;
    for (const id of IDS) band[id] = new TrackingEngine(id);

    let nowSec = 10;
    const conductor = new Conductor(
      engines,
      { band, schedulerNow: () => nowSec, seed: "minimal-band" },
      events,
    );
    conductor.reset(nowSec);

    // Force minimal degradation
    conductor.degradation.force("minimal");

    // Advance 4 bars
    for (let b = 0; b < 4; b++) {
      nowSec += 2.5;
      conductor.tick(nowSec);
    }

    // Drums and bass must have scheduled events; harmony/lead instruments are suppressed
    expect(band.drums.scheduledCount).toBeGreaterThan(0);
    expect(band.bass.scheduledCount).toBeGreaterThan(0);
    // Suppressed instruments remain silent to save CPU
    expect(band.strings.scheduledCount).toBe(0);
    expect(band.violin.scheduledCount).toBe(0);

    conductor.dispose();
  });

  it("hysteresis prevents rapid flapping between levels", () => {
    const d = new DegradationController();
    // Escalate to reduced
    d.evaluate({ lateTotal: config.conductor.degradeLateThreshold, tickAvgMs: 5 });
    expect(d.snapshot().level).toBe("reduced");

    // Partial recovery (late drops from 8 to 3) should NOT immediately restore full
    d.evaluate({ lateTotal: 3, tickAvgMs: 4 });
    expect(d.snapshot().level).toBe("reduced");

    // Still some minor lag (tick 7 ms) should NOT restore full
    d.evaluate({ lateTotal: 0, tickAvgMs: 7 });
    expect(d.snapshot().level).toBe("reduced");

    // Only clean signals (late 0 and tick < threshold / 2) restore full
    d.evaluate({ lateTotal: 0, tickAvgMs: 2 });
    expect(d.snapshot().level).toBe("full");
  });
});
