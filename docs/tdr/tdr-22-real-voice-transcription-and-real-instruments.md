# TDR-22 — Transcrição medida contra anotação humana e só instrumentos gravados

Date: 2026-10-08. Status: accepted. Revises TDR-17/18 (sound) and parts of TDR-21.

## Contexto

O usuário viu "Precisão 25–27%" na tela e concluiu que o app identifica mal as
notas; também relatou que o som "parece fake, sintetizado" e que a banda não
segue o ritmo. Pedido explícito: **só sons reais, nada sintetizado**.

## Medição

1. "Precisão" era o Vocal Coach: % de quadros a ±12¢ de uma nota de A440 — mede
   a afinação do cantor, não o app (cantando sem referência a média esperada é
   24/100). Rótulo renomeado para "Sua afinação (±12¢)" com explicação.
2. Benchmark real de transcrição: **Vocadito** (CC BY 4.0, 40 trechos de canto
   solo com f0 e notas anotadas por músicos), `tests/bench/transcription.test.ts`
   (opt-in `VOCADITO_DIR`). Resultado do pipeline v1.3.5:
   - detector YIN: **95,1%** dos quadros a ±50¢ do f0 anotado (o detector ouve bem);
   - notas (início ±50 ms + altura ±50¢): F = **9%**; onsets ±100 ms: F = **24%**;
   - nota certa ao longo do tempo: **48,5%**.
   As notas anotadas têm mediana de 145 ms; o pipeline (blocos de 43 ms sem
   sobreposição, mediana de 5 blocos, 120 ms de estabilidade + 80–170 ms de
   confirmação) não via notas < ~200 ms.

## Decisão — transcrição

- Janela de 2048 deslizando a cada **512 amostras** (`audio.hopSize`, ~11 ms).
- Função diferença do YIN por **FFT** (mesmo resultado, 5,04 → 0,24 ms por
  análise): cabe na thread de áudio a 4× a taxa (antes já excedia o quantum).
  Interpolação parabólica corrigida (aplicava metade da correção).
- Estabilizador: mediana 3, estabilidade 40 ms, confirmação 30/40 ms, oitava
  100 ms, release extra 60 ms (adaptativo 60/40).
- Worklet e `YinDetector` com paridade testada (`pitch-worklet-parity.test.ts`).

Resultado Vocadito: onsets **24,1 → 73,9%**, notas **9,0 → 44,0%**, nota certa
no tempo **48,5 → 74,3%**. App real (Singin', microfone falso): notas captadas em
40 s 49 → 112.

## Decisão — harmonia ao vivo (ajuste por causa da transcrição mais fina)

Mais notas → andamento detectado maior → meio compasso virava troca de acorde a
cada ~1,5 s (37/min). `harmonySlotsPerBar` 2 → 1 e piso de evidência
`minEvidenceSec` 2,5 s; no tom menor o bônus de acorde principal vale para V
maior/V7, não para o v natural. Benchmark a capela (choque de meio-tom, média
das 4 situações) 17,5% → 17,7% — empate dentro do ruído; Cantarolar Primeiro
Twinkle 15,9 → 13,0%.

## Decisão — só som gravado

- Bateria: FreePats "Synthesizer Percussion" (gravação de sintetizador) →
  **Virtuosity Drums** (CC0): kit acústico, mix kick+snare+overhead+sala,
  3 intensidades × 2 variações por peça.
- Piano: cópia tonejs 1 camada → **Salamander V3 original**, 2 camadas (v6/v12).
- Novos: **contrabaixo** (D. Smolken, royalty-free), **violino solo** e
  **cordas** (VSCO-2 CE, CC0). Ganho por pack calibrado (picos ≈ −3 dBFS).
- Batidas de bateria tocam pela duração gravada (a receita do sintetizador
  cortava o bumbo em 0,14 s e o chimbal em 0,05 s).
- `samples.synthFallback = false`: sem sample pronto → silêncio; instrumento sem
  pack → `SilentSink`, botão desativado (guitarra, sax, acordeão). Export WAV e
  player do Cantarolar Primeiro usam os mesmos sinks com samples.
- Bundle de áudio 4,3 → ~11,8 MB (248 arquivos).

## Limites

- Vocadito e as duas gravações a capela são canto de outras pessoas; a voz do
  usuário pode diferir. O teto da transcrição (nota no tempo ~74%) inclui
  deslizes e ornamentos que anotadores separam em notas.
- Modo ao vivo continua ~3–8 pontos acima do oráculo harmônico.
- Sem gravação livre de guitarra de aço/elétrica, sax e acordeão.
