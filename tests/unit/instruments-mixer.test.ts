/**
 * Mixer: mute/solo/volume/pan resolution (Phase 6, §23). Solo wins over
 * mute; inaudible channels resolve to zero gain. Run:
 * npm test -- instruments-mixer
 */
import { describe, expect, it } from "vitest";
import {
  anySolo,
  defaultMixer,
  effectiveVolume,
  isAudible,
  setChannelPan,
  setChannelVolume,
  toggleMute,
  toggleSolo,
} from "@/features/instruments/mixer";

describe("defaults", () => {
  it("every channel starts audible at 0.9, centered, unmuted, unsoloed", () => {
    const mixer = defaultMixer();
    for (const id of Object.keys(mixer) as (keyof typeof mixer)[]) {
      expect(isAudible(mixer, id)).toBe(true);
      expect(effectiveVolume(mixer, id)).toBeCloseTo(0.9, 9);
      expect(mixer[id].pan).toBe(0);
    }
    expect(anySolo(mixer)).toBe(false);
  });
});

describe("mute", () => {
  it("muted channel resolves to zero but keeps its level", () => {
    let mixer = defaultMixer();
    mixer = toggleMute(mixer, "piano");
    expect(isAudible(mixer, "piano")).toBe(false);
    expect(effectiveVolume(mixer, "piano")).toBe(0);
    expect(mixer.piano.volume).toBeCloseTo(0.9, 9);
    expect(isAudible(mixer, "bass")).toBe(true);
    mixer = toggleMute(mixer, "piano");
    expect(isAudible(mixer, "piano")).toBe(true);
  });
});

describe("solo", () => {
  it("one solo → only soloed channels audible; solo wins over mute", () => {
    let mixer = defaultMixer();
    mixer = toggleSolo(mixer, "violin");
    expect(anySolo(mixer)).toBe(true);
    expect(isAudible(mixer, "violin")).toBe(true);
    expect(isAudible(mixer, "piano")).toBe(false);
    expect(effectiveVolume(mixer, "piano")).toBe(0);
    // Solo wins over mute: a muted+soloed horn still sings.
    mixer = toggleMute(mixer, "violin");
    expect(isAudible(mixer, "violin")).toBe(true);
  });

  it("clearing every solo restores the full band", () => {
    let mixer = defaultMixer();
    mixer = toggleSolo(mixer, "sax");
    mixer = toggleSolo(mixer, "sax");
    expect(anySolo(mixer)).toBe(false);
    expect(isAudible(mixer, "drums")).toBe(true);
  });
});

describe("volume/pan limits", () => {
  it("setters clamp (volume 0–1, pan -1–1, NaN → 0)", () => {
    let mixer = defaultMixer();
    mixer = setChannelVolume(mixer, "bass", 2);
    expect(mixer.bass.volume).toBe(1);
    mixer = setChannelVolume(mixer, "bass", -1);
    expect(mixer.bass.volume).toBe(0);
    mixer = setChannelVolume(mixer, "bass", Number.NaN);
    expect(mixer.bass.volume).toBe(0);
    mixer = setChannelPan(mixer, "guitar", 3);
    expect(mixer.guitar.pan).toBe(1);
    mixer = setChannelPan(mixer, "guitar", -3);
    expect(mixer.guitar.pan).toBe(-1);
  });

  it("effective volume follows the fader for audible channels", () => {
    let mixer = defaultMixer();
    mixer = setChannelVolume(mixer, "accordion", 0.4);
    expect(effectiveVolume(mixer, "accordion")).toBeCloseTo(0.4, 9);
  });
});
