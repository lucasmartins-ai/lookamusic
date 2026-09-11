/**
 * Dynamics engine (Phase 7, §31). Raw mic RMS is room-dependent (gain,
 * distance, room) — musical decisions must NEVER read it directly, and it
 * must NEVER drive a volume gain. This tracker normalizes RMS → 0–1 via the
 * shared `EnergyNormalizer` (adaptive ceiling + EMA, same as the rhythm
 * path), classifies low/medium/high, and emits `EnergyChanged` (normalized
 * energy only) when the value moves materially (`energyEmitDelta`) or the
 * level flips. Arrangement (who plays) and planners (how hard) consume the
 * normalized level — raw amplitude never reaches a gain node through here.
 */
import { bus, type EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import { EnergyNormalizer, levelOf, type EnergyLevel } from "../rhythm/energy";

export type { EnergyLevel };

export interface DynamicsSnapshot {
  /** 0–1 normalized intensity (arrangement/preset input, never a gain). */
  energy01: number;
  level: EnergyLevel;
  /** Raw adaptive ceiling in RMS units (diagnostics only). */
  ceiling: number;
}

export class DynamicsTracker {
  private readonly normalizer = new EnergyNormalizer();
  private lastEmitted: number | null = null;
  private lastLevel: EnergyLevel | null = null;

  constructor(private readonly events: EventBus = bus) {}

  reset(): void {
    this.normalizer.reset();
    this.lastEmitted = null;
    this.lastLevel = null;
  }

  snapshot(): DynamicsSnapshot {
    const s = this.normalizer.snapshot();
    return { energy01: s.energy01, level: s.level, ceiling: s.ceiling };
  }

  /**
   * Push one raw RMS sample (0–~1, clamped; garbage → silence). Returns the
   * normalized snapshot and emits `EnergyChanged` only on material movement
   * (≥ `energyEmitDelta`) or a level flip — the bus never sees per-frame
   * jitter.
   */
  push(rawRms: number, nowMs: number): DynamicsSnapshot {
    const s = this.normalizer.push(rawRms, nowMs);
    const snap: DynamicsSnapshot = { energy01: s.energy01, level: s.level, ceiling: s.ceiling };
    const prev = this.lastEmitted;
    const moved = prev === null || Math.abs(snap.energy01 - prev) >= config.arrangement.energyEmitDelta;
    const flipped = this.lastLevel !== null && snap.level !== this.lastLevel;
    if (moved || flipped || prev === null) {
      this.lastEmitted = snap.energy01;
      this.lastLevel = snap.level;
      this.events.emit("EnergyChanged", { energy: snap.energy01 });
    }
    return snap;
  }

  /** Level boundaries shared with the rhythm path (1/3, 2/3). */
  static levelOf(energy01: number): EnergyLevel {
    return levelOf(energy01);
  }
}
