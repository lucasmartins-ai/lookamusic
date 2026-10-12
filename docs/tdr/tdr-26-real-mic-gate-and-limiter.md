# TDR-26 — Microfone real baixo: gate adaptativo, piso 63 Hz e limitador final

Date: 2026-10-12. Status: accepted.

## Contexto (primeiro uso real registrado — TDR-25)

Sessão `2026-10-12_14-10-08` (Cantarolar Primeiro, "Polegar", 41 s, microfone
do MacBook Pro, sem filtros de fala): o app captou 35 notas de ~0,1 s com
buracos de 2–3 s e erros de oitava; a reprodução offline da mesma tomada deu
17 notas. Relato junto: "uns chiados esquisitos no áudio".

## Achados

1. **Voz baixa**: tomada com pico −21 dBFS, média −41 dB; RMS da voz
   0,01–0,04, silêncio ~0,0015. O gate fixo de 0,008 picotava as notas. A
   v1.4.3 (mic cru) removeu também o ganho automático da Apple — nos testes o
   áudio vinha em nível normal, por isso não apareceu.
2. Com gate mais baixo, ruído grave da sala/notebook virava "notas" A1–B1
   (55–62 Hz).
3. **Saída sem limitador**: compressor 4:1 (ataque 4 ms) + sala por fora dele;
   após a calibração da v1.4.2 (caixa ×2) somas de bumbo+caixa+piano+violão
   passavam de 0 dBFS → clipping digital ("chiados").
4. O usuário canta com andamento livre (notas de 2,8–3 s, acelera/freia): um
   loop de andamento fixo não consegue seguir (limite do formato, não bug).

## Decisão

- Gate adaptativo (YinDetector e worklet iguais): chão = menor RMS dos últimos
  8 s; gate = clamp(3 × chão, 0,0015, 0,008).
- Piso do detector 55 → 63 Hz (mantém C2 = 65,4 Hz da especificação).
- Master bus: limitador (−2 dBFS, 20:1, ataque 1 ms) como último nó; glue
  compressor e sala passam por ele.

## Resultado

- Tomada real do usuário (offline): notas 17 → **63**; choque voz×acorde
  28,2% → **14%**; tom Ré maior; progressão Sol–Mi m–Ré–Si m.
- Vocadito (40 trechos anotados): detector 95,1 → **97,1%**; nota certa no
  tempo 74,3 → **76,5%**; onsets 73,9% (igual).
- Ritmo na tomada real segue ~105 ms de erro mediano: canto em andamento livre.
