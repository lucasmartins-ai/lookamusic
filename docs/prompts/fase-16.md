# Prompt — Fase 16: Instrumentos por samples (sintetizador vira fallback)

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

Trocar o som "sintetizador plástico" por samples reais nos instrumentos onde
isso mais aparece — **piano primeiro** (prova), depois **violão**, depois
**bateria** — mantendo o sintetizador procedural atual como **fallback
automático** (offline sem packs, falha de download, instrumento sem pack).
Aceite: cantar 1 nota sustentada com a banda em quinteto soa piano/violão/
bateria reais; sem rede e sem packs, tudo soa exatamente como hoje.

## Leia antes (só estes)

1. `src/features/instruments/audio-sink.ts` (`VoiceSink`, `WebAudioSink`, `createMasterBus`)
2. `src/features/instruments/engine-base.ts` + `src/features/instruments/types.ts` (contrato `InstrumentEngine`)
3. `src/features/instruments/registry.ts` + `src/lib/config.ts` (§`instruments`)
4. `docs/architecture.md` (onde o sink se encaixa) + `PRIVACY.md` (promessa on-device — será estendida com download opt-in)

## Não leia

Nada de detector de pitch, teoria, harmonia, gestos ou export. Só a camada
engine→som. Não abra `docs/tdr/` antigos salvo para registrar o novo.

## Licenças e packs (verificados em 2026-09-11 — não troque sem re-verificar)

| Instrumento | Pack | Licença | O que baixar | Peso alvo no app |
|---|---|---|---|---|
| Piano | Salamander Grand Piano (Yamaha C5, a cada 3ª menor, 16 vel.) | **CC-BY-3.0** → exige tela de créditos | Notas `C4v8.mp3`… de `https://tambien.github.io/Piano/Salamander/` (padrão `NOTAvVELOCIDADE`, notas MIDI 21,24,27…108) | ~1–2 MB (1 camada de velocidade, ogg/mp3) |
| Violão | FreePats Spanish Classical Guitar | **CC0** (nada exigido) | `github.com/freepats/spanish-classical-guitar`, WAV ~7 MB → converter p/ ogg | < 3 MB |
| Bateria | Salamander Drumkit (só one-shots: kick, snare, 2 hats, ride, crash, 2 toms, rim, clap) | **CC-BY-SA-3.0** → **não embutir no bundle**; baixar como pack opcional ou trocar por one-shots CC0 do freesound.org | `archive.org/details/SalamanderDrumkit`, extrair ~10 WAVs → ogg | < 2 MB como pack opcional |
| Guitarra | — (manter síntese) | FreePats steel é **GPLv3 (não usar)**; Kontakt-libs são travadas | Nada nesta fase | 0 |

## Executar (nesta ordem)

1. **TDR novo** em `docs/tdr/` (samples vs síntese, licenças, pesos, fallback).
2. **`SampleCache`** (`src/features/instruments/sample-cache.ts`, puro + Web API):
   manifest de pack como DADO (`{ instrument, notes: [{ midi, url, velocity }] }`,
   em `src/features/instruments/packs/*.ts` — nunca hardcoded no engine);
   `fetch` → `decodeAudioData` → `AudioBuffer`; guarda em memória +
   **Cache API** (PWA offline-first); baixa **só com consentimento**
   (botão "Baixar som real", nunca automático silencioso).
3. **`SampleVoice`** ao lado do `WebAudioSink`: mesma interface de uso
   (`tone({freq, at, dur, velocity})`), implementada com
   `AudioBufferSourceNode` (sample mais próximo + `playbackRate` p/ afinar
   ±2st) + envelope de release existente. Guitarra/bateria-sem-pack e
   qualquer falha (rede, decode, pack ausente) caem no `WebAudioSink`
   **sem щелчок, sem exceção, sem silêncio**.
4. **Fiação por instrumento** (piano → violão → bateria, um por vez, cada um
   verde antes do próximo): engine escolhe sample-vs-synth via
   `config.instruments.<id>.useSamples` + disponibilidade no cache.
   Novos limiares **só** em `src/lib/config.ts` (regra permanente).
5. **UI mínima**: toggle "Som real / Sintetizador" por instrumento (default:
   real quando o pack existe), progresso de download, estado offline claro.
   Lógica nunca em `components/` — só renderizam.
6. **Créditos + PRIVACY**: tela de créditos (Salamander CC-BY: nome + link);
   `PRIVACY.md` estendido (100% on-device **após** o download opt-in;
   downloads só sob ação do usuário).
7. **Tauri/PWA**: packs **fora** do bundle (download em runtime); checar que
   `build:tauri` não infla.

## Testes obrigatórios

- Unit: mapeamento nota→sample mais próximo (±2st, bordas 21/108);
  `playbackRate` exato por semitom; fallback invocado em
  rede-decode-ausente (sinks falsos, sem rede real); manifest válido
  (toda nota do range coberta); migração de cache entre versões.
- Integração: render offline de 2 compassos piano+violão bit-estável com
  packs mockados; sem packs, saída idêntica à atual (snapshot do synth).
- Pesos: piano ≤ 2 MB, violão ≤ 3 MB, bateria ≤ 2 MB transferidos;
  decode < 1 s em desktop médio; audição do instrumento não trava o scheduler
  (0 late, como hoje).
- E2E: toggle real/synth audível sem erro no `/session`.

## Critérios de aceite

1. Com packs: ouvido confirma piano/violão/bateria reais no quinteto.
2. Sem packs/rede: paridade total com o som atual (fallback invisível).
3. Licenças: créditos CC-BY visíveis; nada GPL/SA embutido no bundle.
4. Gate AGENTS.md §3 verde com números (testes x/y refusing regressão dos 620).

## Fora de escopo (não fazer)

Guitarra elétrica/aço por samples, round-robins, múltiplas velocity layers
no piano (1 camada nesta fase), streaming de samples, qualquer LLM no áudio,
qualquer número mágico fora de `config.ts`.

## Fechamento (gate — AGENTS.md §3–4)

1. Testes + typecheck + build verdes. 2. Docs afetadas (architecture,
   PRIVACY, créditos). 3. `STATUS.md` (Fase 16 OK) + `CHANGELOG.md` com
   números. 4. Responder em pt-BR: o que mudou, arquivos, verificação,
   riscos (peso, licenças, fallback).
