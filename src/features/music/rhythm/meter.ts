/**
 * Meter tracking: 4/4, 3/4, 6/8 with stable switching (Phase 5, §20–22).
 * Pure apart from the injected event bus. All thresholds from
 * `config.rhythm`.
 *
 * Pipeline position: NoteStarted (onsets) + tempo beat → MeterChanged →
 * UI/drums/conductor.
 *
 * Method: the first onset anchors the bar grid (documented assumption: the
 * singer starts on/near a downbeat). Every complete bar under each candidate
 * meter is scored 0–1 (eighth-grid alignment × strong-beat presence, with a
 * mandatory downbeat); the last complete bar of each meter votes, and the
 * meter switches only after `meterStabilityBars` consecutive agreeing votes.
 * Ties and weak bars abstain, so a single anomalous bar can never flip the
 * meter and rhythmically ambiguous streams (e.g. plain quarter notes, which
 * fit 4/4 and 3/4 alike) keep the current meter by hysteresis.
 *
 * BPM is always quarter-note BPM; a 6/8 bar spans 3 quarter-beats
 * (6 eighth-notes), so tempo and patterns stay on one clock.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { TimeSignature } from "@/domain/types";

export const METER_44: TimeSignature = { numerator: 4, denominator: 4 };
export const METER_34: TimeSignature = { numerator: 3, denominator: 4 };
export const METER_68: TimeSignature = { numerator: 6, denominator: 8 };

export const SUPPORTED_METERS: readonly TimeSignature[] = [METER_44, METER_34, METER_68];

export type MeterKey = "4/4" | "3/4" | "6/8";

export function meterKey(m: TimeSignature): MeterKey {
  return `${m.numerator}/${m.denominator}` as MeterKey;
}

export function meterLabel(m: TimeSignature): string {
  return meterKey(m);
}

export function isSupportedMeter(m: TimeSignature): boolean {
  return SUPPORTED_METERS.some((s) => s.numerator === m.numerator && s.denominator === m.denominator);
}

/** Quarter-note beats per bar (6/8 = 3 quarter-beats = 2 dotted beats). */
export function barQuarters(m: TimeSignature): number {
  if (m.numerator === 4 && m.denominator === 4) return 4;
  // 3/4 and 6/8 both span three quarter-notes.
  return 3;
}

/** Eighth-note steps per bar: the shared pattern grid. */
export function barEighths(m: TimeSignature): number {
  if (m.numerator === 4 && m.denominator === 4) return 8;
  return 6;
}

/**
 * Strong-beat positions in eighth-note units. 4/4 leans on quarters,
 * 3/4 on its three quarters, 6/8 on its two dotted-quarter beats —
 * this is what separates 3/4 ({0,2,4}) from 6/8 ({0,3}).
 */
export function strongEighths(m: TimeSignature): number[] {
  const key = meterKey(m);
  if (key === "6/8") return [0, 3];
  if (key === "3/4") return [0, 2, 4];
  return [0, 2, 4, 6];
}

function sameMeter(a: TimeSignature, b: TimeSignature): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

export interface MeterVote {
  meter: TimeSignature | null;
  /** Per-meter scores of the last complete bar (abstentions omitted). */
  scores: Partial<Record<MeterKey, number>>;
  /** Consecutive agreeing votes banked toward a switch. */
  streak: number;
}

/**
 * Score one bar's onsets (positions in eighth-note units from the bar start)
 * against a meter: 40% eighth-grid alignment + 60% strong-beat presence.
 * Returns 0 when the downbeat is missing — without a downbeat a bar says
 * nothing about meter.
 */
export function scoreBar(relEighths: number[], meter: TimeSignature, tolEighth: number): number {
  if (relEighths.length === 0) return 0;
  const hasDownbeat = relEighths.some((p) => Math.abs(p) <= tolEighth);
  if (!hasDownbeat) return 0;
  const aligned = relEighths.filter((p) => Math.abs(p - Math.round(p)) <= tolEighth).length;
  const alignment = aligned / relEighths.length;
  const strong = strongEighths(meter);
  const hit = strong.filter((s) => relEighths.some((p) => Math.abs(p - s) <= tolEighth)).length;
  return 0.4 * alignment + 0.6 * (hit / strong.length);
}

export class MeterTracker {
  private onsets: number[] = [];
  private anchor: number | null = null;
  private current: TimeSignature = { ...METER_44 };
  private streakMeter: TimeSignature | null = null;
  private streak = 0;
  private confidence = 0;
  private off: (() => void) | null = null;

  constructor(private readonly events: EventBus = bus) {
    this.off = events.on("NoteStarted", (n) => this.addOnset(n.startTime));
  }

  dispose(): void {
    this.off?.();
    this.off = null;
  }

  reset(): void {
    this.onsets = [];
    this.anchor = null;
    this.current = { ...METER_44 };
    this.streakMeter = null;
    this.streak = 0;
    this.confidence = 0;
  }

  meter(): TimeSignature {
    return { ...this.current };
  }

  meterConfidence(): number {
    return this.confidence;
  }

  /** Manual override (UI/conductor); emits MeterChanged unless unchanged. */
  setMeter(m: TimeSignature): void {
    if (!isSupportedMeter(m) || sameMeter(m, this.current)) return;
    this.current = { ...m };
    this.streakMeter = null;
    this.streak = 0;
    this.confidence = 1;
    this.events.emit("MeterChanged", this.meter());
  }

  /** Onset in transport seconds (NoteStarted.startTime). */
  addOnset(tSec: number): void {
    if (!Number.isFinite(tSec) || tSec < 0) return;
    const last = this.onsets[this.onsets.length - 1];
    if (last !== undefined && tSec <= last) return; // out-of-order guard
    if (this.anchor === null) this.anchor = tSec;
    this.onsets.push(tSec);
    if (this.onsets.length > 64) {
      this.onsets.splice(0, this.onsets.length - 64);
    }
  }

  /**
   * Evaluate the last complete bar of each meter against `beatSec`
   * (quarter-note seconds from the tempo engine) at `nowSec`. Returns the
   * vote; switches the meter (emitting MeterChanged) after
   * `meterStabilityBars` consecutive agreeing votes.
   */
  evaluate(beatSec: number, nowSec: number): MeterVote {
    const empty: MeterVote = { meter: null, scores: {}, streak: this.streak };
    if (this.anchor === null || !Number.isFinite(beatSec) || beatSec <= 0) return empty;
    const tolEighth = config.rhythm.meterGridTolBeat * 2; // beat fraction → eighth units

    const scored: { meter: TimeSignature; score: number }[] = [];
    for (const m of SUPPORTED_METERS) {
      const barLen = barQuarters(m) * beatSec;
      const barsElapsed = Math.floor((nowSec - this.anchor) / barLen);
      if (barsElapsed < 1) continue;
      const start = this.anchor + (barsElapsed - 1) * barLen;
      const end = start + barLen;
      const eighth = beatSec / 2;
      const rel = this.onsets
        .filter((t) => t >= start - tolEighth * eighth && t < end)
        .map((t) => (t - start) / eighth);
      if (rel.length < config.rhythm.meterMinOnsets) continue;
      const score = scoreBar(rel, m, tolEighth);
      if (score >= config.rhythm.meterMinScore) scored.push({ meter: m, score });
    }
    if (scored.length === 0) return { meter: null, scores: {}, streak: this.streak };

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored.length > 1 ? scored[1].score : 0;
    const scores = Object.fromEntries(scored.map((s) => [meterKey(s.meter), s.score])) as MeterVote["scores"];
    if (best.score - runnerUp < config.rhythm.meterVoteMargin) {
      return { meter: null, scores, streak: this.streak }; // tie → abstain, keep meter
    }
    if (sameMeter(best.meter, this.current)) {
      this.streakMeter = null;
      this.streak = 0;
      this.confidence = Math.min(1, this.confidence + 0.2);
      return { meter: best.meter, scores, streak: 0 };
    }
    if (this.streakMeter && sameMeter(this.streakMeter, best.meter)) {
      this.streak += 1;
    } else {
      this.streakMeter = { ...best.meter };
      this.streak = 1;
    }
    if (this.streak >= config.rhythm.meterStabilityBars) {
      this.current = { ...best.meter };
      this.streakMeter = null;
      this.streak = 0;
      this.confidence = 1;
      this.events.emit("MeterChanged", this.meter());
      return { meter: this.current, scores, streak: 0 };
    }
    this.confidence = Math.max(0.1, this.confidence);
    return { meter: best.meter, scores, streak: this.streak };
  }
}
