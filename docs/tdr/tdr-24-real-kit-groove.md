# TDR-24 — Groove de bateria para kit gravado

Date: 2026-10-09. Status: accepted.

## Contexto

Após a v1.4.1 o usuário aprovou ritmo e harmonia, mas: "a bateria parece sem
nexo, parece que só bate o prato, destoa do resto". Os padrões de bateria
(Fase 5) foram escritos para a bateria procedural antiga, onde o "crash" era um
ruído curto e baixo.

## Medição (loop do Cantarolar Primeiro, "Frei Martinho", LUFS por peça)

- Crash em **todo** compasso (9 em 9), cada um soando ~3,5 s a −1 dBFS:
  crash −26,8 LUFS, **acima do bumbo** (−31,2). Contratempo no aro
  (cross-stick, clique fino) −35,9; chimbal −47,5.
- Causa adicional: o pack normalizava **cada peça** ao mesmo pico, desfazendo o
  equilíbrio natural do kit.

## Decisão

- Crash só no 1º compasso de cada seção (`instruments.crashEveryBars` = 8),
  via `PassageInput.barIndex` (conductor, pickup, player, export).
- "acoustic-pop" (estilo padrão): contratempo na **caixa** em vez do aro.
- Equilíbrio do kit por peça (`DrumPackVoice.gain`): kick 1, snare 2, tom 1,2,
  hats 1,4, ride 0,5, crash 0,3; pack 0,7.

## Resultado

Bumbo −27,7 · caixa −31,1 · chimbal −41,1 · crash (2× em 18 s) −34,9 LUFS; kit
inteiro −26,1 contra piano −24,4 / violão −24,1. Regressões em
`instruments-musical.test.ts`.
