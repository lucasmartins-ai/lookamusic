# TDR-16 — Instrumentos por samples com fallback procedural

Date: 2026-09-11. Status: accepted. Fase: 16.

## Contexto

O som 100% procedural (`WebAudioSink`: osciladores + ruído filtrado, zero
samples) cumpre latência e privacidade, mas soa "plástico" nos instrumentos
onde o ouvido mais percebe ataque e corpo — **piano primeiro**, depois
**violão**, depois **bateria**. A Fase 16 troca esses três por samples reais,
mantendo o sintetizador atual como **fallback automático e invisível**
(offline sem packs, falha de download/decode, instrumento sem pack).

## Decisão

1. **Samples como dado, nunca como código de engine.** Cada pack é um
   manifest em `src/features/instruments/packs/*.ts`
   (`{ packId, instrument, version, license, attribution, baseUrl, notes[] }`);
   engines nunca contêm URLs.
2. **`SampleCache`** (`sample-cache.ts`, puro + Web API): `fetch` →
   `decodeAudioData` → `AudioBuffer`; memória + **Cache API** (PWA
   offline-first, chave com versão p/ migração); download **só com
   consentimento** (botão "Baixar som real", nunca automático silencioso).
3. **`SampleVoice`** (`sample-voice.ts`, ao lado do `WebAudioSink`): mesma
   interface de uso (`tone({freq, at, dur, velocity})`) via
   `AudioBufferSourceNode` (sample mais próximo + `playbackRate` p/ afinar
   ±2 st) + envelope de release existente. Qualquer falha (rede, decode,
   pack ausente, `|detune| > 2`) delega ao `WebAudioSink` interno
   **sem clique, sem exceção, sem silêncio**.
4. **Bateria sem double-trigger.** `EngineBase.renderDrum` emite pares
   `tone` (membrana) + `noise` por hit. O `SampleVoice` em modo bateria
   segura o `tone` pendente e, ao chegar o `noise` do mesmo hit, toca **um
   único one-shot**; sem sample, re-emite o par original no fallback —
   saída bit-idêntica à atual. A voz é inferida por lookup reverso exato
   em `config.instruments.drumVoices` (`filterType` + `filterFreq`, únicos
   por voz); nada hardcoded no sink.
5. **Fiação por instrumento** via `createInstrumentSink(ctx, master, id,
   cache)`: lê `config.instruments.samples.<id>.useSamples` + disponibilidade
   no cache. Piano → violão → bateria, cada um verde antes do próximo.
   Guitarra fica em síntese nesta fase (FreePats steel é GPLv3 — não usar).
6. **Packs fora do bundle.** Só URLs remotas https em runtime; nenhum
   `.mp3/.ogg/.wav` em `public/` ou importado. `build:tauri` não infla.

## Packs e licenças (verificados em 2026-09-11)

| Instrumento | Pack | Licença | Decisão |
|---|---|---|---|
| Piano | Salamander Grand Piano (Yamaha C5, a cada 3ª menor, 16 vel.; usamos 1 camada v8) | **CC-BY-3.0** | Download opt-in em runtime; **tela de créditos obrigatória** (nome + link) |
| Violão | FreePats Spanish Classical Guitar (WAV ~7 MB → ogg) | **CC0** | Download opt-in em runtime; sem crédito exigido (creditamos mesmo assim) |
| Bateria | Salamander Drumkit one-shots (kick, snare, 2 hats, ride, crash, 2 toms, rim, clap) | **CC-BY-SA-3.0** | **Nunca embutir no bundle** — só como pack opcional em runtime com créditos; alternativa CC0 documentada |
| Guitarra | — | FreePats steel GPLv3 / Kontakt travadas | **Fora de escopo**: mantém síntese, 0 bytes |

## Pesos (orçamentos em `config.instruments.samples`)

- Piano ≤ 2 MB, violão ≤ 3 MB, bateria ≤ 2 MB transferidos (1 camada de
  velocidade, ogg/mp3).
- Decode < 1 s em desktop médio; a audição nunca trava o scheduler
  (0 late, como hoje) — o `tone()` é síncrono e cai no fallback quando o
  buffer ainda não existe; o download é background com progresso.

## Privacidade

Estende `PRIVACY.md`: 100% on-device **após** o download opt-in; downloads
só sob ação do usuário, só dos hosts documentados nos manifests; nenhum
áudio do microfone sai do dispositivo em nenhum momento.

## Alternativas consideradas

- **Embutir samples no bundle**: rejeitado — infla web + Tauri, fere
  CC-BY-SA da bateria, quebra offline-first leve.
- **Múltiplas velocity layers / round-robins no piano**: rejeitado nesta
  fase — 1 camada; camadas extras só com medição de peso/latência.
- **Streaming de samples**: rejeitado — Cache API + preload sob
  consentimento é mais simples e determinístico.
- **Tone.js/SoundFont**: rejeitado (TDR-02 segue válido) — Web Audio nativo
  basta para one-shots + pitched.

## Consequências

- Sem packs/rede: paridade total com o som atual (fallback invisível,
  snapshot do synth preservado em teste).
- Com packs: quinteto com piano/violão/bateria reais ao cantar 1 nota
  sustentada.
- Export offline (`renderToWav`) segue 100% synth nesta fase
  (determinístico, sem dependência de rede) — samples no export são
  trabalho futuro explícito.
