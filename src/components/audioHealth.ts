/**
 * Audio-health heuristics (Phase 10, §43 "áudio ruim" + "CPU overload").
 * Pure flags from aggregated meters — the page computes aggregates from
 * `history` + `diagnostics`; this module only classifies. Thresholds all
 * come from `config.ux` / `config.rhythm` (no magic numbers at call sites).
 * Flags are advisory warnings, never errors: the session keeps running.
 */
import { config } from "@/lib/config";

export type AudioHealthFlag = "quiet" | "unclear" | "overload";

export interface AudioHealthInput {
  /** Observations received in the window (history length is a good proxy). */
  obsCount: number;
  /** Observations with voice (frequency > 0). */
  voicedCount: number;
  /** Mean confidence over the window (0–1). */
  avgConfidence: number;
  /** Latest input RMS. */
  inputRms: number;
  /** Cumulative dropped worklet frames. */
  droppedFrames: number;
  /** Main-thread handle p95 (ms). */
  p95HandleMs: number;
}

export const AUDIO_HEALTH_COPY: Record<
  AudioHealthFlag,
  { title: string; body: string }
> = {
  quiet: {
    title: "Quase nenhum som está chegando",
    body: "O microfone está aberto, mas o volume está no nível do silêncio. Aproxime-se do microfone, confira o volume de entrada do sistema e cante um pouco mais forte.",
  },
  unclear: {
    title: "Difícil de ouvir com clareza",
    body: "A detecção está insegura: reduza o ruído de fundo (ventilador, teclado), cante vogais sustentadas e evite falar durante a sessão.",
  },
  overload: {
    title: "O dispositivo parece sobrecarregado",
    body: "Quadros de áudio estão sendo perdidos. Feche abas pesadas, prefira o Chrome/Edge no desktop e evite gravar a tela durante a sessão.",
  },
};

/**
 * Returns active advisory flags. Empty (not null) when evidence is
 * insufficient or everything is healthy — the caller renders nothing.
 */
export function detectAudioHealth(input: AudioHealthInput): AudioHealthFlag[] {
  if (input.obsCount < config.ux.audioHealthMinObs) return [];
  const flags: AudioHealthFlag[] = [];
  const draining =
    input.inputRms <= config.rhythm.energyNoiseFloor && input.voicedCount === 0;
  if (draining) flags.push("quiet");
  else if (input.avgConfidence < config.ux.unclearConfidenceBelow) flags.push("unclear");
  if (
    input.p95HandleMs > config.ux.cpuOverloadP95Ms ||
    input.droppedFrames > config.ux.cpuOverloadDroppedFrames
  ) {
    flags.push("overload");
  }
  return flags;
}
