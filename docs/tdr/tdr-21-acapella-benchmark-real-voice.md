# TDR-21 — Benchmark a capela e harmonia pela voz real

Date: 2026-10-08. Status: accepted. Revises parts of TDR-20.

## Contexto

Após a v1.3.4 o usuário relatou que "ainda não funciona" e pediu um teste com
uma música a capela de verdade. Duas gravações livres do Wikimedia Commons
(voz solo, cantores amadores) foram passadas pelo caminho real do microfone
(`tests/bench/acapella.test.ts`: blocos de 2048 → YIN → Conductor, tick 50 ms)
e pelo app real no Chromium com microfone falso (`e2e/acapella-real.spec.ts`):

- *Twinkle Twinkle Little Star — sung with full lyrics* (Dcoetzee, CC0, 126 s)
- *Singin' in the Rain* (Cary Bass-Deschenes, CC BY 4.0, 39 s)

Métrica perceptual: % de quadros com voz em que a voz bate um **meio-tom**
(0,7–1,3 st) contra uma nota da banda soando. Referências na mesma grade:
acorde fixo da tônica e "oráculo" (melhor tríade diatônica por compasso,
olhando o futuro).

## Achados

1. O cantor amador espalha a afinação ±50¢ (coerência de afinação 0,07): o
   arredondamento ao semitom mais próximo escolhia o vizinho errado. Tom e
   acordes votavam com notas erradas; o tom trocou 52× em 2 min.
2. O estado guardava a altura **arredondada** (o `NoteEnded` não levava a média
   real); a harmonia nunca via os centésimos.
3. **Cantarolar Primeiro tocava 100% sintetizado**: `CompositionPlayer` criava a
   banda com `WebAudioSink` puro (samples só no modo ao vivo) e a melodia-guia
   num dente de serra. No app real: 2.253 osciladores durante o loop.
4. O loop tocava **8 instrumentos** (todo instrumento sem `muted`), inclusive
   acordeão/sax/cordas sintetizados — ignorava `arrangement.active`.
5. O loop reaproveitava os acordes decididos ao vivo (atrasados ~1 compasso).

## Decisão

- `NoteEnded` carrega `pitch` (Hz médio real); estado e tom usam.
- Tom: pitch-class **proporcional** aos centésimos + desafiante precisa vencer
  por `key.switchDwellMs` (4 s) além de `switchMargin` (livre enquanto
  confiança < `lockConfidence`).
- Acorde: `chordFit` pela altura real (tom do acorde +1, atrito de meio-tom −1,
  outra tensão `holdScaleToneWeight`) + `scorerWeight` × nota da Fase 4 +
  `holdBonus` p/ o acorde soando + `primaryChordBonus` (I/IV/V; metade p/ vi).
  Substitui o limiar `holdFitMin` do TDR-20.
- Ao vivo: acorde re-decidido a cada meio compasso (`harmonySlotsPerBar` 2);
  evidência = último meio compasso cheio + o anterior com peso
  `olderEvidenceWeight` (varredura: 0,5 compasso venceu 1 / 0,75 / 0,35 / 0,25).
- Cantarolar Primeiro: acordes **retrospectivos** (`harmonizeTake`, cada
  compasso pelas notas cantadas nele; tom pela tomada inteira).
- `CompositionPlayer`: banda e guia pelo mesmo caminho de samples do modo ao
  vivo; guia no piano real a `recording.guideMelodyVolume`; só toca o lineup
  (`arrangement.active`).

## Resultado (choque de meio-tom, menor = melhor)

| | v1.3.3 instalado | agora | tônica fixa | oráculo |
|---|---|---|---|---|
| Twinkle ao vivo | 19,6% | 13,2% | 18,3% | ~10% |
| Singin' ao vivo | 19,7% | 18,9% | 27,6% | ~15% |
| Twinkle Cantarolar Primeiro | 22,4% | 15,9% | — | — |
| Singin' Cantarolar Primeiro | 28,9% | 21,8% | — | — |

Trocas de tom (Twinkle): 62 → 8. App real (Singin', Chromium, mic falso):
osciladores no loop 2.253 → **0**; notas captadas 28 → 49.

## Limites

- Duas gravações só: parâmetros têm ruído de ±1–2 pontos; não ajustar mais
  fino sem mais tomadas.
- Ao vivo continua ~3–4 pontos acima do oráculo: decidir antes de ouvir o
  compasso é o limite do modo reativo; o Cantarolar Primeiro é o caminho bom.
- A pitch-class proporcional ajudou ao vivo, mas custou 2 pontos no
  Cantarolar Primeiro — lá ficou o histograma duro (`ponytail:` no código).
