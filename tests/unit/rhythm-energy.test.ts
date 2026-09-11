/**
 * EnergyNormalizer: raw RMS → 0–1 musical intensity. Silence reads 0,
 * steps never snap, the ceiling adapts across rooms. Run:
 * npm test -- rhythm-energy
 */
import { describe, expect, it } from "vitest";
import { EnergyNormalizer, levelOf } from "@/features/music/rhythm/energy";
import { config } from "@/lib/config";

function drive(e: EnergyNormalizer, raw: number, fromMs: number, ms: number, stepMs = 83): number {
  let t = fromMs;
  let last = 0;
  while (t < fromMs + ms) {
    t += stepMs;
    last = e.push(raw, t).energy01;
  }
  return last;
}

describe("silence + bounds", () => {
  it("reads 0 at/below the noise floor", () => {
    const e = new EnergyNormalizer();
    expect(e.push(0, 0).energy01).toBe(0);
    expect(e.push(config.rhythm.energyNoiseFloor, 83).energy01).toBe(0);
    expect(e.snapshot().level).toBe("low");
  });

  it("clamps garbage: negative/NaN → 0, huge → ≤ 1", () => {
    const e = new EnergyNormalizer();
    expect(e.push(-0.5, 0).energy01).toBe(0);
    expect(e.push(NaN, 83).energy01).toBe(0);
    const v = drive(e, 50, 83, 5000);
    expect(v).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThan(0);
  });
});

describe("smoothing (no snaps)", () => {
  it("a single loud frame after silence barely moves the needle", () => {
    const e = new EnergyNormalizer();
    e.push(0, 0);
    const snap = e.push(0.3, 10); // 10 ms later: one frame
    expect(snap.energy01).toBeLessThan(0.3);
  });

  it("sustained input converges high; sustained silence converges back to 0", () => {
    const e = new EnergyNormalizer();
    const loud = drive(e, 0.3, 0, 4000);
    expect(loud).toBeGreaterThan(0.8);
    expect(e.snapshot().level).toBe("high");
    const quiet = drive(e, 0, 4000, 6000);
    expect(quiet).toBe(0);
  });
});

describe("adaptive ceiling (room-relative, not absolute)", () => {
  it("same raw reads lower after a loud passage than in a fresh quiet room", () => {
    const adapted = new EnergyNormalizer();
    drive(adapted, 0.5, 0, 4000); // loud room: ceiling adapts up
    const adaptedRead = drive(adapted, 0.2, 4000, 3000);

    const fresh = new EnergyNormalizer();
    const freshRead = drive(fresh, 0.2, 0, 3000);

    expect(adaptedRead).toBeLessThan(freshRead);
  });

  it("ceiling relaxes down over long quiet stretches (diagnostics visible)", () => {
    const e = new EnergyNormalizer();
    drive(e, 0.5, 0, 2000);
    const peak = e.snapshot().ceiling;
    expect(peak).toBeGreaterThan(config.rhythm.energyCeilInit);
    drive(e, 0.05, 2000, 30000);
    expect(e.snapshot().ceiling).toBeLessThan(peak);
  });
});

describe("levels", () => {
  it("low < 1/3 ≤ medium < 2/3 ≤ high", () => {
    expect(levelOf(0)).toBe("low");
    expect(levelOf(0.32)).toBe("low");
    expect(levelOf(0.34)).toBe("medium");
    expect(levelOf(0.65)).toBe("medium");
    expect(levelOf(0.67)).toBe("high");
    expect(levelOf(1)).toBe("high");
  });
});
