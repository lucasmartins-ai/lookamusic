/**
 * Continuous tempo estimator (Phase 2, §20–22; 3-stage chase since Phase 5).
 * Onsets → BPM with the estimated/target/playback split from day one; both
 * chases run through the slew limiter so playback never snaps (82→84 glides,
 * never 82→105→71).
 *
 * Pipeline position: NoteStarted (onsets) → TempoUpdated → UI/conductor.
 * Pure apart from the injected event bus. All bounds from `config.rhythm`.
 *
 * - estimated: median-IOI raw estimate, clamped to [minBpm, maxBpm]. The
 *   median over recent intervals rejects single-onset spikes; onsets closer
 *   together than the fastest musical beat (60/maxBpm) are flam/double-
 *   triggers, not beats, and are ignored. `injectEstimate` lets a future
 *   detector-fusion stage (or tests) feed an estimate directly.
 * - target: slew-limited chase of estimated (tempoSlewPerSec).
 * - playback: slew-limited chase of target — the second damper. Even a
 *   discontinuous target (reset, detector jump) reaches the speakers as a
 *   glide. The Phase 8 conductor reads this field for transport.
 * - confidence: onset-count ramp × IOI regularity (1 − CV), 0 without data.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { BPM, Confidence, TempoState } from "@/domain/types";
import { median } from "../melody/smoothing";

/** Recent intervals kept for the median (memory bound, not a threshold). */
const IOI_WINDOW = 8;
/** Onsets needed for full count-confidence (documented ramp, not a gate). */
const FULL_COUNT = 6;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class TempoEstimator {
  private onsets: number[] = [];
  private estimated: BPM = config.rhythm.defaultBpm;
  private target: BPM = config.rhythm.defaultBpm;
  private playback: BPM = config.rhythm.defaultBpm;
  private confidence: Confidence = 0;
  private lastTickMs: number | null = null;
  private lastEmitted: TempoState | null = null;
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
    this.estimated = config.rhythm.defaultBpm;
    this.target = config.rhythm.defaultBpm;
    this.playback = config.rhythm.defaultBpm;
    this.confidence = 0;
    this.lastTickMs = null;
    this.lastEmitted = null;
  }

  state(): TempoState {
    return {
      estimated: this.estimated,
      target: this.target,
      playback: this.playback,
      confidence: this.confidence,
    };
  }

  /** Seconds per playback beat — the conductor/drum clock. */
  beatSec(): number {
    return 60 / Math.max(this.playback, config.rhythm.minBpm);
  }

  /**
   * Feed one raw estimate straight into `estimated` (detector fusion hook;
   * tests use it to simulate violent 82→105→71→96 jumps). Clamped to the
   * musical range; the slew limiter still governs target/playback.
   */
  injectEstimate(bpm: BPM): void {
    if (!Number.isFinite(bpm)) return;
    this.estimated = clamp(bpm, config.rhythm.minBpm, config.rhythm.maxBpm);
  }

  /**
   * Onset density 0–1 over `densityWindowSec`: 0 with <2 onsets, 1 at
   * `densityFullRate` onsets/sec. Drives accompaniment intensity (Phase 5);
   * pure onset timing — never pitch, never raw amplitude.
   */
  onsetDensity(): number {
    const win = config.rhythm.densityWindowSec;
    const end = this.onsets[this.onsets.length - 1];
    if (end === undefined) return 0;
    const recent = this.onsets.filter((t) => end - t <= win);
    if (recent.length < 2) return 0;
    const span = Math.max(end - recent[0], 1e-6);
    return clamp((recent.length - 1) / span / config.rhythm.densityFullRate, 0, 1);
  }

  /** Recent onset times in transport seconds (oldest first, copy). */
  onsetTimes(): number[] {
    return [...this.onsets];
  }

  /** Onset in transport seconds (NoteStarted.startTime). Idempotent-ish. */
  addOnset(tSec: number): void {
    if (!Number.isFinite(tSec) || tSec < 0) return;
    const last = this.onsets[this.onsets.length - 1];
    const minIoi = 60 / config.rhythm.maxBpm;
    if (last !== undefined && tSec - last < minIoi) return; // flam/double-trigger
    if (last !== undefined && tSec <= last) return; // out-of-order guard
    this.onsets.push(tSec);
    if (this.onsets.length > IOI_WINDOW + 1) {
      this.onsets.splice(0, this.onsets.length - (IOI_WINDOW + 1));
    }
    this.reestimate();
  }

  /**
   * Advance both slew stages to `nowMs` (audio-clock ms). Emits TempoUpdated
   * only when target, playback, or confidence moved materially. Returns
   * current state.
   */
  tick(nowMs: number): TempoState {
    if (this.lastTickMs !== null && nowMs > this.lastTickMs) {
      const dt = (nowMs - this.lastTickMs) / 1000;
      const maxDelta = config.rhythm.tempoSlewPerSec * dt;
      this.target += clamp(this.estimated - this.target, -maxDelta, maxDelta);
      this.playback += clamp(this.target - this.playback, -maxDelta, maxDelta);
    }
    this.lastTickMs = nowMs;
    const s = this.state();
    const prev = this.lastEmitted;
    if (
      !prev ||
      Math.abs(s.target - prev.target) >= 0.05 ||
      Math.abs(s.playback - prev.playback) >= 0.05 ||
      Math.abs(s.confidence - prev.confidence) >= 0.05
    ) {
      this.lastEmitted = s;
      this.events.emit("TempoUpdated", s);
    }
    return s;
  }

  private reestimate(): void {
    const iois: number[] = [];
    for (let i = 1; i < this.onsets.length; i++) {
      iois.push(this.onsets[i] - this.onsets[i - 1]);
    }
    if (iois.length === 0) {
      this.estimated = config.rhythm.defaultBpm;
      this.confidence = 0;
      return;
    }
    const recent = iois.slice(-IOI_WINDOW);
    const med = median(recent);
    this.estimated = clamp(60 / med, config.rhythm.minBpm, config.rhythm.maxBpm);
    const meanIoi = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + (b - meanIoi) * (b - meanIoi), 0) / recent.length;
    const cv = meanIoi > 0 ? Math.sqrt(variance) / meanIoi : 1;
    const regularity = clamp(1 - cv, 0, 1);
    this.confidence = clamp(recent.length / FULL_COUNT, 0, 1) * regularity;
  }
}

export interface OfflineBeat {
  bpm: number;
  /** A beat time (s) — the grid is phase + k·60/bpm. */
  phase: number;
  /** Time (s) of the downbeat at/before the first onset. */
  firstDownbeat: number;
  /** 0–1 weighted fraction of onsets sitting on the grid. */
  fit: number;
}

/**
 * Hindsight beat tracking for a finished take (hum-first). Live tempo is a
 * slew-limited chase (8 BPM/s from 90) and on a real 16 s take still read 108
 * for a 118 BPM singer — the loop drifted > 1 s and the downbeat landed half
 * a beat early. Here every tempo in [minBpm, maxBpm] and every phase is tried;
 * the grid where weighted onsets fall closest to beats wins, under a
 * log-normal tempo prior around `config.rhythm.offlinePriorBpm` (keeps it off
 * the double/half octave). Downbeat: the beat class carrying the most onset
 * weight, defaulting to the first sung note's beat unless another class is
 * clearly heavier. Pure.
 */
export function trackBeatOffline(
  onsets: readonly { t: number; w: number }[],
  beatsPerBar: number,
): OfflineBeat | null {
  const r = config.rhythm;
  if (onsets.length < 3) return null;
  const sorted = [...onsets].sort((a, b) => a.t - b.t);
  const total = sorted.reduce((s, o) => s + o.w, 0);
  const sigma = r.offlineSigmaSec;
  let best: { bpm: number; phase: number; fit: number; score: number } | null = null;
  for (let bpm = r.offlineMinBpm; bpm <= r.offlineMaxBpm; bpm += r.offlineBpmStep) {
    const period = 60 / bpm;
    let bestPhase = 0;
    let bestFit = -1;
    for (let phase = 0; phase < period; phase += r.offlinePhaseStepSec) {
      let s = 0;
      for (const o of sorted) {
        const x = (o.t - phase) / period;
        const d = (x - Math.round(x)) * period;
        s += o.w * Math.exp(-(d * d) / (2 * sigma * sigma));
      }
      if (s > bestFit) {
        bestFit = s;
        bestPhase = phase;
      }
    }
    const fit = bestFit / total;
    const oct = Math.log2(bpm / r.offlinePriorBpm) / r.offlinePriorOctaves;
    const score = fit * Math.exp(-0.5 * oct * oct);
    if (!best || score > best.score) best = { bpm, phase: bestPhase, fit, score };
  }
  if (!best) return null;
  const period = 60 / best.bpm;
  const beatOf = (t: number) => Math.round((t - best!.phase) / period);
  const classW = new Array<number>(Math.max(1, beatsPerBar)).fill(0);
  for (const o of sorted) classW[((beatOf(o.t) % beatsPerBar) + beatsPerBar) % beatsPerBar] += o.w;
  const firstBeat = beatOf(sorted[0].t);
  let down = ((firstBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const heaviest = classW.indexOf(Math.max(...classW));
  if (classW[heaviest] > classW[down] * r.offlineDownbeatMargin) down = heaviest;
  // Downbeat at/before the first onset.
  let k = firstBeat;
  while ((((k - down) % beatsPerBar) + beatsPerBar) % beatsPerBar !== 0) k -= 1;
  return { bpm: best.bpm, phase: best.phase, firstDownbeat: best.phase + k * period, fit: best.fit };
}
