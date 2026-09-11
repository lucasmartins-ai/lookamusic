# Prompt — Fase 3: Motor de teoria musical

> Gatilho: usuário diz **"Vamos para a próxima fase"** e `docs/STATUS.md` aponta aqui.

## Objetivo

O sistema interpreta a melodia musicalmente, não numericamente. Aceite:
`C–E–G` → C maior (conf > 0.6); a estimativa de tom revisa com mais evidência,
nunca trava na primeira nota.

## Leia antes (só estes)

1. `docs/theory-engine-spec.md` (contrato completo desta fase)
2. `docs/domain-model.md` (Intervalo, Escala, KeyEstimate, Chord, função harmônica)
3. Código: `src/domain/types.ts`, `src/features/music/melody/` (entrada: NoteEvents)

## Não leia

Harmonia, ritmo, instrumentos, gestos (fases 4–9).

## Implementar (nesta ordem)

1. `src/features/music/theory/intervals.ts` — semitons → nome (`M3`, `P5`…; compor = oitava + simples).
2. `src/features/music/theory/scales.ts` — registro em dados: maior, menor
   natural/harmônica/melódica + `scaleContains`, `getScalePcs`, `quantizeToScale`.
   Modos futuros = linhas de dados, sem mudar API.
3. `src/features/music/theory/chords.ts` — `chordTones`, `chordFromPcs`,
   `chordName`; qualidades da spec (§15).
4. `src/features/music/theory/functions.ts` — `getFunction` (I–vii° maior;
   conjunto funcional menor) → TONIC/SUBDOMINANT/DOMINANT/UNKNOWN.
5. `src/features/music/theory/key.ts` — janela rolante (`config.key.windowMs`),
   histograma de pitch-class ponderado (duração × confiança × recência) →
   `KeyUpdated` só se top mudar ou Δconf > `config.key.updateDelta`.
6. Tudo **puro**: zero import de React/WebAudio (TDR-04).

## Testes obrigatórios

- Nomes de intervalos, pertinência de escala, tons de acordes, mapeamento de função.
- Corpus `C–E–G` → C maior conf > 0.6; frase `G–D–Em–C` → família de G maior.
- Chave revisa com evidência (não trava na primeira nota).

## Fechamento (gate — AGENTS.md §3–4)

1. `npm test` → typecheck → build verdes. 2. Atualizar docs afetadas.
3. `STATUS.md` (Fase 3 OK, próxima 4) + `CHANGELOG.md` com números.
4. Responder em pt-BR: mudanças, arquivos, verificação, riscos.
