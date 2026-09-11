/**
 * Musical transport (Phase 8, §32). Pure — no React, no Web Audio.
 * Owns the single bar/beat clock every engine reads: origin + playback
 * tempo + meter. Audio-clock driven (AudioContext.currentTime in the
 * browser, injected seconds in tests); wall-clock only as fallback.
 *
 * Transport seconds = audio-clock seconds. NoteEvents already stamp
 * `startTime` in these units (stabilizer: ms/1000), so the conductor maps
 * them directly onto bars — no second clock, no drift source.
 */
import { config } from "@/lib/config";
import { barQuarters } from "@/features/music/rhythm/meter";
import type { TimeSignature } from "@/domain/types";

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

export class MusicalTransport {
  private originSec: number;
  private bpm: number;
  private meter: TimeSignature;

  constructor(originSec = 0, bpm: number = config.rhythm.defaultBpm, meter: TimeSignature = { numerator: 4, denominator: 4 }) {
    this.originSec = finiteOr(originSec, 0);
    this.bpm = bpm > 0 && Number.isFinite(bpm) ? bpm : config.rhythm.defaultBpm;
    this.meter = { ...meter };
  }

  reset(originSec: number): void {
    this.originSec = finiteOr(originSec, 0);
  }

  setTempo(bpm: number): void {
    if (Number.isFinite(bpm) && bpm > 0) this.bpm = bpm;
  }

  setMeter(meter: TimeSignature): void {
    this.meter = { ...meter };
  }

  get origin(): number {
    return this.originSec;
  }

  /** Seconds per playback beat (quarter-note clock). */
  beatSec(): number {
    return 60 / Math.max(this.bpm, config.rhythm.minBpm);
  }

  barSec(): number {
    return barQuarters(this.meter) * this.beatSec();
  }

  /** Bar position (float) of `nowSec` on the grid anchored at origin. */
  barFloatAt(nowSec: number): number {
    if (!Number.isFinite(nowSec)) return 0;
    const bar = this.barSec();
    if (!(bar > 0)) return 0;
    return Math.max(0, (nowSec - this.originSec) / bar);
  }

  /** Beat position (float, quarter units) of `nowSec` since origin. */
  beatFloatAt(nowSec: number): number {
    if (!Number.isFinite(nowSec)) return 0;
    const beat = this.beatSec();
    if (!(beat > 0)) return 0;
    return Math.max(0, (nowSec - this.originSec) / beat);
  }

  /** Transport time of bar `bar` downbeat. */
  barStartSec(bar: number): number {
    const b = Number.isFinite(bar) && bar >= 0 ? Math.floor(bar) : 0;
    return this.originSec + b * this.barSec();
  }

  /** Next boundary at/after `barFloat`, quantized to `transitionBars`. */
  nextBoundary(barFloat: number, transitionBars: number = config.arrangement.transitionBars): number {
    const bars = Number.isFinite(transitionBars) && transitionBars >= 1 ? Math.floor(transitionBars) : 1;
    const at = Number.isFinite(barFloat) && barFloat > 0 ? barFloat : 0;
    const EPS = 1e-9;
    const nearest = Math.round(at);
    const base = Math.abs(at - nearest) <= EPS ? nearest : Math.floor(at) + 1;
    const boundary = Math.ceil(base / bars - EPS) * bars;
    return boundary === 0 ? 0 : boundary;
  }
}
