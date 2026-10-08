# TDR-20 — Harmonia que segura e segue a voz

Date: 2026-10-08. Status: accepted — regra de segurar (`holdFitMin`) e janela de evidência revistas pelo **TDR-21** (benchmark a capela).

## Contexto

Relato do usuário: a banda "começa a acompanhar a voz, se perde e toca algo
bizarro", "fica mudando de nota toda hora". Uma simulação de canto real
(vibrato ±40¢ @5,5 Hz, glitches curtos, legato) pelo conductor inteiro
mostrou quatro causas estruturais:

1. **Canto ligado virava UMA nota.** O estabilizador tratava troca de altura
   sem silêncio como `NoteChanged` (mesma nota). Tom, harmonia e play-along
   só recebiam a última altura de uma frase inteira; o tom nunca era estimado.
2. **Acorde decidido às cegas.** O compasso era harmonizado ao ser agendado
   (até 1 compasso antes), com a melodia *daquele* compasso — sempre vazia.
   O acorde vinha do template pop + teto de repetição (`maxConsecutiveRepeats`
   = 2), que forçava troca a cada 2 compassos. Resultado medido com a voz
   parada em C–E–G: C → G → Am → F → C → G7 → Am.
3. **Tom sem histerese**: uma nota fora trocava o tom e a banda junto.
4. **Transporte pulava compasso** quando o andamento mudava (posição =
   (agora − origem)/compasso com o BPM novo).

## Decisão

1. Troca de altura confirmada = **`NoteEnded` + `NoteStarted`**, legato
   inclusive (a nota velha fecha exatamente onde a nova começou). Histerese e
   janelas de confirmação continuam filtrando vibrato.
2. **Evidência = o que foi cantado**: compasso anterior
   (`config.harmony.evidenceBars`) + o atual até agora, ponderado por duração
   (a "média" da voz: vibrato e deslizes são curtos).
3. **Regra de segurar**: o acorde atual fica enquanto o fit ponderado da voz
   (nota do acorde = 1, nota da escala = `holdScaleToneWeight`, cromática = 0)
   for ≥ `holdFitMin`, ou houver silêncio. Só abaixo disso o scorer da Fase 4
   escolhe um novo acorde.
4. Próximo compasso só é decidido a `config.conductor.planLeadSec` do downbeat.
5. Tom troca só se o novo candidato superar a correlação do atual por
   `config.key.switchMargin`.
6. `MusicalTransport.setTempo(bpm, nowSec)` rebaseia a origem: muda só o futuro.

## Consequências

- Mesma simulação: C segurado o tempo todo; vai para G quando a voz vai para
  G–B–D (`tests/unit/conductor-stable-band.test.ts`).
- A troca de acorde atrasa ~1 compasso em relação à voz (preço da estabilidade;
  ajuste por `holdFitMin`/`evidenceBars`).
- `NoteChanged` segue no contrato de eventos, mas o estabilizador não emite.
