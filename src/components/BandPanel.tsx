/**
 * BandPanel — ACTIVE BAND controls (Phase 6). Renders only: every instrument
 * row is audition (preview) + mute/solo/volume/pan, all real engine params.
 * Business logic lives in `features/instruments/useBand.ts`.
 */
import { INSTRUMENTS, type InstrumentId } from "@/domain/types";
import type { MixerState } from "@/features/instruments/mixer";

const LABELS: Record<InstrumentId, string> = {
  drums: "Bateria",
  bass: "Baixo",
  piano: "Piano",
  guitar: "Guitarra",
  violao: "Violão",
  strings: "Cordas",
  violin: "Violino",
  sax: "Sax",
  accordion: "Acordeão",
};

interface BandPanelProps {
  mixer: MixerState;
  auditioning: InstrumentId | null;
  lateTotal: number;
  onAudition: (id: InstrumentId) => void;
  onToggleMute: (id: InstrumentId) => void;
  onToggleSolo: (id: InstrumentId) => void;
  onVolume: (id: InstrumentId, v: number) => void;
  onPan: (id: InstrumentId, p: number) => void;
  onStop: () => void;
}

export function BandPanel({
  mixer,
  auditioning,
  lateTotal,
  onAudition,
  onToggleMute,
  onToggleSolo,
  onVolume,
  onPan,
  onStop,
}: BandPanelProps) {
  return (
    <div>
      <div className="band-grid" role="group" aria-label="Active band instruments">
        {INSTRUMENTS.map((id) => {
          const ch = mixer[id];
          const live = auditioning === id;
          return (
            <div key={id} className={`channel${live ? " live" : ""}${ch.muted ? " muted" : ""}`}>
              <button
                className="channel-name"
                onClick={() => onAudition(id)}
                aria-label={`Ouvir ${LABELS[id]} (prévia de 2 compassos)`}
                title="Prévia de 2 compassos (C→G no andamento atual)"
              >
                {live ? "♪ " : ""}
                {LABELS[id]}
              </button>
              <div className="channel-toggles">
                <button
                  className={ch.muted ? "on" : ""}
                  onClick={() => onToggleMute(id)}
                  aria-pressed={ch.muted}
                  aria-label={`${ch.muted ? "Desmutar" : "Mutar"} ${LABELS[id]}`}
                  title={ch.muted ? "Desmutar" : "Mutar"}
                >
                  M
                </button>
                <button
                  className={ch.solo ? "on" : ""}
                  onClick={() => onToggleSolo(id)}
                  aria-pressed={ch.solo}
                  aria-label={`${ch.solo ? "Tirar solo de" : "Solar"} ${LABELS[id]}`}
                  title={ch.solo ? "Tirar solo" : "Solo"}
                >
                  S
                </button>
              </div>
              <label className="channel-slider">
                <span>Vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ch.volume}
                  onChange={(e) => onVolume(id, Number(e.target.value))}
                  aria-label={`Volume de ${LABELS[id]}`}
                />
              </label>
              <label className="channel-slider">
                <span>Pan</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={ch.pan}
                  onChange={(e) => onPan(id, Number(e.target.value))}
                  aria-label={`Pan de ${LABELS[id]}`}
                />
              </label>
            </div>
          );
        })}
      </div>
      <div className="controls">
        <button className="ghost" onClick={onStop} aria-label="Parar prévia">
          ■ PARAR PRÉVIA
        </button>
        {lateTotal > 0 && (
          <span className="late-note" role="status">
            {lateTotal} evento{lateTotal === 1 ? "" : "s"} atrasado{lateTotal === 1 ? "" : "s"} descartado
            {lateTotal === 1 ? "" : "s"} (jitter guard)
          </span>
        )}
      </div>
      <p className="hint">
        Toque no nome para ouvir a prévia. Sax entra com energia média ou mais; violino dobra a
        melodia nos inícios de frase (regente chega na Fase 8).
      </p>
    </div>
  );
}
