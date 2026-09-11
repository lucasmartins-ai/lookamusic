# Prompt — Fase 10: Experiência polida

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Produto acabado, não experimento. Aceite: novo usuário completa
mic→nota→banda em < 2 min sem ajuda; passe em a11y + mobile.

## Leia antes (só estes)

1. `docs/ui-information-architecture.md` (identidade, telas, rotas)
2. `docs/architecture.md` (§43 erros, §44 a11y, §46 privacidade)
3. Código: `src/app/`, `src/components/` (auditar tudo)

## Não leia

Gravação, export, educação, hardening (fases 11–14).

## Implementar (nesta ordem)

1. Identidade final LUCA MUSIC (tokens em `globals.css`; sem glassmorphism/neon/gradiente).
2. Onboarding em 3 passos (permitir mic → sustentar nota → ver a nota → revelar banda).
3. Todos os estados: loading, vazio, erro (§43: mic/Camera negados, sem mic,
   áudio ruim, incompatibilidade, AudioContext suspenso, CPU overload, falha de
   samples) — cada um com recuperação, nunca tela silenciosa quebrada.
4. Responsivo + mobile; navegação por teclado; labels; contraste AA;
   reduced-motion; controles compatíveis com leitor de tela.
5. `PRIVACY.md` (raiz): por que mic/câmera, o que sai do dispositivo (nada por
   padrão), retenção/remoção de gravações. Fluxos de permissão explicam antes de pedir.
6. Sistema de ajuda (atalhos, glossário mínimo).

## Testes obrigatórios

- Cada estado de erro renderiza + recuperação funciona (testes de componente sempre
  que o setup permitir; senão checklist manual documentada no CHANGELOG).
- Auditoria a11y (teclado completo, contraste, leitor de tela nos controles críticos).
- Mobile viewport: layout sem quebra nas 3 telas principais.

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs (incluir PRIVACY.md).
3. `STATUS.md` (Fase 10 OK, próxima 11) + `CHANGELOG.md` com números/checklists.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
