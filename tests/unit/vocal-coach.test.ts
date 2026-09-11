import { describe, expect, it } from "vitest";
import { VocalPitchCoach } from "@/features/pitch/coach";
import type { KeyEstimate, PitchObservation } from "@/domain/types";
import { midiToFreq } from "@/features/pitch/conversions";

describe("VocalPitchCoach", () => {
  it("classifies silent observation when unvoiced", () => {
    const coach = new VocalPitchCoach();
    const obs: PitchObservation = {
      frequency: -1,
      midiNote: -1,
      confidence: 0,
      clarity: 0,
      timestamp: 1000,
    };
    const res = coach.evaluate(obs);
    expect(res.state).toBe("silent");
    expect(res.inTune).toBe(false);
    expect(res.targetNote).toBe("—");
    expect(res.message).toContain("Emita um som vocal");
  });

  it("classifies unclear observation when confidence is below threshold", () => {
    const coach = new VocalPitchCoach();
    const obs: PitchObservation = {
      frequency: 440,
      midiNote: 69,
      confidence: 0.2, // below minConfidence 0.35
      clarity: 0.2,
      timestamp: 1000,
    };
    const res = coach.evaluate(obs);
    expect(res.state).toBe("unclear");
    expect(res.inTune).toBe(false);
    expect(res.message).toContain("Voz oscilando");
  });

  it("identifies perfectly in-tune note A4 (440 Hz)", () => {
    const coach = new VocalPitchCoach();
    const obs: PitchObservation = {
      frequency: 440,
      midiNote: 69,
      confidence: 0.95,
      clarity: 0.95,
      timestamp: 1000,
    };
    const res = coach.evaluate(obs);
    expect(res.state).toBe("in-tune");
    expect(res.inTune).toBe(true);
    expect(res.targetNote).toBe("A4");
    expect(res.cents).toBe(0);
    expect(res.accuracyScore).toBe(100);
    expect(res.message).toContain("Afinação perfeita");
  });

  it("identifies flat note (bemol) when singing below target pitch", () => {
    const coach = new VocalPitchCoach();
    // A4 = 440Hz, A4 - 30 cents ≈ 432.42 Hz
    const freqFlat = 440 * Math.pow(2, -30 / 1200);
    const obs: PitchObservation = {
      frequency: freqFlat,
      midiNote: 68.7,
      confidence: 0.9,
      clarity: 0.9,
      timestamp: 1000,
    };
    const res = coach.evaluate(obs);
    expect(res.state).toBe("flat");
    expect(res.inTune).toBe(false);
    expect(res.targetNote).toBe("A4");
    expect(res.cents).toBeLessThan(-12);
    expect(res.message).toContain("Suba a voz");
  });

  it("identifies sharp note (sustenido) when singing above target pitch", () => {
    const coach = new VocalPitchCoach();
    // A4 = 440Hz, A4 + 35 cents ≈ 448.97 Hz
    const freqSharp = 440 * Math.pow(2, 35 / 1200);
    const obs: PitchObservation = {
      frequency: freqSharp,
      midiNote: 69.35,
      confidence: 0.9,
      clarity: 0.9,
      timestamp: 1000,
    };
    const res = coach.evaluate(obs);
    expect(res.state).toBe("sharp");
    expect(res.inTune).toBe(false);
    expect(res.targetNote).toBe("A4");
    expect(res.cents).toBeGreaterThan(12);
    expect(res.message).toContain("Desça a voz");
  });

  it("detects out-of-key note when pitch is in-tune with an out-of-scale chromatic note", () => {
    const coach = new VocalPitchCoach();
    const cMajorKey: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 }; // C Major
    // F#4 (MIDI 66) is NOT in C Major scale (C, D, E, F, G, A, B)
    const fs4Freq = midiToFreq(66);
    const obs: PitchObservation = {
      frequency: fs4Freq,
      midiNote: 66,
      confidence: 0.95,
      clarity: 0.95,
      timestamp: 1000,
    };
    const res = coach.evaluate(obs, cMajorKey);
    expect(res.state).toBe("out-of-key");
    expect(res.targetNote).toBe("F#4");
    expect(res.message).toContain("fora do tom C Maior");
  });

  it("accumulates singing accuracy score and sustains streak across frames", () => {
    const coach = new VocalPitchCoach();
    // 3 in-tune observations
    for (let i = 0; i < 3; i++) {
      coach.evaluate({
        frequency: 440,
        midiNote: 69,
        confidence: 0.9,
        clarity: 0.9,
        timestamp: 1000 + i * 50,
      });
    }
    // 1 flat observation
    const res4 = coach.evaluate({
      frequency: 432,
      midiNote: 68.7,
      confidence: 0.9,
      clarity: 0.9,
      timestamp: 1150,
    });
    // 3 out of 4 in-tune = 75%
    expect(res4.accuracyScore).toBe(75);
    expect(res4.streakMs).toBe(0);

    // reset stats
    coach.resetStats();
    const res5 = coach.evaluate({
      frequency: -1,
      midiNote: -1,
      confidence: 0,
      clarity: 0,
      timestamp: 1200,
    });
    expect(res5.accuracyScore).toBe(100);
  });
});
