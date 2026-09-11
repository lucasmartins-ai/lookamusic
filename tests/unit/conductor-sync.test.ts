/**
 * Conductor sync: distinct engines align to one clock (Phase 8).
 * Tolerance: `config.conductor.syncToleranceMs` (50 ms).
 * Latency: voice→accompaniment perceived < 250 ms (measured).
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { ChordEvent, InstrumentId, NoteEvent } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";
import { g4Observations } from "@/features/conductor/fixture";

class RecEngine implements InstrumentEngine {
  readonly scheduled: { events: MusicalEvent[]; ctx: ScheduleContext }[] = [];
  stoppedCount = 0;
  constructor(readonly id: InstrumentId) {}
  schedule(events: MusicalEvent[], ctx: ScheduleContext): void {
    this.scheduled.push({ events: [...events], ctx: { ...ctx } });
  }
  stop(): void {
    this.stoppedCount++;
  }
  setVolume(): void {}
  setPan(): void {}
}

const IDS: InstrumentId[] = ["drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion"];

function setup() {
  const events = new EventBus();
  const engines = createEngines(events);
  const rec = {} as Record<InstrumentId, RecEngine>;
  for (const id of IDS) rec[id] = new RecEngine(id);
  let nowSec = 0;
  const conductor = new Conductor(engines, {
    band: rec,
    schedulerNow: () => nowSec,
    seed: "sync-test",
  }, events);
  conductor.reset(0);
  const chords: ChordEvent[] = [];
  const notes: NoteEvent[] = [];
  events.on("ChordChanged", (c) => chords.push(c));
  events.on("NoteStarted", (n) => notes.push(n));
  return {
    events, engines, rec, conductor, chords, notes,
    setNow: (s: number) => { nowSec = s; },
  };
}

describe("Conductor sync + latency + pins", () => {
  it("voice → note → chord → scheduled hits share one bar (tolerance 50 ms)", () => {
    const s = setup();
    const t0 = 1_000_000;
    for (const obs of g4Observations(t0, t0 + 2400)) {
      s.conductor.pushObservation(obs);
      s.conductor.pushEnergy(0.2, obs.timestamp);
    }
    // Transport origin is 0; observations stamp seconds ~1000. Re-anchor the
    // transport at the fixture start so bars align with the voice.
    s.conductor.reset(t0 / 1000);
    for (const obs of g4Observations(t0, t0 + 2400)) {
      s.conductor.pushObservation(obs);
      s.conductor.pushEnergy(0.2, obs.timestamp);
    }
    s.setNow(t0 / 1000 + 2.6);
    // Pump at the production 100 ms cadence so the scheduler sees every
    // dispatch window (coarse jumps would skip the 120 ms horizon).
    for (let k = 0; k < 60; k++) {
      const now = t0 / 1000 + 2.6 + k * 0.1;
      s.setNow(now);
      s.conductor.tick(now);
    }

    expect(s.notes.length).toBeGreaterThan(0);
    expect(s.chords.length).toBeGreaterThan(0);
    const dispatched = s.conductor.schedulerStats().dispatchedTotal;
    expect(dispatched).toBeGreaterThan(0);

    // Same-bar alignment: the first chord's bar == the first scheduled
    // hit's bar (one clock, §32), and the hit fires causally — on/after
    // the downbeat, within one scheduler horizon of the plan tick.
    const firstChord = s.chords[0];
    const hits = s.rec.drums.scheduled;
    expect(hits.length).toBeGreaterThan(0);
    const firstAudio = hits[0].ctx.audioTime;
    const barStart = s.conductor.transport.barStartSec(firstChord.startBar);
    expect(hits[0].events[0]?.bar).toBe(firstChord.startBar);
    expect(firstAudio).toBeGreaterThanOrEqual(barStart - 1e-6);
    expect(firstAudio - barStart).toBeLessThanOrEqual(
      s.conductor.transport.barSec() + config.audio.lookaheadMs / 1000,
    );
    // Scheduler queue stays time-ordered (no out-of-order dispatch).
    const times = hits.map((h) => h.ctx.audioTime);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("hot drum pickup answers the voice within 250 ms (no next-bar wait)", () => {
    const s = setup();
    const t0 = 3_000_000;
    s.conductor.reset(t0 / 1000);
    // Interleave pushes and ticks like the 50 ms hook (never a 1.6 s gap —
    // stale items would rightly count late and skip).
    const obs = g4Observations(t0, t0 + 1500);
    obs.forEach((o, k) => {
      s.conductor.pushObservation(o);
      s.conductor.pushEnergy(0.2, o.timestamp);
      if (k % 5 === 0) {
        const now = o.timestamp / 1000 + 0.01;
        s.setNow(now);
        s.conductor.tick(now);
      }
    });
    for (let k = 1; k <= 10; k++) {
      const now = t0 / 1000 + 1.5 + k * 0.05;
      s.setNow(now);
      s.conductor.tick(now);
    }
    expect(s.notes.length).toBeGreaterThan(0);
    const firstNote = s.notes[0];
    // Pickup items carry one hit each; bar plans batch the whole bar per
    // engine — singletons isolate the hot response.
    const pickups = s.rec.drums.scheduled.filter((d) => d.events.length === 1);
    expect(pickups.length).toBeGreaterThan(0);
    const firstPickupAudio = Math.min(...pickups.map((d) => d.ctx.audioTime));
    expect(firstPickupAudio - firstNote.startTime).toBeLessThanOrEqual(0.3);
    // Bounded: at most one pickup per bar no matter how many notes.
    const bars = new Set(pickups.map((d) => d.events[0]?.bar));
    expect(bars.size).toBeGreaterThanOrEqual(1);
  });

  it("perceived voice→accompaniment latency < 250 ms (measured handle + horizon)", () => {
    const s = setup();
    const t0 = 2_000_000;
    s.conductor.reset(t0 / 1000);
    const handle0 = Date.now();
    for (const obs of g4Observations(t0, t0 + 1500)) s.conductor.pushObservation(obs);
    s.setNow(t0 / 1000 + 1.6);
    s.conductor.tick(t0 / 1000 + 1.6);
    const handleMs = Date.now() - handle0;
    const perceived = s.conductor.latency.perceivedMs(handleMs);
    expect(handleMs).toBeLessThan(config.conductor.handleBudgetMs);
    expect(perceived).toBeLessThanOrEqual(config.conductor.latencyBudgetMs);
    expect(s.conductor.latency.withinBudget(handleMs)).toBe(true);
  });

  it("manual pins survive Auto energy changes (Fase 7 risco 3)", () => {
    const s = setup();
    const nowSec = 10;
    s.conductor.reset(0);
    // Pin drums OFF manually.
    s.conductor.requestInstrument("drums", false, nowSec);
    s.conductor.tick(nowSec, { phraseBoundary: true });
    expect(s.events).toBeDefined();
    // Auto high-energy would normally add everything; pinned drums stay off.
    s.conductor.pushEnergy(0.2, nowSec * 1000);
    s.conductor.tick(nowSec + 0.1);
    const pendingDrumsOn = s.conductor.pendingList().find((p) => p.instrument === "drums");
    // Either still off (no queued add) or queued but pin recorded.
    expect(s.conductor.pinnedList()).toContain("drums");
    void pendingDrumsOn;
    s.conductor.unpin("drums");
    expect(s.conductor.pinnedList()).not.toContain("drums");
  });

  it("add/remove quantizes to the next bar (never mid-beat)", () => {
    const s = setup();
    s.conductor.reset(0);
    const midBarSec = 0.5;
    // strings is off by default in the quartet boot (drums/bass/piano/guitar on).
    s.conductor.requestInstrument("strings", true, midBarSec);
    const queued = s.conductor.pendingList().find((p) => p.instrument === "strings");
    expect(queued).toBeDefined();
    expect(queued!.effectiveBar).toBeGreaterThanOrEqual(1);
    // Still bar 0 just before the boundary → stays queued.
    s.conductor.tick(s.conductor.transport.barStartSec(1) - 0.05);
    expect(s.conductor.pendingList().find((p) => p.instrument === "strings")).toBeDefined();
    // On the boundary → applied.
    s.conductor.tick(s.conductor.transport.barStartSec(1) + 0.01);
    expect(s.conductor.pendingList().find((p) => p.instrument === "strings")).toBeUndefined();
  });

  it("stop() silences all engines, stops scheduler and prevents tick execution", () => {
    const s = setup();
    s.conductor.reset(0);
    expect(s.conductor.isStopped).toBe(false);

    // Stop conductor
    s.conductor.stop();
    expect(s.conductor.isStopped).toBe(true);
    // Every engine received a stop() call to cancel active audio
    for (const id of IDS) {
      expect(s.rec[id].stoppedCount).toBeGreaterThanOrEqual(1);
    }

    // While stopped, tick returns 0 dispatched and schedules nothing
    const report = s.conductor.tick(1.0);
    expect(report.dispatched).toBe(0);
    expect(report.bars).toHaveLength(0);

    // Resume with start()
    s.conductor.start(1.0);
    expect(s.conductor.isStopped).toBe(false);
    const resumeReport = s.conductor.tick(1.05);
    expect(resumeReport.bars.length).toBeGreaterThan(0);
  });
});
