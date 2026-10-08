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
import { trackBeatOffline } from "@/features/music/rhythm/tempo";
import type {
  ChordEvent,
  Composition,
  MusicalState,
  NoteEvent,
  PitchClass,
} from "@/domain/types";
import { createDefaultComposition, validateComposition } from "./schema";
import { cleanupHummedMelody, type HumCleanupStats } from "./hum-cleanup";
import { harmonizeTake } from "@/features/conductor/harmony-driver";
import { estimateKeyFromHistogram } from "@/features/music/theory/key";

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
  // 0.25 BPM resolution: rounding 117.6 → 118 drifts 0.3 s over a 2-min loop.
  return Math.min(config.recording.maxBpm, Math.max(config.recording.minBpm, Math.round(bpm * 4) / 4));
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

  const meter = state.timeSignature ?? { numerator: 4, denominator: 4 };
  // Pulse of the WHOLE take (TDR-23): tempo + downbeat from where the notes
  // actually fall, then one count-in bar so the band's beat 1 is the
  // singer's beat 1. Fallback (too few notes): live tempo + 0.5 s lead-in.
  // Onsets from the RAW take (cleanup folds repeated same-pitch notes, which
  // erases real re-attacks the pulse needs); only sub-blip fragments skipped.
  const onsets = state.melody
    .filter((n) => Number.isFinite(n.startTime) && (n.duration <= 0 || n.duration >= config.recording.beatMinNoteSec))
    .map((n) => ({ t: n.startTime, w: Math.min(1, 0.4 + Math.max(0, n.duration)) }));
  const beat = trackBeatOffline(
    onsets,
    Math.max(1, Math.round(barQuarters(meter))),
  );
  const tempo = beat ? clampTempo(beat.bpm) : clampTempo(state.tempo?.playback || config.rhythm.defaultBpm);
  const barSec = (barQuarters(meter) * 60) / tempo;
  const minStart = notes[0].startTime;
  const shift = beat ? beat.firstDownbeat - barSec : minStart - PLAY_ALONG_LEAD_IN_SEC;
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


  // Hindsight: the whole take is known, so the key comes from every sung
  // note (duration-weighted) and each bar's chord from the notes sung IN that
  // bar. The live chords (state.chords) were guessed a bar ahead and lag the
  // voice — measured on real a cappella takes (TDR-21).
  const hist = new Array<number>(12).fill(0);
  // ponytail: hard pitch class — the soft split helped live but cost 2 pts
  // on the hum-first benchmark (TDR-21); revisit with more takes.
  for (const n of melody) hist[((n.midi % 12) + 12) % 12] += n.duration;
  const key = estimateKeyFromHistogram(hist)?.top ?? state.key;
  const perBar = harmonizeTake(melody, key, barSec);
  // Count-in bar(s) have no voice: they take the first sung bar's chord.
  const firstSung = Math.floor(Math.min(...melody.map((n) => n.startTime)) / barSec);
  for (let b = 0; b < firstSung && b < perBar.length; b++) perBar[b] = perBar[Math.min(firstSung, perBar.length - 1)];
  const chords: ChordEvent[] = [];
  perBar.forEach((chord, bar) => {
    const last = chords[chords.length - 1];
    if (last && last.chord.root === chord.root && last.chord.quality === chord.quality) {
      last.durationBars += 1;
      return;
    }
    chords.push({ id: newId("chord"), chord: { ...chord }, startBar: bar, durationBars: 1, confidence: 0.8 });
  });
  if (chords.length === 0) {
    chords.push({
      id: newId("chord"),
      chord: { root: key.root, quality: key.mode === "minor" ? "minor" : "major" },
      startBar: 0,
      durationBars: 1,
      confidence: 0.6,
    });
  }

  const now = new Date().toISOString();
  const comp = createDefaultComposition({
    id: newId("comp"),
    name,
    createdAt: now,
    updatedAt: now,
    tempo,
    timeSignature: { ...meter },
    key: { ...key },
    scaleId: key.mode === "minor" ? "natural-minor" : "major",
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
