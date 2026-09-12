# STATUS.md — estado de execução (fonte da verdade do "onde estamos")

> Agente: este é o arquivo que responde "qual é a próxima fase?".
> Usuário: basta dizer **"Vamos para a próxima fase"**.

- **Fase atual:** Fase 16 — Instrumentos por samples (sintetizador vira fallback) — OK
- **Hotfix pós-16 (pedido do usuário):** Cantarolar Primeiro como fluxo padrão + estabilização adaptativa + descoberta de samples — OK (666/666 testes, typecheck 0, build verde; ver CHANGELOG)
- **Correções v1.3.2 (pedido do usuário):** Cantarolar Primeiro agora inicia o conductor (captura de notas funcionava zero) e os packs de som real foram repontados para fontes reais (todas as URLs antigas eram 404) — OK (668/668 testes, downloads verificados na UI, ver CHANGELOG)
- **v1.3.3 (pedido do usuário, dois lotes):** (a) cantarolar com a banda **completamente muda** (mudo global no conductor, não snapshot de mutes), tomada limpa a cada tentativa + limpeza de padrão/repetição da melodia (6 cantadas não viram mais 14 notas), trio de base (bateria + piano + violão) como lineup padrão e teto do Auto, e **modelos reais nativos** (parciais aditivos + transiente); (b) **som real EMPACOTADO no app** (87 áudios em `public/samples/**`, carregados sozinhos — acabou o download quebrado), UX (MODO AVANÇADO recolhido, trilha 1→2→3, ajuda sempre visível) e visual sem azul (neutros quentes + âmbar). TDRs 17/18/19 — OK (682/682 testes, E2E 11/11 verde, typecheck 0, build verde; ver CHANGELOG)
- **Próxima fase:** a definir — Fase 17 ainda sem prompt em `docs/prompts/` (não executar nada novo sem prompt)

## Todo-list das fases (só marque OK com o gate do AGENTS.md §3 verde)

- [x] Fase 0 — Especificação e pesquisa — OK
- [x] Fase 1 — Fundação de áudio — OK (18/18 testes, RMSE autocorr 2.7¢ / YIN 2.1¢)
- [x] Fase 2 — Interpretação musical — OK (51/51 testes; fixture §9 = 1 nota G4 estável; slew 82→84 sem snap)
- [x] Fase 3 — Motor de teoria musical — OK (79/79 testes; C–E–G → C maior 0.91; G–D–Em–C → família G maior)
- [x] Fase 4 — Motor de harmonia — OK (114/114 testes; C–E–G → C maior top-1 0.74; G–D–Em–C → I–V–vi–IV em G; 8 compassos em tônica, run ≤ 2, voz 0.95 st)
- [x] Fase 5 — Ritmo e andamento — OK (202/202 testes; slew 82→105→71→96 ≤ 8 BPM/s, converge 96; valsa → 3/4, 1 compasso anômalo nunca troca, composto → 6/8; 27 padrões ordenados/contínuos; mesma bateria p/ melodias diferentes)
- [x] Fase 6 — Motor de instrumentos — OK (289/289 testes, 87 novos; 100 eventos ordenados, atrasados contabilizados; 14 combinações sem erro; kazoo fictício só via registro; C–G → baixo C2+G2, piano em voicings 48–72, sax ≥ 0.5, violino só em fronteira; UI ACTIVE BAND real)
- [x] Fase 7 — Motor de arranjo — OK (321/321 testes, 32 novos; beat 2.5 → próximo compasso com fade; low 3 → medium 5 → high 8 instrumentos; preset em dados carrega e toca)
- [x] Fase 8 — Regente musical em tempo real — OK (349/349 testes, 28 novos; hot pickup voz→bateria ≤ 200 ms, percebido < 250 ms; soak 900 s 0 late; E2E chromium 1 passed)
- [x] Fase 9 — Câmera e gestos — OK (430/430 testes, 81 novos; hold 400 ms + cooldown 1200 ms por gesto, histerese 0.1; matriz 9/9 gesto→ação; parcial/não-confiante nunca vira evento; câmera negada = paridade total botão+teclado; E2E chromium 1 passed em prod)
- [x] Fase 10 — Experiência polida — OK (455/455 testes, 25 novos; onboarding 3 passos guiado com aria-live e persistência local; status cards e audio health cobrindo erros §43 com recuperação; sistema de ajuda e atalhos; identidade sem neon/gradiente; PRIVACY.md 100% on-device)
- [x] Fase 11 — Gravação e editor — OK (480/480 testes, 25 novos; round-trip gravar→salvar→carregar→replay bit-idêntico; validação de schema estrita com rejeição legível de dados corruptos; persistência IndexedDB com fallback em memória; editor de timeline em /compose/[id] com quantização, mover/alterar/adicionar notas, regeneração harmônica e mixer; hub /compose; 5/5 testes E2E Playwright verdes)
- [x] Fase 12 — Exportação — OK (499/499 testes unitários, 19 novos; MIDI SMF Formato 1 verificado nota-por-nota; JSON versionado v1 com migração e rejeição estrita; WAV 16-bit PCM estéreo 44.1kHz offline com header RIFF canônico e duração exata; WebM/Opus via MediaRecorder; TDR-12 para MP3/stems/MusicXML; modal de exportação integrado no editor /compose/[id]; 6/6 testes E2E Playwright verdes)
- [x] Fase 13 — Modo educacional — OK (516/516 testes unitários, 17 novos; cantar C–E–G mostra "tríade de C maior"; G–D–Em–C mostra "funções I–V–vi–IV em G"; cadências canônicas autêntica/plagal/engano/semicadência; condução de vozes e modulação; escopo progressivo em 9 níveis; toggle global on/off sem peso acadêmico no UI quando desligado; painel contextual "O que acabou de acontecer?" em /session; estúdio /learn + laboratório interativo; 8/8 testes E2E Playwright verdes)
- [x] Fase 14 — Qualidade e endurecimento — OK (546/546 testes unitários, 30 novos; 9/9 testes E2E Playwright; soaks 5/15/30/60 min comprovados com 0% crescimento estacionário de memória e 0 atrasos; latência do pipeline voz→evento p95 < 0.5 ms e percepção voz→banda 120.5 ms vs orçamento 250 ms; acurácia C2–C6 com RMSE < 40¢ e 0 erros de oitava; 100% de precisão nos 9 gestos canônicos e 0% de misfire; proteção contra sobrecarga de CPU com degradação graciosa com histerese; limpeza de ciclo de vida no unmount do condutor e proteção estrita contra vazamento de memória)
- [x] Fase 15 — Lançamento portfólio — OK (build Turbopack 318 ms; README final com quickstart e arquitetura em 1 figura; case study técnico detalhado em docs/case-study.md; galeria visual com 5 screenshots em public/demo/; suíte de smoke test E2E 10/10 verde; 546/546 testes unitários verdes; typecheck 0 erros; PRIVACY.md 100% on-device e licenças de sintetizadores procedurais verificadas)
- [x] Fase 16 — Instrumentos por samples — OK (647/647 testes, 27 novos; piano Salamander CC-BY ~1.6MB + violão FreePats CC0 ~2.4MB + bateria Salamander CC-BY-SA ~1.5MB como packs opt-in; sem packs paridade total com a síntese; toggle real/synth instantâneo; E2E sample-packs 1/1 verde; typecheck 0 erros; build Turbopack verde)

Detalhe de cada entrega: `CHANGELOG.md`. Plano e aceite: `docs/roadmap.md`.
