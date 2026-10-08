/**
 * SampleCredits — renders only. Attribution for every bundled recording
 * (TDR-22). Sources and processing: `scripts/fetch-sample-packs.mjs`.
 */
const CREDITS: { label: string; text: string; license: string; url: string }[] = [
  { label: "Piano", text: "Salamander Grand Piano V3 (Yamaha C5) por Alexander Holmberg", license: "CC-BY 3.0", url: "https://github.com/sfzinstruments/SalamanderGrandPiano" },
  { label: "Violão", text: "FreePats Spanish Classical Guitar", license: "CC0", url: "https://github.com/freepats/spanish-classical-guitar" },
  { label: "Bateria", text: "Virtuosity Drums por Versilian Studios & Karoryfer Samples", license: "CC0", url: "https://github.com/sfzinstruments/virtuosity_drums" },
  { label: "Contrabaixo", text: "D. Smolken Double Bass (Otto Rubner, 1958)", license: "royalty-free", url: "https://github.com/sfzinstruments/dsmolken.double-bass" },
  { label: "Violino e cordas", text: "VSCO-2 Community Edition por Versilian Studios", license: "CC0", url: "https://github.com/sgossner/VSCO-2-CE" },
];

export function SampleCredits() {
  return (
    <div data-testid="sample-credits" style={{ overflowWrap: "anywhere" }}>
      <h3>CRÉDITOS DE SOM</h3>
      <ul>
        {CREDITS.map((c) => (
          <li key={c.label}>
            <strong>{c.label}:</strong> {c.text} — licença <strong>{c.license}</strong>.{" "}
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.url.replace("https://", "")}
            </a>
          </li>
        ))}
      </ul>
      <p className="hint">
        Todos são gravações de instrumentos acústicos, reempacotadas em mp3 mono dentro do
        aplicativo — tocam offline, sem download. Nenhum som da banda é sintetizado.
      </p>
    </div>
  );
}
