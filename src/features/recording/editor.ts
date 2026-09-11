/**
 * Timeline and Composition Editor (Phase 11, §41).
 * Pure functions manipulating the Composition model immutably.
 * Never modifies audio destrutively — operates purely on MusicalState/Composition.
 */
import { config } from "@/lib/config";
import { newId } from "@/lib/ids";
import { midiToFreq } from "@/features/pitch/conversions";
import { barQuarters } from "@/features/music/rhythm/meter";
import { chooseChordForBar, scaleIdForKey } from "@/features/conductor/harmony-driver";
import type { HarmonyStyleId, PhrasePosition } from "@/features/music/harmony/candidates";
import {
  type Chord,
  type ChordEvent,
  type Composition,
  type InstrumentId,
  type KeyEstimate,
  type MidiNote,
  type NoteEvent,
  type TimeSignature,
  type BPM,
} from "@/domain/types";
import { validateComposition } from "./schema";

function touch(comp: Composition, patch: Partial<Composition>): Composition {
  const updated: Composition = {
    ...comp,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return validateComposition(updated);
}

export function moveNote(comp: Composition, noteId: string, newStartTime: number): Composition {
  const safeStart = Math.max(0, Number(newStartTime.toFixed(4)));
  const melody = comp.melody.map((n) =>
    n.id === noteId ? { ...n, startTime: safeStart, source: "edited" as const } : { ...n },
  );
  return touch(comp, { melody });
}

export function changeNotePitch(comp: Composition, noteId: string, newMidi: MidiNote): Composition {
  const safeMidi = Math.max(0, Math.min(127, Math.round(newMidi)));
  const pitch = Number(midiToFreq(safeMidi).toFixed(2));
  const melody = comp.melody.map((n) =>
    n.id === noteId
      ? { ...n, midi: safeMidi, pitch, source: "edited" as const }
      : { ...n },
  );
  return touch(comp, { melody });
}

export function changeNoteDuration(
  comp: Composition,
  noteId: string,
  newDuration: number,
): Composition {
  const safeDuration = Math.max(0.05, Number(newDuration.toFixed(4)));
  const melody = comp.melody.map((n) =>
    n.id === noteId
      ? { ...n, duration: safeDuration, source: "edited" as const }
      : { ...n },
  );
  return touch(comp, { melody });
}

export function deleteNote(comp: Composition, noteId: string): Composition {
  const melody = comp.melody.filter((n) => n.id !== noteId).map((n) => ({ ...n }));
  return touch(comp, { melody });
}

export function addNote(
  comp: Composition,
  note: Omit<NoteEvent, "id"> & { id?: string },
): Composition {
  const safeMidi = Math.max(0, Math.min(127, Math.round(note.midi)));
  const pitch = note.pitch > 0 ? note.pitch : Number(midiToFreq(safeMidi).toFixed(2));
  const newEvent: NoteEvent = {
    id: note.id ?? newId("nt"),
    pitch,
    midi: safeMidi,
    startTime: Math.max(0, Number(note.startTime.toFixed(4))),
    duration: Math.max(0.05, Number(note.duration.toFixed(4))),
    velocity: Math.max(0, Math.min(1, note.velocity ?? 0.8)),
    confidence: Math.max(0, Math.min(1, note.confidence ?? 1)),
    source: note.source ?? "edited",
  };

  const melody = [...comp.melody.map((n) => ({ ...n })), newEvent].sort(
    (a, b) => a.startTime - b.startTime,
  );
  return touch(comp, { melody });
}

export function quantizeMelody(
  comp: Composition,
  gridBeat: number = config.recording.defaultQuantizeBeat,
): Composition {
  const safeGrid = Math.max(0.0625, gridBeat);
  // Seconds per quarter beat = 60 / BPM
  const secPerBeat = 60 / comp.tempo;
  const gridSec = safeGrid * secPerBeat;

  const melody = comp.melody
    .map((n) => {
      const quantizedStart = Number(
        (Math.round(n.startTime / gridSec) * gridSec).toFixed(4),
      );
      const rawDurSteps = Math.round(n.duration / gridSec);
      const quantizedDuration = Number(
        (Math.max(1, rawDurSteps) * gridSec).toFixed(4),
      );
      return {
        ...n,
        startTime: quantizedStart,
        duration: quantizedDuration,
        source: "edited" as const,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);

  return touch(comp, { melody });
}

export function changeTempo(comp: Composition, newTempo: BPM): Composition {
  const safeTempo = Math.max(
    config.recording.minBpm,
    Math.min(config.recording.maxBpm, Math.round(newTempo)),
  );
  return touch(comp, { tempo: safeTempo });
}

export function changeKey(comp: Composition, newKey: KeyEstimate): Composition {
  const scaleId = scaleIdForKey(newKey);
  return touch(comp, { key: { ...newKey }, scaleId });
}

export function changeTimeSignature(comp: Composition, newMeter: TimeSignature): Composition {
  return touch(comp, { timeSignature: { ...newMeter } });
}

export function changeChord(comp: Composition, chordIndex: number, newChord: Chord): Composition {
  if (chordIndex < 0 || chordIndex >= comp.chords.length) {
    throw new Error(`Chord index ${chordIndex} out of bounds (0..${comp.chords.length - 1}).`);
  }
  const chords = comp.chords.map((c, i) =>
    i === chordIndex ? { ...c, chord: { ...newChord } } : { ...c, chord: { ...c.chord } },
  );
  return touch(comp, { chords });
}

export function addChord(comp: Composition, chord: ChordEvent): Composition {
  const chords = [...comp.chords.map((c) => ({ ...c, chord: { ...c.chord } })), { ...chord }].sort(
    (a, b) => a.startBar - b.startBar,
  );
  return touch(comp, { chords });
}

export function deleteChord(comp: Composition, chordId: string): Composition {
  const chords = comp.chords
    .filter((c) => c.id !== chordId)
    .map((c) => ({ ...c, chord: { ...c.chord } }));
  return touch(comp, { chords });
}

export function setInstrumentControl(
  comp: Composition,
  instrument: InstrumentId,
  patch: Partial<{ volume: number; pan: number; muted: boolean }>,
): Composition {
  const existing = comp.instruments[instrument] ?? { volume: 0.9, pan: 0, muted: false };
  const updatedEntry = {
    volume: patch.volume !== undefined ? Math.max(0, Math.min(1, patch.volume)) : existing.volume,
    pan: patch.pan !== undefined ? Math.max(-1, Math.min(1, patch.pan)) : existing.pan,
    muted: patch.muted !== undefined ? Boolean(patch.muted) : existing.muted,
  };
  const instruments = {
    ...comp.instruments,
    [instrument]: updatedEntry,
  };
  return touch(comp, { instruments });
}

export function toggleInstrumentMute(comp: Composition, instrument: InstrumentId): Composition {
  const existing = comp.instruments[instrument] ?? { volume: 0.9, pan: 0, muted: false };
  return setInstrumentControl(comp, instrument, { muted: !existing.muted });
}

export function setArrangementInstrument(
  comp: Composition,
  instrument: InstrumentId,
  active: boolean,
): Composition {
  const arrangement = {
    ...comp.arrangement,
    active: {
      ...comp.arrangement.active,
      [instrument]: active,
    },
  };
  return touch(comp, { arrangement });
}

function resolveHarmonyStyle(styleId: string): HarmonyStyleId {
  if (styleId === "ambient") return "ambient";
  if (styleId === "folk" || styleId === "ballad") return "folk";
  if (styleId === "jazz") return "jazz";
  return "pop";
}

/**
 * Regenerates the accompaniment chords using Phase 4 harmony scoring
 * over the currently edited melody.
 */
export function regenerateAccompaniment(comp: Composition): Composition {
  const quartersPerBar = barQuarters(comp.timeSignature);
  const secPerBeat = 60 / comp.tempo;
  const barDurationSec = quartersPerBar * secPerBeat;

  // Determine total bars needed to cover the melody
  let maxTime = 0;
  for (const n of comp.melody) {
    const end = n.startTime + n.duration;
    if (end > maxTime) maxTime = end;
  }

  // Minimum 2 bars, maximum 64 bars
  const totalBars = Math.min(64, Math.max(2, Math.ceil(maxTime / barDurationSec)));
  const newChords: ChordEvent[] = [];
  const chordHistory: Chord[] = [];
  const harmonyStyle = resolveHarmonyStyle(comp.styleId);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStartSec = bar * barDurationSec;
    const barEndSec = (bar + 1) * barDurationSec;

    // Slices notes that start inside or overlap this bar
    const slice = comp.melody.filter(
      (n) => n.startTime < barEndSec && n.startTime + n.duration > barStartSec,
    );

    let phrasePosition: PhrasePosition = "middle";
    if (bar === 0) phrasePosition = "start";
    else if (bar === totalBars - 1) phrasePosition = "end";

    const prevChord = chordHistory.length > 0 ? chordHistory[chordHistory.length - 1] : undefined;

    const result = chooseChordForBar({
      key: comp.key,
      scaleId: comp.scaleId,
      melodySlice: slice,
      barIndex: bar,
      phrasePosition,
      style: harmonyStyle,
      prevChord,
      recentChords: [...chordHistory],
      seed: `${comp.id}_regen_${bar}`,
    });

    chordHistory.push(result.chord);

    newChords.push({
      id: newId("chd"),
      chord: result.chord,
      startBar: bar,
      durationBars: 1,
      confidence: result.confidence,
    });
  }

  return touch(comp, { chords: newChords });
}
