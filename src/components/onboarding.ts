/**
 * Onboarding machine (Phase 10). Pure step derivation — the component only
 * renders. Steps: 1 allow mic → 2 sing a sustained note → 3 see the note +
 * meet the band. Never blocks: dismissal persists via `config.ux`.
 */
import { config } from "@/lib/config";

export type OnboardingStep = 1 | 2 | 3 | "done";

export interface OnboardingSignals {
  /** Mic has produced audio at least once (running now or history exists). */
  micLive: boolean;
  /** At least one stable note event exists in the timeline. */
  hasNote: boolean;
  /** User dismissed the tour (persisted). */
  dismissed: boolean;
}

export function deriveOnboardingStep(s: OnboardingSignals): OnboardingStep {
  if (s.dismissed) return "done";
  // Progress never regresses: a captured note outranks a stopped mic.
  if (s.hasNote) return 3;
  if (s.micLive) return 2;
  return 1;
}

export const ONBOARDING_STORAGE_KEY = config.ux.onboardingStorageKey;

export function readOnboardingDismissed(): boolean {
  try {
    return typeof localStorage !== "undefined" &&
      localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOnboardingDismissed(): void {
  try {
    localStorage?.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // Private mode: tour simply shows again next visit. Never crash.
  }
}

export const ONBOARDING_COPY: Record<1 | 2 | 3, { title: string; body: string }> = {
  1: {
    title: "Passo 1 de 3 — Libere o microfone",
    body: "O áudio nunca sai deste dispositivo. Aperte o botão abaixo (ou START) e permita o microfone quando o navegador pedir.",
  },
  2: {
    title: "Passo 2 de 3 — Cante uma nota sustentada",
    body: "Segure uma vogal (ex.: “ahhh”) por ~1 segundo, sem pressa. A curva da sua voz aparece no gráfico.",
  },
  3: {
    title: "Passo 3 de 3 — Veja sua nota e conheça a banda",
    body: "Sua nota virou um bloco na linha do tempo. A banda abaixo está destacada — toque nos instrumentos para ouvir prévias.",
  },
};
