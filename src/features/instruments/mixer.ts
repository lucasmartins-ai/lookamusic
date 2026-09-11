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

/**
 * Hotfix som limpo: mix de partida equilibrado por instrumento (antes
 * tudo em 0.9/centro, o que empastava base + harmonia e clipava o master).
 * Cozinha (bateria/baixo) no centro, harmônicos levemente abertos.
 */
export const DEFAULT_MIX: Record<InstrumentId, { volume: number; pan: number }> = {
  drums: { volume: 0.7, pan: 0 },
  bass: { volume: 0.75, pan: 0 },
  piano: { volume: 0.8, pan: -0.15 },
  guitar: { volume: 0.7, pan: 0.2 },
  violao: { volume: 0.78, pan: -0.25 },
  strings: { volume: 0.6, pan: 0.15 },
  violin: { volume: 0.72, pan: 0.3 },
  sax: { volume: 0.7, pan: -0.2 },
  accordion: { volume: 0.6, pan: 0.25 },
};

export function defaultMixer(): MixerState {
  const mixer = {} as MixerState;
  for (const id of INSTRUMENTS) {
    const d = DEFAULT_MIX[id] ?? { volume: 0.9, pan: 0 };
    mixer[id] = { volume: d.volume, pan: d.pan, muted: false, solo: false };
  }
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
