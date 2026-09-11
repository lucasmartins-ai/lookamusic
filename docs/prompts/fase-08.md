# Prompt — Fase 8: Regente musical em tempo real

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

O loop musical completo funciona sincronizado. Aceite: cantar → banda segue com
percepção < 250 ms; soak de 15 min limpo; suíte E2E verde. Regente **orquestra**,
não contém lógica dos motores.

## Leia antes (só estes)

1. `docs/architecture.md` (§32 regente, §4 pipeline, §10 riscos)
2. `docs/event-model.md` (catálogo completo — o regente fala por eventos)
3. `docs/performance-budget.md` (tabela a cumprir) + `docs/tdr/tdr-05-test-stack.md` (Playwright entra aqui)
4. Código: todos os motores das Fases 2–7

## Não leia

Gestos, polish, gravação, export (fases 9–12).

## Implementar (nesta ordem)

1. `src/features/conductor/` — relógio musical, `MusicalState` central, coordenação
   melodia/harmonia/ritmo/instrumentos/dinâmica/arranjo via eventos. Lógica nos
   motores; aqui só orquestração + transições agendadas.
2. Ajuste fino do look-ahead (responsividade × estabilidade × CPU) com números
   do painel de diagnósticos; registrar valores finais em `config.ts` + docs.
3. Rota `/session` — experiência completa do regente.
4. Playwright: E2E (start → cantar via fixture injetada → acompanhamento →
   add/remove instrumentos). Sem hardware de mic no CI.
5. Bater o orçamento de performance; degradação graciosa com badge (nunca silêncio).

## Testes obrigatórios

- Sincronia: eventos de motores distintos alinhados ao relógio (tolerância documentada).
- Latência percebida voz→acompanhamento < 250 ms (medição, não chute).
- E2E verde + soak manual de 15 min sem degradação.

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` (+ e2e) → typecheck → build verdes. 2. Atualizar docs (incluir números finais de latência).
3. `STATUS.md` (Fase 8 OK, próxima 9) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
