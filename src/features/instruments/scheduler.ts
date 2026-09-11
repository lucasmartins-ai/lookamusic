/**
 * Look-ahead scheduler (Phase 6, §25). Pure — no React, no Web Audio.
 * Timer 25 ms, horizon 120 ms (tunable `config.audio`); the queue stays
 * sorted by audioTime; late events go to the diagnostics counter, never crash.
 *
 * The clock and the dispatch target are injected so vitest drives time
 * deterministically; the browser hook injects `audioCtx.currentTime` and the
 * engine `schedule()` calls. Phase 8 (conductor) reuses this class unchanged.
 */
import { config } from "@/lib/config";

export interface TimedItem {
  audioTime: number;
}

export interface SchedulerOptions {
  tickMs?: number;
  horizonMs?: number;
  now?: () => number;
}

export interface TickReport {
  dispatched: number;
  late: number;
  pending: number;
}

/**
 * Phase 8: grace window for clock skew. `tick()` samples `now()` fresh,
 * so an item stamped "now" by the planner reads milliseconds old by
 * dispatch time — without grace, every bar plan would count late in the
 * browser (ms wall clock) while unit tests (frozen manual clock) stay
 * green. Items ≤ 25 ms past still dispatch (the sink plays them
 * immediately); only older items count late. One 50 ms transport tick,
 * never a dropped bar for a 5 ms skew.
 */
const LATE_GRACE_SEC = 0.025;

export class LookaheadScheduler<T extends TimedItem> {
  private queue: T[] = [];
  private lateCount = 0;
  private dispatchedCount = 0;
  private readonly tickMs: number;
  private readonly horizonMs: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dispatch: (item: T) => void,
    opts: SchedulerOptions = {},
  ) {
    this.tickMs = opts.tickMs ?? config.audio.schedulerTickMs;
    this.horizonMs = opts.horizonMs ?? config.audio.lookaheadMs;
    this.now = opts.now ?? (() => Date.now() / 1000);
  }

  /** Enqueue items; the queue is always kept sorted by audioTime. */
  push(items: readonly T[]): void {
    if (items.length === 0) return;
    this.queue.push(...items);
    this.queue.sort((a, b) => timeOf(a) - timeOf(b));
    if (this.queue.length > 512) {
      this.queue.splice(0, this.queue.length - 512);
    }
  }

  /** One scheduler step: dispatch everything inside the horizon window. */
  tick(): TickReport {
    const now = this.now();
    const horizon = now + this.horizonMs / 1000;
    let dispatched = 0;
    let late = 0;
    while (this.queue.length > 0) {
      const head = this.queue[0];
      const t = timeOf(head);
      if (!Number.isFinite(t)) {
        // Poisoned event: counted, dropped, never dispatched, never thrown.
        this.queue.shift();
        late += 1;
        continue;
      }
      if (t > horizon) break;
      this.queue.shift();
      if (t < now - LATE_GRACE_SEC) {
        // Jitter guard: the moment clearly passed — count it, skip it.
        // (≤25 ms past still dispatches: planner/scheduler clock skew.)
        late += 1;
        continue;
      }
      try {
        this.dispatch(head);
      } catch {
        // A failing consumer must never break the scheduler loop.
        late += 1;
        continue;
      }
      dispatched += 1;
    }
    this.lateCount += late;
    this.dispatchedCount += dispatched;
    return { dispatched, late, pending: this.queue.length };
  }

  /** Browser drive: setInterval(tick, tickMs). Node tests call tick() by hand. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Drop everything unsent (bar boundary, transport stop). Not counted late. */
  flush(): void {
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length;
  }

  get lateTotal(): number {
    return this.lateCount;
  }

  get dispatchedTotal(): number {
    return this.dispatchedCount;
  }
}

function timeOf<T extends TimedItem>(item: T): number {
  return item.audioTime;
}
