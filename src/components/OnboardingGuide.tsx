"use client";

/**
 * OnboardingGuide — 3-step first-run tour (Phase 10).
 * mic → sustained note → note + band. Guidance only: it never blocks the
 * instrument, every step announces via aria-live, dismissal persists.
 */
import { ONBOARDING_COPY } from "./onboarding";

interface OnboardingGuideProps {
  step: 1 | 2 | 3;
  onStartMic: () => void;
  onFinish: () => void;
  onDismiss: () => void;
}

export function OnboardingGuide({ step, onStartMic, onFinish, onDismiss }: OnboardingGuideProps) {
  const copy = ONBOARDING_COPY[step];
  return (
    <section className="panel onboarding" aria-label="Guia de início" data-testid="onboarding" data-step={step}>
      <h2>COMECE A CANTAR</h2>
      <p className="steps" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`step-dot${n === step ? " now" : ""}${n < step ? " past" : ""}`} />
        ))}
      </p>
      <p className="onboarding-title" aria-live="polite">
        <strong>{copy.title}</strong>
        <br />
        {copy.body}
      </p>
      <div className="controls">
        {step === 1 && (
          <button className="primary" onClick={onStartMic} data-testid="onboarding-start">
            ▶ LIBERAR MICROFONE
          </button>
        )}
        {step === 3 && (
          <button className="primary" onClick={onFinish} data-testid="onboarding-finish">
            ♪ EXPLORAR A BANDA
          </button>
        )}
        <button className="ghost" onClick={onDismiss}>
          Pular tour
        </button>
      </div>
    </section>
  );
}
