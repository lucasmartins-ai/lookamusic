/**
 * JSON Export & Import with Versioned Schema (Phase 12, §40).
 * Pure TypeScript — zero dependencies on React or Web Audio.
 * Ensures forward/backward compatibility, schema migration, and legible error reporting.
 */
import type { Composition } from "@/domain/types";
import { validateComposition, CompositionValidationError } from "@/features/recording/schema";

export const CURRENT_EXPORT_SCHEMA_VERSION = 1;

export interface ExportedCompositionV1 {
  schemaVersion: 1;
  generator: string;
  exportedAt: string;
  composition: Composition;
}

export type ExportEnvelope = ExportedCompositionV1;

export class ExportSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportSchemaError";
  }
}

/**
 * Serializes a Composition into a canonical, versioned JSON export string.
 * Validates the composition before serialization to guarantee data integrity.
 */
export function exportToJson(comp: Composition): string {
  const validated = validateComposition(comp);
  const envelope: ExportedCompositionV1 = {
    schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    generator: "LookaMusic",
    exportedAt: new Date().toISOString(),
    composition: validated,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Deserializes and validates a JSON string into a Composition.
 * Handles version envelopes, migrates legacy unversioned payloads,
 * and rejects future or corrupt schemas with clear error messages.
 */
export function importFromJson(jsonStr: string): Composition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new ExportSchemaError(
      `JSON inválido ou corrompido: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ExportSchemaError("O arquivo JSON de importação deve conter um objeto válido.");
  }

  const record = parsed as Record<string, unknown>;

  // Case 1: Versioned envelope
  if ("schemaVersion" in record) {
    const version = record.schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version)) {
      throw new ExportSchemaError("O campo 'schemaVersion' deve ser um número inteiro válido.");
    }

    if (version > CURRENT_EXPORT_SCHEMA_VERSION) {
      throw new ExportSchemaError(
        `Versão de schema de exportação não suportada: v${version}. A versão mais recente suportada é v${CURRENT_EXPORT_SCHEMA_VERSION}. Atualize o LookaMusic para abrir este arquivo.`,
      );
    }

    if (version < 1) {
      throw new ExportSchemaError(`Versão de schema de exportação inválida: v${version}.`);
    }

    if (!record.composition || typeof record.composition !== "object") {
      throw new ExportSchemaError("O envelope de exportação não contém o objeto 'composition'.");
    }

    // Version 1 validation
    try {
      return validateComposition(record.composition);
    } catch (err) {
      if (err instanceof CompositionValidationError) {
        throw err;
      }
      throw new ExportSchemaError(
        `Erro ao validar composição v1: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Case 2: Legacy unversioned raw Composition (e.g. direct export of Composition object)
  // Attempt to validate directly as a legacy composition
  try {
    return validateComposition(record);
  } catch (err) {
    if (err instanceof CompositionValidationError) {
      throw new ExportSchemaError(
        `Formato de composição não reconhecido ou inválido:\n${err.issues.join("\n")}`,
      );
    }
    throw new ExportSchemaError(
      `Erro ao importar composição: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
