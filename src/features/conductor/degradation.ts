/**
 * Graceful degradation controller (Phase 8, §45). Pure — no React.
 * Order per `performance-budget.md`: posted observation rate → UI meter
 * rate → theory re-estimate cadence. Never silence: even `minimal` keeps
 * drums + bass on the transport.
 */
import { config } from "@/lib/config";

export type DegradationLevel = "full" | "reduced" | "minimal";

export interface DegradationSnapshot {
  level: DegradationLevel;
  /** Badge text for the UI; null when full quality (no badge). */
  badge: string | null;
  /** Keep 1 of every N observations (1 = all). */
  observeEvery: number;
  /** UI meter refresh rate (Hz). */
  uiMeterHz: number;
  /** Re-estimate key/harmony every N bars (1 = every bar). */
  theoryEveryBars: number;
}

const FULL: DegradationSnapshot = {
  level: "full",
  badge: null,
  observeEvery: 1,
  uiMeterHz: 12,
  theoryEveryBars: 1,
};

export class DegradationController {
  private level: DegradationLevel = "full";

  reset(): void {
    this.level = "full";
  }

  snapshot(): DegradationSnapshot {
    if (this.level === "reduced") {
      return {
        level: "reduced",
        badge: "QUALIDADE REDUZIDA — acompanhamento simplificado",
        observeEvery: 2,
        uiMeterHz: 6,
        theoryEveryBars: 2,
      };
    }
    if (this.level === "minimal") {
      return {
        level: "minimal",
        badge: "MODO LEVE — bateria + baixo (nunca silêncio)",
        observeEvery: 3,
        uiMeterHz: 4,
        theoryEveryBars: 4,
      };
    }
    return { ...FULL };
  }

  /**
   * Evaluate load signals. Escalates on sustained scheduler lateness or
   * slow ticks; recovers only when both signals are clean (hysteresis —
   * no flapping at the threshold).
   */
  evaluate(input: { lateTotal: number; tickAvgMs: number }): DegradationSnapshot {
    const late = Number.isFinite(input.lateTotal) ? input.lateTotal : 0;
    const tick = Number.isFinite(input.tickAvgMs) ? input.tickAvgMs : 0;
    const lateThreshold = config.conductor.degradeLateThreshold;
    const tickThreshold = config.conductor.degradeTickMs;

    if (this.level === "full") {
      if (late >= lateThreshold || tick >= tickThreshold) this.level = "reduced";
    } else if (this.level === "reduced") {
      if (late >= lateThreshold * 3 || tick >= tickThreshold * 2) {
        this.level = "minimal";
      } else if (late === 0 && tick < tickThreshold / 2) {
        this.level = "full";
      }
    } else {
      if (late === 0 && tick < tickThreshold / 2) this.level = "reduced";
    }
    return this.snapshot();
  }

  /** Manual override (diagnostics / E2E). */
  force(level: DegradationLevel): DegradationSnapshot {
    this.level = level;
    return this.snapshot();
  }
}
