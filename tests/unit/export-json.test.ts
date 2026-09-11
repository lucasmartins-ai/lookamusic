import { describe, it, expect } from "vitest";
import {
  exportToJson,
  importFromJson,
  CURRENT_EXPORT_SCHEMA_VERSION,
  ExportSchemaError,
} from "@/features/export/json";
import { createDefaultComposition, CompositionValidationError } from "@/features/recording/schema";
import type { Composition, NoteEvent, ChordEvent } from "@/domain/types";

function fixtureComposition(): Composition {
  const comp = createDefaultComposition({
    name: "Música de Teste Exportação",
    tempo: 108,
    timeSignature: { numerator: 3, denominator: 4 },
    key: { root: 7, mode: "major", confidence: 0.95 },
    scaleId: "major",
  });

  const notes: NoteEvent[] = [
    {
      id: "n1",
      pitch: 392.0,
      midi: 67, // G4
      startTime: 0.0,
      duration: 0.5,
      velocity: 0.8,
      confidence: 0.95,
      source: "voice",
    },
    {
      id: "n2",
      pitch: 440.0,
      midi: 69, // A4
      startTime: 0.555,
      duration: 0.45,
      velocity: 0.85,
      confidence: 0.92,
      source: "voice",
    },
    {
      id: "n3",
      pitch: 493.88,
      midi: 71, // B4
      startTime: 1.1,
      duration: 0.8,
      velocity: 0.75,
      confidence: 0.89,
      source: "voice",
    },
  ];

  const chords: ChordEvent[] = [
    {
      id: "c1",
      chord: { root: 7, quality: "major" }, // G
      startBar: 0,
      durationBars: 1,
      confidence: 0.9,
    },
    {
      id: "c2",
      chord: { root: 2, quality: "major" }, // D
      startBar: 1,
      durationBars: 1,
      confidence: 0.85,
    },
  ];

  comp.melody = notes;
  comp.chords = chords;
  return comp;
}

describe("JSON Export & Import (Phase 12, §40)", () => {
  it("exports composition into a versioned envelope (schemaVersion 1)", () => {
    const comp = fixtureComposition();
    const jsonStr = exportToJson(comp);

    expect(typeof jsonStr).toBe("string");
    const parsed = JSON.parse(jsonStr);

    expect(parsed.schemaVersion).toBe(CURRENT_EXPORT_SCHEMA_VERSION);
    expect(parsed.generator).toBe("LookaMusic");
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.composition.id).toBe(comp.id);
    expect(parsed.composition.name).toBe(comp.name);
    expect(parsed.composition.tempo).toBe(108);
  });

  it("performs lossless round-trip export → import", () => {
    const comp = fixtureComposition();
    const jsonStr = exportToJson(comp);
    const restored = importFromJson(jsonStr);

    expect(restored.id).toBe(comp.id);
    expect(restored.name).toBe(comp.name);
    expect(restored.tempo).toBe(comp.tempo);
    expect(restored.timeSignature).toEqual(comp.timeSignature);
    expect(restored.key).toEqual(comp.key);
    expect(restored.melody).toEqual(comp.melody);
    expect(restored.chords).toEqual(comp.chords);
    expect(restored.instruments).toEqual(comp.instruments);
    expect(restored.arrangement).toEqual(comp.arrangement);
  });

  it("successfully migrates legacy unversioned raw Composition objects", () => {
    const comp = fixtureComposition();
    // Raw composition without envelope
    const rawJson = JSON.stringify(comp);
    const restored = importFromJson(rawJson);

    expect(restored.id).toBe(comp.id);
    expect(restored.name).toBe(comp.name);
    expect(restored.melody.length).toBe(comp.melody.length);
  });

  it("rejects future schema versions with a clear, actionable error message", () => {
    const envelope = {
      schemaVersion: 99,
      generator: "LookaMusic Future",
      exportedAt: new Date().toISOString(),
      composition: fixtureComposition(),
    };

    expect(() => importFromJson(JSON.stringify(envelope))).toThrowError(
      /Versão de schema de exportação não suportada: v99.*Atualize o LookaMusic/,
    );
  });

  it("rejects non-integer or negative schema versions", () => {
    const envNegative = {
      schemaVersion: -1,
      composition: fixtureComposition(),
    };
    expect(() => importFromJson(JSON.stringify(envNegative))).toThrowError(
      /Versão de schema de exportação inválida/,
    );

    const envFloat = {
      schemaVersion: 1.5,
      composition: fixtureComposition(),
    };
    expect(() => importFromJson(JSON.stringify(envFloat))).toThrowError(
      /O campo 'schemaVersion' deve ser um número inteiro válido/,
    );
  });

  it("rejects invalid JSON syntax", () => {
    expect(() => importFromJson("not a json string")).toThrowError(ExportSchemaError);
    expect(() => importFromJson("{ schemaVersion: 1, ")).toThrowError(ExportSchemaError);
  });

  it("rejects invalid composition data inside the envelope with validation issues", () => {
    const invalidComp = {
      ...fixtureComposition(),
      tempo: -500, // Invalid tempo
      melody: "corrupt melody",
    };

    const envelope = {
      schemaVersion: 1,
      generator: "LookaMusic",
      exportedAt: new Date().toISOString(),
      composition: invalidComp,
    };

    expect(() => importFromJson(JSON.stringify(envelope))).toThrowError(
      CompositionValidationError,
    );
  });
});
