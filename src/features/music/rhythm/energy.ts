/**
 * Normalized input energy (Phase 5, §22). Raw mic RMS depends on mic gain,
 * distance, and room — musical decisions must never read it directly.
 * This follower maps raw RMS → 0–1 with an adaptive ceiling plus EMA
 * smoothing, so a quiet room and a loud stage both produce a usable
 * soft→loud range. Pure — no React, no Web Audio. Bounds from
 * `config.rhythm`.
 *
 * Feed: `MicSession` diagnostics `inputRms` at the UI-meter rate (~12 Hz)
 * via `pushEnergy` in the pipeline. Feed rate only affects smoothness,
 * never correctness.
 */
import { config } from "@/lib/config";

export type EnergyLevel = "low" | "medium" | "high";

export interface EnergySnapshot {
  /** 0–1 normalized intensity. */
  energy01: number;
  level: EnergyLevel;
  /** Current adaptive ceiling (raw RMS units, for diagnostics). */
  ceiling: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function levelOf(energy01: number): EnergyLevel {
  if (energy01 < 1 / 3) return "low";
  if (energy01 < 2 / 3) return "medium";
  return "high";
}

export class EnergyNormalizer {
  private smooth = 0;
  private ceiling: number = config.rhythm.energyCeilInit;
  private lastMs: number | null = null;

  reset(): void {
    this.smooth = 0;
    this.ceiling = config.rhythm.energyCeilInit;
    this.lastMs = null;
  }

  snapshot(): EnergySnapshot {
    return { energy01: this.to01(this.smooth), level: levelOf(this.to01(this.smooth)), ceiling: this.ceiling };
  }

  /**
   * Push one raw RMS sample (0–~1, clamped). Returns the normalized snapshot.
   * Silence at/below `energyNoiseFloor` reads 0; the ceiling chases loud
   * peaks up fast and relaxes down slowly, so the 0–1 range keeps meaning
   * across rooms without ever exposing raw amplitude downstream.
   */
  push(rawRms: number, nowMs: number): EnergySnapshot {
    const raw = Number.isFinite(rawRms) ? Math.max(0, rawRms) : 0;
    const dt = this.lastMs === null ? 0 : Math.min(Math.max((nowMs - this.lastMs) / 1000, 0), 1);
    this.lastMs = nowMs;

    if (dt <= 0) {
      this.smooth = raw;
    } else {
      const alpha = 1 - Math.exp(-dt / (config.rhythm.energySmoothMs / 1000));
      this.smooth += (raw - this.smooth) * alpha;
    }

    const target = Math.max(this.smooth, config.rhythm.energyCeilInit);
    const rate =
      target > this.ceiling
        ? config.rhythm.energyCeilAttackPerSec
        : config.rhythm.energyCeilReleasePerSec;
    if (dt <= 0) {
      this.ceiling = Math.max(this.ceiling, target);
    } else {
      this.ceiling += (target - this.ceiling) * Math.min(1, rate * dt);
    }

    const energy01 = this.to01(this.smooth);
    return { energy01, level: levelOf(energy01), ceiling: this.ceiling };
  }

  private to01(smooth: number): number {
    if (smooth <= config.rhythm.energyNoiseFloor) return 0;
    const span = Math.max(this.ceiling - config.rhythm.energyNoiseFloor, 1e-6);
    return clamp01((smooth - config.rhythm.energyNoiseFloor) / span);
  }
}
