"use client";

/**
 * LearnPanel — contextual educational panel ("O que acabou de acontecer?" / "What just happened?")
 * Phase 13 (§4) & Quality Hardening. Pure presentation component — renders explanations
 * generated from structured MusicalState with debounced phrase stabilization,
 * screen reader verbosity control, and full i18n (pt-BR / en-US).
 */

import Link from "next/link";
import type { MusicalState } from "@/domain/types";
import type { LearnLevel, SupportedLocale } from "@/features/learn/types";
import { getLearnLevels, UI_I18N } from "@/features/learn/i18n";
import { useContextualExplanation } from "@/features/learn/useContextualExplanation";

export interface LearnPanelProps {
  musicalState: MusicalState;
  level: LearnLevel;
  onSelectLevel: (lvl: LearnLevel) => void;
  onClose?: () => void;
  locale?: SupportedLocale;
  onSelectLocale?: (loc: SupportedLocale) => void;
  screenReaderAnnounce?: boolean;
  onToggleScreenReader?: () => void;
}

export function LearnPanel({
  musicalState,
  level,
  onSelectLevel,
  onClose,
  locale = "pt-BR",
  onSelectLocale,
  screenReaderAnnounce = false,
  onToggleScreenReader,
}: LearnPanelProps) {
  // Phase 13 Hardening (Risk 1): Stabilizes fast melodic passages (< 150 ms per note)
  // via phrase retention, updating immediately on user level/locale switch.
  const explanation = useContextualExplanation(musicalState, level, locale);

  const ui = UI_I18N[locale] ?? UI_I18N["pt-BR"];
  const levels = getLearnLevels(locale);

  return (
    <section
      className="panel learn-panel"
      aria-label={ui.headerTitle}
      data-testid="learn-panel"
      role="region"
    >
      <div
        className="learn-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ display: "inline-flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <span>🎓</span> {ui.headerTitle}
          </h2>
          <p className="hint" style={{ margin: "2px 0 0 0" }}>
            {ui.headerSubtitle}
          </p>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Phase 13 Hardening (Risk 3): Screen reader verbosity control */}
          <button
            className="ghost"
            onClick={onToggleScreenReader}
            aria-pressed={screenReaderAnnounce}
            aria-label={ui.screenReaderTooltip}
            title={ui.screenReaderTooltip}
            data-testid="btn-learn-screen-reader"
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              color: screenReaderAnnounce ? "var(--accent)" : "var(--muted)",
              border: screenReaderAnnounce ? "1px solid var(--accent)" : "1px solid var(--line)",
            }}
          >
            {screenReaderAnnounce ? ui.screenReaderActive : ui.screenReaderSilent}
          </button>

          {/* Phase 15 (Risk 2): Language switcher (pt-BR / en-US) */}
          <button
            className="ghost"
            onClick={() => onSelectLocale?.(locale === "pt-BR" ? "en-US" : "pt-BR")}
            aria-label="Alternar idioma / Switch language"
            title="Alternar idioma / Switch language"
            data-testid="btn-learn-locale"
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            {locale === "pt-BR" ? "🌐 EN" : "🌐 PT"}
          </button>

          <Link
            href="/learn"
            className="ghost"
            style={{ fontSize: "11px", textDecoration: "none", padding: "4px 8px" }}
            data-testid="link-learn-studio"
          >
            {ui.fullTrack}
          </Link>

          {onClose && (
            <button
              className="ghost"
              onClick={onClose}
              aria-label={ui.close}
              style={{ fontSize: "11px", padding: "4px 8px" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Progressive Level Selector */}
      <div
        className="level-selector"
        role="tablist"
        aria-label={ui.levelsTablistLabel}
        style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}
      >
        {levels.map((lvl) => {
          const isSelected = lvl.id === level;
          return (
            <button
              key={lvl.id}
              role="tab"
              aria-selected={isSelected}
              data-testid={`level-${lvl.id}`}
              onClick={() => onSelectLevel(lvl.id)}
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "16px",
                border: isSelected ? "1px solid var(--accent)" : "1px solid var(--line)",
                background: isSelected ? "var(--accent-dim)" : "var(--panel-2)",
                color: isSelected ? "#fff" : "var(--muted)",
                cursor: "pointer",
                fontWeight: isSelected ? 600 : 400,
                transition: "all 0.15s ease",
              }}
              title={lvl.shortDescription}
            >
              {lvl.order}. {lvl.title}
            </button>
          );
        })}
      </div>

      {/* Primary Educational Card */}
      {/* Phase 13 Hardening (Risk 3): aria-live toggles between "polite" and "off" */}
      <div
        className="learn-primary-card"
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "12px",
        }}
        aria-live={screenReaderAnnounce ? "polite" : "off"}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
          <strong style={{ color: "var(--accent)", fontSize: "15px" }} data-testid="learn-primary-title">
            {explanation.primary.title}
          </strong>
          {explanation.primary.technicalDetails && (
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: "11px",
                color: "var(--faint)",
              }}
              data-testid="learn-technical-badge"
            >
              {explanation.primary.technicalDetails}
            </span>
          )}
        </div>

        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.5,
            color: "var(--text)",
            margin: "0 0 8px 0",
            fontWeight: 500,
          }}
          data-testid="learn-primary-summary"
        >
          {explanation.primary.summary}
        </p>

        {explanation.primary.details && (
          <p
            style={{
              fontSize: "12px",
              lineHeight: 1.5,
              color: "var(--muted)",
              margin: 0,
            }}
            data-testid="learn-primary-details"
          >
            {explanation.primary.details}
          </p>
        )}
      </div>

      {/* Secondary Insights */}
      {explanation.secondary.length > 0 && (
        <div
          className="learn-secondary-cards"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "8px",
          }}
        >
          {explanation.secondary.slice(0, 3).map((item, idx) => (
            <div
              key={idx}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
                {item.title}
              </div>
              <div style={{ color: "var(--text)", fontSize: "11px", lineHeight: 1.4 }}>
                {item.summary}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
