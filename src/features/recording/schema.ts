/**
 * Composition schema and validation (Phase 11, §41).
 * Pure TypeScript — zero dependencies on React or Web Audio.
 * Rejects invalid or corrupt compositions with legible error messages;
 * never allows silent corruption.
 */
import { config } from "@/lib/config";
import {
  INSTRUMENTS,
  type Chord,
  type ChordEvent,
  type ChordQuality,
  type Composition,
  type InstrumentId,
  type KeyEstimate,
  type NoteEvent,
  type TimeSignature,
} from "@/domain/types";

export class CompositionValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid Composition:\n  - ${issues.join("\n  - ")}`);
    this.name = "CompositionValidationError";
  }
}

const VALID_QUALITIES: ReadonlySet<ChordQuality> = new Set<ChordQuality>([
  "major",
  "minor",
  "diminished",
  "augmented",
  "dom7",
  "maj7",
  "min7",
  "sus2",
  "sus4",
]);

const VALID_TIME_SIGNATURES = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
];

export function isTimeSignature(v: unknown): v is TimeSignature {
  if (!v || typeof v !== "object") return false;
  const ts = v as Record<string, unknown>;
  return (
    (ts.numerator === 3 || ts.numerator === 4 || ts.numerator === 6) &&
    (ts.denominator === 4 || ts.denominator === 8)
  );
}

export function isKeyEstimate(v: unknown): v is KeyEstimate {
  if (!v || typeof v !== "object") return false;
  const k = v as Record<string, unknown>;
  return (
    typeof k.root === "number" &&
    k.root >= 0 &&
    k.root <= 11 &&
    Number.isInteger(k.root) &&
    (k.mode === "major" || k.mode === "minor") &&
    typeof k.confidence === "number" &&
    k.confidence >= 0 &&
    k.confidence <= 1
  );
}

export function isChord(v: unknown): v is Chord {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.root === "number" &&
    c.root >= 0 &&
    c.root <= 11 &&
    Number.isInteger(c.root) &&
    typeof c.quality === "string" &&
    VALID_QUALITIES.has(c.quality as ChordQuality)
  );
}

export function isNoteEvent(v: unknown): v is NoteEvent {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    n.id.length > 0 &&
    typeof n.pitch === "number" &&
    n.pitch > 0 &&
    typeof n.midi === "number" &&
    n.midi >= 0 &&
    n.midi <= 127 &&
    typeof n.startTime === "number" &&
    n.startTime >= 0 &&
    typeof n.duration === "number" &&
    n.duration > 0 &&
    typeof n.velocity === "number" &&
    n.velocity >= 0 &&
    n.velocity <= 1 &&
    typeof n.confidence === "number" &&
    n.confidence >= 0 &&
    n.confidence <= 1 &&
    (n.source === "voice" || n.source === "generated" || n.source === "edited")
  );
}

export function isChordEvent(v: unknown): v is ChordEvent {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    isChord(c.chord) &&
    typeof c.startBar === "number" &&
    c.startBar >= 0 &&
    Number.isInteger(c.startBar) &&
    typeof c.durationBars === "number" &&
    c.durationBars > 0 &&
    Number.isInteger(c.durationBars) &&
    typeof c.confidence === "number" &&
    c.confidence >= 0 &&
    c.confidence <= 1
  );
}

export function validateComposition(data: unknown): Composition {
  const issues: string[] = [];

  if (!data || typeof data !== "object") {
    throw new CompositionValidationError(["Composition must be a non-null object."]);
  }

  const c = data as Record<string, unknown>;

  if (typeof c.id !== "string" || c.id.trim().length === 0) {
    issues.push("Field 'id' must be a non-empty string.");
  }

  if (typeof c.name !== "string") {
    issues.push("Field 'name' must be a string.");
  }

  if (typeof c.createdAt !== "string" || isNaN(Date.parse(c.createdAt))) {
    issues.push("Field 'createdAt' must be a valid ISO date string.");
  }

  if (typeof c.updatedAt !== "string" || isNaN(Date.parse(c.updatedAt))) {
    issues.push("Field 'updatedAt' must be a valid ISO date string.");
  }

  if (
    typeof c.tempo !== "number" ||
    c.tempo < config.recording.minBpm ||
    c.tempo > config.recording.maxBpm
  ) {
    issues.push(
      `Field 'tempo' must be a number between ${config.recording.minBpm} and ${config.recording.maxBpm} BPM.`,
    );
  }

  if (!isTimeSignature(c.timeSignature)) {
    issues.push(
      "Field 'timeSignature' must have numerator 3|4|6 and denominator 4|8 (e.g. 4/4, 3/4, 6/8).",
    );
  }

  if (!isKeyEstimate(c.key)) {
    issues.push("Field 'key' must have integer root (0..11) and mode ('major' | 'minor').");
  }

  if (typeof c.scaleId !== "string" || c.scaleId.trim().length === 0) {
    issues.push("Field 'scaleId' must be a non-empty string.");
  }

  if (typeof c.styleId !== "string" || c.styleId.trim().length === 0) {
    issues.push("Field 'styleId' must be a non-empty string.");
  }

  if (!Array.isArray(c.melody)) {
    issues.push("Field 'melody' must be an array of NoteEvents.");
  } else {
    for (let i = 0; i < c.melody.length; i++) {
      if (!isNoteEvent(c.melody[i])) {
        issues.push(`Field 'melody[${i}]' is not a valid NoteEvent.`);
        break; // Don't overwhelm with hundreds of errors
      }
    }
  }

  if (!Array.isArray(c.chords)) {
    issues.push("Field 'chords' must be an array of ChordEvents.");
  } else {
    for (let i = 0; i < c.chords.length; i++) {
      if (!isChordEvent(c.chords[i])) {
        issues.push(`Field 'chords[${i}]' is not a valid ChordEvent.`);
        break;
      }
    }
  }

  if (!c.arrangement || typeof c.arrangement !== "object") {
    issues.push("Field 'arrangement' must be an object with active instruments and energy.");
  } else {
    const arr = c.arrangement as Record<string, unknown>;
    if (typeof arr.energy !== "number" || arr.energy < 0 || arr.energy > 1) {
      issues.push("Field 'arrangement.energy' must be a number between 0 and 1.");
    }
    if (!arr.active || typeof arr.active !== "object") {
      issues.push("Field 'arrangement.active' must be a map of instruments.");
    }
  }

  if (!c.instruments || typeof c.instruments !== "object") {
    issues.push("Field 'instruments' must be a map of instrument settings.");
  } else {
    const instMap = c.instruments as Record<string, unknown>;
    for (const inst of INSTRUMENTS) {
      const entry = instMap[inst] as Record<string, unknown> | undefined;
      if (!entry || typeof entry !== "object") {
        issues.push(`Missing instrument channel configuration for '${inst}'.`);
        break;
      }
      if (typeof entry.volume !== "number" || entry.volume < 0 || entry.volume > 1) {
        issues.push(`Instrument '${inst}' volume must be between 0 and 1.`);
        break;
      }
      if (typeof entry.pan !== "number" || entry.pan < -1 || entry.pan > 1) {
        issues.push(`Instrument '${inst}' pan must be between -1 and 1.`);
        break;
      }
      if (typeof entry.muted !== "boolean") {
        issues.push(`Instrument '${inst}' muted flag must be a boolean.`);
        break;
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(issues);
  }

  return data as Composition;
}

export function isComposition(data: unknown): data is Composition {
  try {
    validateComposition(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hotfix quarteto: preenche canais/flags do violão em composições salvas
 * antes do 9º instrumento (nunca altera o que já existe — composição
 * antiga continua soando igual, com o violão desligado). A validação
 * pura segue estrita; a migração acontece só na carga.
 */
export function migrateComposition(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const c = data as Record<string, unknown>;
  const instruments = c.instruments as Record<string, unknown> | undefined;
  if (instruments && typeof instruments === "object") {
    for (const inst of INSTRUMENTS) {
      if (instruments[inst] === undefined || typeof instruments[inst] !== "object") {
        instruments[inst] = { volume: 0.9, pan: 0, muted: false };
      }
    }
  }
  const arrangement = c.arrangement as
    | { active?: Record<string, unknown> }
    | undefined;
  if (arrangement && typeof arrangement === "object" && arrangement.active) {
    for (const inst of INSTRUMENTS) {
      if (arrangement.active[inst] === undefined) arrangement.active[inst] = false;
    }
  }
  return data;
}

export function createDefaultComposition(partial?: Partial<Composition>): Composition {
  const now = new Date().toISOString();
  const defaultInstruments = {} as Record<
    InstrumentId,
    { volume: number; pan: number; muted: boolean }
  >;
  for (const inst of INSTRUMENTS) {
    defaultInstruments[inst] = { volume: 0.9, pan: 0, muted: false };
  }

  const defaultActive = {} as Record<InstrumentId, boolean>;
  for (const inst of INSTRUMENTS) {
    defaultActive[inst] =
      inst === "drums" ||
      inst === "bass" ||
      inst === "piano" ||
      inst === "guitar" ||
      inst === "violao";
  }

  return {
    id: partial?.id ?? "comp-" + Math.random().toString(36).slice(2, 10),
    name: partial?.name ?? "Nova Composição",
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    tempo: partial?.tempo ?? config.rhythm.defaultBpm,
    timeSignature: partial?.timeSignature ?? { numerator: 4, denominator: 4 },
    key: partial?.key ?? { root: 0, mode: "major", confidence: 1 },
    scaleId: partial?.scaleId ?? "major",
    melody: partial?.melody ?? [],
    chords: partial?.chords ?? [],
    arrangement: partial?.arrangement ?? {
      active: defaultActive,
      energy: 0.5,
    },
    instruments: partial?.instruments ?? defaultInstruments,
    styleId: partial?.styleId ?? config.recording.defaultStyleId,
    metadata: partial?.metadata ?? {},
  };
}
