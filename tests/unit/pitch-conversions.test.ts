import { describe, expect, it } from "vitest";
import {
  centsOff,
  freqToMidi,
  freqToMidiFloat,
  freqToNoteName,
  midiToFreq,
  midiToNoteName,
} from "@/features/pitch/conversions";

describe("pitch conversions", () => {
  it("A4 = 440 Hz = MIDI 69", () => {
    expect(freqToMidi(440)).toBe(69);
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToNoteName(69)).toBe("A4");
  });

  it("C4 = MIDI 60", () => {
    expect(freqToMidi(261.63)).toBe(60);
    expect(midiToNoteName(60)).toBe("C4");
    expect(freqToNoteName(261.63)).toBe("C4");
  });

  it("round-trips across C2–C6", () => {
    for (let m = 36; m <= 84; m++) {
      expect(freqToMidi(midiToFreq(m))).toBe(m);
    }
  });

  it("reports unvoiced sentinels for non-positive freq", () => {
    expect(freqToMidiFloat(0)).toBe(-1);
    expect(freqToMidi(-3)).toBe(-1);
    expect(freqToNoteName(-1)).toBe("—");
  });

  it("cents deviation is signed and zero-centered", () => {
    expect(centsOff(440)).toBe(0);
    expect(centsOff(466.16)).toBeCloseTo(0, 0); // A#4 center
    const sharp = centsOff(440 * Math.pow(2, 25 / 1200)); // +25 cents
    expect(sharp).toBeGreaterThan(20);
    expect(sharp).toBeLessThan(30);
  });
});
