# Prompt — Fase 11: Gravação e editor de composição

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Criar, editar e preservar composições completas. Aceite: gravar → editar
nota/acorde/instrumento → replay idêntico; projeto persiste localmente.
Editor opera no `MusicalState`, **nunca** em áudio destrutivo.

## Leia antes (só estes)

1. `docs/database-schema.md` (Composition canônica + IndexedDB)
2. `docs/domain-model.md` (Composition) + `docs/event-model.md` (RecordingStarted/Stopped)
3. `docs/tdr/tdr-06-no-cloud.md` (sem backend; Supabase só se sincronia virar requisito real)
4. Código: regente (Fase 8), timeline (Fase 2), arrangement (Fase 7)

## Não leia

Export, educação, hardening (fases 12–14).

## Implementar (nesta ordem)

1. `src/features/recording/` — captura sessão estruturada (voz + acompanhamento +
   estado + arranjo) + replay; preservar representação estruturada separada do áudio final.
2. Persistência IndexedDB (`luca-music`, store `compositions`, keyPath `id`); save/load.
3. Rota `/compose/[id]` — editor de timeline: mover/alterar/deletar/adicionar notas,
   quantizar, mudar tom/tempo/acordes, mute/solo/trocar instrumento, volumes,
   **regenerar acompanhamento** (motores das Fases 4–5 sobre a melodia editada).
4. RecordingStarted/Stopped no bus; UI de transporte (gravar/parar/salvar/carregar).

## Testes obrigatórios

- Round-trip: gravar → salvar → carregar → replay bit-idêntico nos eventos.
- Cada operação de edição com teste (mover nota, quantizar, trocar acorde, regen).
- Schema: Composition inválida rejeitada com erro legível (nunca corrupção silenciosa).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs (+TDR se schema mudar).
3. `STATUS.md` (Fase 11 OK, próxima 12) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
