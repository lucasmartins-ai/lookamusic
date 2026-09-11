/**
 * Master Offline Audio Render to WAV (Phase 12, §40).
 * Completely separated from the live playback engine (zero impact on AudioContext or speakers).
 * Uses OfflineAudioContext to render the composition faster than real-time and encodes
 * a canonical 16-bit PCM stereo RIFF WAVE file.
 */
import type { Composition, InstrumentId, PitchClass } from "@/domain/types";
import { barQuarters } from "@/features/music/rhythm/meter";
import { createBand } from "@/features/instruments/registry";
import { WebAudioSink, createMasterBus } from "@/features/instruments/audio-sink";
import {
  barQuarters as planBarQuarters,
  planAccordion,
  planBass,
  planDrums,
  planGuitar,
  planPiano,
  planSax,
  planStrings,
  planViolao,
  planViolin,
  type PassageInput,
} from "@/features/instruments/planning";
import { styleDrums } from "@/features/music/arrangement/presets";
import { midiToFreq, type MusicalEvent } from "@/features/instruments/types";

export const DEFAULT_WAV_SAMPLE_RATE = 44100;
export const WAV_HEADER_SIZE = 44;

const PLAN_OF: Record<InstrumentId, (input: PassageInput, bars: number) => MusicalEvent[]> = {
  drums: planDrums,
  bass: planBass,
  piano: planPiano,
  guitar: planGuitar,
  violao: planViolao,
  strings: planStrings,
  violin: planViolin,
  sax: planSax,
  accordion: planAccordion,
};

/**
 * Computes the total expected duration of a composition in seconds.
 * Takes the maximum of melody notes and chords, with a minimum of 4 bars,
 * plus a 1.0s decay/release tail.
 */
export function computeCompositionDuration(comp: Composition): number {
  const bpm = comp.tempo > 0 ? comp.tempo : 120;
  const quartersPerBar = barQuarters(comp.timeSignature);
  const secPerBar = quartersPerBar * (60 / bpm);

  const maxMelodyEnd = comp.melody.reduce((max, note) => {
    return Math.max(max, note.startTime + note.duration);
  }, 0);

  const maxChordEnd = comp.chords.reduce((max, chord) => {
    return Math.max(max, (chord.startBar + chord.durationBars) * secPerBar);
  }, 0);

  const minDuration = 4 * secPerBar;
  const tailSec = 1.0; // Decay tail for release envelopes and reverberation

  return Number((Math.max(maxMelodyEnd, maxChordEnd, minDuration) + tailSec).toFixed(3));
}

/**
 * Encodes two 32-bit float audio channels (L and R) into a 16-bit PCM stereo RIFF WAVE Uint8Array.
 */
export function encodeWav(
  leftChannel: Float32Array,
  rightChannel: Float32Array,
  sampleRate: number = DEFAULT_WAV_SAMPLE_RATE,
): Uint8Array {
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample; // 4 bytes
  const byteRate = sampleRate * blockAlign;

  const numSamples = Math.min(leftChannel.length, rightChannel.length);
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;

  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings
  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // 1. RIFF Header
  writeString(0, "RIFF");
  view.setUint32(4, fileSize, true); // Little-endian
  writeString(8, "WAVE");

  // 2. "fmt " Subchunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size = 16 for PCM
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // 3. "data" Subchunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // 4. Interleaved PCM Samples
  let offset = WAV_HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    // Left channel
    const sL = Math.max(-1, Math.min(1, leftChannel[i]));
    const intL = sL < 0 ? Math.round(sL * 32768) : Math.round(sL * 32767);
    view.setInt16(offset, intL, true);
    offset += 2;

    // Right channel
    const sR = Math.max(-1, Math.min(1, rightChannel[i]));
    const intR = sR < 0 ? Math.round(sR * 32768) : Math.round(sR * 32767);
    view.setInt16(offset, intR, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

export interface ParsedWavHeader {
  chunkId: string;
  fileSize: number;
  format: string;
  subchunk1Id: string;
  subchunk1Size: number;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  subchunk2Id: string;
  dataSize: number;
  numSamples: number;
  durationSec: number;
}

/**
 * Parses and verifies a WAV byte array header for testing and validation.
 */
export function parseWavHeader(bytes: Uint8Array): ParsedWavHeader {
  if (bytes.length < WAV_HEADER_SIZE) {
    throw new Error(`Arquivo WAV muito curto: ${bytes.length} bytes (mínimo ${WAV_HEADER_SIZE}).`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  function readString(offset: number, length: number): string {
    let str = "";
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(view.getUint8(offset + i));
    }
    return str;
  }

  const chunkId = readString(0, 4);
  const fileSize = view.getUint32(4, true);
  const format = readString(8, 4);

  if (chunkId !== "RIFF" || format !== "WAVE") {
    throw new Error(`Cabeçalho RIFF/WAVE inválido: chunkId='${chunkId}', format='${format}'.`);
  }

  const subchunk1Id = readString(12, 4);
  const subchunk1Size = view.getUint32(16, true);
  const audioFormat = view.getUint16(20, true);
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bitsPerSample = view.getUint16(34, true);

  const subchunk2Id = readString(36, 4);
  const dataSize = view.getUint32(40, true);

  if (subchunk1Id !== "fmt " || subchunk2Id !== "data") {
    throw new Error(
      `Subchunks WAV inválidos: subchunk1='${subchunk1Id}', subchunk2='${subchunk2Id}'.`,
    );
  }

  const numSamples = dataSize / blockAlign;
  const durationSec = Number((numSamples / sampleRate).toFixed(4));

  return {
    chunkId,
    fileSize,
    format,
    subchunk1Id,
    subchunk1Size,
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    subchunk2Id,
    dataSize,
    numSamples,
    durationSec,
  };
}

export interface WavExportOptions {
  sampleRate?: number;
  onProgress?: (percent: number) => void;
}

/**
 * Offline rendering pipeline: synthesizes composition via OfflineAudioContext and returns a WAV Blob.
 */
export async function renderToWav(
  comp: Composition,
  options: WavExportOptions = {},
): Promise<{ blob: Blob; durationSec: number; rawBytes: Uint8Array }> {
  const sampleRate = options.sampleRate ?? DEFAULT_WAV_SAMPLE_RATE;
  const durationSec = computeCompositionDuration(comp);
  const totalFrames = Math.ceil(durationSec * sampleRate);

  const OfflineContextClass =
    typeof window !== "undefined"
      ? window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
          .webkitOfflineAudioContext
      : null;

  if (!OfflineContextClass) {
    throw new Error("OfflineAudioContext não está disponível neste ambiente.");
  }

  const offlineCtx = new OfflineContextClass(2, totalFrames, sampleRate);

  // Master bus (comprimido + sala curta, igual ao ao vivo).
  const masterBus = createMasterBus(offlineCtx, offlineCtx.destination);
  const masterGain = masterBus.input;

  // 1. Synthesize Lead Melody Voice
  const melodyGain = offlineCtx.createGain();
  melodyGain.gain.value = 0.85;
  melodyGain.connect(masterGain);

  for (const note of comp.melody) {
    if (note.duration <= 0) continue;
    const start = Math.max(0, note.startTime);
    const dur = Math.max(0.04, note.duration);
    const freq = note.pitch > 0 ? note.pitch : midiToFreq(note.midi);

    const osc = offlineCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, start);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, start);

    const env = offlineCtx.createGain();
    const peak = Math.max(0.0001, Math.min(1, note.velocity * 0.8));
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.02);
    env.gain.setValueAtTime(peak, start + Math.max(0.02, dur - 0.04));
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.04);

    osc.connect(filter);
    filter.connect(env);
    env.connect(melodyGain);

    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  // 2. Synthesize Accompaniment Instruments via Engine Sinks
  const band = createBand((_id) => new WebAudioSink(offlineCtx, masterGain));

  // Apply mixer settings
  for (const inst of Object.keys(comp.instruments) as InstrumentId[]) {
    const channel = comp.instruments[inst];
    const engine = band[inst];
    if (engine && channel) {
      engine.setVolume(channel.muted ? 0 : channel.volume);
      engine.setPan(channel.pan);
    }
  }

  // Plan and schedule accompaniment bar by bar
  const bpm = comp.tempo > 0 ? comp.tempo : 120;
  const quartersPerBar = planBarQuarters(comp.timeSignature);
  const secPerBar = quartersPerBar * (60 / bpm);
  const totalBars = Math.ceil(durationSec / secPerBar);

  for (let b = 0; b < totalBars; b++) {
    const barStartSec = b * secPerBar;
    // Find chord matching this bar or fallback
    const chordEv = comp.chords.find(
      (c) => b >= c.startBar && b < c.startBar + c.durationBars,
    );
    const chord = chordEv?.chord ?? {
      root: comp.key.root as PitchClass,
      quality: comp.key.mode === "minor" ? "minor" : "major",
    };

    const input: PassageInput = {
      chords: [chord],
      melody: comp.melody,
      phraseStarts: [barStartSec],
      meter: comp.timeSignature,
      bpm,
      originSec: barStartSec,
      energy01: comp.arrangement.energy,
      density: 0.5,
      style: styleDrums(comp.styleId),
    };

    for (const inst of Object.keys(band) as InstrumentId[]) {
      if (!comp.arrangement.active[inst]) continue;
      const channel = comp.instruments[inst];
      if (channel?.muted) continue;

      const planner = PLAN_OF[inst];
      if (!planner) continue;

      const events = planner(input, 1).map((e) => ({ ...e, bar: b }));
      band[inst].schedule(events, {
        audioTime: barStartSec,
        tempo: {
          estimated: bpm,
          target: bpm,
          playback: bpm,
          confidence: 1,
        },
        meter: comp.timeSignature,
      });
    }
  }

  if (options.onProgress) options.onProgress(20);

  // Render audio offline
  const renderedBuffer = await offlineCtx.startRendering();
  if (options.onProgress) options.onProgress(80);

  const leftData = renderedBuffer.getChannelData(0);
  const rightData =
    renderedBuffer.numberOfChannels > 1
      ? renderedBuffer.getChannelData(1)
      : renderedBuffer.getChannelData(0);

  const rawBytes = encodeWav(leftData, rightData, sampleRate);
  if (options.onProgress) options.onProgress(100);

  const blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: "audio/wav" });
  return { blob, durationSec, rawBytes };
}
