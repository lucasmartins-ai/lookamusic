/**
 * SamplePackPanel — renders only. Every decision lives in
 * `features/instruments/useSamplePacks.ts` + `sample-store.ts`.
 *
 * TDR-22 ("só sons reais, nada sintetizado"): every audible instrument is a
 * recording bundled with the app. There is no real↔synth switch anymore —
 * just the load state and the credits.
 */
import type { PackState } from "@/features/instruments/useSamplePacks";
import type { SampleInstrumentId } from "@/features/instruments/sample-store";

export const SAMPLE_LABELS: Record<SampleInstrumentId, string> = {
  piano: "Piano",
  violao: "Violão",
  drums: "Bateria",
  bass: "Contrabaixo",
  violin: "Violino",
  strings: "Cordas",
};

function mb(bytes: number): string {
  return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  packs: PackState[];
  loadedCount: number;
}

export function SamplePackPanel({ packs, loadedCount }: Props) {
  return (
    <div role="group" aria-label="Som real por samples">
      <p className="meta" data-testid="samples-summary">
        Só instrumentos gravados de verdade: {loadedCount} de {packs.length} prontos, carregados do
        próprio app — sem download e sem sintetizador.
        {loadedCount < packs.length ? " Enquanto um carrega, ele fica em silêncio." : " Pronto."}
      </p>
      <div className="band-grid">
        {packs.map((p) => (
          <div key={p.instrument} className="channel" data-testid={`sample-${p.instrument}`}>
            <strong>{SAMPLE_LABELS[p.instrument]}</strong>
            <span className="meta" data-testid={`sample-mode-${p.instrument}`}>
              Som real · {p.license} · {mb(p.bytesEstimate)}
            </span>
            {p.status === "loading" && (
              <span className="meta" role="status" data-testid={`sample-loading-${p.instrument}`}>
                CARREGANDO… {Math.round(p.progress * 100)}%
              </span>
            )}
            {p.status === "partial" && (
              <span className="meta" role="status" data-testid={`sample-partial-${p.instrument}`}>
                {p.missing} amostra(s) não carregaram (essas notas ficam em silêncio)
              </span>
            )}
            {p.status === "unavailable" && (
              <span className="meta" role="status" data-testid={`sample-unavailable-${p.instrument}`}>
                Áudio gravado indisponível aqui — instrumento em silêncio
              </span>
            )}
            {p.status === "ready" && (
              <span className="meta" role="status" data-testid={`sample-ready-${p.instrument}`}>
                Instalado — toca offline.
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="hint">
        Guitarra elétrica, sax e acordeão ficam indisponíveis: não há gravações livres com
        qualidade para redistribuir, e o app não toca nada sintetizado.
      </p>
    </div>
  );
}
