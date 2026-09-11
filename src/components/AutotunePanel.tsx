"use client";

/**
 * AutotunePanel — Interactive pitch correction controls.
 * Pure rendering component (§44): controls autotune enabled state,
 * speed (natural / pop / hard), snap mode (chromatic vs song key),
 * correction depth amount, and headphone monitor volume.
 */
import type { AutotuneConfig, AutotuneSnapMode, AutotuneSpeed } from "@/domain/types";
import { LightningIcon, HeadphonesIcon } from "@/components/icons";

interface AutotunePanelProps {
  config: AutotuneConfig;
  onChange: (patch: Partial<AutotuneConfig>) => void;
  keyLabel?: string;
}

export function AutotunePanel({ config, onChange, keyLabel }: AutotunePanelProps) {
  const { enabled, speed, snapMode, amount, monitorVolume } = config;

  return (
    <section
      className="panel autotune-panel"
      aria-label="Controles de Autotune"
      data-testid="autotune-panel"
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
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <LightningIcon size={18} style={{ color: "var(--accent)" }} />
          <h2 style={{ fontSize: "14px", margin: 0, letterSpacing: "0.08em", fontWeight: 700 }}>
            AUTOTUNE & CORREÇÃO VOCAL
          </h2>
        </div>

        {/* Master Toggle */}
        <button
          className={enabled ? "primary" : "ghost"}
          onClick={() => onChange({ enabled: !enabled })}
          data-testid="autotune-toggle"
          style={{
            fontSize: "11px",
            padding: "4px 12px",
            fontWeight: 700,
            letterSpacing: "0.05em",
            borderRadius: "6px",
            background: enabled ? "#238636" : "transparent",
            color: enabled ? "#ffffff" : "#c9d1d9",
            borderColor: enabled ? "#2ea043" : "#30363d",
          }}
          aria-pressed={enabled}
        >
          {enabled ? "● AUTOTUNE ATIVO" : "○ AUTOTUNE DESLIGADO"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "14px",
          opacity: enabled ? 1 : 0.65,
          transition: "opacity 0.2s ease",
        }}
      >
        {/* Speed presets */}
        <div>
          <label
            style={{
              fontSize: "11px",
              color: "#8b949e",
              display: "block",
              marginBottom: "6px",
              fontWeight: 600,
            }}
          >
            VELOCIDADE DE CORREÇÃO:
          </label>
          <div style={{ display: "flex", gap: "6px" }} role="group" aria-label="Velocidade">
            {(
              [
                ["natural", "Natural (80ms)"],
                ["pop", "Pop (25ms)"],
                ["hard", "Robô / Hard (0ms)"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={speed === val ? "primary" : "ghost"}
                onClick={() => onChange({ speed: val as AutotuneSpeed })}
                data-testid={`autotune-speed-${val}`}
                style={{
                  fontSize: "10px",
                  padding: "4px 8px",
                  flex: 1,
                  background: speed === val ? "#1f6feb" : "transparent",
                  color: speed === val ? "#ffffff" : "#8b949e",
                  borderColor: speed === val ? "#388bfd" : "#30363d",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Snap mode */}
        <div>
          <label
            style={{
              fontSize: "11px",
              color: "#8b949e",
              display: "block",
              marginBottom: "6px",
              fontWeight: 600,
            }}
          >
            TRAVAMENTO DE ESCALA:
          </label>
          <div style={{ display: "flex", gap: "6px" }} role="group" aria-label="Escala">
            {(
              [
                ["chromatic", "Cromático (Todas as notas)"],
                ["key", keyLabel ? `Escala do Tom (${keyLabel})` : "Escala do Tom Atual"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={snapMode === val ? "primary" : "ghost"}
                onClick={() => onChange({ snapMode: val as AutotuneSnapMode })}
                data-testid={`autotune-snap-${val}`}
                style={{
                  fontSize: "10px",
                  padding: "4px 8px",
                  flex: 1,
                  background: snapMode === val ? "#1f6feb" : "transparent",
                  color: snapMode === val ? "#ffffff" : "#8b949e",
                  borderColor: snapMode === val ? "#388bfd" : "#30363d",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Intensity / Amount */}
        <div>
          <label
            style={{
              fontSize: "11px",
              color: "#8b949e",
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "6px",
              fontWeight: 600,
            }}
          >
            <span>INTENSIDADE:</span>
            <strong style={{ color: "#e6edf3" }}>{Math.round(amount * 100)}%</strong>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={amount}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) })}
            data-testid="autotune-amount-slider"
            style={{ width: "100%", accentColor: "#1f6feb" }}
            aria-label="Intensidade de correção"
          />
        </div>

        {/* Headphone Monitor Volume */}
        <div>
          <label
            style={{
              fontSize: "11px",
              color: "#8b949e",
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "6px",
              fontWeight: 600,
            }}
          >
            <span>RETORNO NOS FONES:</span>
            <strong style={{ color: monitorVolume > 0 ? "#22c55e" : "#8b949e" }}>
              {Math.round(monitorVolume * 100)}%
            </strong>
          </label>
          <input
            type="range"
            min="0"
            max="0.9"
            step="0.05"
            value={monitorVolume}
            onChange={(e) => onChange({ monitorVolume: parseFloat(e.target.value) })}
            data-testid="autotune-monitor-slider"
            style={{ width: "100%", accentColor: "#22c55e" }}
            aria-label="Volume de retorno do microfone"
          />
        </div>
      </div>

      {/* Headphone Safety Tip */}
      <div
        style={{
          marginTop: "12px",
          padding: "6px 10px",
          background: "rgba(56, 139, 253, 0.1)",
          border: "1px solid rgba(56, 139, 253, 0.2)",
          borderRadius: "4px",
          fontSize: "11px",
          color: "#8b949e",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <HeadphonesIcon size={16} style={{ color: "var(--accent)" }} />
        <span>
          <strong>Dica de Monitoramento:</strong> Use fones de ouvido para ouvir sua voz afinada em
          tempo real sem microfonia acústica com os alto-falantes.
        </span>
      </div>
    </section>
  );
}
