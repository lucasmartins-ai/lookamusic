/**
 * MeterTracker: 4/4 rests, waltz and compound grooves switch stably,
 * single anomalous bars never flip, ties keep the current meter.
 * Run: npm test -- rhythm-meter
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import type { TimeSignature } from "@/domain/types";
import {
  METER_34,
  METER_44,
  METER_68,
  MeterTracker,
  barEighths,
  barQuarters,
  meterKey,
  meterLabel,
  scoreBar,
} from "@/features/music/rhythm/meter";

const BEAT = 0.5; // 120 BPM quarter-note seconds

function harness() {
  const bus = new EventBus();
  const meter = new MeterTracker(bus);
  const changes: TimeSignature[] = [];
  bus.on("MeterChanged", (m) => changes.push({ ...m }));
  return { meter, changes };
}

/** Waltz-feel onsets: beats 0 and 2 of each 3-beat bar (sing–rest–sing). */
function waltzBars(h: ReturnType<typeof harness>, bars: number): void {
  const barLen = 3 * BEAT;
  for (let b = 0; b < bars; b++) {
    h.meter.addOnset(b * barLen);
    h.meter.addOnset(b * barLen + 2 * BEAT);
  }
}

/** Compound groove: the two dotted-quarter beats of each 6/8 bar. */
function compoundBars(h: ReturnType<typeof harness>, bars: number): void {
  const barLen = 3 * BEAT;
  for (let b = 0; b < bars; b++) {
    h.meter.addOnset(b * barLen);
    h.meter.addOnset(b * barLen + 3 * (BEAT / 2));
  }
}

describe("resting state + helpers", () => {
  it("rests at 4/4 with zero confidence", () => {
    const { meter } = harness();
    expect(meterKey(meter.meter())).toBe("4/4");
    expect(meter.meterConfidence()).toBe(0);
  });

  it("bar grids: 4/4 = 4 quarters/8 eighths, 3/4 and 6/8 = 3 quarters/6 eighths", () => {
    expect(barQuarters(METER_44)).toBe(4);
    expect(barEighths(METER_44)).toBe(8);
    expect(barQuarters(METER_34)).toBe(3);
    expect(barEighths(METER_34)).toBe(6);
    expect(barQuarters(METER_68)).toBe(3);
    expect(barEighths(METER_68)).toBe(6);
    expect(meterLabel(METER_68)).toBe("6/8");
  });

  it("scoreBar: 0 without a downbeat, 1 on a perfect bar", () => {
    expect(scoreBar([2, 4], METER_44, 0.3)).toBe(0);
    expect(scoreBar([], METER_44, 0.3)).toBe(0);
    expect(scoreBar([0, 2, 4, 6], METER_44, 0.3)).toBeCloseTo(1, 6);
  });
});

describe("stable switching", () => {
  it("one waltz bar votes but never switches (stability needs consecutive bars)", () => {
    const h = harness();
    waltzBars(h, 1);
    const vote = h.meter.evaluate(BEAT, 1.5);
    expect(vote.meter).not.toBeNull();
    expect(meterKey(h.meter.meter())).toBe("4/4");
    expect(h.changes).toHaveLength(0);
  });

  it("sustained waltz switches 4/4→3/4 with one MeterChanged", () => {
    const h = harness();
    waltzBars(h, 3);
    h.meter.evaluate(BEAT, 1.5);
    expect(meterKey(h.meter.meter())).toBe("4/4"); // first vote banked, no flip
    h.meter.evaluate(BEAT, 3.0);
    expect(meterKey(h.meter.meter())).toBe("4/4"); // tie/abstain holds
    h.meter.evaluate(BEAT, 4.5);
    expect(meterKey(h.meter.meter())).toBe("3/4");
    expect(h.changes).toHaveLength(1);
    expect(meterKey(h.changes[0])).toBe("3/4");
  });

  it("compound dotted-beat groove switches 4/4→6/8", () => {
    const h = harness();
    compoundBars(h, 2);
    h.meter.evaluate(BEAT, 1.5);
    expect(meterKey(h.meter.meter())).toBe("4/4");
    h.meter.evaluate(BEAT, 3.0);
    expect(meterKey(h.meter.meter())).toBe("6/8");
    expect(h.changes).toHaveLength(1);
    expect(meterKey(h.changes[0])).toBe("6/8");
  });

  it("plain quarter-note streams keep 4/4 (ambiguous fits abstain by hysteresis)", () => {
    const h = harness();
    for (let i = 0; i < 13; i++) h.meter.addOnset(i * BEAT); // 6 s of quarters
    for (const t of [1.5, 3.0, 4.5, 6.0]) h.meter.evaluate(BEAT, t);
    expect(meterKey(h.meter.meter())).toBe("4/4");
    expect(h.changes).toHaveLength(0);
  });

  it("manual setMeter overrides; repeats and unsupported meters are ignored", () => {
    const h = harness();
    h.meter.setMeter(METER_34);
    expect(meterKey(h.meter.meter())).toBe("3/4");
    expect(h.changes).toHaveLength(1);
    h.meter.setMeter({ ...METER_34 });
    expect(h.changes).toHaveLength(1); // repeat: silent
    h.meter.setMeter({ numerator: 7, denominator: 8 } as unknown as TimeSignature);
    expect(meterKey(h.meter.meter())).toBe("3/4"); // unsupported: ignored
    h.meter.setMeter(METER_68);
    expect(meterKey(h.meter.meter())).toBe("6/8");
  });

  it("feeds from NoteStarted on the bus (pipeline wiring)", () => {
    const bus = new EventBus();
    const meter = new MeterTracker(bus);
    const changes: TimeSignature[] = [];
    bus.on("MeterChanged", (m) => changes.push(m));
    // Two compound bars through the real event path.
    const onsets = [0, 0.75, 1.5, 2.25];
    for (const t of onsets) {
      bus.emit("NoteStarted", {
        id: `n${t}`, pitch: 220, midi: 57, startTime: t,
        duration: 0.2, velocity: 0.8, confidence: 0.9, source: "voice",
      });
    }
    meter.evaluate(BEAT, 1.5);
    meter.evaluate(BEAT, 3.0);
    expect(meterKey(meter.meter())).toBe("6/8");
    expect(changes).toHaveLength(1);
    meter.dispose();
  });
});
