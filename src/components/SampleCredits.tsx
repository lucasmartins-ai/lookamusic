/**
 * SampleCredits — renders only (Phase 16 / v1.3.3). Attribution screen:
 * Salamander Grand Piano (Alexander Holmberg, CC-BY-3.0) + FreePats
 * Spanish Classical Guitar and Synthesizer Percussion (CC0).
 * Desde a v1.3.3 os áudios vêm EMPACOTADOS com o app (mesma origem), então o
 * texto fala de origem/proveniência, não de download.
 */
export function SampleCredits() {
  return (
    <div data-testid="sample-credits">
      <h3>CRÉDITOS DE SOM</h3>
      <ul>
        <li>
          <strong>Piano:</strong> Salamander Grand Piano (Yamaha C5) por Alexander Holmberg —
          licença <strong>CC-BY 3.0</strong>. Original em{" "}
          <a href="http://freepats.zenvoid.org/Piano/salamander-grand-piano.html" target="_blank" rel="noreferrer">
            freepats.zenvoid.org
          </a>{" "}
          · cópia de trabalho em{" "}
          <a href="https://tonejs.github.io/audio/salamander/" target="_blank" rel="noreferrer">
            tonejs.github.io/audio/salamander
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
          <strong>CC0</strong>. Fonte:{" "}
          <a href="https://github.com/freepats/synthesizer-percussion" target="_blank" rel="noreferrer">
            github.com/freepats/synthesizer-percussion
          </a>
          .
        </li>
      </ul>
      <p className="hint">
        Os áudios acima viajam <strong>dentro do aplicativo</strong> (reempacotados em mp3 mono,
        ver <code>scripts/fetch-sample-packs.mjs</code>) e tocam offline, sem download nenhum.
        Quando um áudio ainda não está decodificado, o piano/violão/bateria soam pelos{" "}
        <strong>modelos nativos</strong> do engine — bancos de parciais aditivos próprios (MIT).
        Guitarra elétrica/aço segue 100% nativa (sem pack com licença compatível).
      </p>
    </div>
  );
}
