/**
 * SamplePackPanel — renders only. Every decision lives in
 * `features/instruments/useSamplePacks.ts` + `sample-store.ts`.
 *
 * v1.3.3 (pedido do usuário: "quero que venha já instalado"): os áudios vêm
 * empacotados no app e carregam sozinhos. Não existe botão de download — só o
 * estado do carregamento, o liga/desliga real↔nativo e o crédito das fontes.
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
  loadedCount: number;
  onToggle: (id: SampleInstrumentId, v: boolean) => void;
}

export function SamplePackPanel({ packs, loadedCount, onToggle }: Props) {
  return (
    <div role="group" aria-label="Som real por samples">
      <p className="meta" data-testid="samples-summary">
        Já vem instalado: {loadedCount} de {packs.length} instrumentos em som gravado
        (piano, violão e bateria), carregados do próprio app — sem download.
        {loadedCount < packs.length
          ? " O resto continua no modelo nativo até terminar de carregar."
          : " Pronto."}
      </p>
      <div className="band-grid">
        {packs.map((p) => (
          <div key={p.instrument} className="channel" data-testid={`sample-${p.instrument}`}>
            <strong>{LABELS[p.instrument]}</strong>
            <span className="meta" data-testid={`sample-mode-${p.instrument}`}>
              {p.useReal ? "Som real" : "Sintetizador"} · {p.license} · {mb(p.bytesEstimate)}
            </span>
            {p.status === "loading" && (
              <span className="meta" role="status" data-testid={`sample-loading-${p.instrument}`}>
                CARREGANDO… {Math.round(p.progress * 100)}%
              </span>
            )}
            {p.status === "partial" && (
              <span className="meta" role="status" data-testid={`sample-partial-${p.instrument}`}>
                {p.missing} amostra(s) no modelo nativo
              </span>
            )}
            {p.status === "unavailable" && (
              <span className="meta" role="status" data-testid={`sample-unavailable-${p.instrument}`}>
                MODELO NATIVO (áudio gravado indisponível aqui)
              </span>
            )}
            {p.status === "ready" && (
              <span className="meta" role="status" data-testid={`sample-ready-${p.instrument}`}>
                Instalado — toca offline.
              </span>
            )}
            <label className="channel-slider">
              <span>{p.useReal ? "Real" : "Nativo"}</span>
              <input
                type="checkbox"
                checked={p.useReal}
                onChange={(e) => onToggle(p.instrument, e.target.checked)}
                aria-label={`Usar som real em ${LABELS[p.instrument]} (desligar = modelo nativo)`}
                data-testid={`sample-toggle-${p.instrument}`}
              />
            </label>
          </div>
        ))}
      </div>
      <p className="hint">
        Os packs são empacotados junto com o aplicativo (mesma origem) e carregam sozinhos
        na primeira abertura. Sem eles, a banda segue nos modelos nativos do engine.
      </p>
    </div>
  );
}
