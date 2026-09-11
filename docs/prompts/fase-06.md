# Prompt — Fase 6: Motor de instrumentos

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

A mesma composição renderiza em qualquer combinação dos 8 instrumentos, cada um
controlável (mute/solo/volume/pan). Aceite: adicionar instrumento novo = 1 arquivo
+ 1 linha de registro, sem tocar regente/motores.

## Leia antes (só estes)

1. `docs/instrument-engine-spec.md` (interface normativa + contratos dos 8)
2. `docs/audio-processing-strategy.md` (look-ahead) + `docs/tdr/tdr-02-tonejs-deferred.md`
3. Código: `src/domain/types.ts` (InstrumentId), `src/features/music/harmony/`, `src/features/music/rhythm/`

## Não leia

Arranjo, regente, gestos (fases 7–9).

## Implementar (nesta ordem)

1. `src/features/instruments/types.ts` — `InstrumentEngine` + `ScheduleContext`
   exatamente como na spec; registro `instruments/registry.ts`.
2. Scheduler com look-ahead (tick/horizonte do `config.audio`): eventos ordenados
   por audioTime; evento atrasado → contador de diagnóstico, nunca crash.
3. Os 8 motores (papéis na spec): bateria (só ritmo), baixo (fundamental+quinta),
   piano (voicings), violão, cordas (pads), violino, sax, acordeão.
4. Síntese Web Audio (osciladores + ruído p/ bateria + envelopes); **sem samples
   com copyright** (manifesto em `public/samples/*.json` se usar). Tone.js só com
   A/B de latência/CPU + TDR (TDR-02).
5. Linha ACTIVE BAND do UI vira toggles reais (mute/solo/volume/pan por instrumento).

## Testes obrigatórios

- Contrato: cada motor implementa a interface; `stop()` silencia; volume/pan limites.
- Scheduler: 100 eventos → ordem de audioTime preservada; atrasados contabilizados.
- Subconjunto arbitrário de instrumentos renderiza sem erro (tabela de combinações).
- Novo instrumento fictício plugado só via registro (teste de arquitetura).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs afetadas (+TDR se Tone.js entrar).
3. `STATUS.md` (Fase 6 OK, próxima 7) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
