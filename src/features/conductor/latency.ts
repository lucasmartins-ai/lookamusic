/**
 * Voice → accompaniment latency tracker (Phase 8, §45). Pure.
 * Measures wall-clock delay from the first voiced observation to the first
 * scheduled accompaniment dispatch — a measurement, never a guess.
 *
 * Budget: perceived < `config.conductor.latencyBudgetMs` (250 ms), where
 * perceived = pipeline handle + scheduler horizon. The diagnostics panel
 * and `/session` read `perceivedMs()`; tests assert the budget.
 */
import { config } from "@/lib/config";

export interface LatencySample {
  voiceMs: number;
  accompanimentMs: number;
  /** accompanimentMs − voiceMs. */
  deltaMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export class LatencyTracker {
  private pendingVoiceMs: number | null = null;
  private readonly samples: LatencySample[] = [];
  private readonly cap = 128;

  reset(): void {
    this.pendingVoiceMs = null;
    this.samples.length = 0;
  }

  /** Mark voice arrival (first voiced observation of a gesture). */
  markVoice(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    if (this.pendingVoiceMs === null) this.pendingVoiceMs = nowMs;
  }

  /** Mark accompaniment dispatch; pairs with the oldest unpaired voice. */
  markAccompaniment(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    if (this.pendingVoiceMs === null) return;
    const delta = nowMs - this.pendingVoiceMs;
    this.pendingVoiceMs = null;
    if (delta < 0 || delta > 10_000) return;
    this.samples.push({ voiceMs: nowMs - delta, accompanimentMs: nowMs, deltaMs: delta });
    if (this.samples.length > this.cap) this.samples.splice(0, this.samples.length - this.cap);
  }

  deltas(): number[] {
    return this.samples.map((s) => s.deltaMs);
  }

  p50(): number {
    return percentile([...this.deltas()].sort((a, b) => a - b), 50);
  }

  p95(): number {
    return percentile([...this.deltas()].sort((a, b) => a - b), 95);
  }

  max(): number {
    const d = this.deltas();
    return d.length === 0 ? 0 : Math.max(...d);
  }

  count(): number {
    return this.samples.length;
  }

  /** Perceived latency = handle p95 + scheduler horizon (ms). */
  perceivedMs(handleP95Ms: number, horizonMs: number = config.audio.lookaheadMs): number {
    return handleP95Ms + horizonMs;
  }

  /** True when the measured path fits the 250 ms budget. */
  withinBudget(handleP95Ms: number, horizonMs: number = config.audio.lookaheadMs): boolean {
    return this.perceivedMs(handleP95Ms, horizonMs) <= config.conductor.latencyBudgetMs;
  }
}
