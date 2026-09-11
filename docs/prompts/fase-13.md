# Prompt — Fase 13: Modo educacional

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Instrumento que também ensina. Aceite: cantar `C–E–G` mostra "tríade de C maior";
`G–D–Em–C` mostra funções I–V–vi–IV em G. Camada opcional — o padrão continua musical, não acadêmico.

## Leia antes (só estes)

1. Especificação §4 (camada educacional) + `docs/theory-engine-spec.md` + `docs/harmony-engine-spec.md`
   (os `reasons` da Fase 4 são a matéria-prima das explicações)
2. Código: `src/features/music/theory/`, `src/features/music/harmony/` (candidates.reasons, cadence)

## Não leia

Hardening, portfólio (fases 14–15).

## Implementar (nesta ordem)

1. `src/features/learn/explain.ts` — explicações geradas de representações
   **estruturadas** (MusicalState → texto), nunca de áudio bruto: notas,
   intervalos, escalas, acordes, funções, progressões, ritmo, cadência.
2. Rota `/learn` + painel contextual opcional na sessão ("o que acabou de acontecer?").
3. Escopo progressivo: notas → intervalos → escalas → acordes → funções →
   progressões → cadência → condução → modulação (cada nível destravável, sem jargão forçado).
4. Toggle global: modo educacional on/off; off = zero peso acadêmico no UI.

## Testes obrigatórios

- Tabela de exemplos: cada figura musical canônica → explicação exata esperada
  (C–E–G, I–V–vi–IV, cadência autêntica, etc.).
- Explicações nunca quebram com entrada atonal/ruído (fallback gracioso, não erro).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs afetadas.
3. `STATUS.md` (Fase 13 OK, próxima 14) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
