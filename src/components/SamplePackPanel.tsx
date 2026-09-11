/**
 * SamplePackPanel — renders only (Phase 16). Every decision lives in
 * `features/instruments/useSamplePacks.ts` + `sample-store.ts`.
 * Toggle "Som real / Sintetizador" per instrument (default: real when the
 * pack exists), download progress, clear offline state.
 */
import type { PackState } from "@/features/instruments/useSamplePacks";
import type { SampleInstrumentId } from "@/features/instruments/sample-store";

const LABELS: Record<SampleInstrumentId, string> = {
  piano: "Piano",
  violao: "Violão",
  drums: "Bateria",
};

function mb(bytes: number): string {
  return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  packs: PackState[];
  online: boolean;
  onToggle: (id: SampleInstrumentId, v: boolean) => void;
  onDownload: (id: SampleInstrumentId) => void;
}

export function SamplePackPanel({ packs, online, onToggle, onDownload }: Props) {
  const ready = packs.filter((p) => p.status === "ready").length;
  return (
    <div role="group" aria-label="Som real por samples">
      <p className="meta" data-testid="samples-summary">
        Som real pronto em {ready} de {packs.length} instrumentos.
        {ready < packs.length
          ? " Os demais tocam no sintetizador procedural (o fallback nunca falha)."
          : " Tudo em som real."}
      </p>
      {!online && (
        <p className="meta" role="status" data-testid="samples-offline">
          Offline — os packs baixados continuam tocando; novos downloads precisam de conexão.
          Sem packs, a síntese procedural assume (som atual, sem silêncio).
        </p>
      )}
      <div className="band-grid">
        {packs.map((p) => (
          <div key={p.instrument} className="channel" data-testid={`sample-${p.instrument}`}>
            <strong>{LABELS[p.instrument]}</strong>
            <span className="meta" data-testid={`sample-mode-${p.instrument}`}>
              {p.useReal ? "Som real" : "Sintetizador"} · {p.license} · {mb(p.bytesEstimate)}
            </span>
            {p.status !== "ready" && p.status !== "downloading" && (
              <span
                className="meta"
                role="status"
                data-testid={`sample-missing-${p.instrument}`}
                title="Pack ainda não baixado — tocando o sintetizador procedural"
              >
                PACK NÃO BAIXADO — SYNTH
              </span>
            )}
            <label className="channel-slider">
              <span>{p.useReal ? "Real" : "Synth"}</span>
              <input
                type="checkbox"
                checked={p.useReal}
                onChange={(e) => onToggle(p.instrument, e.target.checked)}
                aria-label={`Usar som real em ${LABELS[p.instrument]} (desligar = sintetizador)`}
                data-testid={`sample-toggle-${p.instrument}`}
              />
            </label>
            {p.status !== "ready" ? (
              <button
                className="ghost"
                onClick={() => onDownload(p.instrument)}
                disabled={p.status === "downloading"}
                aria-label={`Baixar som real de ${LABELS[p.instrument]}`}
                data-testid={`sample-download-${p.instrument}`}
              >
                {p.status === "downloading"
                  ? `BAIXANDO… ${Math.round(p.progress * 100)}%`
                  : `BAIXAR SOM REAL (${mb(p.bytesEstimate)})`}
              </button>
            ) : (
              <span className="meta" role="status" data-testid={`sample-ready-${p.instrument}`}>
                Pack pronto{!online ? " (offline OK)" : ""}.
              </span>
            )}
            {p.status === "downloading" && (
              <progress value={p.progress} max={1} aria-label={`Progresso de ${LABELS[p.instrument]}`} />
            )}
            {p.error && (
              <span className="meta" role="alert">
                {p.error}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="hint">
        Download só com o seu toque (nunca automático). Falha de rede/decode nunca cala a
        banda: o sintetizador procedural assume na hora.
      </p>
    </div>
  );
}
