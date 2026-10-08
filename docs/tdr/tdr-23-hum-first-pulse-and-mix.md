# TDR-23 — Cantarolar Primeiro no pulso certo, loop emendado e mix

Date: 2026-10-08. Status: accepted.

## Contexto

Relato do usuário cantando "Polegar, onde está?" (melodia de Frère Jacques):
"fica trocando de nota sem parar", "não tá no ritmo", "a bateria tá muito
forte", "o MS tá em 3000". Reproduzido com gravações reais livres da mesma
melodia em português ("Frei Martinho" e "Irmão Jorge", Rafael Caldas,
CC BY-SA 4.0, Wikimedia Commons) pelo benchmark a capela e pelo app real
(Chromium, microfone falso).

## Achados (medidos)

1. **Transcrição estava certa** nessa gravação (Mi♭–Fá–Sol–Mi♭ …, 2–3 notas de
   passagem falsas). O problema estava no que a banda fazia com as notas.
2. **Andamento errado**: o loop usava o andamento ao vivo (perseguição com
   limite de 8 BPM/s a partir de 90) — 108 BPM para um cantor a ~118.
3. **Tempo forte deslocado**: a grade começava 0,5 s antes da 1ª nota. Erro
   mediano nota×tempo da banda **162 ms** (acaso ≈ 125 ms): fora de pulso.
4. **Melodia-guia** repetia as notas captadas no piano por cima da voz — cada
   fragmento detectado virava "nota sem relação".
5. **Loop com tropeço**: ao fim de cada volta, `stop()` (cortando caudas) e
   reinício por timer 40–120 ms atrasado.
6. **Mix**: bateria −18,0 LUFS e violão −17,2 contra piano −24,6 (voz −20,4).
7. **"Latência 3000 ms"**: voz → próximo compasso agendado (até 1 compasso),
   exibida também com a banda muda. Não é atraso de áudio.

## Decisão

- `trackBeatOffline` (pure, `rhythm/tempo.ts`): todos os andamentos
  60–180 BPM (passo 0,25) × fases (10 ms), ajuste gaussiano dos inícios de nota
  (σ 50 ms), prior log-normal em 105 BPM (±0,5 oitava) contra dobro/metade;
  tempo forte = classe de tempo mais pesada (default: a da 1ª nota). A
  composição usa esse andamento (resolução 0,25 BPM) e 1 compasso de contagem.
  Inícios vêm da tomada crua (a limpeza funde re-ataques).
- Loop (`CompositionPlayer.play({ loop: true, melody: false })`): próxima volta
  agendada no relógio de áudio 0,5 s antes do fim, em compassos inteiros — sem
  stop, sem buraco. Sem melodia-guia no Cantarolar Primeiro (editor mantém).
- Ganho por pack: bateria 0,4, violão 0,45 → bateria −25,9, piano −24,6,
  violão −24,1 LUFS (bateria ~2 dB abaixo, banda abaixo da voz).
- Indicador renomeado "Reação da banda", só no modo ao vivo, com explicação.

## Resultado (erro mediano nota cantada × tempo da banda; % a ≤ 70 ms)

| Gravação | antes | agora |
|---|---|---|
| Frei Martinho | 162 ms · 30% | **32 ms · 64%** |
| Irmão Jorge | 146 ms · 26% | **24 ms · 71%** |
| Twinkle (amador, rubato) | 176 ms · 23% | 108 ms · 37% |
| Singin' (síncope) | 133 ms · 25% | 122 ms · 37% |

App real (Frei Martinho): tom Mi♭ maior estável, 34 notas, 0 osciladores, 0 erros.

## Limites

- Loop de andamento fixo não acompanha cantor que acelera/freia (Twinkle).
- Modo ao vivo ainda usa o andamento perseguido e a fase do início da sessão.
