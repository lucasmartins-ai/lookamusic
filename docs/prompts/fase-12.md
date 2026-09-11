# Prompt — Fase 12: Exportação

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

A música sai do Luca Music. Aceite: WAV, WebM, MIDI e JSON abrem em ferramentas
de terceiros (MIDI verificado nota-por-nota). Export separado do motor de playback.

## Leia antes (só estes)

1. `docs/architecture.md` (§40 export; §11 estado como verdade)
2. `docs/domain-model.md` (Composition/NoteEvent/ChordEvent — o que serializar)
3. Código: `src/features/recording/` (fonte: estado estruturado, não nós de áudio vivos)

## Não leia

Educação, hardening, portfólio (fases 13–15).

## Implementar (nesta ordem)

1. `src/features/export/json.ts` — Composition JSON (schema versionado).
2. `src/features/export/midi.ts` — melodia + acordes + andamento/compasso; SMF válido.
3. `src/features/export/wav.ts` — render offline (OfflineAudioContext) do master → WAV.
4. `src/features/export/webm.ts` — via MediaRecorder onde aplicável.
5. Avaliar e decidir (com TDR curto): MP3, stems, MusicXML — implementar ou adiar
   com motivo registrado.
6. UI de export na tela de composição (formato + progresso + download).

## Testes obrigatórios

- MIDI: reimportar o arquivo e comparar nota-por-nota com o estado (duração/tempo inclusos).
- JSON: round-trip contra o schema versionado (versão antiga migra ou rejeita com mensagem).
- WAV: header válido, duração ≈ esperada (±tolerância documentada).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs (+TDR da decisão MP3/stems/MusicXML).
3. `STATUS.md` (Fase 12 OK, próxima 13) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
