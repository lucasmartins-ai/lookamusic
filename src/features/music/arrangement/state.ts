/**
 * Arrangement state + quantized transitions (Phase 7, §29). Pure apart from
 * the injected event bus. All tunables from `config.arrangement`.
 *
 * Rule: entries/exits NEVER cut mid-beat. A request made mid-bar is queued
 * (`pendingList()` feeds the visible UI queue) and applied at the next
 * boundary — the next multiple of `transitionBars` bars, or immediately on
 * a phrase boundary (`tick(..., { phraseBoundary: true })`), which the hook
 * drives from `PhraseEnded`. Every applied transition carries `fadeSec`
 * (`fadeBeats` at the request-time tempo); `fadeGain` is the linear curve
 * the Phase 8 conductor rides per voice, so entries/exits glide instead of
 * clicking. Per-note envelopes already keep boundary entries click-free.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { INSTRUMENTS, type ArrangementState, type InstrumentId } from "@/domain/types";

export type ArrangementAction = "add" | "remove";

export interface PendingTransition {
  instrument: InstrumentId;
  action: ArrangementAction;
  /** Bar position (float) where the request was made. */
  requestedBar: number;
  /** Integer bar boundary where it takes effect. */
  effectiveBar: number;
  /** Fade length in seconds at the request-time tempo. */
  fadeSec: number;
}

export interface AppliedTransition extends PendingTransition {}

/** Math epsilon for on-boundary detection (not a musical tunable). */
const EPS = 1e-9;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function isInstrumentId(id: string): id is InstrumentId {
  return (INSTRUMENTS as readonly string[]).includes(id);
}

/**
 * Next boundary at/after `barFloat`, quantized to multiples of
 * `transitionBars`. A request exactly on a boundary applies there
 * (no wait); mid-bar requests wait for the next multiple.
 */
export function effectiveBarFor(barFloat: number, transitionBars: number): number {
  const bars = Number.isFinite(transitionBars) && transitionBars >= 1
    ? Math.floor(transitionBars)
    : 1;
  const at = Number.isFinite(barFloat) && barFloat > 0 ? barFloat : 0;
  const nearest = Math.round(at);
  const onBoundary = Math.abs(at - nearest) <= EPS;
  const base = onBoundary ? nearest : Math.floor(at) + 1;
  const boundary = Math.ceil(base / bars - EPS) * bars;
  return boundary === 0 ? 0 : boundary;
}

/**
 * Bar position (float) of `timeSec` on a grid anchored at `originSec`.
 * Guards garbage to 0; never negative.
 */
export function barFloatAt(
  timeSec: number,
  originSec: number,
  secPerBeat: number,
  beatsPerBar: number,
): number {
  if (!Number.isFinite(timeSec) || !Number.isFinite(originSec)) return 0;
  if (!Number.isFinite(secPerBeat) || secPerBeat <= 0) return 0;
  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) return 0;
  return Math.max(0, (timeSec - originSec) / (beatsPerBar * secPerBeat));
}

/** Fade length in seconds for `fadeBeats` at `bpm` (falls back to defaultBpm). */
export function fadeSecFor(bpm: number): number {
  const b = Number.isFinite(bpm) && bpm > 0 ? bpm : config.rhythm.defaultBpm;
  return config.arrangement.fadeBeats * (60 / b);
}

/**
 * Linear fade curve 0–1 for an entry ("in") or exit ("out") `elapsedSec`
 * into a `fadeSec` fade. `fadeSec <= 0` means no fade (returns 1).
 */
export function fadeGain(
  elapsedSec: number,
  fadeSec: number,
  direction: "in" | "out",
): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) elapsedSec = 0;
  if (!Number.isFinite(fadeSec) || fadeSec <= 0) return 1;
  const t = Math.min(1, elapsedSec / fadeSec);
  return direction === "in" ? t : 1 - t;
}

function blankActive(): Record<InstrumentId, boolean> {
  return {
    drums: false,
    bass: false,
    piano: false,
    guitar: false,
    violao: false,
    strings: false,
    violin: false,
    sax: false,
    accordion: false,
  };
}

export class ArrangementEngine {
  private active: Record<InstrumentId, boolean>;
  private energy: number;
  private pending: PendingTransition[] = [];

  constructor(
    private readonly events: EventBus = bus,
    initial?: Partial<ArrangementState>,
  ) {
    this.active = blankActive();
    if (initial?.active) {
      for (const id of INSTRUMENTS) {
        if (typeof initial.active[id] === "boolean") this.active[id] = initial.active[id];
      }
    }
    this.energy = clamp01(initial?.energy ?? 0);
  }

  reset(initial?: Partial<ArrangementState>): void {
    this.active = blankActive();
    if (initial?.active) {
      for (const id of INSTRUMENTS) {
        if (typeof initial.active[id] === "boolean") this.active[id] = initial.active[id];
      }
    }
    this.energy = clamp01(initial?.energy ?? 0);
    this.pending = [];
  }

  snapshot(): ArrangementState {
    return { active: { ...this.active }, energy: this.energy };
  }

  /** Normalized intensity 0–1 (display/preset input only — never a gain). */
  setEnergy(e01: number): void {
    this.energy = clamp01(e01);
  }

  /** Queued transitions, oldest-effective first (the visible UI queue). */
  pendingList(): PendingTransition[] {
    return this.pending.map((p) => ({ ...p }));
  }

  /**
   * Request `instrument` on/off at `barFloat` (bar position, float).
   * No-op when already in the wanted state (also cancels a stale queued
   * request for that instrument). Returns either the immediate application
   * (requested on a boundary) or the queued entry (mid-bar).
   */
  request(
    instrument: InstrumentId,
    wantActive: boolean,
    barFloat: number,
    bpm: number,
  ): { applied: AppliedTransition | null; queued: PendingTransition | null } {
    if (!isInstrumentId(instrument)) throw new Error(`unknown instrument: ${instrument}`);
    const at = Number.isFinite(barFloat) && barFloat > 0 ? barFloat : 0;
    this.pending = this.pending.filter((p) => p.instrument !== instrument);
    if (this.active[instrument] === wantActive) return { applied: null, queued: null };
    const entry: PendingTransition = {
      instrument,
      action: wantActive ? "add" : "remove",
      requestedBar: at,
      effectiveBar: effectiveBarFor(at, config.arrangement.transitionBars),
      fadeSec: fadeSecFor(bpm),
    };
    if (entry.effectiveBar <= Math.floor(at + EPS)) {
      this.apply(entry);
      return { applied: { ...entry }, queued: null };
    }
    this.pending.push(entry);
    this.pending.sort((a, b) => a.effectiveBar - b.effectiveBar);
    return { applied: null, queued: { ...entry } };
  }

  /**
   * Advance to `barFloat`; applies every transition whose boundary was
   * reached. `phraseBoundary: true` (drive from `PhraseEnded`) applies all
   * queued transitions immediately — phrase edges are valid boundaries.
   * Emits `InstrumentAdded`/`InstrumentRemoved` per application.
   */
  tick(barFloat: number, opts: { phraseBoundary?: boolean; bpm?: number } = {}): AppliedTransition[] {
    void opts.bpm;
    const at = Number.isFinite(barFloat) && barFloat > 0 ? barFloat : 0;
    const nowBar = Math.floor(at + EPS);
    const due = this.pending.filter((p) => opts.phraseBoundary === true || p.effectiveBar <= nowBar);
    if (due.length === 0) return [];
    this.pending = this.pending.filter((p) => !(opts.phraseBoundary === true || p.effectiveBar <= nowBar));
    for (const d of due) this.apply(d);
    return due.map((d) => ({ ...d }));
  }

  private apply(t: PendingTransition): void {
    this.active[t.instrument] = t.action === "add";
    this.events.emit(
      t.action === "add" ? "InstrumentAdded" : "InstrumentRemoved",
      { instrument: t.instrument },
    );
  }
}
