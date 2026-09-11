/**
 * Pitch detector accuracy + benchmark (§8, §49, TDR-03).
 * Corpus generated in-code. Prints the comparison table; asserts minimum bars.
 * Run: npm test -- pitch-detectors
 */
import { describe, expect, it } from "vitest";
import { AutocorrelationDetector } from "@/features/pitch/autocorrelation";
import { midiToFreq, freqToMidiFloat } from "@/features/pitch/conversions";
import type { PitchDetector } from "@/features/pitch/detector";
import { YinDetector } from "@/features/pitch/yin";
import { BLOCK, SR, noise, silence, sine, slide, vibrato } from "../fixtures/synth";

const detectors: PitchDetector[] = [new AutocorrelationDetector(), new YinDetector()];

function centsErr(detectedMidi: number, expectedMidi: number): number {
  return Math.abs(detectedMidi - expectedMidi) * 100;
}

describe.each(detectors.map((d) => ({ detector: d })))("$detector.name", ({ detector }) => {
  it("tracks pure chromatic tones C4–C5 within 60 cents", () => {
    for (let m = 60; m <= 72; m++) {
      const obs = detector.process(sine(midiToFreq(m)), SR);
      expect(obs.frequency, `MIDI ${m}`).toBeGreaterThan(0);
      expect(centsErr(obs.midiNote, m), `MIDI ${m}`).toBeLessThan(60);
    }
  });

  it("reports silence as unvoiced", () => {
    const obs = detector.process(silence(), SR);
    expect(obs.frequency).toBe(-1);
    expect(obs.confidence).toBe(0);
  });

  it("reports white noise as unvoiced or low-confidence", () => {
    const obs = detector.process(noise(0.5), SR);
    expect(obs.frequency === -1 || obs.confidence < 0.6).toBe(true);
  });

  it("rejects sub-RMS-gate whispers as unvoiced", () => {
    const obs = detector.process(sine(440, 0.001), SR);
    expect(obs.frequency).toBe(-1);
  });

  it("follows vibrato within 80 cents of center", () => {
    const obs = detector.process(vibrato(392.0), SR); // G4 with vibrato
    expect(obs.frequency).toBeGreaterThan(0);
    expect(centsErr(obs.midiNote, freqToMidiFloat(392.0))).toBeLessThan(80);
  });

  it("tracks a slide endpoint within an octave", () => {
    const obs = detector.process(slide(329.63, 392.0), SR); // E4→G4
    expect(obs.frequency).toBeGreaterThan(0);
    // Slide midpoint ≈ F4/F#4; accept anything in E4–A4 band (no octave jump).
    expect(obs.midiNote).toBeGreaterThan(63);
    expect(obs.midiNote).toBeLessThan(71);
  });
});

describe("benchmark", () => {
  it("prints latency/accuracy table and enforces minimum bars", () => {
    const rows: Record<string, string | number>[] = [];
    for (const d of detectors) {
      // Warmup.
      for (let i = 0; i < 5; i++) d.process(sine(440), SR);
      // Accuracy: RMSE cents over C4–C5.
      let se = 0;
      let n = 0;
      let octaveErrors = 0;
      const t0 = performance.now();
      const REPS = 20;
      for (let r = 0; r < REPS; r++) {
        for (let m = 60; m <= 72; m++) {
          const obs = d.process(sine(midiToFreq(m), 0.5, r), SR);
          if (obs.frequency > 0) {
            const err = (obs.midiNote - m) * 100;
            se += err * err;
            n++;
            if (Math.abs(err) > 600) octaveErrors++;
          }
        }
      }
      const ms = (performance.now() - t0) / (REPS * 13);
      const rmse = Math.sqrt(se / Math.max(1, n));
      rows.push({
        detector: d.name,
        "ms/block": Number(ms.toFixed(3)),
        "RMSE cents": Number(rmse.toFixed(1)),
        "octave err %": Number(((100 * octaveErrors) / Math.max(1, n)).toFixed(1)),
      });
      // Minimum bars (§8): usable accuracy within the latency budget.
      expect(rmse, `${d.name} RMSE`).toBeLessThan(60);
      expect(ms, `${d.name} latency`).toBeLessThan(10);
    }
    console.table(rows);
  });
});
