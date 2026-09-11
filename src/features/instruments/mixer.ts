/**
 * Band mixer state (Phase 6, §23). Pure — no React, no Web Audio.
 * One channel per instrument: volume/pan/mute/solo. Solo wins over mute:
 * when any channel solos, only soloed channels are audible. Engines stay
 * dumb — the band hook resolves audibility here and drives `setVolume`.
 */
import { INSTRUMENTS, type InstrumentId } from "@/domain/types";
import { clampPan, clampVolume } from "./types";

export interface ChannelState {
  /** 0–1 */
  volume: number;
  /** -1–1 */
  pan: number;
  muted: boolean;
  solo: boolean;
}

export type MixerState = Record<InstrumentId, ChannelState>;

export function defaultChannel(): ChannelState {
  return { volume: 0.9, pan: 0, muted: false, solo: false };
}

export function defaultMixer(): MixerState {
  const mixer = {} as MixerState;
  for (const id of INSTRUMENTS) mixer[id] = defaultChannel();
  return mixer;
}

/** True when at least one channel in the band is soloed. */
export function anySolo(mixer: MixerState): boolean {
  return INSTRUMENTS.some((id) => mixer[id].solo);
}

/** Audibility after mute/solo resolution (the only gate before sound). */
export function isAudible(mixer: MixerState, id: InstrumentId): boolean {
  const ch = mixer[id];
  if (!ch) return false;
  if (anySolo(mixer)) return ch.solo;
  return !ch.muted;
}

/** Effective engine gain: 0 when inaudible, clamped volume otherwise. */
export function effectiveVolume(mixer: MixerState, id: InstrumentId): number {
  const ch = mixer[id];
  if (!ch || !isAudible(mixer, id)) return 0;
  return clampVolume(ch.volume);
}

export function setChannelVolume(mixer: MixerState, id: InstrumentId, v: number): MixerState {
  return { ...mixer, [id]: { ...mixer[id], volume: clampVolume(v) } };
}

export function setChannelPan(mixer: MixerState, id: InstrumentId, p: number): MixerState {
  return { ...mixer, [id]: { ...mixer[id], pan: clampPan(p) } };
}

export function toggleMute(mixer: MixerState, id: InstrumentId): MixerState {
  return { ...mixer, [id]: { ...mixer[id], muted: !mixer[id].muted } };
}

export function toggleSolo(mixer: MixerState, id: InstrumentId): MixerState {
  return { ...mixer, [id]: { ...mixer[id], solo: !mixer[id].solo } };
}
