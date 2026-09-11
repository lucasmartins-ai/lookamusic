/**
 * Look-ahead scheduler (Phase 6, §25): 100 events keep audioTime order,
 * late events are counted and dropped — never a crash. Run:
 * npm test -- instruments-scheduler
 */
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { LookaheadScheduler } from "@/features/instruments/scheduler";

interface Hit {
  audioTime: number;
  seq: number;
}

function shuffled<T>(arr: T[]): T[] {
  // Deterministic shuffle (LCG) — the test never depends on Math.random.
  let s = 42;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("ordering", () => {
  it("100 events pushed shuffled dispatch in audioTime order", () => {
    let now = 999; // clock starts ahead of the first event: nothing is born late
    const seen: number[] = [];
    const sched = new LookaheadScheduler<Hit>((h) => seen.push(h.seq), { now: () => now });
    const events: Hit[] = Array.from({ length: 100 }, (_, k) => ({
      audioTime: 1000 + k * 0.05,
      seq: k,
    }));
    sched.push(shuffled(events));
    for (let step = 0; step < 60 && sched.pending > 0; step++) {
      now += 0.1;
      sched.tick();
    }
    expect(seen).toEqual(events.map((e) => e.seq));
    expect(sched.pending).toBe(0);
    expect(sched.dispatchedTotal).toBe(100);
    expect(sched.lateTotal).toBe(0);
  });

  it("respects the horizon: far-future events wait for later ticks", () => {
    let now = 0;
    const seen: number[] = [];
    const sched = new LookaheadScheduler<Hit>((h) => seen.push(h.seq), {
      now: () => now,
      horizonMs: config.audio.lookaheadMs,
    });
    sched.push([
      { audioTime: 0.05, seq: 0 },
      { audioTime: 5, seq: 1 },
    ]);
    const first = sched.tick();
    expect(first.dispatched).toBe(1);
    expect(seen).toEqual([0]);
    now = 5;
    const second = sched.tick();
    expect(second.dispatched).toBe(1);
    expect(seen).toEqual([0, 1]);
  });

  it("empty queue ticks are silent no-ops", () => {
    const sched = new LookaheadScheduler<Hit>(() => {});
    expect(sched.tick()).toEqual({ dispatched: 0, late: 0, pending: 0 });
  });
});

describe("jitter guard: late events counted, never crashed", () => {
  it("past-due events are counted late and skipped", () => {
    let now = 10;
    const seen: number[] = [];
    const sched = new LookaheadScheduler<Hit>((h) => seen.push(h.seq), { now: () => now });
    sched.push([
      { audioTime: 9.5, seq: 0 },
      { audioTime: 9.9, seq: 1 },
      { audioTime: 10.05, seq: 2 },
    ]);
    const report = sched.tick();
    expect(seen).toEqual([2]);
    expect(report.late).toBe(2);
    expect(sched.lateTotal).toBe(2);
  });

  it("poisoned (NaN/Infinity) times are dropped without throwing", () => {
    const seen: number[] = [];
    const sched = new LookaheadScheduler<Hit>((h) => seen.push(h.seq), { now: () => 0 });
    expect(() =>
      sched.push([
        { audioTime: Number.NaN, seq: 0 },
        { audioTime: Number.POSITIVE_INFINITY, seq: 1 },
        { audioTime: 0.01, seq: 2 },
      ]),
    ).not.toThrow();
    const report = sched.tick();
    expect(seen).toEqual([2]);
    expect(report.late).toBe(2);
  });

  it("a throwing consumer is isolated: counted late, loop continues", () => {
    const seen: number[] = [];
    const sched = new LookaheadScheduler<Hit>(
      (h) => {
        if (h.seq === 1) throw new Error("boom");
        seen.push(h.seq);
      },
      { now: () => 0 },
    );
    sched.push([
      { audioTime: 0.01, seq: 0 },
      { audioTime: 0.02, seq: 1 },
      { audioTime: 0.03, seq: 2 },
    ]);
    const report = sched.tick();
    expect(seen).toEqual([0, 2]);
    expect(report.late).toBe(1);
    expect(sched.dispatchedTotal).toBe(2);
  });

  it("flush drops the pending queue without late counts", () => {
    const sched = new LookaheadScheduler<Hit>(() => {}, { now: () => 0 });
    sched.push([
      { audioTime: 5, seq: 0 },
      { audioTime: 6, seq: 1 },
    ]);
    expect(sched.pending).toBe(2);
    sched.flush();
    expect(sched.pending).toBe(0);
    expect(sched.lateTotal).toBe(0);
  });
});
