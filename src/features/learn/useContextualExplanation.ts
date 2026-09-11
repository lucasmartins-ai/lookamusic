"use client";

/**
 * useContextualExplanation — stabilized educational explanation hook and engine (Phase 13+ Hardening).
 *
 * Pure domain logic (ExplanationStabilizer) + React hook.
 * Mitigates rapid UI churn when a singer performs fast melodic phrasing (< 150 ms per note).
 * Implements phrase retention: keeps the current explanation steady during transient notes,
 * updating once the phrase settles or after a configurable debounce window.
 * User-initiated changes (level or locale) update immediately with 0 ms lag.
 */

import { useEffect, useRef, useState } from "react";
import type { MusicalState } from "@/domain/types";
import { config } from "@/lib/config";
import { explainState } from "./explain";
import type { LearnLevel, MusicalExplanation, SupportedLocale } from "./types";

export interface ContextualExplanationOptions {
  /** Debounce window in ms for rapid note runs (defaults to config.learn.updateDebounceMs). */
  debounceMs?: number;
  /** Minimum interval in ms between notes to qualify as rapid/transient (defaults to config.learn.rapidNoteThresholdMs). */
  rapidThresholdMs?: number;
}

/**
 * Pure domain stabilizer for contextual musical explanations.
 * Independent of React — deterministic and unit-testable without DOM/hooks.
 */
export class ExplanationStabilizer {
  readonly debounceMs: number;
  readonly rapidThresholdMs: number;

  private currentExplanation: MusicalExplanation | null = null;
  private lastLevel: LearnLevel | null = null;
  private lastLocale: SupportedLocale | null = null;
  private lastNoteCount = 0;
  private lastNoteTime = 0;
  private pendingTimerDeadline: number | null = null;

  constructor(options?: ContextualExplanationOptions) {
    this.debounceMs = options?.debounceMs ?? config.learn.updateDebounceMs;
    this.rapidThresholdMs = options?.rapidThresholdMs ?? config.learn.rapidNoteThresholdMs;
  }

  /**
   * Evaluates incoming musical state at a given timestamp.
   * Returns whether the update was debounced (retained) or immediately applied.
   */
  process(
    state: MusicalState,
    level: LearnLevel,
    locale: SupportedLocale = "pt-BR",
    now: number = Date.now(),
  ): {
    explanation: MusicalExplanation;
    debounced: boolean;
    nextDeadline: number | null;
  } {
    // 1. Level or Locale changed by user: immediate update (0 ms UI response)
    const levelChanged = this.lastLevel !== null && this.lastLevel !== level;
    const localeChanged = this.lastLocale !== null && this.lastLocale !== locale;
    this.lastLevel = level;
    this.lastLocale = locale;

    if (levelChanged || localeChanged || this.currentExplanation === null) {
      this.pendingTimerDeadline = null;
      this.currentExplanation = explainState(state, level, locale);
      this.lastNoteCount = state.melody.length;
      this.lastNoteTime = now;
      return { explanation: this.currentExplanation, debounced: false, nextDeadline: null };
    }

    // 2. Check note interval in melody
    const noteCount = state.melody.length;
    const noteCountChanged = noteCount !== this.lastNoteCount;
    const elapsedSinceLastNote = now - (this.lastNoteTime || now);
    this.lastNoteCount = noteCount;
    this.lastNoteTime = now;

    const isRapid =
      noteCountChanged &&
      elapsedSinceLastNote > 0 &&
      elapsedSinceLastNote < this.rapidThresholdMs;

    if (isRapid) {
      // Rapid melodic phrasing in progress: retain previous explanation and schedule settle deadline
      this.pendingTimerDeadline = now + this.debounceMs;
      return {
        explanation: this.currentExplanation,
        debounced: true,
        nextDeadline: this.pendingTimerDeadline,
      };
    }

    // If a pending timer exists and hasn't expired yet, hold
    if (this.pendingTimerDeadline !== null && now < this.pendingTimerDeadline) {
      return {
        explanation: this.currentExplanation,
        debounced: true,
        nextDeadline: this.pendingTimerDeadline,
      };
    }

    // Normal progression or debounce elapsed: apply fresh explanation
    this.pendingTimerDeadline = null;
    this.currentExplanation = explainState(state, level, locale);
    return { explanation: this.currentExplanation, debounced: false, nextDeadline: null };
  }

  /** Force flush and return the latest explanation. */
  flush(
    state: MusicalState,
    level: LearnLevel,
    locale: SupportedLocale = "pt-BR",
  ): MusicalExplanation {
    this.pendingTimerDeadline = null;
    this.currentExplanation = explainState(state, level, locale);
    return this.currentExplanation;
  }
}

/**
 * React hook using the pure ExplanationStabilizer.
 */
export function useContextualExplanation(
  musicalState: MusicalState,
  level: LearnLevel,
  locale: SupportedLocale = "pt-BR",
  options?: ContextualExplanationOptions,
): MusicalExplanation {
  const stabilizerRef = useRef<ExplanationStabilizer | null>(null);
  if (!stabilizerRef.current) {
    stabilizerRef.current = new ExplanationStabilizer(options);
  }

  const [explanation, setExplanation] = useState<MusicalExplanation>(() =>
    explainState(musicalState, level, locale),
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stabilizer = stabilizerRef.current!;
    const now = Date.now();
    const result = stabilizer.process(musicalState, level, locale, now);

    if (!result.debounced) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setExplanation(result.explanation);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      const delay = Math.max(0, (result.nextDeadline ?? now + stabilizer.debounceMs) - now);
      timerRef.current = setTimeout(() => {
        setExplanation(stabilizer.flush(musicalState, level, locale));
        timerRef.current = null;
      }, delay);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [musicalState, level, locale]);

  return explanation;
}
