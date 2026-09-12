# TDR-17 — Packs de som real EMPACOTADOS no app (substitui o download opt-in)

Date: 2026-09-12. Status: accepted. Revê: TDR-16 (item 6 e a seção
"Alternativas consideradas", onde "embutir samples no bundle" foi rejeitado).

## Contexto

O TDR-16 optou por **packs remotos sob consentimento** ("BAIXAR SOM REAL").
Na prática o usuário relatou que o fluxo **não funciona** ("não tá funcionando
isso de clicar em baixar") e pediu explicitamente: **"quero que venha já
instalado"**. Um download que falha (webview/CORS/Cache API/rede) deixa a
melhor sonoridade atrás de um botão que não resolve — o pior dos mundos.

## Decisão

1. **Os áudios vivem no app**: `public/samples/{piano,violao,drums}/*.mp3`,
   servidos na **mesma origem** do app web/PWA e do instalador Tauri. Nada de
   CORS, nada de Cache API obrigatória, nada de rede.
2. **Sem botão, sem consentimento, sem estado offline.** O
   `useSamplePacks` decodifica os packs **automaticamente** no mount
   (`loadPack`, ex-`downloadPack`) e o painel `/session → SOM REAL` virou
   somente leitura + liga/desliga real↔nativo + créditos. O banner de sugestão
   pós-microfone e suas funções (`shouldSuggestSamples`,
   `dismissSamplesSuggestion`, `promptStorageKey`) foram **removidos**.
3. **Formato normalizado no empacotamento** (`scripts/fetch-sample-packs.mjs`,
   executável e versionado para auditoria de proveniência): FLAC lossless em
   Mono mp3 128 kbps, **4 s com fade** de saída. Motivo: um pack empacotado
   vive como PCM decodificado em memória (sampleRate × canais × 4 B/s); a
   cauda original do piano tinha 16 s (~5,6 MB de RAM por nota, ~170 MB nos 30
   samples). Com 4 s mono, os 87 arquivos decodificam em ~47 MB e o bundle
   inteiro fica em **~4,3 MB**.
4. **Nomes locais sem `#`.** Sustenidos viram `s` (`Cs2.mp3`) — `#` em URL é
   fragmento e truncava o caminho (a causa real dos 404 do pack remoto).
5. **Fallback em duas camadas, na ordem certa:** o engine toca o **modelo
   nativo** (TDR-18, parciais aditivos) enquanto o buffer não está pronto ou
   quando o webview não decodifica; com o pack pronto, toca o sample gravado.
   Nunca silêncio, nunca modal de erro.
6. **Verificação no CI**: `tests/unit/instruments-samples.test.ts` afirma que
   **todo URL de pack existe de fato em `public/`** (87 arquivos) — o erro
   clássico de pack empacotado (manifest apontando para arquivo não copiado)
   falha no CI, não no aparelho do usuário.

## Consequências

- Instalador Tauri cresce ~4,3 MB (o README deixa de prometer "~12 MB").
- `cacheVersion` 2 → 3: descarta o bucket da Cache API que guardava os áudios
  remotos antigos (libera espaço do usuário).
- Licenças preservadas: piano **CC-BY-3.0** (crédito em tela obrigatório,
  mantido em `SampleCredits`), violão e bateria **CC0**. Redistribuir os
  arquivos empacotados é permitido pelas duas licenças.
- Privacidade melhora: o app não faz **nenhuma** requisição de áudio em
  runtime; `PRIVACY.md` atualizado.
- Perde-se a "leveza" que motivou o TDR-16 — aceito, porque a alternativa era
  manter a funcionalidade quebrada atrás de um clique.
