/**
 * Conductor gesture path (Phase 9, §27–28): `GestureDetected` → arrangement
 * ONLY. Gestures quantize like manual toggles, never schedule synthesis
 * directly, and partial/low-confidence input never becomes an event
 * (proven in gestures-recognition; here: no event → no effect).
 * Run: npm test -- conductor-gestures
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import type { GestureKind, InstrumentId } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";
import { GESTURE_ORDER } from "@/features/gestures/mapping";
import { densityForEnergy } from "@/features/music/arrangement/presets";

class RecEngine implements InstrumentEngine {
  readonly scheduled: { events: MusicalEvent[]; ctx: ScheduleContext }[] = [];
  constructor(readonly id: InstrumentId) {}
  schedule(events: MusicalEvent[], ctx: ScheduleContext): void {
    this.scheduled.push({ events: [...events], ctx: { ...ctx } });
  }
  stop(): void {}
  setVolume(): void {}
  setPan(): void {}
}

const IDS: InstrumentId[] = ["drums", "bass", "piano", "guitar", "strings", "violin", "sax", "accordion"];

function setup() {
  const events = new EventBus();
  const engines = createEngines(events);
  const rec = {} as Record<InstrumentId, RecEngine>;
  for (const id of IDS) rec[id] = new RecEngine(id);
  const conductor = new Conductor(engines, { band: rec, schedulerNow: () => 0, seed: "gesture-test" }, events);
  conductor.reset(0);
  const added: InstrumentId[] = [];
  const removed: InstrumentId[] = [];
  events.on("InstrumentAdded", (p) => added.push(p.instrument));
  events.on("InstrumentRemoved", (p) => removed.push(p.instrument));
  const scheduledTotal = () => IDS.reduce((n, id) => n + rec[id].scheduled.length, 0);
  return { events, engines, rec, conductor, added, removed, scheduledTotal };
}

function gesture(events: EventBus, kind: GestureKind): void {
  events.emit("GestureDetected", { kind, confidence: 0.95, timestamp: Date.now() });
}

describe("open/close gestures drive the quantized lineup", () => {
  it("OPEN_HAND via bus queues the selected guitar, applies on the next bar", () => {
    const s = setup();
    expect(s.conductor.gestureSelected()).toBe("guitar");
    gesture(s.events, "OPEN_HAND");
    expect(s.engines.arrangement.pendingList().map((p) => p.instrument)).toEqual(["guitar"]);
    // Vision alone schedules nothing — synthesis is unreachable w/o tick.
    expect(s.scheduledTotal()).toBe(0);
    // The request used wall-clock now; drain everything due.
    s.engines.arrangement.tick(1e12);
    expect(s.added).toEqual(["guitar"]);
    expect(s.engines.arrangement.snapshot().active.guitar).toBe(true);
  });

  it("CLOSED_HAND removes the selected instrument with InstrumentRemoved", () => {
    const s = setup();
    s.conductor.applyGesture("OPEN_HAND", 0); // on-boundary → immediate
    expect(s.engines.arrangement.snapshot().active.guitar).toBe(true);
    s.conductor.applyGesture("CLOSED_HAND", 0.5); // mid-bar → queued
    expect(s.engines.arrangement.snapshot().active.guitar).toBe(true);
    s.engines.arrangement.tick(1.0);
    expect(s.removed).toEqual(["guitar"]);
    expect(s.engines.arrangement.snapshot().active.guitar).toBe(false);
  });

  it("gesture adds pin the instrument (survive Auto, like manual toggles)", () => {
    const s = setup();
    s.conductor.applyGesture("OPEN_HAND", 0);
    expect(s.conductor.pinnedList()).toContain("guitar");
  });
});

describe("finger + swipe gestures drive energy and selection", () => {
  it("TWO_FINGERS sets medium energy (same density as the Média button)", () => {
    const s = setup();
    s.conductor.applyGesture("TWO_FINGERS", 0);
    expect(s.engines.arrangement.snapshot().energy).toBeCloseTo(densityForEnergy("medium"), 9);
  });

  it("ONE/THREE_FINGERS set low/high; SWIPE_UP/DOWN step and clamp", () => {
    const s = setup();
    s.conductor.applyGesture("ONE_FINGER", 0);
    expect(s.engines.arrangement.snapshot().energy).toBeCloseTo(densityForEnergy("low"), 9);
    s.conductor.applyGesture("SWIPE_UP", 0);
    expect(s.engines.arrangement.snapshot().energy).toBeCloseTo(densityForEnergy("medium"), 9);
    s.conductor.applyGesture("SWIPE_UP", 0);
    s.conductor.applyGesture("SWIPE_UP", 0); // clamp at high
    expect(s.engines.arrangement.snapshot().energy).toBeCloseTo(densityForEnergy("high"), 9);
    s.conductor.applyGesture("SWIPE_DOWN", 0);
    expect(s.engines.arrangement.snapshot().energy).toBeCloseTo(densityForEnergy("medium"), 9);
  });

  it("SWIPE_LEFT/RIGHT cycle the open/close target; OPEN follows it", () => {
    const s = setup();
    s.conductor.applyGesture("SWIPE_RIGHT", 0); // guitar → strings
    expect(s.conductor.gestureSelected()).toBe("strings");
    s.conductor.applyGesture("OPEN_HAND", 0);
    expect(s.engines.arrangement.snapshot().active.strings).toBe(true);
    expect(s.engines.arrangement.snapshot().active.guitar).toBe(false);
    s.conductor.applyGesture("SWIPE_LEFT", 0);
    expect(s.conductor.gestureSelected()).toBe("guitar");
  });

  it("manual selection works too (dropdown parity)", () => {
    const s = setup();
    s.conductor.setGestureSelected("sax");
    s.conductor.applyGesture("OPEN_HAND", 0);
    expect(s.engines.arrangement.snapshot().active.sax).toBe(true);
  });
});

describe("totality + event-only flow", () => {
  it("every vocab gesture is handled without throwing", () => {
    const s = setup();
    for (const kind of GESTURE_ORDER) {
      expect(() => s.conductor.applyGesture(kind, 0)).not.toThrow();
    }
  });

  it("GestureDetected with unknown shape never touches the lineup", () => {
    const s = setup();
    const before = s.engines.arrangement.snapshot();
    // @ts-expect-error — hostile input probe: no kind at all
    s.events.emit("GestureDetected", { confidence: 0.99, timestamp: 1 });
    expect(s.engines.arrangement.snapshot()).toEqual(before);
    expect(s.scheduledTotal()).toBe(0);
  });
});
