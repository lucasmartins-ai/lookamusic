import { describe, expect, it } from "vitest";
import {
  CompositionValidationError,
  createDefaultComposition,
  isComposition,
  migrateComposition,
  validateComposition,
} from "@/features/recording/schema";

describe("recording schema and validation", () => {
  it("validates a default composition cleanly", () => {
    const def = createDefaultComposition({ name: "Teste Válido" });
    expect(isComposition(def)).toBe(true);
    const validated = validateComposition(def);
    expect(validated.name).toBe("Teste Válido");
    expect(validated.tempo).toBe(90);
  });

  it("rejects non-object input with legible error", () => {
    expect(() => validateComposition(null)).toThrow(CompositionValidationError);
    expect(() => validateComposition("not an object")).toThrow("Composition must be a non-null object");
  });

  it("rejects invalid tempo (< 30 or > 240)", () => {
    const comp = createDefaultComposition({ tempo: 20 });
    expect(() => validateComposition(comp)).toThrow("Field 'tempo' must be a number between 30 and 240 BPM");

    const compHigh = createDefaultComposition({ tempo: 300 });
    expect(() => validateComposition(compHigh)).toThrow(CompositionValidationError);
  });

  it("rejects invalid time signature", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = createDefaultComposition({ timeSignature: { numerator: 5, denominator: 4 } as any });
    expect(() => validateComposition(comp)).toThrow("Field 'timeSignature'");
  });

  it("rejects invalid key root or mode", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = createDefaultComposition({ key: { root: 14, mode: "major", confidence: 1 } as any });
    expect(() => validateComposition(comp)).toThrow("Field 'key'");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compMode = createDefaultComposition({ key: { root: 0, mode: "dorian", confidence: 1 } as any });
    expect(() => validateComposition(compMode)).toThrow("Field 'key'");
  });

  it("rejects corrupt melody notes (e.g. negative duration, negative pitch, missing id)", () => {
    const comp = createDefaultComposition({
      melody: [
        {
          id: "",
          pitch: 440,
          midi: 69,
          startTime: 0,
          duration: 1,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });
    expect(() => validateComposition(comp)).toThrow("Field 'melody[0]' is not a valid NoteEvent");

    const compDuration = createDefaultComposition({
      melody: [
        {
          id: "n1",
          pitch: 440,
          midi: 69,
          startTime: 0,
          duration: -0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });
    expect(() => validateComposition(compDuration)).toThrow("Field 'melody[0]' is not a valid NoteEvent");
  });

  it("rejects corrupt chords (e.g. invalid quality or negative startBar)", () => {
    const comp = createDefaultComposition({
      chords: [
        {
          id: "ch1",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chord: { root: 0, quality: "unknown_quality" as any },
          startBar: 0,
          durationBars: 1,
          confidence: 0.8,
        },
      ],
    });
    expect(() => validateComposition(comp)).toThrow("Field 'chords[0]' is not a valid ChordEvent");
  });

  it("rejects missing instrument or out-of-range volume", () => {
    const comp = createDefaultComposition();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (comp.instruments as any).piano;
    expect(() => validateComposition(comp)).toThrow("Missing instrument channel configuration for 'piano'");

    const compVol = createDefaultComposition();
    compVol.instruments.drums.volume = 1.5;
    expect(() => validateComposition(compVol)).toThrow("Instrument 'drums' volume must be between 0 and 1");
  });
});

describe("migrateComposition (pre-9-instrument payloads)", () => {
  it("backfills the violao channel and arrangement flag, then validates", () => {
    const comp = createDefaultComposition() as unknown as Record<string, unknown>;
    const instruments = comp.instruments as Record<string, unknown>;
    delete instruments.violao;
    const arrangement = comp.arrangement as { active: Record<string, unknown> };
    delete arrangement.active.violao;
    expect(() => validateComposition(comp)).toThrow("violao");
    const migrated = migrateComposition(comp);
    const out = validateComposition(migrated);
    expect(out.instruments.violao).toEqual({ volume: 0.9, pan: 0, muted: false });
    expect(out.arrangement.active.violao).toBe(false);
  });

  it("leaves complete payloads untouched", () => {
    const comp = createDefaultComposition();
    const before = JSON.stringify(comp);
    migrateComposition(comp);
    expect(JSON.stringify(comp)).toBe(before);
    expect(isComposition(comp)).toBe(true);
  });
});
