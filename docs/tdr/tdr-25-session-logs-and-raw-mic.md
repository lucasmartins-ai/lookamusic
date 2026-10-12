# TDR-25 — Registro de cada uso real e microfone sem filtros de fala

Date: 2026-10-11. Status: accepted.

## Contexto

"No seu teste funciona, mas quando vou fazer na prática não ficou legal." Os
benchmarks injetam áudio limpo no Chromium; o usuário canta no app desktop
(Tauri = **WebKit**), com microfone real, sala real e o processamento de voz do
navegador. Pedido explícito: "salvar os logs sempre que eu usar, pra você
acompanhar e irmos ajustando".

## Decisão

1. **Registro de diagnóstico** (`src/features/diagnostics/session-log.ts`,
   comando Rust `save_session_file`): um diretório por uso em
   `~/Library/Application Support/com.lookamusic.desktop/sessoes/<data_hora>/`
   com `meta.json` (config + configurações reais do microfone), `events.jsonl`,
   `observations.csv` (cada leitura: t, Hz, midi, confiança, RMS, fase),
   `notes.json`, `composition.json`/`chords.json` e `take.<ext>` (áudio da tomada
   via MediaRecorder do mesmo stream do detector). Ligado por padrão, aviso e
   botão na tela; só no app desktop; nunca sai do computador (PRIVACY.md).
   `scripts/analyze-session.mjs` reproduz o uso no benchmark a capela.
2. **Microfone sem filtros de fala no Cantarolar Primeiro**: `echoCancellation`
   e `noiseSuppression` eram `true` sempre. São filtros de videochamada (cortam
   notas sustentadas, tratam vibrato como ruído) e no macOS/WebKit acionam o
   Voice Processing da Apple, que também abaixa a saída do próprio app. Na
   captura a banda está muda — não há eco a cancelar. Modo ao vivo mantém.

## Verificação

Chromium com microfone falso (Frei Martinho): 35 notas, 0 fragmentos sem
filtros vs 34 + 1 fragmento com filtros (o efeito do Voice Processing da Apple
só aparece no WebKit/macOS real — é exatamente o que o registro vai medir).
`session-log.test.ts`: nomes de arquivo, desligado = nada gravado, disco cheio
nunca derruba o app.

## Limites

- Navegador (web) não grava registro (sem acesso ao disco); só o app desktop.
- O registro mede; os ajustes seguintes dependem dos usos reais registrados.
