# Prompt — Fase 14: Qualidade e endurecimento

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Nada degrada em sessão longa. Aceite: soaks de 5/15/30/60 min sem degradação
relevante; orçamentos de performance cumpridos; matriz de browsers + mobile verde.

## Leia antes (só estes)

1. `docs/performance-budget.md` (tabela a provar) + `docs/testing-strategy.md`
2. `docs/audio-processing-strategy.md` (§26 instrumentação) + diagnósticos do app
3. Código: hot path completo (worklet → motores → scheduler) à procura de
   alocação/vazamento (arrays sem limite, listeners sem cleanup, timers)

## Não leia

Portfólio (fase 15). Foco total em prova, não em feature nova.
**Nenhuma feature nova nesta fase** — só correção do que os testes revelarem.

## Executar (nesta ordem)

1. Latência: média/p95 do pipeline, frames dropados, glitches — antes/depois de ajustes.
2. CPU: carga por bloco, comportamento sob overload (degradação com badge, §26).
3. Compatibilidade: Chrome/Edge/Safari/Firefox desktop + mobile (matriz documentada).
4. Pitch: acurácia por registro (grave/agudo), vibrato, ruído, fala, volume baixo.
5. Gestos: taxa de acerto/misfire do vocabulário.
6. Memória: soaks 5/15/30/60 min (crescimento ≤ 5% em 60 min); caçar vazamentos.
7. Sessão longa de canto real (checklist manual documentada no CHANGELOG).

## Testes obrigatórios

- Todos os itens acima com números registrados no CHANGELOG (tabela antes/depois).
- Regressão: suíte completa verde no final; qualquer fix ganha teste de regressão (§diagnose).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` (+e2e) → typecheck → build verdes. 2. Atualizar docs com os números finais.
3. `STATUS.md` (Fase 14 OK, próxima 15) + `CHANGELOG.md` com tabelas.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
