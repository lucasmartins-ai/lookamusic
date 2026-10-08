/**
 * buildPlayAlongComposition — hum-first → música tocável em loop.
 * Run: npm test -- recording-playalong
 */
import { describe, expect, it } from "vitest";
import type { MusicalState } from "@/domain/types";
import { buildPlayAlongComposition } from "@/features/recording/playalong";
import { isComposition } from "@/features/recording/schema";

function baseState(): MusicalState {
  return {
    tempo: { estimated: 90, target: 90, playback: 90, confidence: 1 },
    timeSignature: { numerator: 4, denominator: 4 },
    key: { root: 0, mode: "major", confidence: 0.9 },
    scale: { id: "major", name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    melody: [],
    chords: [],
    rhythm: { tempo: { estimated: 90, target: 90, playback: 90, confidence: 1 }, meter: { numerator: 4, denominator: 4 }, density: 0.5, onsets: [] },
    arrangement: {
      active: { drums: true, bass: true, piano: true, guitar: false, violao: false, strings: false, violin: false, sax: false, accordion: false },
      energy: 0.5,
    },
    dynamics: { inputEnergy: 0.5, smoothedEnergy: 0.5, level: "medium" },
  };
}

describe("buildPlayAlongComposition", () => {
  it("retorna null sem melodia (nada para tocar)", () => {
    expect(buildPlayAlongComposition(baseState())).toBeNull();
  });

  it("rebaseia a cantarolada: 1 compasso de contagem antes da 1ª nota, ordena e valida schema", () => {
    const st = baseState();
    st.melody = [
      { id: "n2", pitch: 392, midi: 67, startTime: 101.0, duration: 0.4, velocity: 0.8, confidence: 0.9, source: "voice" },
      { id: "n1", pitch: 261.6, midi: 60, startTime: 100.0, duration: 0.5, velocity: 0.8, confidence: 0.9, source: "voice" },
      { id: "n3", pitch: 329.6, midi: 64, startTime: 102.0, duration: 0, velocity: 0.8, confidence: 0.9, source: "voice" },
    ];
    const comp = buildPlayAlongComposition(st, "Teste");
    expect(comp).not.toBeNull();
    expect(isComposition(comp)).toBe(true);
    expect(comp!.melody.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    // TDR-23: pulse from the take; the first sung note lands on beat 1 of
    // bar 2 (bar 1 = count-in).
    const barSec = (4 * 60) / comp!.tempo;
    expect(comp!.melody[0].startTime).toBeCloseTo(barSec, 1);
    expect(comp!.melody[2].duration).toBeCloseTo(0.25, 3); // aberta → mínima
    expect(comp!.chords.length).toBeGreaterThan(0); // fallback do tom
  });

  it("desloca acordes junto com a melodia (alinhamento preservado)", () => {
    const st = baseState();
    st.melody = [
      { id: "n1", pitch: 261.6, midi: 60, startTime: 40.0, duration: 0.5, velocity: 0.8, confidence: 0.9, source: "voice" },
    ];
    st.chords = [
      { id: "c1", chord: { root: 0, quality: "major" }, startBar: 20, durationBars: 1, confidence: 0.9 },
    ];
    const comp = buildPlayAlongComposition(st);
    expect(comp!.chords[0].startBar).toBeLessThan(20);
    expect(comp!.chords[0].startBar).toBeGreaterThanOrEqual(0);
    expect(isComposition(comp)).toBe(true);
  });

  it("harmoniza pela melodia cantada no próprio compasso (C–E–G–C → C, G–B–D–G → G)", () => {
    const st = baseState();
    // Steady quarter notes at 120 BPM (0.5 s): one bar of each arpeggio.
    const n = (id: string, midi: number, t: number) => ({
      id, pitch: 440 * 2 ** ((midi - 69) / 12), midi, startTime: t, duration: 0.45, velocity: 0.8, confidence: 0.9, source: "voice" as const,
    });
    const line = [60, 64, 67, 60, 67, 71, 74, 67];
    st.melody = line.map((m, k) => n(`n${k}`, m, 10 + k * 0.5));
    const comp = buildPlayAlongComposition(st)!;
    expect(comp.tempo).toBeGreaterThan(115);
    expect(comp.tempo).toBeLessThan(125);
    const at = (bar: number) => comp.chords.find((c) => bar >= c.startBar && bar < c.startBar + c.durationBars)!.chord;
    expect(at(1)).toMatchObject({ root: 0, quality: "major" });
    expect(at(2).root).toBe(7);
    expect(at(0)).toMatchObject(at(1)); // count-in takes the first sung bar's chord
  });
});
