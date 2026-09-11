/** Degradation controller: graceful, never silence (Phase 8, §45). */
import { describe, expect, it } from "vitest";
import { DegradationController } from "@/features/conductor/degradation";

describe("DegradationController", () => {
  it("starts full with no badge", () => {
    const d = new DegradationController();
    const s = d.snapshot();
    expect(s.level).toBe("full");
    expect(s.badge).toBeNull();
  });

  it("escalates full → reduced on scheduler lateness", () => {
    const d = new DegradationController();
    const s = d.evaluate({ lateTotal: 8, tickAvgMs: 1 });
    expect(s.level).toBe("reduced");
    expect(s.badge).toMatch(/REDUZIDA/i);
    expect(s.observeEvery).toBe(2);
  });

  it("escalates reduced → minimal under heavy load, with never-silence badge", () => {
    const d = new DegradationController();
    d.evaluate({ lateTotal: 8, tickAvgMs: 1 });
    const s = d.evaluate({ lateTotal: 30, tickAvgMs: 30 });
    expect(s.level).toBe("minimal");
    expect(s.badge).toMatch(/nunca silêncio/i);
  });

  it("recovers with hysteresis (no flapping): needs clean signals", () => {
    const d = new DegradationController();
    d.evaluate({ lateTotal: 8, tickAvgMs: 1 });
    // Still some lateness → stays reduced.
    expect(d.evaluate({ lateTotal: 3, tickAvgMs: 8 }).level).toBe("reduced");
    // Fully clean → back to full.
    expect(d.evaluate({ lateTotal: 0, tickAvgMs: 1 }).level).toBe("full");
  });

  it("degradation order sheds observation rate first (budget §45)", () => {
    const d = new DegradationController();
    d.force("reduced");
    const s = d.snapshot();
    expect(s.observeEvery).toBeGreaterThan(1);
    expect(s.uiMeterHz).toBeLessThan(12);
    expect(s.theoryEveryBars).toBeGreaterThan(1);
  });
});
