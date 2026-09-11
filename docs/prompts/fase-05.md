# Prompt — Fase 5: Ritmo e andamento

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

A banda segue o tempo do cantor sem solavancos. Aceite: bateria acompanha o
BPM cantado sem saltos violentos; troca de compasso (4/4, 3/4, 6/8) estável.
Bateria lê tempo/onsets/energia — **nunca pitch**.

## Leia antes (só estes)

1. `docs/architecture.md` (§20–22 ritmo/tempo/bateria; §56 hierarquia)
2. `docs/performance-budget.md` (scheduling: tick 25 ms, horizonte 120 ms)
3. Código: `src/features/music/melody/` (onsets, frases), `src/domain/types.ts` (TempoState)

## Não leia

Instrumentos melódicos, arranjo, regente, gestos (fases 6–9).

## Implementar (nesta ordem)

1. Beat tracking sobre onsets + slew limiter (`config.rhythm.tempoSlewPerSec`):
   `estimated → target → playback`, nunca snap direto. `TempoUpdated`.
2. `src/features/music/rhythm/meter.ts` — 4/4, 3/4, 6/8; detecção/troca estável.
3. `src/features/music/rhythm/patterns.ts` — padrões de bateria **em dados**
   (nunca hardcode no UI): estilos acústico-pop, rock, balada, folk, cinematic,
   eletrônico, latin, blues, ambient × compassos.
4. Acompanhamento rítmico dirigido por densidade de onsets + energia normalizada
   (não amplitude crua do mic).
5. Mostrar BPM (estimado) e compasso no readout do header (tira os "—" da Fase 1).

## Testes obrigatórios

- Slew: sequência 82→105→71→96 de estimativas → playback move ≤ limite/seg.
- Padrões: cada estilo × compasso gera eventos ordenados, sem gaps audíveis na lógica.
- Bateria ignora pitch (teste: mesma bateria para melodias diferentes no mesmo tempo).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs afetadas.
3. `STATUS.md` (Fase 5 OK, próxima 6) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
