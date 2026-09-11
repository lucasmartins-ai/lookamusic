/**
 * Standard MIDI File (SMF 1.0) Exporter and Parser (Phase 12, §40).
 * Pure TypeScript — zero dependencies on React or Web Audio.
 *
 * Generates valid multitrack (Format 1) SMF binaries containing:
 * - Track 0: Conductor (Tempo, Meter, Key Signature)
 * - Track 1: Melody (NoteEvents mapped to ticks with duration and velocity)
 * - Track 2: Chords (ChordEvents voiced harmonically across bars)
 *
 * Includes an SMF parser for bidirectional round-trip verification:
 * export → parse → note-by-note equality check.
 */
import type { Composition, NoteEvent, ChordEvent } from "@/domain/types";
import { chordTones } from "@/features/music/theory/chords";
import { barQuarters } from "@/features/music/rhythm/meter";

export const MIDI_PPQ = 480; // Standard Pulses Per Quarter note

// --- Binary helpers ---

function writeString(bytes: number[], str: string): void {
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
}

function write16(bytes: number[], val: number): void {
  bytes.push((val >> 8) & 0xff);
  bytes.push(val & 0xff);
}

function write24(bytes: number[], val: number): void {
  bytes.push((val >> 16) & 0xff);
  bytes.push((val >> 8) & 0xff);
  bytes.push(val & 0xff);
}

function write32(bytes: number[], val: number): void {
  bytes.push((val >> 24) & 0xff);
  bytes.push((val >> 16) & 0xff);
  bytes.push((val >> 8) & 0xff);
  bytes.push(val & 0xff);
}

function writeVarLen(bytes: number[], val: number): void {
  let buffer = val & 0x7f;
  const parts: number[] = [];
  while ((val >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (val & 0x7f) | 0x80;
  }
  while (true) {
    parts.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  for (const b of parts) {
    bytes.push(b);
  }
}

interface MidiRawEvent {
  tick: number;
  type: "noteOn" | "noteOff" | "meta";
  channel?: number;
  note?: number;
  velocity?: number;
  metaType?: number;
  data?: number[];
}

function serializeTrack(events: MidiRawEvent[]): Uint8Array {
  // Sort events chronologically. If ticks are identical, place NoteOff before NoteOn
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const priority = (type: MidiRawEvent["type"]) => {
      if (type === "meta") return 0;
      if (type === "noteOff") return 1;
      return 2;
    };
    return priority(a.type) - priority(b.type);
  });

  const body: number[] = [];
  let currentTick = 0;

  for (const ev of events) {
    const delta = Math.max(0, ev.tick - currentTick);
    writeVarLen(body, delta);
    currentTick = ev.tick;

    if (ev.type === "meta") {
      body.push(0xff);
      body.push(ev.metaType ?? 0);
      const data = ev.data ?? [];
      writeVarLen(body, data.length);
      for (const d of data) body.push(d);
    } else if (ev.type === "noteOn") {
      body.push(0x90 | ((ev.channel ?? 0) & 0x0f));
      body.push(Math.max(0, Math.min(127, ev.note ?? 60)));
      body.push(Math.max(1, Math.min(127, ev.velocity ?? 64)));
    } else if (ev.type === "noteOff") {
      body.push(0x80 | ((ev.channel ?? 0) & 0x0f));
      body.push(Math.max(0, Math.min(127, ev.note ?? 60)));
      body.push(0);
    }
  }

  // End of Track meta event (FF 2F 00)
  writeVarLen(body, 0);
  body.push(0xff, 0x2f, 0x00);

  const header: number[] = [];
  writeString(header, "MTrk");
  write32(header, body.length);

  const full = new Uint8Array(header.length + body.length);
  full.set(header, 0);
  full.set(body, header.length);
  return full;
}

/**
 * Encodes a Composition into a Standard MIDI File (SMF 1.0) Format 1 byte array.
 */
export function exportToMidi(comp: Composition): Uint8Array {
  const bpm = comp.tempo > 0 ? comp.tempo : 120;
  const quartersPerSec = bpm / 60;
  const ticksPerSec = quartersPerSec * MIDI_PPQ;
  const quartersPerBar = barQuarters(comp.timeSignature);
  const secPerBar = quartersPerBar / quartersPerSec;

  // Track 0: Conductor / Tempo / Meter
  const t0Events: MidiRawEvent[] = [];
  // Track name: "Conductor"
  const nameBytes = Array.from("Conductor").map((c) => c.charCodeAt(0));
  t0Events.push({ tick: 0, type: "meta", metaType: 0x03, data: nameBytes });

  // Time Signature: FF 58 04 nn dd cc bb
  // dd is log2(denominator): 4 -> 2, 8 -> 3
  const denomPow = comp.timeSignature.denominator === 8 ? 3 : 2;
  t0Events.push({
    tick: 0,
    type: "meta",
    metaType: 0x58,
    data: [comp.timeSignature.numerator, denomPow, 24, 8],
  });

  // Set Tempo: FF 51 03 tt tt tt (microseconds per quarter note)
  const usPerQuarter = Math.round(60_000_000 / bpm);
  t0Events.push({
    tick: 0,
    type: "meta",
    metaType: 0x51,
    data: [(usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff],
  });

  // Track 1: Melody
  const t1Events: MidiRawEvent[] = [];
  const melodyNameBytes = Array.from("Melody").map((c) => c.charCodeAt(0));
  t1Events.push({ tick: 0, type: "meta", metaType: 0x03, data: melodyNameBytes });

  for (const note of comp.melody) {
    const startTick = Math.round(note.startTime * ticksPerSec);
    const durTick = Math.max(1, Math.round(note.duration * ticksPerSec));
    const endTick = startTick + durTick;
    const midiPitch = Math.max(0, Math.min(127, Math.round(note.midi)));
    const vel = Math.max(1, Math.min(127, Math.round(note.velocity * 127)));

    t1Events.push({
      tick: startTick,
      type: "noteOn",
      channel: 0,
      note: midiPitch,
      velocity: vel,
    });
    t1Events.push({
      tick: endTick,
      type: "noteOff",
      channel: 0,
      note: midiPitch,
    });
  }

  // Track 2: Chords
  const t2Events: MidiRawEvent[] = [];
  const chordsNameBytes = Array.from("Chords").map((c) => c.charCodeAt(0));
  t2Events.push({ tick: 0, type: "meta", metaType: 0x03, data: chordsNameBytes });

  for (const chordEv of comp.chords) {
    const startSec = chordEv.startBar * secPerBar;
    const durSec = chordEv.durationBars * secPerBar;
    const startTick = Math.round(startSec * ticksPerSec);
    const durTick = Math.max(1, Math.round(durSec * ticksPerSec));
    const endTick = startTick + durTick;

    // Voicing: root in octave 4 (midi 48–59 or 60–71)
    const pcs = chordTones(chordEv.chord);
    const baseOctave = 48; // C3
    for (const pc of pcs) {
      const midiNote = baseOctave + pc;
      t2Events.push({
        tick: startTick,
        type: "noteOn",
        channel: 1,
        note: midiNote,
        velocity: 70,
      });
      t2Events.push({
        tick: endTick,
        type: "noteOff",
        channel: 1,
        note: midiNote,
      });
    }
  }

  const serializedTracks = [
    serializeTrack(t0Events),
    serializeTrack(t1Events),
    serializeTrack(t2Events),
  ];

  // Header chunk: MThd, length 6, format 1, tracks 3, division 480
  const header: number[] = [];
  writeString(header, "MThd");
  write32(header, 6);
  write16(header, 1); // Format 1 (synchronous multitrack)
  write16(header, serializedTracks.length);
  write16(header, MIDI_PPQ);

  const totalLength =
    header.length + serializedTracks.reduce((acc, t) => acc + t.length, 0);
  const out = new Uint8Array(totalLength);
  out.set(header, 0);
  let offset = header.length;
  for (const trk of serializedTracks) {
    out.set(trk, offset);
    offset += trk.length;
  }

  return out;
}

// --- SMF Parser for validation & round-trip testing ---

export interface ParsedMidiNote {
  midi: number;
  startTick: number;
  endTick: number;
  startTimeSec: number;
  durationSec: number;
  velocity: number;
}

export interface ParsedMidiTrack {
  name: string;
  notes: ParsedMidiNote[];
}

export interface ParsedMidi {
  format: number;
  trackCount: number;
  ppq: number;
  tempoBpm: number;
  timeSignature: { numerator: number; denominator: number };
  tracks: ParsedMidiTrack[];
}

/**
 * Reads variable-length quantity from binary data.
 */
function readVarLen(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  while (offset + bytesRead < data.length) {
    const b = data[offset + bytesRead];
    bytesRead++;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, bytesRead };
}

/**
 * Parses a Standard MIDI File (SMF) Uint8Array back into structured data.
 */
export function parseMidi(bytes: Uint8Array): ParsedMidi {
  if (bytes.length < 14) {
    throw new Error("Arquivo MIDI muito curto.");
  }

  // Check MThd
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "MThd") {
    throw new Error(`Cabeçalho MIDI inválido: esperado 'MThd', encontrado '${magic}'.`);
  }

  const format = (bytes[8] << 8) | bytes[9];
  const trackCount = (bytes[10] << 8) | bytes[11];
  const ppq = (bytes[12] << 8) | bytes[13];

  let tempoBpm = 120;
  let timeSignature = { numerator: 4, denominator: 4 };
  const tracks: ParsedMidiTrack[] = [];

  let offset = 14;

  for (let t = 0; t < trackCount && offset < bytes.length; t++) {
    const trkMagic = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    if (trkMagic !== "MTrk") {
      throw new Error(`Esperado 'MTrk' no início da trilha ${t}, encontrado '${trkMagic}'.`);
    }

    const trkLen =
      (bytes[offset + 4] << 24) |
      (bytes[offset + 5] << 16) |
      (bytes[offset + 6] << 8) |
      bytes[offset + 7];
    offset += 8;

    const trkEnd = offset + trkLen;
    let currentTick = 0;
    let trackName = `Track ${t}`;
    const openNotes = new Map<number, { startTick: number; velocity: number }>();
    const finishedNotes: ParsedMidiNote[] = [];

    while (offset < trkEnd) {
      const { value: delta, bytesRead } = readVarLen(bytes, offset);
      offset += bytesRead;
      currentTick += delta;

      const status = bytes[offset++];
      if (status === 0xff) {
        // Meta event
        const metaType = bytes[offset++];
        const { value: metaLen, bytesRead: metaLenBytes } = readVarLen(bytes, offset);
        offset += metaLenBytes;

        if (metaType === 0x03) {
          // Track Name
          let name = "";
          for (let i = 0; i < metaLen; i++) {
            name += String.fromCharCode(bytes[offset + i]);
          }
          trackName = name;
        } else if (metaType === 0x51 && metaLen === 3) {
          // Tempo
          const us = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
          tempoBpm = Number((60_000_000 / us).toFixed(2));
        } else if (metaType === 0x58 && metaLen >= 2) {
          // Time signature
          const num = bytes[offset];
          const denomPow = bytes[offset + 1];
          timeSignature = { numerator: num, denominator: Math.pow(2, denomPow) };
        }
        offset += metaLen;
      } else {
        const cmd = status & 0xf0;
        if (cmd === 0x90) {
          // Note On
          const note = bytes[offset++];
          const vel = bytes[offset++];
          if (vel > 0) {
            openNotes.set(note, { startTick: currentTick, velocity: vel });
          } else {
            // Note On with vel 0 is Note Off
            const opened = openNotes.get(note);
            if (opened) {
              const startSec = opened.startTick / ((tempoBpm / 60) * ppq);
              const durSec = (currentTick - opened.startTick) / ((tempoBpm / 60) * ppq);
              finishedNotes.push({
                midi: note,
                startTick: opened.startTick,
                endTick: currentTick,
                startTimeSec: Number(startSec.toFixed(4)),
                durationSec: Number(durSec.toFixed(4)),
                velocity: Number((opened.velocity / 127).toFixed(3)),
              });
              openNotes.delete(note);
            }
          }
        } else if (cmd === 0x80) {
          // Note Off
          const note = bytes[offset++];
          offset++; // ignore release velocity
          const opened = openNotes.get(note);
          if (opened) {
            const startSec = opened.startTick / ((tempoBpm / 60) * ppq);
            const durSec = (currentTick - opened.startTick) / ((tempoBpm / 60) * ppq);
            finishedNotes.push({
              midi: note,
              startTick: opened.startTick,
              endTick: currentTick,
              startTimeSec: Number(startSec.toFixed(4)),
              durationSec: Number(durSec.toFixed(4)),
              velocity: Number((opened.velocity / 127).toFixed(3)),
            });
            openNotes.delete(note);
          }
        } else if (cmd === 0xc0 || cmd === 0xd0) {
          // Program change or channel aftertouch (1 data byte)
          offset++;
        } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
          // Poly aftertouch, control change, pitch bend (2 data bytes)
          offset += 2;
        }
      }
    }

    tracks.push({
      name: trackName,
      notes: finishedNotes.sort((a, b) => a.startTick - b.startTick),
    });
  }

  return {
    format,
    trackCount,
    ppq,
    tempoBpm,
    timeSignature,
    tracks,
  };
}
