/**
 * SampleCredits — renders only (Phase 16). CC-BY attribution screen:
 * Salamander Grand Piano + Drumkit (Alexander Holmberg) + FreePats guitar.
 */
export function SampleCredits() {
  return (
    <div data-testid="sample-credits">
      <h3>CRÉDITOS DE SOM</h3>
      <ul>
        <li>
          <strong>Piano:</strong> Salamander Grand Piano (Yamaha C5) por Alexander Holmberg —
          licença <strong>CC-BY 3.0</strong>. Fonte:{" "}
          <a href="https://tambien.github.io/Piano/Salamander/" target="_blank" rel="noreferrer">
            tambien.github.io/Piano/Salamander
          </a>{" "}
          · original em{" "}
          <a href="http://freepats.zenvoid.org/Piano/salamander-grand-piano.html" target="_blank" rel="noreferrer">
            freepats.zenvoid.org
          </a>
          .
        </li>
        <li>
          <strong>Violão:</strong> FreePats Spanish Classical Guitar — domínio público{" "}
          <strong>CC0</strong>. Fonte:{" "}
          <a href="https://github.com/freepats/spanish-classical-guitar" target="_blank" rel="noreferrer">
            github.com/freepats/spanish-classical-guitar
          </a>
          .
        </li>
        <li>
          <strong>Bateria:</strong> Salamander Drumkit por Alexander Holmberg — licença{" "}
          <strong>CC-BY-SA 3.0</strong> (pack opcional em runtime, nunca no bundle). Fonte:{" "}
          <a href="https://archive.org/details/SalamanderDrumkit" target="_blank" rel="noreferrer">
            archive.org/details/SalamanderDrumkit
          </a>
          .
        </li>
      </ul>
      <p className="hint">
        Guitarra elétrica/aço segue 100% sintetizada nesta fase (sem pack com licença
        compatível). Todo o resto do som sem packs é síntese procedural própria (MIT).
      </p>
    </div>
  );
}
