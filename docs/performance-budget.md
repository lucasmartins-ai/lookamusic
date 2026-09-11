# Performance budget (§45) — measurable, enforced Ph8/Ph14

| Signal | Target | Measure |
|---|---|---|
| UI frame rate | 60 fps, no dropped-input perception | rAF monitor, dev overlay |
| React renders from audio | 0 per-sample; meters ≤ 12 Hz; notes event-driven | render counter in diagnostics |
| Pitch block (2048 @48k) | mean < 5 ms, p95 < 10 ms (worklet) | benchmark + live sampler |
| Voice→event pipeline (excl. lookahead) | p95 < 60 ms | diagnostics sampler |
| Scheduler | 25 ms tick, 120 ms horizon, 0 audible gaps | glitch/drop counters |
| Memory | no growth > 5 % over 60-min soak | Phase 14 soak 5/15/30/60 min |
| Bundle (initial) | < 250 kB gz (Phase 1), revisit per phase | next build stats |

Graceful degradation order: posted observation rate → UI meter rate → theory re-estimate cadence.
Every degradation surfaces a badge + diagnostics row, never silence.

## Phase 8 finals (measured 2026-09-10)

| Signal | Target | Measured |
|---|---|---|
| Scheduler | 25 ms tick, 120 ms horizon, 0 audible gaps | kept (TDR-08); 900 s simulated soak: 0 late, level full |
| Voice→event pipeline (excl. lookahead) | p95 < 60 ms | single-digit ms (Node); asserted `< handleBudgetMs` in `conductor-sync` |
| Voice→band perceived (incl. lookahead) | < 250 ms | handle + 120 ms horizon; hot drum pickup base now + 50 ms, sync dispatch same frame; E2E badge reads "within 250 ms" |
| Sync across engines | aligned to one clock | same-bar chord/hit alignment; tolerance `syncToleranceMs` 50 ms + horizon |
| Transport tick (hook) | inside horizon | 50 ms (2× scheduler tick); per-tick cost sub-ms |
| Clock-skew guard | no false lates | scheduler grace 25 ms + conductor stamps now + 20 ms |
| Memory (soak proxy) | bounded | melody/chord/phrase rings at `config.conductor` caps; planned/hot sets ≤ 16 |
| E2E | green without mic | Playwright chromium: start → fixture → chord → add/remove, 1 passed |

## Phase 14 finals (measured 2026-09-10) — Endurecimento e Qualidade Comprovada

| Sinal | Alvo (§45) | Medido (Fase 14) | Status |
|---|---|---|---|
| Pitch block (2048 @48k) | mean < 5 ms, p95 < 10 ms | Autocorr 1.7 ms / YIN 1.8 ms (RMSE 2.7¢ / 2.1¢) | APROVADO |
| Pipeline voz→evento (excl. lookahead) | p95 < 60 ms | mean < 0.2 ms, p95 0.5 ms em 5.000 obs (`quality-latency-pipeline`) | APROVADO |
| Percepção voz→banda (incl. lookahead 120 ms) | < 250 ms | 120.5 ms típico (handle p95 0.5 ms + lookahead 120 ms) | APROVADO |
| Scheduler | 25 ms tick, 120 ms horizon, 0 gaps | Tick médio 0.02 ms; 0 atrasados em 1.000 compassos | APROVADO |
| Sobrecarga CPU / Degradação graciosa | Ordem estrita, nunca silêncio | Nível full → reduced (badge) → minimal (bateria + baixo ativos); recuperação limpa por histerese | APROVADO |
| Memória (Soak 5 / 15 / 30 / 60 min) | Crescimento ≤ 5% em 60 min | 0.00% crescimento após regime estacionário (323 itens); anéis limitados (melodia ≤ 128, acordes ≤ 64, frases ≤ 16, stabilizer ≤ 128, phrases ≤ 64) | APROVADO |
| Acurácia vocal em extremos | Grave + Agudo + Vibrato + Baixo volume | C2–C3 RMSE < 40¢, C5–C6 RMSE < 40¢, 0 erros oitava, vibrato ±80¢ sem pulo, rejeição de ruído 0.8 RMS e fala FM | APROVADO |
| Vocabulário gestual (9 gestos) | Taxa de acerto ≥ 95%, misfire = 0% | 100% acerto canônico; 0% disparos acidentais em mãos indeterminadas/relaxadas; cooldown 1200 ms estrito | APROVADO |
| Limpeza de ciclo de vida (Unmount) | 0 vazamentos de listeners | Conductor.dispose() e useConductor desmontam motores e limpam barramento de eventos (0 listeners órfãos) | APROVADO |
| Testes automatizados | Suíte 100% verde | 546/546 unitários (65 arquivos) + 9/9 E2E Playwright | APROVADO |

