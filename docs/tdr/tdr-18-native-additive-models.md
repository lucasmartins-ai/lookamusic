# TDR-18 — Modelos nativos de instrumento (parciais aditivos + transiente)

Date: 2026-09-12. Status: accepted. Complementa: TDR-16 / TDR-17.

## Contexto

O usuário pediu "**modelos reais implementados nativamente**". Mesmo com os
packs empacotados (TDR-17), o fallback precisava deixar de ser um oscilador
único + lowpass: piano/violão/bateria soavam "de sintetizador" sempre que o
buffer não estava pronto (primeira nota, decode ainda em andamento, webview
sem suporte a mp3, pack indisponível).

## Decisão

1. **`ToneParams.partials` + `ToneParams.noiseAttack`.** O `VoiceSink` ganhou
   um caminho de voz **aditivo**: N osciladores senoidais com *decay* próprio,
   somados num lowpass único (brilho acompanha o tom via
   `brightnessPerOctave`), mais um transiente curto de ruído filtrado
   (martelo do piano, unha do violão). Sem `partials`, o caminho antigo de
   oscilador único permanece **byte a byte** (zero regressão).
2. **Modelos como DADO**, em `config.instruments.nativeModels` (piano, violão e
   os corpos membranosos de bumbo/tom/cajon) — nenhum número mágico no engine,
   coerente com §54. `pitchedTimbreOf` mescla o modelo no timbre;
   `drumBodyOf(voice)` resolve o corpo por voz.
3. **Sweep preservado.** Quando `freqEnd` existe (kick/tom/cajon), cada
   parcial segue o mesmo sweep proporcional — o "bump" do bumbo não se perde
   ao ganhar corpo harmônico.
4. **Mesmo sink em todas as saídas**: reprodução ao vivo, `renderToWav` e o
   player do editor usam o `WebAudioSink`, então exportação offline ganha os
   modelos automaticamente (determinismo mantido).

## Consequências

- Custo: ~5–6 osciladores por nota no piano contra 1–3 antes. Medido em teste
  (um oscilador por parcial + 1 fonte de ruído no transiente); a banda ativa é
  um trio (TDR-19), então a soma ficou abaixo do que era com 5 instrumentos.
- Níveis somam mais que o oscilador único; absorvido pelo ganho por canal
  (mixer) e pelo compressor do master bus.
- Nenhuma dependência nova, nenhum asset, licença do projeto intacta (MIT).
