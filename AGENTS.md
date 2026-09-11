# AGENTS.md — LookaMusic · regra permanente de sessão

> **LEIA ESTE ARQUIVO PRIMEIRO, em toda conversa, antes de qualquer ação.**
> Ele é estável de propósito: prefixo fixo = melhor aproveitamento de cache.
> Sessão com o usuário em pt-BR. Documentação técnica do repo em inglês.

## 1. Protocolo de abertura (ordem fixa — otimiza cache e tokens)

1. Leia **este AGENTS.md** (você já está aqui).
2. Leia **`docs/STATUS.md`** (pequeno: diz qual é a fase atual).
3. Leia **somente o prompt da fase atual**: `docs/prompts/fase-XX.md`.
4. Leia **somente os arquivos listados** na seção "Leia antes" daquele prompt.
5. **PARE de ler.** Não abra o resto de `docs/`, não faça grep recursivo,
   não despeje o vault de memória. Arquivo fora da lista = token jogado fora.

## 2. Gatilho de fase

- Quando o usuário disser **"Vamos para a próxima fase"** (ou equivalente):
  `docs/STATUS.md` → "Próxima fase" indica o arquivo `docs/prompts/fase-XX.md`.
  Execute aquele prompt de ponta a ponta.
- Nunca pule fase. Nunca execute duas fases na mesma resposta sem pedido explícito.
- Nunca implemente funcionalidade de fase futura ("prematura") — só a fase atual.

## 3. Regra de ouro do CHANGELOG (gate obrigatório)

- Nenhuma fase recebe **OK** em `docs/STATUS.md` ou entrada em `CHANGELOG.md`
  sem, **nesta ordem**: `npm test` verde → `npm run typecheck` verde →
  `npm run build` verde. Sem exceção, sem "OK parcial".
- A entrada do changelog registra os números (testes x/y, latência, RMSE).
- Se algo falhar: diagnostique (§diagnose), corrija, rode tudo de novo.
  Só então marque OK.

## 4. Fechamento de fase (sempre, antes de declarar OK)

1. Testes + typecheck + build verdes (item 3).
2. Atualize **toda a documentação afetada** pela fase (código → docs, nunca o inverso
   silencioso; mudança de arquitetura exige TDR novo em `docs/tdr/`).
3. Atualize `docs/STATUS.md` (fase atual → OK, próxima fase).
4. Registre no `CHANGELOG.md`.
5. Responda em pt-BR: o que mudou, arquivos, verificação (números), riscos.

## 5. Limites permanentes (da especificação)

- Caminho crítico de áudio 100% local; sem LLM no motor musical.
- `src/domain` e `src/features/music/theory`: TypeScript puro (sem React/WebAudio).
- Sem números mágicos fora de `src/lib/config.ts`.
- Lógica de negócio nunca em `components/`; componentes só renderizam.
- Microfone/câmera: permissão explicada antes, negação com recuperação guiada.
- Definition of done (§60): implementação + testes + erros + performance +
  docs + arquitetura + UI + a11y + edge cases + critérios de aceite.

## 6. Mapa mínimo (não substitui a leitura dos prompts de fase)

| Preciso de… | Arquivo |
|---|---|
| Fase atual / próxima | `docs/STATUS.md` |
| Prompt executável da fase | `docs/prompts/fase-XX.md` |
| Plano completo + aceite por fase | `docs/roadmap.md` |
| Histórico de entregas | `CHANGELOG.md` |
| Arquitetura / domínio / eventos | `docs/architecture.md`, `domain-model.md`, `event-model.md` |
| Decisões registradas | `docs/tdr/` |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
