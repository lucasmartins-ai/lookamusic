# Prompt — Fase 4: Motor de harmonia

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Acompanhamento harmônico coerente a partir do canto — nunca acordes aleatórios.
Aceite: `C–E–G` em C maior → C maior top-1; `G–D–Em–C` analisado como I–V–vi–IV
em G; 8 compassos gerados terminam em tônica, sem >2 repetições seguidas,
condução de vozes < 4 semitons/voz em média.

## Leia antes (só estes)

1. `docs/harmony-engine-spec.md` (contrato completo: scoring, progressões, vozes, cadência)
2. `docs/domain-model.md` (ChordCandidate, ChordEvent)
3. Código: `src/features/music/theory/`, `src/features/music/melody/`

## Não leia

Ritmo, instrumentos, arranjo, gestos (fases 5–9).

## Implementar (nesta ordem)

1. `src/features/music/harmony/candidates.ts` — gera candidatos a partir de
   tom + escala + melodia + posição na frase + estilo + acorde anterior.
2. `src/features/music/harmony/scoring.ts` — 6 dimensões da spec com pesos em
   `config.ts` (ajustáveis por estilo); empates via PRNG com seed logada
   (sessões reproduzíveis). Cada candidato carrega `reasons` legíveis
   (alimentam a Fase 13).
3. `src/features/music/harmony/progressions.ts` — templates como *priors*
   (I–V–vi–IV etc.), nunca jaulas + matriz de transição por estilo; propõe
   continuações de 1–4 compassos.
4. `src/features/music/harmony/voice-leading.ts` — guloso + beam search (largura 3):
   tons comuns, movimento pequeno, sem 5as/8as paralelas; respeitar tessitura.
   Reservar `voicing/optimizer.ts` para upgrade futuro sem mudar interface.
5. `src/features/music/harmony/cadence.ts` — autêntica/plagal/engano­sa/semicadência
   no `PhraseEnded` → dica de transição + string educacional. Emite `ChordChanged`.

## Testes obrigatórios

- Rank-order do scoring (tom do acorde > tom de passagem > cromático).
- Os três aceites do Objetivo acima, como testes automatizados.
- Regeneração da mesma melodia com mesma seed → mesmo resultado.

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs afetadas (+TDR se mudar arquitetura).
3. `STATUS.md` (Fase 4 OK, próxima 5) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
