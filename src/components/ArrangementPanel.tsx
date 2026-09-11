/**
 * ArrangementPanel — adaptive-band controls (Phase 7). Renders only:
 * style preset + energy mode + lineup toggles + visible pending queue.
 * Business logic lives in `features/music/arrangement/useArrangement.ts`.
 */
import { INSTRUMENTS, type ArrangementState, type InstrumentId } from "@/domain/types";
import type { PendingTransition } from "@/features/music/arrangement/state";
import type { EnergyLevel } from "@/features/music/arrangement/dynamics";
import type { EnergyMode } from "@/features/music/arrangement/useArrangement";
import type { MusicalStyle } from "@/features/music/arrangement/presets";

const LABELS: Record<InstrumentId, string> = {
  drums: "Bateria",
  bass: "Baixo",
  piano: "Piano",
  guitar: "Violão",
  strings: "Cordas",
  violin: "Violino",
  sax: "Sax",
  accordion: "Acordeão",
};

const ENERGY_LABELS: Record<EnergyMode, string> = {
  auto: "Automática (voz)",
  low: "Suave",
  medium: "Média",
  high: "Cheia",
};

interface ArrangementPanelProps {
  styles: MusicalStyle[];
  styleId: string;
  energyMode: EnergyMode;
  energy01: number;
  energyLevel: EnergyLevel;
  arrangement: ArrangementState;
  pending: PendingTransition[];
  currentBar: number;
  lastFadeSec: number | null;
  targetDensity: number;
  onStyle: (id: string) => void;
  onEnergyMode: (mode: EnergyMode) => void;
  onToggleInstrument: (id: InstrumentId) => void;
}

export function ArrangementPanel({
  styles,
  styleId,
  energyMode,
  energy01,
  energyLevel,
  arrangement,
  pending,
  currentBar,
  lastFadeSec,
  targetDensity,
  onStyle,
  onEnergyMode,
  onToggleInstrument,
}: ArrangementPanelProps) {
  const activeCount = INSTRUMENTS.filter((id) => arrangement.active[id]).length;
  const queuedFor = (id: InstrumentId) => pending.find((p) => p.instrument === id) ?? null;
  const pct = Math.round(energy01 * 100);

  return (
    <div>
      <div className="controls">
        <div className="control-field">
          <label htmlFor="arr-style">STYLE</label>
          <select
            id="arr-style"
            value={styleId}
            onChange={(e) => onStyle(e.target.value)}
            aria-label="Estilo de arranjo"
          >
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="control-field">
          <label htmlFor="arr-energy">ENERGY</label>
          <select
            id="arr-energy"
            value={energyMode}
            onChange={(e) => onEnergyMode(e.target.value as EnergyMode)}
            aria-label="Energia do arranjo"
          >
            {(Object.keys(ENERGY_LABELS) as EnergyMode[]).map((m) => (
              <option key={m} value={m}>
                {ENERGY_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div
          className="control-field"
          role="meter"
          aria-label={`Energia da voz ${pct}% nível ${energyLevel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <label>
            VOZ {pct}% · {energyLevel.toUpperCase()}
          </label>
          <div className="energy-bar" aria-hidden>
            <div className="energy-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="band-grid" role="group" aria-label="Arranjo: instrumentos na banda">
        {INSTRUMENTS.map((id) => {
          const on = arrangement.active[id];
          const q = queuedFor(id);
          return (
            <button
              key={id}
              className={`pill${on ? " live" : ""}${q ? " queued" : ""}`}
              onClick={() => onToggleInstrument(id)}
              aria-pressed={on}
              aria-label={`${on ? "Remover" : "Adicionar"} ${LABELS[id]}${q ? ` (entra no compasso ${q.effectiveBar + 1})` : ""}`}
              title={
                q
                  ? `${q.action === "add" ? "Entra" : "Sai"} no compasso ${q.effectiveBar + 1} (fade ${q.fadeSec.toFixed(2)}s)`
                  : on
                    ? "Na banda — clique para remover na próxima fronteira"
                    : "Fora — clique para adicionar na próxima fronteira"
              }
            >
              {on ? "♪ " : "+ "}
              {LABELS[id]}
              {q ? ` ⏳${q.effectiveBar + 1}` : ""}
            </button>
          );
        })}
      </div>

      <p className="hint" role="status">
        {pending.length === 0 ? (
          <>
            {activeCount}/{INSTRUMENTS.length} na banda · compasso {Math.floor(currentBar) + 1}
            {lastFadeSec !== null ? ` · último fade ${lastFadeSec.toFixed(2)}s` : ""} ·
            densidade alvo {targetDensity.toFixed(2)}
          </>
        ) : (
          <>
            {pending.length} mudança{pending.length === 1 ? "" : "s"} na fila →{" "}
            {pending
              .map(
                (p) =>
                  `${LABELS[p.instrument]} ${p.action === "add" ? "entra" : "sai"} no compasso ${p.effectiveBar + 1}`,
              )
              .join(" · ")}
          </>
        )}
      </p>
    </div>
  );
}
