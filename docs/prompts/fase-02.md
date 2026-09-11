# Prompt — Fase 2: Interpretação musical

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Transformar pitch bruto em música coerente: o usuário canta e vê blocos de
notas estáveis, frases e um BPM que não pula. Aceite: frase cantada → notas +
fronteiras de frase + BPM estável no timeline.

## Leia antes (só estes)

1. `docs/architecture.md` (§4 pipeline, §8–10 estado)
2. `docs/domain-model.md` (NoteEvent, pipeline raw→estável→evento)
3. `docs/event-model.md` (NoteStarted/Changed/Ended, PhraseStarted/Ended, TempoUpdated)
4. Código: `src/features/pitch/`, `src/features/audio/`, `src/components/PitchCanvas.tsx`

## Não leia

Resto de `docs/` (teoria, harmonia, ritmo, instrumentos, gestos são fases futuras).

## Implementar (nesta ordem, um item por vez)

1. `src/features/music/melody/smoothing.ts` — filtro de confiança + mediana
   (janela em `config.note.smoothingWindow`).
2. `src/features/music/melody/stabilization.ts` — histerese
   (`config.note.hysteresisSemitones`) + duração mínima (`config.note.stabilityMs`)
   → emite NoteStarted/Changed/Ended no `bus`. Thresholds só via `config.ts`.
3. `src/features/music/melody/phrases.ts` — fronteiras por silêncio
   (`config.rhythm.phraseSilenceMs`), densidade e contorno → PhraseStarted/Ended.
4. Estimador de tempo contínuo (onsets → BPM estimado/alvo, SEM snap violento;
   separar estimated/target/playback desde já) → TempoUpdated.
5. Timeline no UI (blocos de nota + frases + compassos) abaixo do canvas;
   UI recebe eventos, nunca samples.

## Testes obrigatórios (antes de qualquer OK)

- Fixture da spec §9 (`G4, G4+vibrato, G4, G#4, G4, F#4` → permanece **G4**).
- Histerese, duração mínima, onsets, fim de frase por silêncio, slew do BPM
  (82→84 gradual, nunca 82→105→71).
- Integração: observações sintéticas → NoteEvents ordenados no tempo.

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → `npm run typecheck` → `npm run build`, todos verdes.
2. Atualizar docs afetadas (pipeline em `architecture.md` se mudar; sem TDR se
   arquitetura intacta, com TDR se mudar).
3. `docs/STATUS.md`: Fase 2 → OK, próxima → 3. `CHANGELOG.md`: entrada com números.
4. Responder em pt-BR: o que mudou, arquivos, verificação, riscos.
