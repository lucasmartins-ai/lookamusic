# TDR-19 — Silêncio global de captura e trio de base

Date: 2026-09-12. Status: accepted.

## Contexto

Dois problemas relatados pelo usuário na sessão de cantarolar:

1. "As músicas estão tocando quando clico no cantarolar" — a banda soava por
   cima do microfone. A causa era estrutural: o silêncio era um **snapshot de
   mutes por canal**. Ao cantarolar, `pushEnergy` → `applyLevel` (modo Auto)
   **acrescentava vozes que não estavam no ar** (strings, violino, …) e essas
   vozes **não estavam mudas**. Nenhum snapshot de mutes sobrevive a uma
   lineup que muda depois dele.
2. "Deixar só violão, piano e drum ativos" — o lineup de partida era um
   quinteto e o modo Auto reabria baixo/guitarra/strings conforme a energia.

## Decisão

1. **`Conductor.setBandSilenced(bool)` — mudo GLOBAL.** Um único flag aplicado
   em `applyMixerToBand`, que zera o ganho de **todos** os canais e vale para
   qualquer engine criado depois (inclusive o real, criado no `ensureAudio`).
   Não é mute por canal: não existe estado para dessincronizar. O fluxo de
   cantarolar liga antes de `start()`; `TOCAR A BANDA` continua sendo o único
   momento em que a música começa.
2. **`Conductor.clearCapture()` — tomada limpa.** Zera melodia, frases,
   acordes e onsets (e reseta estabilizador/frases/tom + o relógio do
   transporte) a cada tentativa de cantarolar. A contagem acumulada entre
   tomadas era parte do "6 notas virou 14".
3. **Trio de base via `config.arrangement.coreEnsemble`.** O Auto nunca
   acrescenta fora de `[drums, piano, violao]`; **pin manual vence** (se o
   usuário ligou uma voz, ela fica). O lineup inicial (`INITIAL_ACTIVE`) e o
   default do `ConductorState` passam a ser o trio.

## Consequências

- Cantarolar é silencioso por construção, não por bookkeeping de UI.
- Cantarolar repetidas vezes dá contagens por tomada, não acumuladas.
- A banda de partida não tem baixo nem guitarra: menos corpo, mais clareza —
  e um clique reintroduz qualquer voz (ela fica pinned).
- `applyLevel` passa a filtrar por core: o arranjo automático fica mais
  previsível e o teste `conductor-capture-silence` trava isso.
