/**
 * Central tunable parameters (§54). No magic numbers at call sites —
 * import from here. Values are Phase 1 defaults; later phases tune
 * experimentally and record changes in docs + TDRs.
 */
export const config = {
  audio: {
    /** Worklet analysis block in samples. 2048 @48k ≈ 43 ms per observation. */
    blockSize: 2048,
    /** Microphone sample rate request (0 = device default). */
    sampleRate: 0,
    /**
     * Phase 8 (final): scheduler look-ahead 120 ms / tick 25 ms.
     * Tuning (responsividade × estabilidade × CPU): tick p50 < 0.5 ms em
     * Node (100 eventos ordenados, 0 late), horizon cobre ~0.18 tempo @90
     * BPM — suficiente p/ agendar 1–2 compassos sem mascarar a voz;
     * handle p95 do pipeline < 60 ms + horizon 120 ms → percebido < 250 ms.
     * Valores medidos em `tests/unit/conductor-latency.test.ts` + painel
     * de diagnósticos (`/session`). Não mexer sem re-medir a latência.
     */
    lookaheadMs: 120,
    /** Scheduler tick (Ph8 final; ver nota acima). */
    schedulerTickMs: 25,
  },
  pitch: {
    /** Below this RMS the frame is unvoiced silence. */
    rmsGate: 0.008,
    /** Detector search range (covers E1–C6 voice + instrument headroom). */
    minFreq: 55,
    maxFreq: 1200,
    /** Detector-internal voicing floor; musical gating happens downstream. */
    minConfidence: 0.25,
    /** YIN cumulative-mean-normalized-difference threshold. */
    yinThreshold: 0.1,
    /** UI meter throttle. */
    uiThrottleHz: 12,
  },
  note: {
    /** Phase 2+: confidence gate raw pitch → candidate. */
    confidenceThreshold: 0.5,
    /** Phase 2+: median smoothing window. */
    smoothingWindow: 5,
    /**
     * Hotfix voz estável: histerese em semitons antes de trocar de candidato
     * (absorve vibrato vocal de ±1 st; antes 0.75 picotava a melodia e a
     * harmonia dançava junto).
     */
    hysteresisSemitones: 1.0,
    /** Phase 2+: minimum stable duration to emit a NoteEvent. */
    stabilityMs: 120,
    /**
     * Hotfix voz estável: a excursão além da histerese precisa persistir
     * este tempo antes de trocar o candidato (oscilação breve nunca
     * re-arma a janela; em tempo — não em frames — p/ valer em qualquer
     * taxa de observação).
     * Fase 17: fica como o caminho RÁPIDO para saltos deliberados grandes
     * (|Δ| ≥ `strongStepSemitones`); excursões pequenas usam
     * `weakConfirmMs`, quase sempre vibrato.
     */
    confirmMs: 80,
    /**
     * Fase 17 (tolerância a vibrato): excursões pequenas — de
     * `hysteresisSemitones` até `strongStepSemitones` — são quase sempre
     * vibrato/ruído, não uma nota nova. Exigem esta confirmação, mais longa
     * que um salto deliberado. Vibrato a ~5,5 Hz tem meia onda de ~90 ms,
     * então 120 ms já absorve o balanço periódico sem engolir um semitom
     * cantado de verdade (que persiste e confirma).
     */
    weakConfirmMs: 120,
    /**
     * Fase 17: |Δ| ≥ este valor contra a nota aberta conta como mudança
     * deliberada e usa o `confirmMs` rápido (resposta musical preservada).
     */
    strongStepSemitones: 2.0,
    /**
     * Hotfix voz estável: confirmação estendida p/ salto exato de ±12 st
     * (erro clássico de oitava do detector; salto cantado de verdade
     * persiste e confirma com atraso).
     */
    octaveConfirmMs: 200,
    /**
     * Hotfix voz estável: folga extra após `stabilityMs` antes de fechar a
     * nota em silêncio (consoantes oclusivas não cortam a nota; o
     * acompanhamento sustenta em vez de engasgar).
     * Fase 17: subiu de 120 → 150 ms (mais tolerante a respiração ruidosa
     * e oclusivas curtas) sem engolir o fim de nota (o teste de duração
     * exata em `melody-stabilization` fecha com 280 ms de silêncio).
     */
    releaseExtraMs: 150,
    /**
     * Fase 17 (estabilização adaptativa): enquanto a voz fica afinada e
     * confiante por `lockAfterMs`, a nota "trava" e a janela de confirmação
     * pequena cresce até `weakConfirmMaxMs` (+ release até
     * `releaseExtraMaxMs`). Um cantor firme deixa de picotar por vibrato;
     * mudança deliberada de ≥ `strongStepSemitones` continua rápida.
     * NÃO aumentamos a histerese adaptativamente: passar de 1,0 st engoliria
     * saltos cromáticos de 1 st (aumentar a janela de tempo resolve vibrato
     * sem esse efeito colateral).
     */
    adaptive: {
      /** Canto estável (dentro da histerese + confiante) que trava a nota. */
      lockAfterMs: 500,
      /** Confiança mínima por frame para contar como estável. */
      lockConfidenceMin: 0.6,
      /** Clareza mínima por frame (proxy de energia periódica da voz). */
      lockClarityMin: 0.55,
      /** Teto da confirmação pequena quando travado (ms). */
      weakConfirmMaxMs: 170,
      /** Folga de release adicional quando travado (ms). */
      releaseExtraMaxMs: 80,
    },
  },
  rhythm: {
    /** Phase 5+: tempo slew limit (BPM change per second). */
    tempoSlewPerSec: 8,
    /** Phase 2+: silence gap that ends a phrase. */
    phraseSilenceMs: 600,
    /** Phase 2+: musical clamp for IOI-derived estimates. */
    minBpm: 40,
    maxBpm: 208,
    /** Phase 2+: resting estimate before any onset evidence. */
    defaultBpm: 90,
    /** Phase 5+: consecutive agreeing bar-votes before a meter switch. */
    meterStabilityBars: 2,
    /** Phase 5+: min onsets inside a bar for it to vote (else abstain). */
    meterMinOnsets: 2,
    /** Phase 5+: min bar score (0–1) for a vote to count. */
    meterMinScore: 0.55,
    /** Phase 5+: min score margin over runner-up to vote (else abstain). */
    meterVoteMargin: 0.1,
    /** Phase 5+: onset-to-grid tolerance as a fraction of one beat. */
    meterGridTolBeat: 0.15,
    /** Phase 5+: EMA smoothing time constant for normalized energy. */
    energySmoothMs: 120,
    /** Phase 5+: raw RMS at/below this reads as silence (0). */
    energyNoiseFloor: 0.006,
    /** Phase 5+: resting ceiling before any loud evidence. */
    energyCeilInit: 0.2,
    /** Phase 5+: ceiling chase rate upward (loud hits register fast). */
    energyCeilAttackPerSec: 4,
    /** Phase 5+: ceiling decay rate downward (adapts to quiet rooms). */
    energyCeilReleasePerSec: 0.05,
    /** Phase 5+: onset-density window for accompaniment drive. */
    densityWindowSec: 4,
    /** Phase 5+: onsets/sec that reads as full density (1.0). */
    densityFullRate: 3,
    /** Phase 5+: below this density ghost notes are dropped. */
    densitySparseBelow: 0.3,
    /** Phase 5+: above this density an extra fill voice is added. */
    densityDenseAbove: 0.65,
    /** Phase 5+: pattern hits below this velocity are ghosts (droppable). */
    ghostCutVelocity: 0.45,
    /** Phase 5+: velocity floor so quiet singing stays audible. */
    energyVelocityFloor: 0.6,
  },
  key: {
    /** Phase 3+: rolling estimation window. */
    windowMs: 8000,
    /** Phase 3+: min confidence delta to emit KeyUpdated. */
    updateDelta: 0.15,
  },
  gesture: {
    /** Phase 9+: per-gesture confidence + hold + cooldown. */
    confidenceThreshold: 0.7,
    holdMs: 400,
    cooldownMs: 1200,
    /**
     * Phase 9+: hysteresis release margin. A held pose stays a candidate
     * while confidence ≥ threshold − margin (brief dips don't restart the
     * hold); entry always requires ≥ threshold; below release → decay.
     */
    hysteresisMargin: 0.1,
    /**
     * Phase 9+: swipe transient gate (the swipe's "hold"). A palm-travel of
     * ≥ this fraction of the frame within `swipeWindowMs` counts as a
     * swipe; slower drift never fires.
     */
    swipeMinDisplacement: 0.25,
    /** Phase 9+: max duration of the motion window that counts as a swipe. */
    swipeWindowMs: 600,
    /**
     * Phase 9+: finger-extension ratio. A finger counts as extended when
     * dist(tip, wrist) exceeds dist(pip, wrist) by this factor
     * (rotation-invariant, no upright-hand assumption).
     */
    fingerExtendRatio: 1.12,
  },
  arrangement: {
    /** Phase 7+: transitions quantize to N bars. */
    transitionBars: 1,
    /** Phase 7+: fade length in beats applied at quantized entries/exits. */
    fadeBeats: 1,
    /** Phase 7+: min normalized-energy delta that emits EnergyChanged. */
    energyEmitDelta: 0.05,
  },
  instruments: {
    /** Phase 8+: conductor replaces the audition loop (kept for BandPanel fallback). */
    auditionBars: 2,
    /** Phase 6+: audition drum style (pattern data, never hardcoded downstream). */
    auditionStyle: "acoustic-pop",
    /** Phase 6+: audition roots as pitch classes (C major → G major). */
    auditionRoots: [0, 7],
    /** Phase 6+: audition floor for energy-driven voices (sax/violin previews). */
    auditionEnergyFloor: 0.7,
    /** Phase 6+: drum MusicalEvents encode voice as General MIDI percussion. */
    drumGm: {
      kick: 36,
      snare: 38,
      hihat: 42,
      ride: 51,
      crash: 49,
      tom: 45,
      rim: 37,
      clap: 39,
      shaker: 70,
      cajon: 35,
      "cajon-slap": 40,
    },
    /** Phase 6+: drum voice → synthesis recipe (noise + optional membrane tone). */
    drumVoices: {
      kick: { filterType: "lowpass", filterFreq: 400, durSec: 0.14, membraneFrom: 120, membraneTo: 45 },
      snare: { filterType: "bandpass", filterFreq: 1800, durSec: 0.16, membraneFrom: 190, membraneTo: 150 },
      hihat: { filterType: "highpass", filterFreq: 8000, durSec: 0.05, membraneFrom: 0, membraneTo: 0 },
      ride: { filterType: "highpass", filterFreq: 6000, durSec: 0.4, membraneFrom: 0, membraneTo: 0 },
      crash: { filterType: "highpass", filterFreq: 5000, durSec: 1.1, membraneFrom: 0, membraneTo: 0 },
      tom: { filterType: "lowpass", filterFreq: 900, durSec: 0.25, membraneFrom: 180, membraneTo: 90 },
      rim: { filterType: "bandpass", filterFreq: 2200, durSec: 0.04, membraneFrom: 1700, membraneTo: 1700 },
      clap: { filterType: "bandpass", filterFreq: 1200, durSec: 0.15, membraneFrom: 0, membraneTo: 0 },
      shaker: { filterType: "highpass", filterFreq: 7000, durSec: 0.08, membraneFrom: 0, membraneTo: 0 },
      cajon: { filterType: "lowpass", filterFreq: 800, durSec: 0.14, membraneFrom: 140, membraneTo: 70 },
      "cajon-slap": { filterType: "bandpass", filterFreq: 1500, durSec: 0.12, membraneFrom: 300, membraneTo: 220 },
    },
    /** Phase 6+: pitched-instrument synthesis recipes (oscillators + envelopes). */
    timbre: {
      bass: { osc: "triangle", cutoff: 800, attack: 0.01, release: 0.35, detune: 0, octaveGain: 0.3 },
      piano: { osc: "triangle", cutoff: 2800, attack: 0.004, release: 0.9, detune: 0, octaveGain: 0.25 },
      guitar: { osc: "sawtooth", cutoff: 1800, attack: 0.004, release: 0.5, detune: 0, octaveGain: 0 },
      guitarElectric: { osc: "sawtooth", cutoff: 3800, attack: 0.003, release: 0.3, detune: 0, octaveGain: 0.2 },
      /**
       * Hotfix quarteto: violão nylon — dedilhado redondo (triangle pelo
       * lowpass cantado, sustain médio p/ a nota se manter).
       */
      violao: { osc: "triangle", cutoff: 2200, attack: 0.003, release: 0.6, detune: 0, octaveGain: 0.15 },
      strings: { osc: "sawtooth", cutoff: 1800, attack: 0.45, release: 0.8, detune: 6, octaveGain: 0 },
      violin: { osc: "sawtooth", cutoff: 3200, attack: 0.08, release: 0.3, detune: 0, octaveGain: 0 },
      sax: { osc: "sawtooth", cutoff: 1300, attack: 0.06, release: 0.25, detune: 0, octaveGain: 0 },
      accordion: { osc: "square", cutoff: 2000, attack: 0.05, release: 0.4, detune: 8, octaveGain: 0 },
    },
    /**
     * Hotfix som limpo: energia abaixo disto = piano em half-notes
     * sustentadas em vez de broken-chord corrido (menos notas rápidas).
     */
    pianoCalmEnergyBelow: 0.35,
    /** Phase 6+: bass roots sit around this MIDI octave center (C2 = 36). */
    bassRootMidi: 36,
    /** Phase 6+: guitar strum step between strings (seconds). */
    guitarStrumStepSec: 0.012,
    /** Phase 6+: sax fills only at mid-energy and above. */
    saxFillEnergyMin: 0.5,
    /** Phase 6+: violin doubles melody on phrase-start bars only. */
    violinDoublesPhraseStarts: true,
    /**
     * Phase 16+: sample packs (real sound) per instrument. The procedural
     * `WebAudioSink` stays the automatic fallback: `useSamples` is only a
     * *preference* — the sink still falls back to synthesis whenever the
     * pack is absent, the download/decode fails, or |detune| exceeds
     * `maxDetuneSt`. Guitar keeps synthesis (no license-clean pack).
     * Weights are transfer budgets (single velocity layer, ogg/mp3).
     */
    samples: {
      /** Cache API name (versioned key migrates between pack versions). */
      cacheName: "lookamusic-sample-packs",
      /**
       * Bumped whenever a pack manifest changes incompatibly. v2 = caminhos
       * reais (tonejs/Salamander + FreePats CC0); descarta o cache da v1, que
       * apontava para URLs inexistentes.
       */
      cacheVersion: 2,
      /**
       * Fase 17: chave p/ lembrar que o usuário já viu a sugestão de packs
       * logo depois de ligar o microfone (banner não-intrusivo, uma vez só).
       */
      promptStorageKey: "lookamusic-samples-prompt-dismissed-v1",
      /** Max pitch correction applied via playbackRate (±st, else synth). */
      maxDetuneSt: 2,
      /** localStorage key for the per-instrument real/synth toggle. */
      toggleStorageKey: "lookamusic-samples-use-real-v1",
      piano: { useSamples: true, weightBudgetBytes: 2 * 1024 * 1024, decodeBudgetMs: 1000 },
      // Violão upstream é FLAC lossless (FreePats CC0) — ~3,8 MB reais; o teto
      // foi elevado de 3 MB para caber o pack de verdade.
      violao: { useSamples: true, weightBudgetBytes: 5 * 1024 * 1024, decodeBudgetMs: 1500 },
      drums: { useSamples: true, weightBudgetBytes: 2 * 1024 * 1024, decodeBudgetMs: 1000 },
      guitar: { useSamples: false, weightBudgetBytes: 0, decodeBudgetMs: 0 },
    },
  },
  harmony: {
    /** Phase 4+: base weights of the 6 scoring dimensions (sum = 1). */
    weights: {
      scale: 0.25,
      melody: 0.3,
      function: 0.2,
      voiceLeading: 0.1,
      style: 0.05,
      phrase: 0.1,
    },
    /**
     * Phase 4+: per-style weight overrides (merged over `weights`).
     * Jazz leans on function/progression; ambient ignores repetition/style.
     */
    styleWeights: {
      pop: {},
      folk: {},
      jazz: { function: 0.28, scale: 0.17 },
      ambient: { style: 0.0, melody: 0.35 },
    },
    /** Phase 4+: per-note melody deltas (§16: chord-tone/passing/chromatic). */
    melodyChordTone: 0.3,
    melodyPassingTone: 0.1,
    melodyChromaticPenalty: -0.2,
    /** Phase 4+: subtracted per out-of-key chord tone (scaled by style). */
    outOfKeyPenalty: 0.5,
    /** Phase 4+: styles where chromaticism is idiomatic (penalty halved). */
    chromaticTolerantStyles: ["jazz"],
    /** Phase 4+: cadential motion bonus (V→I, vii°→I at phrase ends). */
    cadenceBonus: 0.25,
    /** Phase 4+: tonic-function bonus on the final bar of a phrase. */
    tonicEndBonus: 0.2,
    /** Phase 4+: penalty when the pick would repeat the previous bar(s). */
    repeatPenalty: 0.4,
    /** Phase 4+: max identical consecutive bars (ambient/static exempt). */
    maxConsecutiveRepeats: 2,
    /** Phase 4+: styles exempt from the repetition penalty. */
    staticStyles: ["ambient"],
    /** Phase 4+: voice-leading cost per semitone of movement. */
    movementCostPerSemitone: 0.06,
    /** Phase 4+: bonus per common tone held between bars. */
    commonToneBonus: 0.1,
    /** Phase 4+: penalty per parallel 5th/octave pair (keyboard/strings). */
    parallelPenalty: 0.5,
    /** Phase 4+: close-position voicing range (piano tessitura, MIDI). */
    voicingMinMidi: 48,
    voicingMaxMidi: 72,
    /** Phase 4+: beam-search width over voicings (§19). */
    beamWidth: 3,
  },
  conductor: {
    /** Phase 8+: bars planned ahead per tick (1 = atual + 1 = próximo). */
    planAheadBars: 2,    /** Phase 8+: harmonia re-avaliada a cada N compassos (1 = todo compasso). */
    harmonyReestimateEveryBars: 1,
    /** Phase 8+: teto do anel de melodia no MusicalState (memória limitada). */
    melodyCap: 128,
    /** Phase 8+: teto do anel de acordes no MusicalState (memória limitada). */
    chordCap: 64,
    /** Phase 8+: teto do anel de frases no MusicalState (memória limitada). */
    phraseCap: 16,
    /** Phase 8+: orçamento de latência percebida voz→acompanhamento (ms). */
    latencyBudgetMs: 250,
    /** Phase 8+: orçamento do pipeline voz→evento, sem look-ahead (ms). */
    handleBudgetMs: 60,
    /** Phase 8+: tolerância de alinhamento entre eventos de motores (ms). */
    syncToleranceMs: 50,
    /** Phase 8+: atrasados acumulados que disparam degradação reduced. */
    degradeLateThreshold: 8,
    /** Phase 8+: tick médio (ms) que dispara degradação reduced. */
    degradeTickMs: 12,
    /** Phase 8+: pins manuais sobrevivem ao modo Auto (Fase 7 risco 3). */
    pinHoldsAuto: true,
  },
  recording: {
    /** Phase 11+: IndexedDB database name. */
    dbName: "lookamusic",
    /** Phase 11+: IndexedDB database version. */
    dbVersion: 1,
    /** Phase 11+: object store for compositions. */
    storeName: "compositions",
    /** Phase 11+: default style when not provided. */
    defaultStyleId: "pop",
    /** Phase 11+: quantize grid options in fractions of a beat (quarters). */
    quantizeGridOptions: [0.25, 0.5, 1] as const,
    /** Phase 11+: default quantization step (8th note). */
    defaultQuantizeBeat: 0.5,
    /** Phase 11+: min and max allowed tempo in BPM. */
    minBpm: 30,
    maxBpm: 240,
  },
  /**
   * Fase 17 (anti-feedback): aviso suave quando o microfone capta um nível
   * alto e sustentado ENQUANTO a banda está soando — assinatura de
   * acoplamento mic↔alto-falante ("banda dançando"). Heurística local, sem
   * DSP extra: apenas comparar nível de entrada com limiares conservadores.
   */
  feedback: {
    /** RMS de entrada que já sugere acoplamento quando há monitor de voz. */
    inputRmsRisk: 0.35,
    /** RMS alto mesmo sem monitor (mic muito perto da caixa/casal). */
    inputRmsSevere: 0.6,
    /** Frames consecutivos acima do limiar antes de avisar (evita picos). */
    confirmObs: 3,
  },
  ux: {
    /** Phase 10+: chave de persistência do onboarding (localStorage). */
    onboardingStorageKey: "lookamusic-onboarding-done-v1",
    /** Phase 10+: observações mínimas antes de julgar a qualidade do áudio. */
    audioHealthMinObs: 30,
    /** Phase 10+: confiança média abaixo disto (na janela) = "difícil de ouvir". */
    unclearConfidenceBelow: 0.35,
    /** Phase 10+: p95 de handle acima disto = sobrecarga de CPU. */
    cpuOverloadP95Ms: 12,
    /** Phase 10+: frames descartados acumulados acima disto = sobrecarga. */
    cpuOverloadDroppedFrames: 10,
  },
  learn: {
    /** Phase 13+: chave de persistência do toggle educacional (localStorage). */
    storageKey: "lookamusic-learn-enabled-v1",
    /** Phase 13+: chave de persistência do nível de aprendizagem ativo. */
    levelStorageKey: "lookamusic-learn-level-v1",
    /** Phase 13+ / Hardening: chave de persistência de anúncio no leitor de tela. */
    screenReaderStorageKey: "lookamusic-learn-sr-announce-v1",
    /** Phase 13+ / Hardening: padrão para anúncio em leitor de tela (evita sobrecarga auditiva). */
    defaultScreenReaderAnnounce: false,
    /** Phase 13+ / Lançamento: chave de persistência do idioma do modo educacional. */
    localeStorageKey: "lookamusic-learn-locale-v1",
    /** Phase 13+ / Lançamento: idioma padrão inicial. */
    defaultLocale: "pt-BR" as const,
    /** Phase 13+ / Hardening: intervalo de debounce (ms) para fixação de frase melódica rápida. */
    updateDebounceMs: 250,
    /** Phase 13+ / Hardening: limiar entre notas (ms) para considerar fraseado transitório rápido. */
    rapidNoteThresholdMs: 150,
    /** Phase 13+: estado padrão do toggle educacional. */
    defaultEnabled: false,
    /** Phase 13+: nível de aprendizagem padrão inicial. */
    defaultLevel: "chords",
    /** Phase 13+: janela de notas recentes consideradas para análise de arpejo/acorde. */
    recentNotesWindow: 8,
    /** Phase 13+: janela de acordes recentes para análise de progressão. */
    recentChordsWindow: 6,
  },
  coach: {
    /** Cents tolerance for perfect in-tune (+-12 cents). */
    inTuneCentsTolerance: 12,
    /** Cents tolerance for near target note (+-25 cents). */
    nearCentsTolerance: 25,
    /** Minimum confidence to treat observation as voiced candidate. */
    minConfidence: 0.35,
    /** Minimum RMS gate for pitch coach. */
    minRms: 0.008,
    /** Throttle advice update interval in milliseconds. */
    adviceThrottleMs: 200,
    /** Streak milestone threshold in milliseconds. */
    streakMilestoneMs: 1500,
  },
  autotune: {
    /** Speed glide times in milliseconds for pitch transition. */
    speeds: {
      natural: 80,
      pop: 25,
      hard: 0,
    },
    /** Default correction amount (0–1). */
    defaultAmount: 0.85,
    /** Default monitor volume (safe at 0 to avoid acoustic feedback). */
    defaultMonitorVolume: 0.0,
    /** Worklet block size for pitch shifter. */
    bufferSize: 1024,
  },
  desktop: {
    windowWidth: 1280,
    windowHeight: 860,
    minWidth: 960,
    minHeight: 640,
    audioBufferSize: 256,
  },
} as const;

export type AppConfig = typeof config;
