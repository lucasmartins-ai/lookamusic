# Prompt — Fase 9: Câmera e gestos

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

O usuário rege o arranjo com as mãos. Aceite: cada gesto do vocabulário dispara
de forma confiável, sem misfires; **toda** ação por gesto existe também em
botão/teclado; câmera negada → paridade total de UI.

## Leia antes (só estes)

1. `docs/gesture-architecture.md` (pipeline + vocabulário + anti-misfire normativos)
2. `docs/tdr/tdr-07-gesture-stack.md` + `docs/event-model.md` (GestureDetected)
3. Código: `src/features/music/arrangement/` (único consumidor permitido)

## Não leia

Polish, gravação, export, educação (fases 10–13).

## Implementar (nesta ordem)

1. Permissão de câmera com explicação prévia + recuperação guiada (§43/§46;
   frames nunca saem do dispositivo, nunca gravados por padrão).
2. Landmarks via MediaPipe Tasks Vision (local) em Worker/off-DOM.
3. `src/features/gestures/recognition.ts` — vocabulário da spec com confiança +
   histerese + hold (`config.gesture.holdMs`) + cooldown (`config.gesture.cooldownMs`).
   Tracking perdido → decai, nunca trava.
4. Mapeamento gesto→arranjo (open/close, dedos 1-3, swipes) emitindo
   `GestureDetected` → ArrangementEngine. **Visão NUNCA chama síntese direto.**
5. Equivalentes UI/teclado para cada gesto (§44); indicador de gesto + confiança no UI.

## Testes obrigatórios

- Matemática de debounce/hold/cooldown (unit, sem câmera).
- Gesto→arranjo só via evento; teste de fronteira: proibido importar instruments em gestures.
- Matriz do vocabulário: cada gesto → ação correta; gesto parcial/não-confiante → nada.

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs (+TDR se trocar stack de visão).
3. `STATUS.md` (Fase 9 OK, próxima 10) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
