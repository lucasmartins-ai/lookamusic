# Prompt — Fase 7: Motor de arranjo

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

O sistema vira banda adaptativa, não backing track estático. Aceite: entradas
caem em fronteiras de compasso/frase com fades (nunca no meio do beat);
energia audível + visível (poucos→todos os instrumentos).

## Leia antes (só estes)

1. `docs/architecture.md` (§29 arranjo, §31 dinâmica)
2. `docs/domain-model.md` (ArrangementState, DynamicsState)
3. Código: `src/features/music/arrangement/` (se existir), `src/features/instruments/`, frases/tempo

## Não leia

Regente, gestos, gravação (fases 8–9, 11).

## Implementar (nesta ordem)

1. `src/features/music/arrangement/state.ts` — `ArrangementState` + transições
   quantizadas (`config.arrangement.transitionBars`) com fade-in/out.
2. `src/features/music/arrangement/dynamics.ts` — energia do input normalizada +
   smoothing → níveis low/medium/high → `EnergyChanged` (NUNCA amplitude→volume direto).
3. `src/features/music/arrangement/presets.ts` — presets de arranjo + estilos
   **em dados** (formato da spec §55: BPM, densidade, padrões, defaults).
4. Entradas/saídas de instrumento via fronteira musical; pedido no meio do compasso
   espera a fronteira (fila visível no UI).
5. Controles de Energy/Style do UI funcionais; estilos não exigem mudar código de motor.

## Testes obrigatórios

- Transição pedida no beat 2.5 → efetiva no próximo compasso, com fade.
- Energia baixa/média/alta → contagem de instrumentos e densidade corretas.
- Preset novo em dados, sem código, carrega e toca.

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs afetadas.
3. `STATUS.md` (Fase 7 OK, próxima 8) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
