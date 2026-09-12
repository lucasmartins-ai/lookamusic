/**
 * Play-along builder (hum-first flow).
 * Pure — no React, no Web Audio.
 *
 * Converte o estado musical capturado em silêncio (mic aberto, banda muda)
 * numa Composition tocável em loop: a banda passa a tocar ESSA música fixa
 * e a voz acompanha por cima (só energia/dinâmica seguem ao vivo).
 * Isso quebra o ciclo de feedback do modo 100% reativo (mic recaptura a
 * banda → notas fantasmas rápidas → lag em cascata).
 */
import { config } from "@/lib/config";
import { newId } from "@/lib/ids";
import { midiToFreq } from "@/features/pitch/conversions";
import { barQuarters } from "@/features/music/rhythm/meter";
import type {
  ChordEvent,
  Composition,
  MusicalState,
  NoteEvent,
  PitchClass,
} from "@/domain/types";
import { createDefaultComposition, validateComposition } from "./schema";
import { cleanupHummedMelody, type HumCleanupStats } from "./hum-cleanup";

/** Folga antes da primeira nota no loop (count-in respirável). */
export const PLAY_ALONG_LEAD_IN_SEC = 0.5;
/** Duração assumida p/ nota ainda aberta quando virou música. */
export const PLAY_ALONG_OPEN_NOTE_DUR = 0.25;

/**
 * Melody cleanup report for a hum-first take (diagnostics/UI). Counts are
 * the *musical* ones after artifacts are removed — the band plays what was
 * sung, not the detector's fragment count.
 */
export interface PlayAlongNotes {
  rawCount: number;
  cleanCount: number;
  stats: HumCleanupStats;
}

let lastNotes: PlayAlongNotes | null = null;

/** Cleanup report of the most recent `buildPlayAlongComposition` (or null). */
export function lastPlayAlongNotes(): PlayAlongNotes | null {
  return lastNotes ? { ...lastNotes, stats: { ...lastNotes.stats } } : null;
}

function clampTempo(bpm: number): number {
  if (!Number.isFinite(bpm)) return config.rhythm.defaultBpm;
  return Math.min(config.recording.maxBpm, Math.max(config.recording.minBpm, Math.round(bpm)));
}

export function buildPlayAlongComposition(state: MusicalState, name = "Cantarolada"): Composition | null {
  // Pattern/repetition cleanup first: a fragmented take must not become a
  // song with twice as many notes as the singer hummed (user report: 6 → 14).
  const clean = cleanupHummedMelody(state.melody);
  const notes = clean.notes;
  lastNotes = {
    rawCount: clean.stats.input,
    cleanCount: notes.length,
    stats: clean.stats,
  };
  if (notes.length === 0) return null;

  const minStart = notes[0].startTime;
  const shift = minStart - PLAY_ALONG_LEAD_IN_SEC;
  const melody: NoteEvent[] = notes.map((n) => {
    const midi = Math.round(n.midi);
    const duration =
      Number.isFinite(n.duration) && n.duration > 0 ? n.duration : PLAY_ALONG_OPEN_NOTE_DUR;
    return {
      id: n.id || newId("note"),
      pitch: n.pitch > 0 ? n.pitch : midiToFreq(midi),
      midi,
      startTime: Math.max(0, Number((n.startTime - shift).toFixed(4))),
      duration,
      velocity: Math.min(1, Math.max(0.2, n.velocity || 0.8)),
      confidence: Math.min(1, Math.max(0, n.confidence || 0.8)),
      source: "voice" as const,
    };
  });

  const tempo = clampTempo(state.tempo?.playback || config.rhythm.defaultBpm);
  const meter = state.timeSignature ?? { numerator: 4, denominator: 4 };
  const barSec = (barQuarters(meter) * 60) / tempo;
  const barShift = Math.max(0, Math.floor(shift / barSec));

  let chords: ChordEvent[] = state.chords
    .filter((c) => Number.isInteger(c.startBar) && c.startBar >= 0)
    .map((c) => ({
      id: c.id || newId("chord"),
      chord: { ...c.chord },
      startBar: Math.max(0, c.startBar - barShift),
      durationBars: Math.max(1, c.durationBars || 1),
      confidence: Math.min(1, Math.max(0, c.confidence ?? 0.8)),
    }))
    .sort((a, b) => a.startBar - b.startBar);

  if (chords.length === 0) {
    const totalDur = Math.max(...melody.map((n) => n.startTime + n.duration));
    const totalBars = Math.max(1, Math.ceil(totalDur / barSec));
    chords = [
      {
        id: newId("chord"),
        chord: {
          root: (state.key?.root ?? 0) as PitchClass,
          quality: state.key?.mode === "minor" ? "minor" : "major",
        },
        startBar: 0,
        durationBars: totalBars,
        confidence: 0.6,
      },
    ];
  }

  const now = new Date().toISOString();
  const comp = createDefaultComposition({
    id: newId("comp"),
    name,
    createdAt: now,
    updatedAt: now,
    tempo,
    timeSignature: { ...meter },
    key: { ...state.key },
    scaleId: state.scale?.id ?? (state.key?.mode === "minor" ? "natural-minor" : "major"),
    melody,
    chords,
    arrangement: {
      active: { ...state.arrangement.active },
      energy: Math.min(1, Math.max(0, state.arrangement?.energy ?? 0.5)),
    },
    styleId: "neutral",
    metadata: {
      source: "hum-first",
      noteCount: melody.length,
      chordCount: chords.length,
      // Limpeza de padrão/repetição: quantas notas o detector entregou e
      // quantas sobreviveram como música (transparência do pedido do usuário).
      rawNoteCount: clean.stats.input,
      cleanup: { ...clean.stats },
    },
  });
  return validateComposition(comp);
}
