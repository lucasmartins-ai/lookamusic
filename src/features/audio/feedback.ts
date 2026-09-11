/**
 * Anti-feedback watcher (Phase 17, §diagnose). Pure — no React, no Web Audio.
 *
 * The reported "banda dançando" starts with acoustic coupling: the mic
 * re-captures the band and the loop compounds. We cannot run adaptive
 * cancellation on the critical path (and must not), so we surface a *soft*
 * advisory instead: a sustained high input level while the band is sounding
 * is the signature of mic↔speaker feedback or a mic too close to the output.
 *
 * Heuristic only: thresholds live in `config.feedback`. `confirmObs`
 * consecutive flagged frames prevent a single loud consonant from warning.
 */

import { config } from "@/lib/config";

export interface FeedbackSignals {
  /** Microphone input RMS (0–1). */
  inputRms: number;
  /** True while the band/loop audio is actually sounding. */
  outputActive: boolean;
  /** Direct voice monitor level (autotune); > 0 raises the risk. */
  monitorVolume: number;
}

export interface FeedbackAdvisory {
  kind: "feedback-risk";
  message: string;
}

/** Does one frame look like acoustic coupling? (stateless predicate) */
export function looksLikeFeedback(signals: FeedbackSignals): boolean {
  if (!signals.outputActive) return false;
  const { inputRmsRisk, inputRmsSevere } = config.feedback;
  if (signals.inputRms >= inputRmsSevere) return true;
  return signals.monitorVolume > 0 && signals.inputRms >= inputRmsRisk;
}

const MESSAGE =
  "Nível de entrada muito alto com a banda soando — possível eco/feedback. " +
  "Baixe o volume, use fone ou afaste o microfone da caixa. Se a banda estiver " +
  "“dançando”, prefira CANTAROLAR PRIMEIRO (a banda toca a música fixa, sem reagir).";

/**
 * Stateful streak gate: warns only after `config.feedback.confirmObs`
 * consecutive flagged frames, clearing on the first clean frame.
 */
export class FeedbackWatcher {
  private streak = 0;
  private active = false;

  /** True while the advisory is being shown (cleared by a clean frame). */
  get isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.streak = 0;
    this.active = false;
  }

  push(signals: FeedbackSignals): FeedbackAdvisory | null {
    if (!looksLikeFeedback(signals)) {
      this.streak = 0;
      this.active = false;
      return null;
    }
    this.streak += 1;
    if (this.streak < config.feedback.confirmObs) return null;
    // Same advisory while the condition persists: emit once per streak so the
    // UI does not re-announce every frame.
    if (this.active) return null;
    this.active = true;
    return { kind: "feedback-risk", message: MESSAGE };
  }
}
