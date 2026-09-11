/**
 * Vocal Pitch Coach — Real-time intonation feedback and vocal training engine.
 * Pure TypeScript — no React, no Web Audio.
 * Evaluates pitch accuracy against chromatic notes or current musical scale,
 * provides pedagogic advice in Portuguese, and tracks singing accuracy statistics.
 */
import type { KeyEstimate, PitchObservation, VocalCoachFeedback } from "@/domain/types";
import { config } from "@/lib/config";
import { centsOff, freqToMidi, midiToFreq, midiToNoteName } from "./conversions";
import { scaleContains } from "../music/theory/scales";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export class VocalPitchCoach {
  private totalVoicedFrames = 0;
  private inTuneFrames = 0;
  private currentStreakMs = 0;
  private lastInTuneTimestamp = 0;

  constructor(
    private readonly inTuneTol: number = config.coach.inTuneCentsTolerance,
    private readonly nearTol: number = config.coach.nearCentsTolerance,
    private readonly minConf: number = config.coach.minConfidence,
  ) {}

  resetStats(): void {
    this.totalVoicedFrames = 0;
    this.inTuneFrames = 0;
    this.currentStreakMs = 0;
    this.lastInTuneTimestamp = 0;
  }

  evaluate(obs: PitchObservation, key?: KeyEstimate | null): VocalCoachFeedback {
    const isVoiced = obs.frequency > 0 && obs.confidence >= this.minConf;

    if (!isVoiced) {
      this.currentStreakMs = 0;
      this.lastInTuneTimestamp = 0;

      const accuracy = this.totalVoicedFrames > 0
        ? Math.round((this.inTuneFrames / this.totalVoicedFrames) * 100)
        : 100;

      const isUnclear = obs.frequency > 0 && obs.confidence < this.minConf;
      return {
        state: isUnclear ? "unclear" : "silent",
        cents: 0,
        targetMidi: -1,
        targetNote: "—",
        targetFreq: 0,
        message: isUnclear
          ? "Voz oscilando ou sem nota definida. Firme a emissão e a respiração."
          : "Emita um som vocal contínuo (ex: 'Aaaah') para treinar sua afinação.",
        inTune: false,
        accuracyScore: accuracy,
        streakMs: 0,
      };
    }

    this.totalVoicedFrames += 1;

    const targetMidi = freqToMidi(obs.frequency);
    const targetNote = midiToNoteName(targetMidi);
    const targetFreq = midiToFreq(targetMidi);
    const cents = centsOff(obs.frequency);
    const absCents = Math.abs(cents);

    // Check if target note belongs to active key scale
    let inScale = true;
    let keyStr = "";
    if (key && key.confidence >= 0.25) {
      const scaleId = key.mode === "minor" ? "natural-minor" : "major";
      const targetPc = ((targetMidi % 12) + 12) % 12;
      inScale = scaleContains(key.root, scaleId, targetPc);
      keyStr = `${KEY_NAMES[key.root]} ${key.mode === "minor" ? "Menor" : "Maior"}`;
    }

    const isInTune = absCents <= this.inTuneTol;

    if (isInTune) {
      this.inTuneFrames += 1;
      const now = obs.timestamp || performance.now();
      if (this.lastInTuneTimestamp > 0) {
        const dt = Math.max(0, now - this.lastInTuneTimestamp);
        // Avoid jumping streak across huge gaps (e.g. paused sessions)
        if (dt < 300) {
          this.currentStreakMs += dt;
        } else {
          this.currentStreakMs = dt;
        }
      } else {
        this.currentStreakMs = 50;
      }
      this.lastInTuneTimestamp = now;
    } else {
      this.currentStreakMs = 0;
      this.lastInTuneTimestamp = 0;
    }

    const accuracyScore = Math.round((this.inTuneFrames / this.totalVoicedFrames) * 100);
    const streakSec = (this.currentStreakMs / 1000).toFixed(1);

    if (isInTune) {
      if (!inScale && keyStr) {
        return {
          state: "out-of-key",
          cents,
          targetMidi,
          targetNote,
          targetFreq,
          message: `Afinado em ${targetNote} (${cents >= 0 ? "+" : ""}${cents}¢), mas esta nota está fora do tom ${keyStr}!`,
          inTune: true,
          accuracyScore,
          streakMs: this.currentStreakMs,
        };
      }

      const streakBonus = this.currentStreakMs >= 1500 ? ` (${streakSec}s sustentados!)` : "";
      return {
        state: "in-tune",
        cents,
        targetMidi,
        targetNote,
        targetFreq,
        message: `Afinação perfeita em ${targetNote}! ${cents === 0 ? "Centro exato." : `${cents > 0 ? "+" : ""}${cents}¢`}${streakBonus}`,
        inTune: true,
        accuracyScore,
        streakMs: this.currentStreakMs,
      };
    }

    if (cents < -this.inTuneTol) {
      const severity = absCents > this.nearTol ? "Muito abaixo" : "Um pouco abaixo";
      return {
        state: "flat",
        cents,
        targetMidi,
        targetNote,
        targetFreq,
        message: `${severity} de ${targetNote} (${cents}¢). Suba a voz levemente.`,
        inTune: false,
        accuracyScore,
        streakMs: 0,
      };
    }

    const severity = absCents > this.nearTol ? "Muito acima" : "Um pouco acima";
    return {
      state: "sharp",
      cents,
      targetMidi,
      targetNote,
      targetFreq,
      message: `${severity} de ${targetNote} (+${cents}¢). Desça a voz levemente.`,
      inTune: false,
      accuracyScore,
      streakMs: 0,
    };
  }
}
