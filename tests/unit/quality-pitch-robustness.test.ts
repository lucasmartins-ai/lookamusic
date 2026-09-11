/**
 * Phase 14: Quality & Hardening — Pitch Robustness Across Registers & Environments
 * Tests:
 * 1. Grave register (C2–C3, 65–130 Hz): RMSE < 40 cents, 0 octave error.
 * 2. Agudo register (C5–C6, 523–1046 Hz): RMSE < 40 cents, 0 octave error.
 * 3. Vibrato tracking: follows vibrato within 80 cents of center without octave jumping.
 * 4. Noise immunity: low SNR and white/pink noise reject or report low confidence.
 * 5. Low volume: near rmsGate detection vs sub-gate silence.
 * 6. Speech-like rapid frequency modulation rejection.
 */
import { describe, expect, it } from "vitest";
import { AutocorrelationDetector } from "@/features/pitch/autocorrelation";
import { YinDetector } from "@/features/pitch/yin";
import { midiToFreq, freqToMidiFloat } from "@/features/pitch/conversions";
import type { PitchDetector } from "@/features/pitch/detector";
import { BLOCK, SR, noise, silence, sine, vibrato } from "../fixtures/synth";
import { NoteStabilizer } from "@/features/music/melody/stabilization";
import { EventBus } from "@/lib/events";
import { smObs } from "../fixtures/melody";

const detectors: PitchDetector[] = [new AutocorrelationDetector(), new YinDetector()];

function centsDiff(detectedMidi: number, targetMidi: number): number {
  return Math.abs(detectedMidi - targetMidi) * 100;
}

describe.each(detectors.map((d) => ({ detector: d })))("$detector.name — Extended Robustness", ({ detector }) => {
  it("tracks grave register (C2=36 to C3=48, 65–130 Hz) with RMSE < 40 cents and 0 octave errors", () => {
    let se = 0;
    let count = 0;
    let octaveErrors = 0;

    for (let m = 36; m <= 48; m++) {
      const f = midiToFreq(m);
      const obs = detector.process(sine(f, 0.6), SR);
      expect(obs.frequency, `Grave MIDI ${m} (${f.toFixed(1)} Hz)`).toBeGreaterThan(0);
      const err = (obs.midiNote - m) * 100;
      if (Math.abs(err) > 600) octaveErrors++;
      se += err * err;
      count++;
    }

    const rmse = Math.sqrt(se / count);
    expect(rmse).toBeLessThan(40);
    expect(octaveErrors).toBe(0);
  });

  it("tracks agudo register (C5=72 to C6=84, 523–1046 Hz) with RMSE < 40 cents and 0 octave errors", () => {
    let se = 0;
    let count = 0;
    let octaveErrors = 0;

    for (let m = 72; m <= 84; m++) {
      const f = midiToFreq(m);
      const obs = detector.process(sine(f, 0.6), SR);
      expect(obs.frequency, `Agudo MIDI ${m} (${f.toFixed(1)} Hz)`).toBeGreaterThan(0);
      const err = (obs.midiNote - m) * 100;
      if (Math.abs(err) > 600) octaveErrors++;
      se += err * err;
      count++;
    }

    const rmse = Math.sqrt(se / count);
    expect(rmse).toBeLessThan(40);
    expect(octaveErrors).toBe(0);
  });

  it("follows vibrato at 5.5 Hz around G4 (392 Hz) within 80 cents without octave jumps", () => {
    const obs = detector.process(vibrato(392.0), SR);
    expect(obs.frequency).toBeGreaterThan(0);
    expect(centsDiff(obs.midiNote, freqToMidiFloat(392.0))).toBeLessThan(80);
  });

  it("distinguishes low volume above gate (0.02 RMS) from sub-gate whisper (0.003 RMS)", () => {
    // Above gate: detected with valid pitch
    const audible = detector.process(sine(440, 0.02), SR);
    expect(audible.frequency).toBeGreaterThan(0);
    expect(audible.confidence).toBeGreaterThan(0.25);

    // Below gate: rejected as unvoiced (-1)
    const whisper = detector.process(sine(440, 0.003), SR);
    expect(whisper.frequency).toBe(-1);
    expect(whisper.confidence).toBe(0);
  });

  it("heavy noise (0.8 RMS) produces unvoiced or very low confidence", () => {
    const noisy = detector.process(noise(0.8), SR);
    expect(noisy.frequency === -1 || noisy.confidence < 0.5).toBe(true);
  });
});

describe("Phase 14 — Pipeline Speech & Rapid Modulation Rejection", () => {
  it("rapid speech-like erratic pitch hops do not emit stable note events", () => {
    const bus = new EventBus();
    const stab = new NoteStabilizer(bus);
    const notesStarted: unknown[] = [];
    bus.on("NoteStarted", (n) => notesStarted.push(n));

    // Simulate rapid erratic speech hops (every frame a different pitch, under 120 ms each)
    let t = 0;
    const pitches = [60, 64, 67, 71, 62, 65, 69, 58, 63, 68];
    for (let i = 0; i < 20; i++) {
      const pitch = pitches[i % pitches.length];
      // 2 frames per pitch = 40 ms (< stabilityMs 120 ms)
      stab.push(smObs(pitch, t));
      t += 20;
      stab.push(smObs(pitch, t));
      t += 20;
    }

    // Because no pitch was sustained for >= stabilityMs (120 ms), 0 NoteStarted emitted
    expect(notesStarted).toHaveLength(0);
  });
});
