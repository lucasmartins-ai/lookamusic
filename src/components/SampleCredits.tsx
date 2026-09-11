/**
 * SampleCredits — renders only (Phase 16/17). Attribution screen:
 * Salamander Grand Piano (Alexander Holmberg, CC-BY-3.0) + FreePats
 * Spanish Classical Guitar and Synthesizer Percussion (CC0).
 */
export function SampleCredits() {
  return (
    <div data-testid="sample-credits">
      <h3>CRÉDITOS DE SOM</h3>
      <ul>
        <li>
          <strong>Piano:</strong> Salamander Grand Piano (Yamaha C5) por Alexander Holmberg —
          licença <strong>CC-BY 3.0</strong>. Áudio servido por{" "}
          <a href="https://tonejs.github.io/audio/salamander/" target="_blank" rel="noreferrer">
            tonejs.github.io/audio/salamander
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
          <strong>Bateria:</strong> FreePats Synthesizer Percussion — domínio público{" "}
          <strong>CC0</strong> (pack opcional em runtime, nunca no bundle). Fonte:{" "}
          <a href="https://github.com/freepats/synthesizer-percussion" target="_blank" rel="noreferrer">
            github.com/freepats/synthesizer-percussion
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
