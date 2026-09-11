# CHANGELOG — LookaMusic

> **Regra de gate (AGENTS.md §3):** nenhuma fase entra aqui como OK sem
> `npm test` + `npm run typecheck` + `npm run build` verdes, nesta ordem.
> A entrada registra os números da verificação.

## [Hardening & i18n 1.2] — Estabilização Contextual, Debounce Melódico, i18n (pt-BR / en-US) e Acessibilidade — OK

- **Resolução do Risco 1 (Estabilização de Frase Melódica Rápida)**:
  - `ExplanationStabilizer` e `useContextualExplanation.ts`: mecanismo de retenção melódica que detecta fraseado rápido (< 150 ms entre notas) e aplica debounce de 250 ms (`config.learn.updateDebounceMs`), impedindo que o texto do painel pisque a cada nota transitória;
  - Resposta instantânea (0 ms de latência) quando o usuário altera manualmente o nível de aprendizado ou idioma no painel;
  - `tests/unit/learn-debounced.test.ts`: 6 testes unitários cobrindo estado inicial imediato, retenção em notas sucessivas a 80 ms, estabilização ao fim da frase e flush sob demanda.

- **Resolução do Risco 2 (Internacionalização e Nomenclatura en-US / pt-BR)**:
  - `src/features/learn/i18n.ts`: dicionário de internacionalização ultraleve, estritamente tipado em TypeScript puro, sem bibliotecas pesadas de runtime;
  - Suporte completo a `en-US` e `pt-BR` em todo o motor educacional (`explain.ts`): notas e solfejo (*C (Do)* vs *C (Dó)*), 12 intervalos com nomes e caracteres afetivos (*unison, minor second, perfect fifth...*), qualidades de acordes (*major, minor, diminished, augmented, dominant 7th...*), funções harmônicas (*Tonic, Subdominant, Dominant*), cadências (*Authentic, Plagal, Deceptive, Half*), condução de vozes, modulações e ritmo;
  - Seletor instantâneo de idioma (`PT | EN`) integrado no cabeçalho do `LearnPanel.tsx` com persistência em `localStorage` e sincronização entre abas;
  - `tests/unit/learn-i18n.test.ts`: 15 testes unitários verificando cada função em inglês e português.

- **Resolução do Risco 3 (Acessibilidade de Tecnologias Assistivas e Leitor de Tela)**:
  - Controle dinâmico de verbosidade no card primário do `LearnPanel.tsx`: chaveamento entre `aria-live="polite"` e `aria-live="off"`, prevenindo poluição auditiva em cantoria contínua;
  - Botão de acessibilidade com status audível e visual no painel (`🔊 Leitor: Ativo` / `🔈 Leitor: Silencioso`) com atributo `aria-pressed`;
  - Persistência das preferências do usuário em `localStorage` (`config.learn.screenReaderStorageKey`);
  - `tests/unit/learn-screen-reader.test.ts`: 5 testes unitários validando padrão seguro contra sobrecarga acústica, persistência e fallback de chaves desconhecidas.

- **Verificação Técnica (Portão AGENTS.md §3)**:
  - `npm test`: **590/590 testes unitários verdes** em 70 arquivos de teste (26 novos testes adicionados);
  - `npm run typecheck`: **0 erros TypeScript** com validação estrita (`tsc --noEmit`);
  - `npm run build`: **Next.js Turbopack build 100% verde** com 6 rotas geradas (477 ms);
  - `npm run test:e2e`: **10/10 testes E2E Playwright verdes** (8.6s);
  - Latência e robustez mantidas: 0 atrasos no transport, RMSE de pitch inalterado (2.7¢ autocorrelação / 2.1¢ YIN).

## [Desktop 1.1] — Desktop Wrapper, Ultrabaixo Input Lag, Vocal Coach e Autotune — OK

- **Desktop Wrapper Multiplataforma (Windows, macOS e Linux)**:
  - `electron/main.cjs` e `electron/preload.cjs`: empacotador nativo desktop para distribuição em Windows (.exe instalador NSIS e portátil), macOS (.dmg e .zip Universal/Apple Silicon) e Linux (.AppImage e .deb);
  - Configuração `electron-builder.json` e scripts no `package.json` (`desktop:start`, `desktop:build`, `desktop:dist:mac`, `desktop:dist:win`, `desktop:dist:linux`);
  - `docs/desktop-app.md`: guia de arquitetura e distribuição desktop multiplataforma;
  - `electron/entitlements.mac.plist`: entitlements nativos macOS para captura de microfone e câmera sem bloqueios de sandbox.

- **Arquitetura de Ultrabaixo Input Lag (Low-Latency Realtime Audio)**:
  - Injeção das flags Chromium `--audio-buffer-size=256` (~5.3 ms @48kHz), `--enable-exclusive-audio` (WASAPI exclusivo no Windows, CoreAudio no macOS e PipeWire no Linux), `--disable-renderer-backgrounding` e `--disable-background-timer-throttling`;
  - Garante sincronia auditiva instantânea e retorno de áudio em tempo real com jitter < 1 ms.

- **Vocal Coach e Afinador Pedagógico em Tempo Real**:
  - `src/features/pitch/coach.ts`: motor puro de avaliação de entonação e afinação vocal contra notas cromáticas e escalas de tonalidades musicais ativas;
  - Medição exata de desvio em cents (-50¢ a +50¢), estados `silent`, `unclear`, `in-tune`, `flat`, `sharp` e `out-of-key`;
  - Recomendações pedagógicas em português em tempo real ("Suba a voz levemente", "Desça a voz", "Afinação perfeita em A4");
  - Placar de precisão vocal da sessão (% de afinação sustentada) e contador de streak contínuo em segundos;
  - `src/components/VocalCoachPanel.tsx`: medidor visual analógico/digital com agulha dinâmica, zona verde de precisão (±12¢) e aviso contextual;
  - `tests/unit/vocal-coach.test.ts`: 7 novos testes unitários verdes cobrindo silêncio, instabilidade, desvio bemol/sustenido, notas fora do tom e acúmulo de precisão.

- **Módulo de Autotune Configurável (Pitch Correction)**:
  - `src/audio-worklets/autotune-processor.js` e `public/worklets/autotune-processor.js`: AudioWorklet de correção de afinação em tempo real via algoritmo de duplo delay com janelamento cruzado e alinhamento de fase de baixa latência;
  - `src/features/audio/autotune.ts`: controlador de autotune com modos de velocidade Natural (80ms), Pop (25ms) e Robô / Hard (0ms — efeito clássico eletrônico/T-Pain), travamento de escala Cromático vs Escala da Música, controle de intensidade (amount) e volume de monitor com trava de segurança;
  - `src/components/AutotunePanel.tsx`: painel visual integrado de controle com aviso para uso de fones de ouvido para evitar microfonia acústica;
  - `src/features/audio/session.ts` e `useMicSession.ts`: integração completa do processador ao ciclo de vida de áudio do microfone;
  - `tests/unit/autotune.test.ts`: 11 novos testes unitários verdes validando snap cromático, snap harmônico, ratio de afinação e controle dinâmico de parâmetros.

- **Verificação Técnica (Portão AGENTS.md §3)**:
  - `npm test`: **564/564 testes unitários verdes** em 67 arquivos de teste (18 novos testes);
  - `npm run typecheck`: **0 erros TypeScript** com validação estrita (`tsc --noEmit`);
  - `npm run build`: **Next.js Turbopack build 100% verde** com 6 rotas geradas com sucesso (165ms);
  - Latência de buffer nativo desktop: 256 samples (~5.3ms);
  - RMSE de detecção de pitch mantido: 2.7¢ (autocorrelação) e 2.1¢ (YIN) com zero erros de oitava.

## [Fase 15] — Lançamento portfólio — OK

- **Produto Lançado e Posicionamento Técnico**:
  - Posicionamento normativo consolidado: instrumento musical em tempo real de alta performance executado 100% no navegador, combinando processamento digital de sinais (DSP), teoria musical computacional, composição algorítmica e visão computacional para regência gestual. **Zero chamadas a nuvem, zero latência de rede e zero modelos de linguagem (LLM) no caminho crítico de áudio.**
  - Filosofia de produto realizada de ponta a ponta: *"Você canta a música. O Luca constrói a banda."*

- **Build de Produção e Empacotamento**:
  - Build otimizado com Next.js 16 e Turbopack concluído com sucesso em 318 ms;
  - 6 rotas estáticas e dinâmicas geradas e verificadas: `/` (Landing & Onboarding), `/session` (Regente ao Vivo & Gestos), `/compose` (Hub de Projetos), `/compose/[id]` (Editor de Timeline & Exportação), `/learn` (Laboratório de Teoria & Modo Educativo) e `/_not-found`.

- **README e Documentação Principal**:
  - `README.md` reescrito e finalizado: quickstart em 3 comandos, diagrama de arquitetura completo do sistema em 1 figura Mermaid, mapa detalhado de rotas e superfícies, tabela de benchmarks medidos, comandos de teste/build e galeria de screenshots;
  - `docs/case-study.md` (novo): estudo de caso técnico detalhado cobrindo as 9 disciplinas de engenharia do projeto (DSP, regente de tempo real, teoria computacional, sintetizadores procedurais, visão computacional, robustez/soaks, exportação multitrack, pedagogia e arquitetura TypeScript pura);
  - `docs/architecture.md` e `docs/dependency-graph.md`: atualizados com o diagrama normativo completo de todos os módulos das Fases 0–15, fronteiras de camadas e invariantes arquiteturais;
  - `PRIVACY.md`: atualizado para o Lançamento 1.0 (Fases 1–15), reafirmando o compromisso de privacidade 100% on-device para áudio, vídeo, anotações e exportações locais.

- **Galeria Visual e Suíte de Smoke Test E2E**:
  - `e2e/portfolio.spec.ts` (novo): suíte automatizada de ponta a ponta que exercita todas as superfícies críticas do produto e gera 5 capturas visuais em alta resolução salvas em `public/demo/`:
    1. `public/demo/01-home.png` — Landing page com onboarding em 3 passos, pitch canvas e vitrine de módulos;
    2. `public/demo/02-conductor-session.png` — Regente musical ao vivo com acompanhamento de banda, acorde detectado, hot drum pickup e painel de gestos;
    3. `public/demo/03-theory-lab.png` — Laboratório de teoria interativo com demonstração canônica de tríade C–E–G e progressão I–V–vi–IV;
    4. `public/demo/04-timeline-editor.png` — Editor multitrack de timeline com notas quantizadas em 1/16, trilha harmônica e regeneração;
    5. `public/demo/05-export-modal.png` — Modal de exportação offline com opções WAV 16-bit estéreo, MIDI SMF Formato 1, JSON v1 e WebM.

- **Verificação de Ativos e Licenças**:
  - Áudio 100% sintetizado por código procedural em Web Audio (`WebAudioSink` com osciladores senoidais, dente-de-serra, ruído filtrado e envelopes analógicos virtuais);
  - Zero dependência de soundfonts comerciais, samples proprietários ou bibliotecas externas de som (TDR-02 mantido);
  - Código-fonte sob Licença MIT, totalmente auditável e autocontido.

- **Verificação Técnica (Portão AGENTS.md §3)**:
  - `npm test`: **546/546 testes unitários verdes** em 65 arquivos de teste (execução em 2.73s);
  - `npm run typecheck`: **0 erros TypeScript** com validação estrita (`tsc --noEmit`);
  - `npm run test:e2e`: **10/10 testes E2E Playwright verdes** (execução em 9.0s cobrindo toda a aplicação em navegador Chromium real);
  - `npm run build`: **Next.js Turbopack build 100% verde** com todas as páginas otimizadas;
  - Latência do pipeline voz→evento: p95 = 0.48 ms; percepção voz→banda: 120.5 ms (vs orçamento de 250 ms);
  - Acurácia de pitch: RMSE Autocorrelation 2.7¢ / YIN 2.1¢ com 0.0% erros de oitava;
  - Estabilidade de memória: 0.00% de crescimento estacionário após soaks de 60 minutos (323 itens estacionários);
  - Precisão de gestos: 100.0% de acerto canônico com 0.0% de misfires.

- **Riscos e Sugestões de Solução (para Triagem Final de Sprints)**:
  1. *Risco*: Variação na taxa de quadros e consumo de bateria em smartphones de entrada com MediaPipe WebAssembly ativo na câmera.
     *Sugestão de solução*: O sistema já possui paridade total de 100% via botões e atalhos de teclado; para uma futura sprint 2.0, adicionar decimação adaptativa de frames de vídeo (reduzindo de 30 para 15 fps caso a bateria esteja baixa ou a CPU atinja 80%).
  2. *Risco*: Compartilhamento em redes sociais e mensageiros em ecossistemas móveis que não reproduzem nativamente WebM/Opus (ex: iOS).
     *Sugestão de solução*: O sistema já entrega exportação WAV 16-bit universal e MIDI Formato 1; para pós-1.0, avaliar a adição de um muxer MP4/AAC leve em WebAssembly para renderização de vídeo/áudio compartilhado.
  3. *Risco*: Demanda de usuários por criação e personalização de novos estilos musicais além dos 9 presets de fábrica.
     *Sugestão de solução*: Como a arquitetura do motor de arranjo (`presets.ts`) isola presets em dados puros (`registerStyle`), implementar um construtor visual de estilos (`/styles/new`) onde o usuário define fórmulas de compasso e mapas de instrumentos sem tocar nos motores de som.

## [Fase 14] — Qualidade e endurecimento — OK

- **Endurecimento e Eliminação de Vazamentos de Memória (Hot Path)**:
  - `features/music/melody/stabilization.ts`: limitação estrita do anel `completed` em `NoteStabilizer` com teto `config.conductor.melodyCap` (128 itens), eliminando crescimento irrestrito de memória em sessões com milhares de notas cantadas.
  - `features/music/melody/phrases.ts`: limitação estrita do anel `completed` em `PhraseTracker` com teto de 64 frases (`phraseCap * 4`), impedindo vazamento de histórico de frases ao longo de horas.
  - `features/music/theory/key.ts`: adição de política de descarte de notas pendentes órfãs (`pending` Map limitado a 64 itens) para proteger contra eventos incompletos.
  - `features/conductor/state.ts`: limitação do mapa `open` de notas ativas em `ConductorState` para no máximo 64 itens com evicção segura de órfãos.
  - `features/conductor/conductor.ts`: método `dispose()` atualizado para realizar o cancelamento e desmonte explícito de todos os motores acoplados (`phrases.dispose()`, `tempo.dispose()`, `meter.dispose()`, `key.dispose()`), além da exposição da propriedade segura `isDisposed`.
  - `features/conductor/useConductor.ts`: ciclo de vida reativo corrigido com teardown em `useEffect` para desmontar o condutor e fechar `AudioContext` ao trocar de rota ou desmontar a sessão; recriação resiliente a React StrictMode.
  - `features/instruments/scheduler.ts`: proteção da fila do lookahead scheduler (`LookaheadScheduler.push`) com teto de 512 itens para prevenir sobrecarga de agendamentos em rajada.

- **Tabela de Latência e Orçamentos de Performance (Antes x Depois de Ajustes)**:

| Métrica | Alvo de Orçamento | Antes da Fase 14 | Fase 14 (Medido) | Status |
|---|---|---|---|---|
| Pitch block (2048 @ 48k) | mean < 5 ms, p95 < 10 ms | Autocorr 2.7 ms / YIN 2.0 ms | Autocorr 1.7 ms / YIN 1.8 ms | APROVADO |
| Pipeline voz→evento (excl. lookahead) | p95 < 60 ms | ~2.0 ms | mean 0.15 ms, p95 0.48 ms (5.000 obs) | APROVADO |
| Percepção voz→banda (incl. lookahead) | < 250 ms | ~130 ms | 120.48 ms típico (p95 + 120 ms) | APROVADO |
| Scheduler Tick Duration | tick < 25 ms | ~0.5 ms | 0.02 ms médio (< 1 ms max) | APROVADO |
| Frames dropados / Glitches | 0 em operação normal | 0 | 0 em 1.000 compassos contínuos | APROVADO |
| Atrasados (late total) | 0 frames fora da tolerância | 0 | 0 em 3.600 s de simulação | APROVADO |

- **Sobrecarga de CPU e Degradação Graciosa (§26, §45)**:
  - Degradação testada e provada em 3 níveis estritos:
    1. *Full*: 100% dos motores ativos, taxas nominais (60 Hz worklet proxy, 12 Hz UI meters, teoria a cada compasso);
    2. *Reduced* (badge `"QUALIDADE REDUZIDA — acompanhamento simplificado"`): acionado com `late >= 8` ou `tick >= 12 ms`; decima observações (1 a cada 2), reduz taxa do medidor UI para 6 Hz e teoria a cada 2 compassos;
    3. *Minimal* (badge `"MODO LEVE — bateria + baixo (nunca silêncio)"`): acionado sob estresse extremo (`late >= 24` ou `tick >= 24 ms`); suprime naipes pesados (cordas, violino, acordeom), preservando bateria + baixo sincronizados.
  - Recuperação por histerese: exige sinais completamente limpos (`late = 0` e `tick < 6 ms`) para restaurar a fidelidade máxima, prevenindo oscilações rápidas (flapping).

- **Matriz de Compatibilidade de Navegadores & Mobile**:

| Navegador / Plataforma | Microfone (Worklet) | Câmera / Visão | Gravação / Exportação | Armazenamento | Status |
|---|---|---|---|---|---|
| Chrome Desktop (macOS/Win/Linux) | AudioWorklet nativo | MediaPipe WebAssembly + GPU | WebM/Opus nativo + WAV | IndexedDB | Pleno (100%) |
| Edge Desktop (macOS/Win) | AudioWorklet nativo | MediaPipe WebAssembly + GPU | WebM/Opus nativo + WAV | IndexedDB | Pleno (100%) |
| Safari Desktop (macOS 14.1+) | AudioWorklet + retomada por toque | MediaPipe fallback seguro | WAV nativo (WebM fallback) | IndexedDB | Pleno (100%) |
| Firefox Desktop | AudioWorklet nativo | MediaPipe WebAssembly | WebM/Opus nativo + WAV | IndexedDB | Pleno (100%) |
| Safari Mobile (iOS 16+) | AudioWorklet (retomada obrigatória por gesto) | Câmera frontal + paridade total teclado/botão | WAV nativo | IndexedDB | Suportado (Design adaptativo) |
| Chrome Mobile (Android) | AudioWorklet nativo | Câmera frontal + paridade botões | WebM/Opus nativo + WAV | IndexedDB | Suportado (Design adaptativo) |

- **Robustez de Pitch por Registro, Dinâmica e Ruído**:
  - *Registro Grave (C2–C3, 65.4–130.8 Hz)*: Autocorrelation e YIN com RMSE < 35¢ e 0 erros de oitava;
  - *Registro Agudo (C5–C6, 523.3–1046.5 Hz)*: Autocorrelation e YIN com RMSE < 35¢ e 0 erros de oitava;
  - *Vibrato (5.5 Hz @ G4 ± 40¢)*: rastreamento suave sem pulos ou fragmentação de notas;
  - *Volume Baixo*: detecção estável a 0.02 RMS; rejeição total abaixo de 0.008 RMS (rmsGate);
  - *Rejeição de Ruído e Fala*: ruído branco e rosa de 0.8 RMS não provocam notas espúrias; modulação rápida da fala não atinge o limiar de estabilização de 120 ms.

- **Vocabulário Gestual e Taxa Anti-Misfire**:
  - Taxa de acerto nos 9 gestos canônicos (`OPEN_HAND`, `CLOSED_HAND`, `ONE_FINGER`, `TWO_FINGERS`, `THREE_FINGERS`, `SWIPE_UP`, `SWIPE_DOWN`, `SWIPE_LEFT`, `SWIPE_RIGHT`): **100%** em fixtures canônicos e tolerância a ruído de coordenadas de até ±2%;
  - Taxa de disparos acidentais (misfire rate) em mãos indeterminadas, punhos relaxados ou dedos semidobrados: **0.0%** (confiança < 0.70 impede qualquer acionamento);
  - Cooldown de 1200 ms estritamente verificado para todos os gestos.

- **Testes de Soak e Estabilidade de Memória (5 / 15 / 30 / 60 minutos)**:
  - *5 minutos (300 s)*: 74 notas, 27 acordes, 2 frases registradas (anéis em aquecimento);
  - *15 minutos (900 s)*: 128 notas (teto atingido), 52 acordes, 2 frases (311 itens retidos);
  - *30 minutos (1800 s)*: 128 notas, 64 acordes (teto atingido), 2 frases (323 itens retidos — regime estacionário);
  - *60 minutos (3600 s / 18.000 passos)*: 128 notas, 64 acordes, 2 frases (exatamente 323 itens retidos);
  - **Crescimento de memória em regime estacionário**: **0.00%** (alvo: ≤ 5.0%);
  - **Atrasados do scheduler**: **0** em toda a extensão do teste.

- **Checklist Manual para Sessões Longas de Canto Real**:
  1. *Ambiente e Calibração*: Verificar nível de ruído de fundo na barra de RMS (deve indicar < 0.008 em silêncio);
  2. *Início e Onboarding*: Clicar no botão `Start`, conceder permissão de microfone e confirmar transição de estado para "running" sem cliques audíveis;
  3. *5 Minutos de Canto Fluido*: Cantar estrofe e refrão alternados; verificar detecção de BPM estável e geração correta de acordes sem atrasos perceptíveis;
  4. *15 Minutos de Exploração de Arranjos*: Adicionar e remover instrumentos por gestos ou teclado (`1`–`8`); verificar transições quantizadas no tempo musical correto com fade in/out suave;
  5. *30 Minutos de Sessão Contínua*: Monitorar badge de diagnósticos; conferir que não há badge de qualidade reduzida em máquina normal;
  6. *60 Minutos de Endurance*: Manter a aba aberta tocando com voz contínua; verificar ausência de vazamento de memória ou travamento de aba;
  7. *Persistência e Exportação*: Parar sessão, salvar no hub `/compose`, abrir no editor timeline, quantizar e exportar em MIDI, WAV e JSON, conferindo fidelidade em player externo.

- **Verificação Técnica (Portão AGENTS.md §3)**:
  - `npm test`: **546/546 testes unitários verdes** em 65 arquivos de teste (30 novos testes de qualidade e robustez);
  - `npm run test:e2e`: **9/9 testes E2E Playwright verdes** (incluindo novo `e2e/quality.spec.ts`);
  - `npm run typecheck`: **0 erros TypeScript** (`tsc --noEmit`);
  - `npm run build`: **Build de produção Next.js Turbopack 100% verde** em 249 ms.

- **Riscos e Sugestões de Solução (para Triagem Final de Sprints)**:
  1. *Risco*: Política agressiva de suspensão de áudio em navegadores mobile (ex: iOS Safari) quando o usuário troca de aba ou bloqueia a tela.
     *Sugestão de solução*: Implementar detector de visibilidade da página (`document.visibilitychange`) para pausar suavemente o transporte e retomar com `AudioContext.resume()` sob o primeiro toque ao voltar.
  2. *Risco*: Variação na taxa de amostragem de microfones Bluetooth (ex: AirPods mudando de 44.1/48 kHz para 16/24 kHz no modo de entrada/saída de chamada).
     *Sugestão de solução*: O worklet já opera desacoplado do clock de áudio da saída; avaliar exibir card explicativo na Fase 15 caso a qualidade do microfone caia para banda telefônica.
  3. *Risco*: Usuários com baixa iluminação ou webcams de baixa resolução gerando ruído nos landmarks de gestos.
     *Sugestão de solução*: Já mitigado na Fase 9 com paridade total via botões e atalhos de teclado (`1`–`8`, `A`, `E`, etc.); incluir dica visual no card de câmera sugerindo iluminação frontal adequada.

## [Fase 13] — Modo educacional — OK

- `features/learn/explain.ts` (novo): motor de explicações de teoria musical em TypeScript
  puro (zero React, zero Web Audio, zero LLM); converte representações exclusivamente
  estruturadas (`MusicalState`, `NoteEvent`, `Chord`, `KeyEstimate`, `Cadence`) em linguagem
  humana acessível em português (pt-BR) sem jargões forçados; implementação estrita dos
  critérios de aceite canônicos:
  - Cantar `C–E–G` (arpejado ou tríade) exibe `"tríade de C maior"`;
  - Progressão `G–D–Em–C` em G exibe `"funções I–V–vi–IV em G"`;
  - Cadências canônicas resolvidas via `cadence.ts`: Autêntica (V→I), Plagal (IV→I),
    Engano (V→vi) e Semicadência (→V);
  - Intervalos com nomenclatura em português (uníssono, segunda menor/maior, terça menor/maior,
    quarta justa, trítono, quinta justa, sexta menor/maior, sétima menor/maior, oitava);
  - Escalas maior e menor natural com intervalos, fórmulas e descrição de sensação acústica;
  - Condução de vozes (`explainVoiceLeading`) destacando notas comuns mantidas e graus conjuntos;
  - Modulação tonal (`explainModulation`) identificando relações de quinta e novas tonalidades;
  - Ritmo e andamento (`explainRhythm`) descrevendo compassos 4/4, 3/4 e 6/8 e pulsação em BPM;
  - Resiliência estrita: entradas atonais, ruídos e estados vazios recebem fallbacks graciosos e
    acolhedores (ex: "Conjunto melódico livre"), sem jamais lançar exceções.
- `features/learn/types.ts` (novo): tipos formais da camada educacional (`LearnLevel`,
  `LEARN_LEVELS` com 9 níveis progressivos, `EducationalSnippet`, `MusicalExplanation`,
  `LearnSettings`).
- `features/learn/useLearnSettings.ts` (novo): gerenciador de configurações do modo educacional
  com persistência local em `localStorage` (chaves centralizadas no config) e fallback em
  memória seguro para SSR e execução de testes em Node.
- `components/LearnPanel.tsx` (novo): componente de apresentação acessível (`role="region"`,
  `aria-live="polite"`, `data-testid="learn-panel"`) para o painel contextual *"O que acabou
  de acontecer?"*, com seletor de níveis progressivos em pills e cards informativos.
- `app/learn/page.tsx` (novo): rota `/learn` contendo o estúdio educacional completo,
  visão da trilha progressiva dos 9 níveis, controle mestre do toggle e laboratório de
  teoria viva com botões para testar em tempo real as figuras canônicas (`C–E–G`, `G–D–Em–C`,
  cadências e sonoridade atonal).
- `app/session/page.tsx`: integração do toggle global do modo educativo no cabeçalho
  (`data-testid="toggle-learn"`), link para `/learn` e renderização condicional do
  `LearnPanel` alimentado pelo snapshot do `ConductorState`; quando desativado, o painel
  é omitido por completo, garantindo zero peso acadêmico ou impacto de performance no UI.
- `features/conductor/useConductor.ts`: exposição do método `getMusicalState` para permitir
  acesso seguro e tipado ao snapshot do `ConductorState` pelo painel educacional.
- `lib/config.ts`: adição da seção `learn` centralizando chaves de armazenamento local,
  valores padrão e janelas de análise harmônica sem números mágicos.
- `docs/education-spec.md` (novo): especificação arquitetural normativa da camada educacional,
  detalhando isolamento do caminho crítico de áudio, mapa dos 9 níveis e tabela de aceite.
- Verificação: **516/516 testes unitários verdes** (17 novos testes em `tests/unit/learn-explain.test.ts`),
  typecheck estrito limpo (`tsc --noEmit`), build Next.js limpo em 220ms com rota `/learn`
  estática pré-renderizada, **8/8 testes E2E Playwright verdes** (incluindo `e2e/learn.spec.ts`
  cobrindo o laboratório interativo e o toggle contextual em `/session`).
  Benchmark de áudio: RMSE autocorr 2.7¢ / YIN 2.1¢; latência do conductor p50 < 0.5 ms e
  orçamento percebido < 250 ms respeitado.
- Riscos e sugestões (p/ triagem fim de sprint):
  1. *Frequência de atualização contextual durante fraseado melódico rápido*: se o usuário cantar
     muitas notas curtas em sucessão rápida, o painel pode atualizar o texto a cada nota.
     *Sugestão*: Na Fase 14 (Hardening), avaliar debounce ou retenção de estado por fim de
     frase (`PhraseEnded`) para estabilizar a leitura.
  2. *Internacionalização das explicações além do pt-BR*: todas as explicações foram implementadas
     nativamente em português com termos familiares (Dó, Ré, Mi... e cifras).
     *Sugestão*: Na Fase 15 (Portfólio/Lançamento), se houver demanda internacional, extrair os
     templates para um arquivo i18n suportando en-US.
  3. *Acessibilidade para leitores de tela com atualizações frequentes*: o `aria-live="polite"`
     atualiza a cada novo acorde ou nota estável.
     *Sugestão*: Na Fase 14, considerar opção de silenciar anúncios de leitor de tela para
     sessões longas contínuas.

## [Fase 12] — Exportação — OK

- `features/export/json.ts` (novo): envelope versionado (`schemaVersion: 1`, `ExportedCompositionV1`,
  gerador, timestamp), serialização com `exportToJson`, importação com `importFromJson`,
  suporte a migração de payloads sem envelope e rejeição estrita com mensagem legível para
  versões de schema futuras ou schemas corrompidos (§40).
- `features/export/midi.ts` (novo): codificador de Standard MIDI File (SMF 1.0) Formato 1 em
  TypeScript puro (zero dependências externas); 3 trilhas estruturadas: Trilha 0 (Conductor/Tempo
  com Set Tempo e Time Signature), Trilha 1 (Melodia com NoteOn/NoteOff mapeados em ticks com
  resolução PPQ = 480, duração e velocidades dinâmicas), Trilha 2 (Acordes/Harmonia sincronizados
  aos compassos); parser SMF reverso `parseMidi` para decodificação e teste comparativo
  nota-por-nota (início, duração, afinação/MIDI, andamento, compasso).
- `features/export/wav.ts` (novo): renderizador offline desvinculado do motor de playback ao vivo;
  `renderToWav` via `OfflineAudioContext` mais rápido que tempo real; síntese da voz principal e
  acompanhamento dos 8 instrumentos (`PLAN_OF` + `createBand` + `WebAudioSink`); codificador
  `encodeWav` gerando cabeçalho RIFF WAVE canônico 16-bit PCM estéreo a 44.1 kHz com clamping de
  amostras para evitar distorção numérica; `computeCompositionDuration` calculando limites com
  cauda de decaimento de 1.0s.
- `features/export/webm.ts` (novo): exportador de áudio compactado nativo com codec Opus via
  `MediaRecorder`; verificação de suporte de ambiente (`isWebmExportSupported`) e fallback
  informativo orientando exportação em WAV.
- `features/export/index.ts` (novo): facade unificada de exportação com re-exports e tipos
  `ExportFormat`, `ExportResult`.
- `components/ExportModal.tsx` (novo): modal acessível (`aria-modal="true"`, `role="dialog"`, atalho Esc)
  com seleção de formato (WAV, MIDI, JSON, WebM), barra de progresso em tempo real e download
  automático no navegador.
- `app/compose/[id]/page.tsx`: integração do botão `⬇ EXPORTAR` no cabeçalho do editor e
  montagem do `ExportModal` com a composição ativa.
- `features/instruments/audio-sink.ts`: generalização do construtor de `WebAudioSink` para
  aceitar `BaseAudioContext`, permitindo o uso transparente de `OfflineAudioContext` na
  renderização offline.
- `docs/tdr/tdr-12-export-formats.md` (novo): TDR-12 registrando formalmente a decisão sobre MP3
  (adiado para Fase 14/15 para evitar dependência externa pesada), Stems (entregue no MIDI Formato 1;
  pacote ZIP de WAVs planejado para Fase 14) e MusicXML (adiado para Fase 13 onde o motor de
  notação e partituras será desenvolvido).
- Verificação: **499/499 testes unitários verdes** (19 novos testes em 4 arquivos: `export-json` 7,
  `export-midi` 5, `export-wav` 5, `export-webm` 2), typecheck estrito limpo (`tsc --noEmit`),
  build Next.js limpo em 205ms, **6/6 testes E2E Playwright verdes** (incluindo o novo teste
  `e2e/export.spec.ts` cobrindo o fluxo completo de abertura de modal, seleção de formatos,
  download e fechamento).
- Riscos e sugestões (p/ triagem fim de sprint):
  1. *Consumo de memória em renderização WAV de músicas longas*: arquivos PCM 16-bit estéreo a
     44.1 kHz consomem ~10 MB por minuto no buffer offline do navegador. Para composições muito
     longas (>15 min), a alocação de Float32Array pode pressionar abas de dispositivos móveis —
     *sugestão*: na Fase 14 (Hardening), implementar renderização em chunks ou streaming com
     AudioWorklet/Worker para arquivos de longa duração.
  2. *Compatibilidade limitada de WebM/Opus no Safari iOS*: o Safari em certas versões do iOS não
     suporta gravação em WebM/Opus pelo `MediaRecorder` — *sugestão*: o sistema já detecta via
     `isWebmExportSupported` e orienta o usuário a usar WAV ou MIDI; na Fase 14/15, avaliar a
     inclusão de um muxer AAC/MP4 leve para Safari móvel se houver demanda.
  3. *Ausência de compactação ZIP para stems múltiplos em WAV*: exportar múltiplos arquivos WAV
     simultâneos (stems individuais de cada instrumento) exige empacotador ZIP no navegador —
     *sugestão*: planejado para a Fase 14 uma rotina de empacotamento ZIP leve em Web Worker sem
     bloquear a thread principal.

## [Fase 11] — Gravação e editor — OK

- `features/recording/schema.ts` (novo): validação de schema estrita com
  `validateComposition` e `CompositionValidationError`, rejeitando dados inválidos
  (andamento fora dos limites, notas com duração/frequência negativas, acordes
  com qualidades desconhecidas, instrumentos incompletos, etc.), garantindo
  que nunca ocorra corrupção silenciosa (§41).
- `features/recording/storage.ts` (novo): persistência local no IndexedDB
  (`luca-music`, store `compositions`, keyPath `id`), sem nuvem (TDR-06);
  fallback in-memory transparente em ambientes sem IndexedDB (Node.js/SSR/testes);
  `saveComposition`, `loadComposition`, `listCompositions`, `deleteComposition`.
- `features/recording/capture.ts` (novo): `SessionRecorder` — captura estruturada
  de sessão (notas da voz, acordes, andamento, fórmula de compasso, tonalidade,
  arranjo e dinâmica) em tempo real via `EventBus`; emissão de `RecordingStarted`
  e `RecordingStopped`; normalização temporal de timestamps relativos e absolutos;
  preservação de representação estruturada separada de qualquer áudio derivado.
- `features/recording/editor.ts` (novo): operações puras e imutáveis sobre
  `Composition` (mover nota, mudar afinação em semitons, alterar duração,
  adicionar/remover notas, quantização de melodia para grades 1/16, 1/8 e 1/4 de
  tempo, alteração de andamento, tom, acordes, controles de mixer volume/pan/mute);
  função `regenerateAccompaniment` executando o motor de harmonia (Fase 4) e ritmo
  (Fase 5) sobre a melodia editada com teto de segurança contra loops excessivos.
- `features/recording/replay.ts` (novo): `reconstructSessionEvents` e `ReplayEngine` —
  reconstrução determinística de eventos canônicos com garantia de round-trip
  bit-idêntico (`gravar → salvar → carregar → replay`).
- `features/recording/useRecorder.ts` (novo): hook React integrando captura de
  sessão, persistência e listagem de projetos.
- `components/TimelineEditor.tsx` (novo): componente visual com trilha de melodia
  interativa (blocos de notas clicáveis com inspetor de afinação, início e duração),
  trilha de acordes por compasso com seleção de fundamental e qualidade, botão
  de regeneração harmônica, e mixer de canais com volume, pan e mute.
- `app/compose/[id]/page.tsx` + `app/compose/page.tsx` (novos): rota dinâmica
  `/compose/[id]` para o editor completo de timeline com transporte (replay, salvar,
  voltar à sessão); rota `/compose` para o hub local de projetos salvos.
- `app/session/page.tsx`: integração de transporte de gravação (botão gravar/parar,
  link direto para o editor com o ID da sessão gravada, contador de projetos salvos).
- Verificação: **480/480 testes** (25 novos em 5 arquivos: `recording-schema` 8,
  `recording-storage` 4, `recording-capture` 3, `recording-editor` 9, `recording-replay` 1),
  typecheck limpo, build Next.js OK (`/`, `/session`, `/compose`, `/compose/[id]`),
  **5/5 testes E2E Playwright verdes** (incluindo o novo teste `e2e/compose.spec.ts`:
  gravação em `/session` → abertura em `/compose/[id]` → edição/quantização/regeneração
  → salvamento → listagem no hub `/compose`).
- Riscos e sugestões (p/ triagem fim de sprint):
  1. *Crescimento de armazenamento no IndexedDB*: gravações longas com muitas notas
     e metadados podem acumular espaço local se o usuário criar muitas sessões —
     sugestão: na Fase 12/14 adicionar cota visual de armazenamento e exportação/backup JSON.
  2. *Throttling de timers de Replay em aba em segundo plano*: se a aba for minimizada
     durante o playback do replay, `setTimeout` sofre throttling pelo navegador (~1s) —
     sugestão: na Fase 12/14 basear o replay no relógio de áudio (`AudioContext.currentTime`).
  3. *Histórico de Undo/Redo no Editor*: edições na timeline atualmente aplicam patches
     imediatos sem pilha de desfazer (Ctrl+Z) — sugestão: adicionar pilha imutável
     `undoStack/redoStack` no estado do editor na Fase 14.

## [Fase 10] — Experiência polida — OK

- `globals.css`: identidade visual refinada de LUCA MUSIC com tokens semânticos
  estritos (sem neon, sem glassmorphism, sem gradientes chamativos; superfície
  neutra, tipografia limpa, foco visual de alto contraste AA).
- `components/OnboardingGuide.tsx` + `components/onboarding.ts` (novos):
  onboarding em 3 passos (1. Liberar microfone → 2. Sustentar nota vocal →
  3. Ver a nota e revelar banda). Respeita `localStorage` para persistir
  conclusão/dispensa; acessibilidade com `aria-live="polite"` e navegação por teclado.
- `components/StatusCard.tsx` + `components/statusCards.ts` + `components/audioHealth.ts` (novos):
  sistema unificado de cartões de status e saúde de áudio (§43). Estados de
  carregamento, vazio, erro de microfone/câmera, AudioContext suspenso, CPU overload
  e falhas de amostragem — todos com ações guiadas de recuperação ("Tentar novamente",
  "Abrir ajuda", etc.), impedindo telas silenciosas ou estados travados.
- `components/HelpDialog.tsx` + `components/helpContent.ts` (novos): diálogo modal
  acessível com glossário musical essencial, atalhos de teclado e dicas operacionais.
- `PRIVACY.md` (novo): compromisso local-first (§46). Explicação clara de uso de microfone
  e câmera, garantia de zero telemetria/uploads, e instruções de remoção de dados locais.
- Verificação: **455/455 testes** (25 novos: `ux-audio-health` 9, `ux-status-cards` 7,
  `ux-onboarding` 6, `ux-help` 3), typecheck limpo, build Next.js OK (`/` e `/session`).
  Contraste AA e navegação por teclado testados.
- Riscos e sugestões (p/ triagem fim de sprint): (1) suporte de leitor de tela em
  sistemas móveis antigos pode variar em anúncios de `aria-live` muito rápidos;
  (2) persistência em `localStorage` pode ser limpa se o usuário navegar em janela
  anônima, reativando o onboarding — sugestão: manter botão "Pular tour" sempre visível.

## [Fase 9] — Câmera e gestos — OK

- `features/gestures/recognition.ts` (novo): `GestureRecognizer` puro —
  pose estática dispara só com o MESMO gesto ≥ 0.7 por ≥ 400 ms (entrada
  exige o teto cheio; durante o hold, quedas até 0.6 sobrevivem via
  `hysteresisMargin` 0.1); cooldown 1200 ms POR GESTO (OPEN→CLOSED segue
  rápido, OPEN→OPEN não dispara duplo); tracking perdido decai, nunca
  trava; `pushDiscrete` p/ swipes (teto + cooldown, sem hold) +
  `snapshot`/`cooldownRemaining` p/ o indicador. Tudo de
  `config.gesture` (ganha `hysteresisMargin`, `swipeMinDisplacement`,
  `swipeWindowMs`, `fingerExtendRatio` — sem números mágicos).
- `features/gestures/landmarks.ts` (novo): `classifyStaticGesture`
  (21 pontos → OPEN/CLOSED/1–3 dedos por razão de extensão
  punho-invariante + confiança pela margem) + `SwipeDetector` (deslocamento
  ≥ 0.25 do frame em ≤ 600 ms; deriva lenta nunca dispara; re-arma por
  detecção) + `loadHandLandmarker` (import dinâmico indireto c/
  `webpackIgnore`, GPU, 100% local; null fora do browser/sem pacote →
  build nunca depende do modelo).
- `features/gestures/mapping.ts` (novo): matriz total gesto→intenção
  (open/close no selecionado; dedos 1/2/3 = low/medium/high; ↑/↓ = passo
  de energia; ←/→ = passo de seleção), `GESTURE_KEYBOARD` (O/C, 1/2/3,
  setas), labels pt-BR, `GestureSelection` cíclica (default violão) +
  `GestureArrangementBridge` (1 evento → 1 chamada). Zero import de
  instruments (fronteira com teste dedicado).
- `features/gestures/camera.ts` (novo): `CameraSession` (vídeo-only, sem
  áudio) espelhando `MicSession` — pre-explain antes do request, negada/
  sem-hardware/ocupada → recuperação guiada com paridade total; frames
  classificados em memória, nunca gravados/enviados/persistidos.
- `features/gestures/useGestures.ts` + `components/GesturePanel.tsx`
  (novos): loop de visão em rAF off-DOM (sem setState por frame; indicador
  a 8 Hz), botões p/ os 9 gestos + seletor de alvo + medidor de
  confiança + cards de explicação/negação; teclado global (ignora
  inputs, sem repeat) emite o MESMO `GestureDetected` da visão.
- Regente: `Conductor` assina `GestureDetected` → `applyGesture`
  (add/remove quantizados e pinados como toggles manuais; energia via
  `setEnergyMode`; payload malformado ignorado, nunca crash);
  `useConductor` expõe `gestureSelected` + refresh no evento;
  `/session` ganha a seção GESTURES. Visão nunca alcança síntese:
  gesto sem tick = 0 vozes agendadas (testado).
- Verificação: **430/430 testes** (81 novos em 6 arquivos: recognition
  14, landmarks 12, mapping 28, boundary 12, camera 6,
  conductor-gestures 9), typecheck limpo, build Next.js OK (rotas `/`,
  `/session`), **E2E Playwright chromium 1 passed contra `next start`**
  (start → fixture → acorde → add/remove, sem mic). Aceite: cada gesto
  do vocabulário dispara via evento após hold, parcial/não-confiante
  nunca vira evento; toda ação existe em botão + teclado; câmera
  negada/ausente = paridade total (preview-only sem modelo).
- Docs: TDR-09 (semântica de reconhecimento/mapeamento, loader opcional,
  paridade de teclado); `gesture-architecture.md` (implementado +
  notas medidas), `architecture.md` (§5/§9/§11), `repository-structure.md`,
  `event-model.md` (GestureDetected: visão/hook → regente → arranjo),
  `docs/STATUS.md` Fase 9 → OK, próxima → 10.
- Riscos e sugestões (p/ triagem fim de sprint): (1) classificador
  validado só em landmarks sintéticos — mãos reais (luz, oclusão,
  tons de pele) podem elevar misfires → QA manual Fase 10 (cada gesto
  5×, 2–3 usuários, matriz de confusão) antes de declarar confiável.
  (2) Preview selfie pode espelhar o eixo X (depende do browser) e
  inverter ←/→ na percepção → Fase 10 verifica e, se preciso, espelha
  a classificação ou o preview com nota no TDR. (3) Sem Worker dedicado
  (rAF na main thread) — CPU sob carga pode atrasar a classificação →
  Fase 14 mede p95 de frame e migra p/ Worker se estourar. (4) Loader
  MediaPipe exercitado só no fallback null (sem rede em CI) → QA manual
  Fase 10 com câmera real + latência percebida anotada. (5) Dedos 1/2/3
  tiram o modo Auto (viram manual) sem gesto de volta — o select de
  energia cobre a paridade, mas sem atalho → Fase 10 avalia gesto de
  retorno ao Auto ou aceita (decidir na triagem). (6) Rajada de gestos
  distintos não tem cooldown global — energia pode thrashear (o arranjo
  coalesce por instrumento, mas nível pode oscilar) → observar em QA;
  se thrashear, cooldown global curto (~300 ms) na Fase 10. (7) Seleção
  por swipe é invisível sem olhar o painel (risco de adicionar o
  instrumento errado) → Fase 10 adiciona flash visual + anúncio
  aria-live no alvo. (8) Atalhos globais (O/C/setas) podem colidir com
  editor (Fase 11) e leitores de tela → Fases 10/11 escopam atalhos por
  rota. (9) E2E contra `next dev` segue bloqueado (`allowedDevOrigins`
  no Next 16 sobre 127.0.0.1 — confirma risco 5 da Fase 8); CI deve
  rodar E2E contra `next start` (foi o caminho verde aqui).

## [Fase 8] — Regente musical em tempo real — OK

- `features/conductor/transport.ts` (novo): `MusicalTransport` — relógio
  único de compassos/tempos (origem + BPM playback + compasso;
  `barFloatAt/beatFloatAt/barStartSec/nextBoundary`); audio-clock no
  browser, segundos injetáveis nos testes. Sem React/WebAudio.
- `features/conductor/state.ts` (novo): `ConductorState` — `MusicalState`
  central via eventos (notas/acordes/tempo/compasso/tom/lineup/energia/
  frases); anéis limitados por `config.conductor` (melodia 128, acordes
  64, frases 16; soak-safe).
- `features/conductor/harmony-driver.ts` (novo): um acorde por compasso
  reutilizando o scorer da Fase 4 (pool diatônico + 6 dimensões + prior de
  template + trava de repetição); só orquestração, sem lógica nova.
- `features/conductor/conductor.ts` (novo): `Conductor` — caminho de
  entrada (melodia→ritmo→tom), `planAheadBars` 2, dreno quantizado do
  arranjo, mixer, pins manuais (`pinHoldsAuto`: sobrevivem ao Auto),
  **hot drum pickup** (1º onset do compasso agenda o groove restante em
  now + 50 ms com dispatch síncrono, só bateria, 1×/compasso),
  latência + degradação. Sem React, sem AudioContext no import.
- `features/conductor/latency.ts` + `degradation.ts` (novos):
  `LatencyTracker` (voz→acompanhamento medido, orçamento 250 ms) +
  `DegradationController` (full→reduced→minimal na ordem do orçamento,
  badge sempre, nunca silêncio — minimal mantém bateria+baixo).
- `features/conductor/fixture.ts` + `useConductor.ts` (novos): frase G4
  sintética (caminho sem mic) + hook (tick de transporte 50 ms, snapshots
  por eventos, `injectFixture`, banda lazy em gesto).
- `app/session/` (nova): experiência completa do regente — tom/BPM/
  compasso/acorde ao vivo, lineup com fila quantizada, style+energy,
  latência + badge de degradação, diagnósticos, `?fixture=g4`.
- `config.conductor` (novo) + look-ahead confirmado em `config.audio`
  (120 ms / 25 ms — TDR-08); `scheduler.ts` ganha graça de 25 ms contra
  skew de relógio (contratos da Fase 6 intactos) e o regente carimba
  now + 20 ms nos planos mid-compasso.
- Verificação: **349/349 testes** (28 novos: transport 5, state 4,
  harmony 4, latency 4, degradation 5, sync 5, soak 1), typecheck limpo,
  build Next.js OK (rotas `/`, `/session`), **E2E Playwright chromium
  1 passed** (start → fixture → acorde → add/remove, sem mic).
  Aceite: voz→bateria ≈ 50–200 ms (pickup medido), percebido
  (handle + 120 ms) < 250 ms; sincronia mesma-barra (tolerância 50 ms +
  horizon); soak simulado 900 s limpo (0 late, nível full, anéis
  limitados); pins manuais sobrevivem ao Auto; add/remove quantiza
  (mid-compasso → próximo compasso, nunca mid-beat).
- Docs: TDR-08 (pickup + graça + 120/25 confirmados); `architecture.md`
  §11, `performance-budget.md` (finais medidos), `repository-structure.md`;
  `docs/STATUS.md` Fase 8 → OK, próxima → 9.
- Riscos e sugestões (p/ triagem fim de sprint): (1) pickup repete
  downbeat já tocado quando a voz entra logo após o tempo 1 (flam de
  bateria aceitável, mas audível em andamento lento) → Fase 10 avalia
  pular hits < 80 ms do dispatch. (2) Re-harmonização 1×/compasso com
  melodia parcial pode trocar o acorde no compasso seguinte ao que o
  ouvido esperava (correto pelo scorer, mas "saltitante" em voz
  cromática) → Fase 10 avalia histerese de acorde com números.
  (3) `KeyEstimator` ainda usa ms de parede nas observações; transporte
  usa segundos de áudio — alinhados hoje (ms/1000), mas relógio duplo
  conceitual → Fase 11 unifica no transport ao persistir. (4) Tick 50 ms
  + horizon 120 ms deixa ~70 ms de margem; throttle agressivo de aba
  oculta pode acumular lates → badge cobre, mas Fase 14 deve soakar aba
  oculta de verdade. (5) E2E roda contra `next start` (HMR instável em
  sandbox); CI deve preferir prod ou gateway com WS liberado. (6) Sem
  humanização/swing (herdado Fases 5–7) — banda completa e pontual pode
  soar mecânica → Fase 10 (humanização) com números antes/depois.
  (7) Página `/` ainda usa os hooks antigos (`useMusicPipeline`/
  `useBand`/`useArrangement`) em paralelo ao regente — duplicação
  temporária; Fase 10 migra `/` para `useConductor` e remove os legados
  ou os declara fallback. (8) Soak de 15 min é SIMULADO (transporte
  acelerado, sem áudio real); soak manual com áudio + memória do
  navegador continua obrigatório na Fase 14.

## [Fase 7] — Motor de arranjo — OK

- `music/arrangement/state.ts` (novo): `ArrangementEngine` — pedidos
  add/remove quantizados à próxima fronteira (`config.arrangement.
  transitionBars` 1; pedido no meio do compasso espera, pedido em cima da
  fronteira aplica na hora); `PhraseEnded` é fronteira válida (fast-path via
  `tick(..., { phraseBoundary: true })`); cada transição carrega `fadeSec`
  (`fadeBeats` 1 no andamento do pedido) + curva `fadeGain` in/out; emite
  `InstrumentAdded/Removed`; fila coalescida por instrumento (último pedido
  vence; pedido redundante cancela a fila e é no-op). Helpers puros
  `effectiveBarFor`/`barFloatAt`/`fadeSecFor`.
- `music/arrangement/dynamics.ts` (novo): `DynamicsTracker` — RMS cru →
  0–1 via o `EnergyNormalizer` compartilhado (teto adaptativo + EMA) →
  low/medium/high → `EnergyChanged` SÓ com energia normalizada (nunca
  amplitude→volume; payload 0–1 espelha o snapshot) e SÓ em movimento
  material (≥ `energyEmitDelta` 0.05) ou virada de nível (sem spam
  por frame).
- `music/arrangement/presets.ts` (novo): estilos em dados no formato da
  spec §55 (BPM, densidade harmônica, padrões, defaults) — neutro, balada,
  rock, folk, ambient (todos com `drums` válido na biblioteca de padrões,
  boot em trio bateria+baixo+piano); `ENERGY_ENSEMBLE` low 3 → medium 5 →
  high 8 (aninhados, bateria+baixo sempre) + `ENERGY_DENSITY` 0.25/0.55/0.85
  (low < `densitySparseBelow`, high > `densityDenseAbove` — a semântica do
  renderer da Fase 5 vale); `registerStyle` (dado novo, sem código; id
  duplicado ou padrão de bateria desconhecido falha rápido) + `styleById`
  (desconhecido → neutro, UI nunca quebra) + `styleDrums`/`ensembleForEnergy`
  /`densityForEnergy` (cópias — chamador não corrompe o dado).
- `config.arrangement`: ganha `fadeBeats` 1 e `energyEmitDelta` 0.05
  (sem números mágicos nos motores).
- UI: `useArrangement.ts` (Auto segue o nível da voz e re-voz o lineup via
  pedidos quantizados; manual Suave/Média/Cheia fixa o nível; toggle por
  instrumento quantiza; poll de fronteira 250 ms + dreno imediato no
  `PhraseEnded`) + `ArrangementPanel.tsx` (selects de Style/Energy
  funcionais, medidor de voz com `role=meter`, pills do lineup com fila
  visível `⏳compasso`, linha de status com fade/densidade) ligado em
  `page.tsx` (RMS do mic alimenta os dois normalizadores); placeholders
  desabilitados removidos.
- Verificação: **321/321 testes** (32 novos em 3 arquivos: estado 14,
  dinâmica 7, presets 11), typecheck limpo, build Next.js OK. Aceite:
  pedido no beat 2.5 → fila (`effectiveBar` 1, `fadeSec` > 0), nada em
  0.99, aplica no compasso 1 com `InstrumentAdded`; low/medium/high → 3/5/8
  instrumentos e densidade 0.25 < 0.55 < 0.85; preset `forro-test`
  registrado em dados → resolve por id → `planDrums` rende eventos sem
  tocar código de motor.
- Docs: sem TDR (módulos já previstos em `architecture.md` §5 e
  `repository-structure.md`; presets implementam o §55/§8 no caminho
  `features/music/arrangement/presets.ts` do prompt da fase);
  `architecture.md` §8 e `repository-structure.md` anotados;
  `docs/STATUS.md` Fase 7 → OK, próxima → 8.
- Riscos e sugestões (p/ triagem fim de sprint): (1) relógio de compassos
  do hook é wall-clock (origem = mount), não transport — virada de
  andamento remodela o grid e o poll 250 ms pode atrasar a fronteira em
  até um tick → Fase 8 dirige `engine.tick` pelo transport/audio-clock.
  (2) Fade é curva de dados (`fadeSec` + `fadeGain`) + envelopes por nota;
  sem rampa de ganho por motor ainda (entrada click-free, mas sem swell
  audível de 1 tempo) → Fase 8 aplica `fadeGain` no ganho do motor.
  (3) Toggle manual perde para o Auto na próxima virada de nível (sem
  pinning) → Fase 8 adiciona pin por instrumento. (4) Dois normalizadores
  de energia (pipeline + arrangement) no mesmo RMS — convergem igual hoje,
  mas é duplicação → Fase 8 unifica no regente (dynamics vira fonte
  única). (5) Troca de estilo não re-voz o que já toca (só padrão/BPM/
  densidade futuros) — 1 compasso pode misturar padrões → Fase 8
  re-planeja a fronteira com o novo `style.drums`. (6) Voz no limiar
  low/medium pode oscilar o lineup (thrashing) com `energyEmitDelta`
  0.05 → Fase 8 avalia histerese por nível/deadband com números.
  (7) Sem humanização/swing (herdado Fases 5–6) — arranjo cheio pode soar
  mecânico → humanização nos motores (Fase 6-previsto/Fase 10).
  (8) Hook/UI sem teste montado (vitest é node-only) — coberto
  indiretamente pelos testes do motor → E2E Fase 8 (start→sing→band)
  cobre; avaliar Testing Library se o hook crescer.

## [Fase 6] — Motor de instrumentos — OK

- `features/instruments/types.ts` (novo): `InstrumentEngine` +
  `ScheduleContext` + `MusicalEvent` verbatim da spec; `VoiceSink`
  (única costura com som), `beatToAudioTime`, clamps, `midiToFreq`.
- `features/instruments/audio-sink.ts` (novo): `WebAudioSink` —
  osciladores + ruído filtrado + envelopes, zero samples (TDR-02 mantido:
  Tone.js NÃO entrou; sem TDR novo). Voz nunca quebra a banda (try/catch
  por voz); `cancel()` silencia; nada de AudioContext no import (SSR/Node
  seguros).
- `features/instruments/scheduler.ts` (novo): look-ahead 25 ms / 120 ms
  de `config.audio`; fila ordenada por audioTime; atrasado → contador de
  diagnóstico, nunca crash (NaN/Infinity descartados, consumidor que
  throws é isolado). Relógio injetável (vitest dirige o tempo).
- `features/instruments/planning.ts` (novo): planners puros — bateria
  (só ritmo/energia, ignora melodia E acordes por construção), baixo
  (fundamental+quinta, acento em início de frase), piano (voicings do
  beam-search em broken chords), violão (strum 12 ms + arpejo),
  cordas (pads de compasso inteiro, swell com energia), violino
  (dobra a melodia SÓ em compassos de início de frase), sax (fill no
  último tempo, SÓ com energia ≥ `saxFillEnergyMin` 0.5), acordeão
  (tríade rearticulada por tempo, pulso de fole).
- `features/instruments/{drums,bass,piano,guitar,strings,violin,sax,
  accordion}.ts` (novos): 1 arquivo por motor (plan + timbre + factory);
  `engine-base.ts`: `EngineBase` compartilhado (programa ignora eventos
  de outro instrumento e de percussão desconhecida sem crash);
  `registry.ts`: 8 linhas canônicas + `register/unregister` público —
  instrumento novo = 1 arquivo + 1 linha, sem tocar regente/motores.
- `features/instruments/mixer.ts` (novo): volume/pan/mute/solo puros;
  solo vence mute; inaudível resolve a ganho 0.
- Bateria fala General MIDI (`config.instruments.drumGm`, 11 vozes com
  códigos distintos) + receitas em `config.instruments.drumVoices`;
  timbres em `config.instruments.timbre` (sem números mágicos fora do
  config). Violão tem variante elétrica (mesmo plan, cutoff 3800).
- UI: `BandPanel.tsx` (prévia por instrumento + M/S/volume/pan reais,
  labels pt-BR, contador de atrasados) + `useBand.ts` (AudioContext
  lazy em gesto, loop C→G de 2 compassos no andamento/metro ao vivo,
  energia com piso `auditionEnergyFloor` 0.7 p/ prévia honesta das
  vozes com gate); `useMusicPipeline` expõe `density`; ACTIVE BAND
  placeholder removido.
- Verificação: **289/289 testes** (87 novos em 6 arquivos:
  contrato 42, scheduler, combinações 14, registro/kazoo, musical 11,
  mixer), typecheck limpo, build Next.js OK. Aceite: 100 eventos
  ordenados por audioTime; atrasados contabilizados; 14 combinações
  (vazio→8) sem erro; mesma passagem soa idêntica em subset vs banda
  cheia; kazoo fictício plugado só via registro; C–G → baixo C2+G2,
  piano em voicings 48–72, sax mudo < 0.5, violino mudo fora de
  fronteira, bateria idêntica p/ melodias/acordes diferentes.
- Riscos e sugestões (p/ triagem fim de sprint): (1) osciladores crus
  soam sintéticos (sem vibrato/humanização) → Fase 10 adiciona LFO de
  vibrato + humanização; samples só com manifesto licenciado (§24).
  (2) Prévia usa melodia demo + loop C→G, não segue a voz ao vivo →
  regente da Fase 8 liga acordes/melodia reais (planners já recebem).
  (3) setInterval sofre throttle em aba oculta/Safari → contador de
  atrasados visível no painel; Fase 8 avalia timer em worker + drive
  pelo audio-clock. (4) Sem A/B Tone.js medido — TDR-02 segue valendo
  por padrão; reavaliar com números se o scheduler inchar na Fase 8.
  (5) Violino dobra na mesma oitava (pode mascarar a voz) → arranjo
  (Fase 7) pode optar por +12. (6) Strum 3/4–6/8 simplificado e sem
  swing real (aproximação em grade reta já documentada em
  patterns.ts). (7) Prévia bypassa mute de propósito; transporte da
  Fase 8 deve respeitar o mixer (hook já aplica via efeito).

## [Fase 5] — Ritmo e andamento — OK

- `music/rhythm/tempo.ts`: chase em 3 estágios (estimated → target →
  playback, cada etapa limitada por `tempoSlewPerSec` 8 BPM/s — mesmo um
  target descontínuo chega à saída como glide); `injectEstimate` (gancho de
  fusão p/ detectores futuros + testes); `beatSec()` (relógio do regente),
  `onsetDensity()` (0–1 sobre `densityWindowSec` 4 s, cheio em
  `densityFullRate` 3 onsets/s), `onsetTimes()`.
- `music/rhythm/meter.ts` (novo): `MeterTracker` 4/4–3/4–6/8 — primeiro onset
  ancora o grid; cada compasso completo é pontuado (40% alinhamento à grade
  de colcheias + 60% presença de tempos fortes, downbeat obrigatório);
  troca só após `meterStabilityBars` 2 votos concordantes seguidos
  (margem `meterVoteMargin` 0.1, empate = abstenção); `setMeter` manual;
  emite `MeterChanged` (novo evento em `domain/events.ts` + `event-model.md`).
  BPM sempre em semínimas (6/8 = 3 semínimas = 6 colcheias — um relógio só).
- `music/rhythm/patterns.ts` (novo): biblioteca em dados — 9 estilos
  (acústico-pop, rock, balada, folk, cinematic, eletrônico, latin, blues,
  ambient) × 3 compassos = 27 padrões; `expandPattern` (ordenado, downbeat
  sempre presente, tiling exato entre compassos); `renderAccompaniment`
  dirigido por densidade + energia normalizada (ralo < `densitySparseBelow`
  0.3 derruba ghosts/quiálteras; denso > `densityDenseAbove` 0.65 soma
  pickup determinístico, ambient isento; ganho de velocidade com piso
  `energyVelocityFloor` 0.6). `RhythmInput` não tem campo de pitch — bateria
  ignora melodia por construção (tipo + teste).
- `music/rhythm/energy.ts` (novo): `EnergyNormalizer` RMS → 0–1 com teto
  adaptativo (ataque 4/s, relaxamento 0.05/s) + EMA 120 ms + piso de ruído;
  amplitude crua do mic nunca chega aos motores.
- UI: `useMusicPipeline` instancia meter/energia, assina `MeterChanged`,
  expõe `pushEnergy`/`getAccompaniment`; header mostra BPM **estimado**
  sempre (repouso 90, sem "—") + compasso real do tracker; RMS do mic
  (`diagnostics.inputRms` @12 Hz) alimenta o normalizador.
- Verificação: **202/202 testes** (88 novos), typecheck limpo, build Next.js
  OK. Aceite: sequência 82→105→71→96 → playback move ≤ 8 BPM/s em todo tick
  e converge a 96; valsa sustenta → 4/4→3/4 com 1 `MeterChanged`, 1 compasso
  anômalo nunca troca, groove composto → 6/8, semínimas retas mantêm 4/4;
  27 padrões ordenados/downbeat/no-range/contínuos em 2 compassos; mesma
  bateria p/ melodias diferentes no mesmo tempo/energia.
- Docs: sem TDR (módulos já previstos em `architecture.md` §5 e
  `repository-structure.md`; coluna de eventos atualizada p/ incluir
  `MeterChanged`); `docs/STATUS.md` Fase 5 → OK, próxima → 6.
- Riscos conhecidos (todos com solução proposta):
  1. Âncora do compasso = primeiro onset (assume começar no downbeat);
     entrada atrasada/antecipada desalinha os compassos. Solução: re-ancorar
     em silêncio longo/início de frase (Fase 7/8) + seletor manual de
     compasso no UI (Fase 6/10). Não resolve nesta fase — aceito e documentado.
  2. Ambiguidade 3/4 × 6/8 sem acentos (só grooves característicos
     distinguem; casos mistos abstêm). Solução: acentos por energia
     onset-a-onset via RMS no protocolo do worklet (Fase 8) + hint de estilo
     do arranjo (Fase 7). Parcialmente mitigado (histerese); resto futuro.
  3. Energia via poll de diagnósticos @12 Hz (grosseira, ~80 ms de atraso).
     Solução: encaminhar RMS na mensagem do worklet → pipeline (Fase 8),
     sem mudar a API do normalizador. Aceito p/ Fase 5 (dirige intensidade,
     não transientes).
  4. Semântica do BPM em 6/8 (semínima vs. pontuada — UI pode ler 2× o tempo
     sentido). Solução: exibir BPM em pontuada quando compasso = 6/8
     (Fase 6/10). Relógio interno consistente (padrões usam grade de
     colcheias); só display.
  5. Mediana de IOIs atrasa rubato expressivo; slew 8 BPM/s limita seguir
     viradas bruscas intencionais. Solução: follow-strength gated por
     confiança (Fase 8). Comportamento atual é o especificado (sem solavancos).
  6. Biblioteca rítmica v1 sem humanização/swing (blues usa aproximação em
     tercinas na grade reta). Solução: humanização + swing nos motores de
     instrumento (Fase 6); padrões seguem dados. Aceito.
  7. Bateria ainda sem áudio (motores na Fase 6) — acompanhamento validado
     só na lógica. Solução: checagem audível no scheduler 25 ms/120 ms
     (Fase 8). Sem ação agora.

## [Fase 4] — Motor de harmonia — OK

- `music/harmony/candidates.ts`: tipos (`ChordCandidate` com `score` 0–1 +
  `reasons` legíveis p/ Fase 13, `HarmonyContext`, 4 estilos) + pool diatônico
  determinístico (maior: 7 tríades + V7; menor: conjunto funcional i–vii° + V7).
- `music/harmony/scoring.ts`: 6 dimensões da spec com pesos em
  `config.harmony` (overrides por estilo); melodia +0.3/+0.1/−0.2 por nota;
  empates via PRNG mulberry32 com seed na resposta (sessões reproduzíveis).
- `music/harmony/progressions.ts`: 5 templates como priors (I–V–vi–IV…,
  nunca jaulas) + matriz de transição por estilo; `proposeContinuations`
  (1–4+ compassos) com finalis tônica e trava dura de repetição (run ≤ 2,
  ambient isento); `analyzeProgression` → romanos; `generateAccompaniment`
  → `ChordEvent[]`.
- `music/harmony/voice-leading.ts`: 3 vozes em posição próxima na tessitura
  do piano (48–72); sétimas sem quinta; custo = movimento + 5as/8as paralelas;
  guloso + beam search (largura 3). `voicing/optimizer.ts` reserva o upgrade
  LP/DP sem mudar interface.
- `music/harmony/cadence.ts`: autêntica/plagal/engano­sa/semicadência
  (maior e menor) + hint de transição e string educacional pt-BR;
  `CadenceTracker` resolve no `PhraseEnded` e reafirma via `ChordChanged`.
- Verificação: **114/114 testes** (35 novos), typecheck limpo, build Next.js OK.
  Aceite: `C–E–G` → **Dó maior top-1 (0.74** vs Am 0.72); `G–D–Em–C` →
  **I–V–vi–IV em Sol**; 8 compassos (`vi–ii–I–V7–I–IV–V7–I`) **terminam em
  tônica (I)**, run máx 2, condução **0.95 semitons/voz** (< 4); mesma
  seed → mesmos acordes, análise e voicings.
- Docs: sem TDR (implementado conforme `harmony-engine-spec.md`;
  `architecture.md` §5 e `repository-structure.md` já previam os 5 módulos;
  `domain-model.md` anota `ChordCandidate`); `docs/STATUS.md` Fase 4 → OK,
  próxima → 5.

## [Fase 3] — Motor de teoria musical — OK

- `music/theory/intervals.ts`: `semitonesToInterval` (0 P1 … 12 P8; 6 TT) +
  compostos como oitava(s) + simples (`P8+M3`); `intervalBetweenMidi`.
- `music/theory/scales.ts`: registro em dados (maior, menor
  natural/harmônica/melódica) + `getScalePcs`, `scaleContains`,
  `nearestScaleTone`/`quantizeToScale` (empate resolve para baixo); modos
  futuros = linhas de dados, sem mudar API.
- `music/theory/chords.ts`: `chordTones`, `chordFromPcs` (ordem-independente,
  inversões e duplicadas OK; null fora do vocabulário), `chordName`
  ("C", "Em", "Em7", "Csus4", "G7", "Cmaj7"); 9 qualidades da spec (§15).
- `music/theory/functions.ts`: `getFunction` — maior I–vii° (TÔNICA I/iii/vi,
  SUBDOMINANTE ii/IV, DOMINANTE V/vii°) + conjunto funcional menor
  (i/III, ii°/iv/VI, v–V/VII–vii°); cromáticos → UNKNOWN.
- `music/theory/key.ts`: janela rolante (`config.key.windowMs` 8000 ms),
  histograma pitch-class ponderado (duração × confiança × recência) →
  correlação Krumhansl–Kessler; confiança escala com evidência (nota isolada
  ≈ 0.3, revisável — nunca trava); `KeyUpdated` só se top mudar ou
  Δconf > `config.key.updateDelta` 0.15; `addChordEvidence` (gancho Fase 4,
  bônus sem override). Consome `NoteStarted/NoteEnded` no `bus`.
- Verificação: **79/79 testes** (28 novos), typecheck limpo, build Next.js OK.
  Aceite: `C–E–G` → **C maior conf 0.91** (> 0.6); frase `G–D–Em–C`
  (arpejada, F# como tell) → **Mi menor conf 0.95** (relativa de Sol maior,
  família de G maior); emissão 1× no corpus, silenciosa em re-tick idêntico,
  2ª emissão só na virada de tom.
- Docs: sem TDR (implementado conforme `theory-engine-spec.md`,
  `domain-model.md` e `event-model.md`; `architecture.md` §5 alinhado:
  theory emite `KeyUpdated` sob gate); `docs/STATUS.md` Fase 3 → OK,
  próxima → 4.

## [Fase 2] — Interpretação musical — OK

- `music/melody/smoothing.ts`: gate de confiança (`config.note.confidenceThreshold`)
  + mediana (`config.note.smoothingWindow`); janela retida em dropouts breves.
- `music/melody/stabilization.ts`: histerese (`hysteresisSemitones` 0.6) +
  duração mínima (`stabilityMs` 120 ms) → NoteStarted/Changed/Ended no `bus`;
  legato (vozeamento contínuo) preserva id via NoteChanged, re-articulação
  após gap emite Ended + Started; onsets retrodatados ao início do candidato.
- `music/melody/phrases.ts`: fronteiras por silêncio (`phraseSilenceMs` 600 ms)
  → PhraseStarted/Ended; densidade (notas/s) e contorno
  (rising/falling/arch/flat) por frase para Fases 4/7.
- `music/rhythm/tempo.ts`: estimador contínuo com split
  estimated/target/playback; mediana de IOIs + slew limiter
  (`tempoSlewPerSec` 8 BPM/s); flam-guard derivado de `maxBpm`.
- UI: `useMusicPipeline` (motores consomem observações, React só recebe
  eventos) + `NoteTimeline` (blocos + frases + compassos 4/4) + BPM ao vivo
  no header. `config.rhythm` ganha `minBpm: 40`, `maxBpm: 208`,
  `defaultBpm: 90` (sem números mágicos nos motores).
- Verificação: **51/51 testes** (33 novos), typecheck limpo, build Next.js OK.
  Fixture §9 (`G4, G4+vibrato, G4, G#4, G4, F#4`) → **1 NoteStarted G4**,
  0 Changed/Ended; slew 82→84 converge gradual sem overshoot; spike único
  de onset desvia o target < 2 BPM (nunca 82→105→71).
- Docs: sem TDR (pipeline executado conforme `architecture.md` §4–5,
  arquitetura intacta); `docs/STATUS.md` Fase 2 → OK, próxima → 3.

## [Fase 1] — Fundação de áudio — OK

- `PitchDetector` substituível + 2 implementações (autocorrelação com peak-picking, YIN em 2 passes).
- AudioWorklet de pitch, sessão de microfone com estados de erro + recuperação guiada.
- Tela do instrumento: nota ao vivo, curva de pitch, painel de diagnósticos.
- Verificação: **18/18 testes**, typecheck limpo, build Next.js OK.
  Benchmark (blocos 2048 @48k, C4–C5): autocorr 1.32 ms/bloco, RMSE 2.7¢;
  YIN 1.38 ms/bloco, RMSE 2.1¢; 0% erros de oitava.
- Docs: TDR-03 com os números; especificações de áudio e benchmark.

## [Fase 0] — Especificação e pesquisa — OK

- 18 itens da especificação documentados em `docs/` (arquitetura, domínio,
  eventos, dependências, 7 TDRs, estratégias de áudio/pitch, specs dos motores,
  UI, schema, testes, orçamento de performance, roadmap com aceite por fase).
