"use client";

/**
 * StatusCard — unified loading/empty/error/warning card (Phase 10, §43).
 * Renders only: copy comes from `statusCards.ts` / `audioHealth.ts`.
 * Every session failure gets a recovery action; never a silent screen.
 */
import type { StatusCardContent } from "./statusCards";
import { AUDIO_HEALTH_COPY, type AudioHealthFlag } from "./audioHealth";

const ROLE: Record<StatusCardContent["tone"], "status" | "alert" | "note"> = {
  info: "note",
  loading: "status",
  error: "alert",
  warning: "status",
};

interface StatusCardProps {
  card: StatusCardContent;
  onRetry?: () => void;
  onOpenHelp?: () => void;
}

export function StatusCard({ card, onRetry, onOpenHelp }: StatusCardProps) {
  return (
    <div className={`notice tone-${card.tone}`} role={ROLE[card.tone]} data-testid={card.testId}>
      <strong>{card.title}</strong>
      <br />
      {card.body}
      {card.actions.length > 0 && (
        <div className="controls">
          {card.actions.map((a) =>
            a.kind === "retry" ? (
              <button key={a.label} className="primary" onClick={onRetry}>
                {a.label}
              </button>
            ) : (
              <button key={a.label} className="ghost" onClick={onOpenHelp}>
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function AudioHealthCard({ flag }: { flag: AudioHealthFlag }) {
  const copy = AUDIO_HEALTH_COPY[flag];
  return (
    <div className="notice tone-warning" role="status" data-testid={`health-${flag}`}>
      <strong>{copy.title}</strong>
      <br />
      {copy.body}
    </div>
  );
}
