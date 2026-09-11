/**
 * Frequency ↔ MIDI ↔ note-name conversions. Pure. A4 = 440 Hz, MIDI 60 = C4.
 */
import { UNVOICED } from "@/domain/types";

export const A4_FREQ = 440;
export const A4_MIDI = 69;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function freqToMidiFloat(freq: number): number {
  if (!Number.isFinite(freq) || freq <= 0) return UNVOICED;
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

export function midiToFreq(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Nearest integer MIDI for a frequency, or -1 when unvoiced. */
export function freqToMidi(freq: number): number {
  const m = freqToMidiFloat(freq);
  return m === UNVOICED ? UNVOICED : Math.round(m);
}

/** "G4" for MIDI 67. */
export function midiToNoteName(midi: number): string {
  if (!Number.isFinite(midi)) return "—";
  const m = Math.round(midi);
  const name = NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

/** "G4" for a frequency; "—" when unvoiced. */
export function freqToNoteName(freq: number): string {
  const m = freqToMidi(freq);
  return m === UNVOICED ? "—" : midiToNoteName(m);
}

/** Signed cents deviation of freq from nearest note center. */
export function centsOff(freq: number): number {
  const m = freqToMidiFloat(freq);
  if (m === UNVOICED) return 0;
  return Math.round((m - Math.round(m)) * 100);
}
