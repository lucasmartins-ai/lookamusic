"use client";

/**
 * VocalCoachPanel — Visual intonation gauge & pedagogic singing feedback.
 * Pure rendering component (§44): receives feedback and renders the needle,
 * cents offset (-50¢ to +50¢), target note, instructional advice and singing accuracy.
 */
import { useMemo } from "react";
import type { KeyEstimate, PitchObservation, VocalCoachFeedback } from "@/domain/types";
import { VocalPitchCoach } from "@/features/pitch/coach";

interface VocalCoachPanelProps {
  observation: PitchObservation | null;
  keyEstimate?: KeyEstimate | null;
  coach: VocalPitchCoach;
  onResetStats?: () => void;
}

export function VocalCoachPanel({
  observation,
  keyEstimate,
  coach,
  onResetStats,
}: VocalCoachPanelProps) {
  const feedback: VocalCoachFeedback = useMemo(() => {
    if (!observation) {
      return coach.evaluate(
        { frequency: -1, midiNote: -1, confidence: 0, clarity: 0, timestamp: 0 },
        keyEstimate,
      );
    }
    return coach.evaluate(observation, keyEstimate);
  }, [coach, observation, keyEstimate]);

  const { state, cents, targetNote, targetFreq, message, inTune, accuracyScore, streakMs } =
    feedback;

  // Clamp cents between -50 and +50 for visual gauge
  const clampedCents = Math.max(-50, Math.min(50, cents));
  // Needle position from 0% to 100% (0 cents = 50%)
  const needlePercent = ((clampedCents + 50) / 100) * 100;

  let gaugeColor = "#5d6370"; // unvoiced / neutral gray
  let statusBadge = "AGUARDANDO VOZ";
  if (state === "in-tune") {
    gaugeColor = "#22c55e"; // green
    statusBadge = "AFINADO";
  } else if (state === "out-of-key") {
    gaugeColor = "#eab308"; // yellow/amber
    statusBadge = "FORA DO TOM";
  } else if (state === "flat") {
    gaugeColor = "#f59e0b"; // amber
    statusBadge = "BEMOL (BAIXO)";
  } else if (state === "sharp") {
    gaugeColor = "#f43f5e"; // rose/coral
    statusBadge = "SUSTENIDO (ALTO)";
  } else if (state === "unclear") {
    gaugeColor = "#a855f7"; // purple
    statusBadge = "INSTÁVEL";
  }

  return (
    <section
      className="panel vocal-coach-panel"
      aria-label="Vocal Coach e Afinador"
      data-testid="vocal-coach-panel"
      style={{
        background: "rgba(22, 27, 34, 0.75)",
        backdropFilter: "blur(10px)",
        border: "1px solid #30363d",
        borderRadius: "8px",
        padding: "16px",
        margin: "12px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px" }}>🎤</span>
          <h2 style={{ fontSize: "14px", margin: 0, letterSpacing: "0.08em", fontWeight: 700 }}>
            VOCAL COACH & AFINADOR
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: gaugeColor,
              color: "#0d1117",
              fontWeight: 800,
              letterSpacing: "0.05em",
            }}
            data-testid="coach-status-badge"
          >
            {statusBadge}
          </span>
          <span
            style={{
              fontSize: "11px",
              color: "#8b949e",
              fontWeight: 600,
            }}
          >
            Precisão: <strong style={{ color: "#e6edf3" }}>{accuracyScore}%</strong>
          </span>
          {onResetStats && (
            <button
              onClick={onResetStats}
              className="ghost"
              style={{ fontSize: "10px", padding: "1px 6px", minHeight: "auto" }}
              title="Zerar estatísticas da sessão"
            >
              Zerar
            </button>
          )}
        </div>
      </div>

      {/* Target note and frequency readout */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            fontSize: "36px",
            fontWeight: 800,
            fontFamily: "ui-monospace, monospace",
            color: inTune ? "#22c55e" : "#f0f6fc",
            minWidth: "70px",
            textAlign: "center",
            textShadow: inTune ? "0 0 12px rgba(34, 197, 94, 0.4)" : "none",
            transition: "color 0.15s ease",
          }}
          data-testid="coach-target-note"
        >
          {targetNote}
        </div>
        <div style={{ fontSize: "12px", color: "#8b949e", fontFamily: "ui-monospace, monospace" }}>
          {targetFreq > 0 ? `${targetFreq.toFixed(1)} Hz` : "—"}
          {cents !== 0 && (
            <span
              style={{
                marginLeft: "8px",
                color: inTune ? "#22c55e" : gaugeColor,
                fontWeight: 700,
              }}
            >
              ({cents > 0 ? "+" : ""}
              {cents}¢)
            </span>
          )}
        </div>
      </div>

      {/* Cents Intonation Gauge */}
      <div style={{ position: "relative", margin: "0 auto 16px", maxWidth: "480px" }}>
        {/* Scale labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "10px",
            color: "#6e7681",
            fontFamily: "ui-monospace, monospace",
            marginBottom: "4px",
          }}
        >
          <span>♭ -50¢</span>
          <span>-25¢</span>
          <span style={{ color: "#22c55e", fontWeight: 700 }}>0¢ (PERFEITO)</span>
          <span>+25¢</span>
          <span>+50¢ ♯</span>
        </div>

        {/* Gauge Track */}
        <div
          style={{
            height: "14px",
            background: "#161b22",
            borderRadius: "7px",
            position: "relative",
            overflow: "hidden",
            border: "1px solid #30363d",
          }}
        >
          {/* In-tune sweet spot (center +-12 cents = 38% to 62%) */}
          <div
            style={{
              position: "absolute",
              left: "38%",
              width: "24%",
              height: "100%",
              background: "rgba(34, 197, 94, 0.25)",
              borderLeft: "1px dashed rgba(34, 197, 94, 0.5)",
              borderRight: "1px dashed rgba(34, 197, 94, 0.5)",
            }}
          />

          {/* Center line marker */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: "2px",
              background: "#22c55e",
              transform: "translateX(-50%)",
            }}
          />

          {/* Dynamic Needle */}
          {state !== "silent" && (
            <div
              style={{
                position: "absolute",
                left: `${needlePercent}%`,
                top: 0,
                bottom: 0,
                width: "4px",
                background: gaugeColor,
                borderRadius: "2px",
                transform: "translateX(-50%)",
                boxShadow: `0 0 8px ${gaugeColor}`,
                transition: "left 0.08s ease-out, background-color 0.15s ease",
              }}
              data-testid="coach-needle"
            />
          )}
        </div>
      </div>

      {/* Pedagogic Guidance Message */}
      <div
        role="status"
        aria-live="polite"
        style={{
          background: "rgba(13, 17, 23, 0.6)",
          padding: "10px 14px",
          borderRadius: "6px",
          fontSize: "12px",
          color: "#e6edf3",
          borderLeft: `4px solid ${gaugeColor}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
        }}
        data-testid="coach-advice"
      >
        <span>💡 {message}</span>
        {streakMs >= 1000 && (
          <span
            style={{
              fontSize: "11px",
              color: "#22c55e",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            🔥 {(streakMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </section>
  );
}
