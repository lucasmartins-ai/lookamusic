# Prompt — Fase 15: Lançamento portfólio

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Um estranho roda, entende e se impressiona em 5 min. Aceite: build de produção,
case técnico, demo gravada, métricas publicadas. Posicionamento: sistema
tempo-real/DSP/teoria/composição algorítmica — **nunca** "gerador de música por IA".

## Leia antes (só estes)

1. `docs/roadmap.md` (§15 checklist) + `CHANGELOG.md` (números para o case)
2. `docs/architecture.md` + `docs/dependency-graph.md` (base do diagrama)
3. `docs/performance-budget.md` + resultados da Fase 14 (métricas a publicar)

## Não leia

Nada de engenharia nova. Só empacotar, documentar e demonstrar.

## Executar (nesta ordem)

1. Build de produção + deploy (Vercel ou equivalente) + README final
   (quickstart, arquitetura em 1 figura, como rodar, como testar).
2. Diagrama de arquitetura final (a partir do dependency-graph + pipeline).
3. Case técnico: DSP, tempo-real, teoria, composição algorítmica, visão,
   engenharia de áudio, arquitetura TS, UX — com números (latência, RMSE, CPU).
4. Screenshots + gravação demo (cantar → banda → gestos → export).
5. Site/página do projeto + write-up técnico.
6. Revisão final: links, ortografia, licença de samples/assets, PRIVACY.md.

## Testes obrigatórios

- Build limpo de produção + smoke test no deploy (start → nota → banda).
- Todos os links do README/case funcionam; assets com licença verificada.

## Fechamento (gate — AGENTS.md §3–4)

1. Testes + typecheck + build verdes. 2. Docs finais.
3. `STATUS.md` (Fase 15 OK — **produto lançado**) + `CHANGELOG.md` de release.
4. Responder em pt-BR: resumo do produto, links, métricas, próximos passos possíveis.
