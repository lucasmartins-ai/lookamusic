/**
 * Internationalization (i18n) dictionary and utilities for Educational Mode.
 * Pure TypeScript — no external libraries, no React, no Web Audio.
 * Supports pt-BR (default, Portuguese solfège & nomenclature) and en-US (English).
 */

import type { PitchClass } from "@/domain/types";
import { PC_NAMES } from "@/features/music/theory/chords";
import type { LearnLevel, LearnLevelInfo, SupportedLocale } from "./types";

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

export const SOLFEGE_NAMES: Record<SupportedLocale, readonly string[]> = {
  "pt-BR": [
    "Dó",
    "Dó#",
    "Ré",
    "Ré#",
    "Mi",
    "Fá",
    "Fá#",
    "Sol",
    "Sol#",
    "Lá",
    "Lá#",
    "Si",
  ],
  "en-US": [
    "Do",
    "Do#",
    "Re",
    "Re#",
    "Mi",
    "Fa",
    "Fa#",
    "Sol",
    "Sol#",
    "La",
    "La#",
    "Ti",
  ],
};

export const INTERVAL_NAMES: Record<SupportedLocale, Record<number, string>> = {
  "pt-BR": {
    0: "uníssono",
    1: "segunda menor",
    2: "segunda maior",
    3: "terça menor",
    4: "terça maior",
    5: "quarta justa",
    6: "trítono",
    7: "quinta justa",
    8: "sexta menor",
    9: "sexta maior",
    10: "sétima menor",
    11: "sétima maior",
    12: "oitava",
  },
  "en-US": {
    0: "unison",
    1: "minor second",
    2: "major second",
    3: "minor third",
    4: "major third",
    5: "perfect fourth",
    6: "tritone",
    7: "perfect fifth",
    8: "minor sixth",
    9: "major sixth",
    10: "minor seventh",
    11: "major seventh",
    12: "octave",
  },
};

export const INTERVAL_CHARACTERS: Record<SupportedLocale, Record<number, string>> = {
  "pt-BR": {
    0: "Mesma nota ou oitava pura: fusão acústica perfeita.",
    1: "Segunda menor: forte tensão dramática que quer se mover.",
    2: "Segunda maior: passo natural e melódico da escala.",
    3: "Terça menor: sonoridade suave, melancólica e introspectiva.",
    4: "Terça maior: salto brilhante, aberto e afirmativo.",
    5: "Quarta justa: sensação de marcha ou chamado firme.",
    6: "Trítono: máxima tensão cromática que divide a oitava ao meio.",
    7: "Quinta justa: o intervalo de apoio mais estável da harmonia.",
    8: "Sexta menor: expressividade romântica e emotiva.",
    9: "Sexta maior: abertura luminosa e nostálgica.",
    10: "Sétima menor: sonoridade de blues, pop e acordes dominantes.",
    11: "Sétima maior: forte atração magnética para a oitava.",
  },
  "en-US": {
    0: "Same note or pure octave: perfect acoustic fusion.",
    1: "Minor second: strong dramatic tension that yearns to resolve.",
    2: "Major second: natural step-wise melodic motion of the scale.",
    3: "Minor third: gentle, melancholic and introspective sound.",
    4: "Major third: bright, open and uplifting melodic leap.",
    5: "Perfect fourth: stately marching character or confident call.",
    6: "Tritone: maximum chromatic tension dividing the octave evenly.",
    7: "Perfect fifth: the most stable supporting interval in harmony.",
    8: "Minor sixth: romantic, tender and emotional warmth.",
    9: "Major sixth: bright, open and nostalgic coloration.",
    10: "Minor seventh: cornerstone blues, pop and dominant coloration.",
    11: "Major seventh: strong magnetic pull leading into the octave.",
  },
};

export const CHORD_QUALITIES: Record<
  SupportedLocale,
  Record<string, { label: string; mood: string }>
> = {
  "pt-BR": {
    major: { label: "maior", mood: "sonoridade aberta, estável e alegre" },
    minor: { label: "menor", mood: "sonoridade emotiva e introspectiva" },
    diminished: { label: "diminuta", mood: "tensão concentrada que busca resolução rápida" },
    augmented: { label: "aumentada", mood: "sonoridade misteriosa e suspensa" },
    dom7: { label: "com sétima dominante", mood: "tensão direcionada com forte impulso de retorno à tônica" },
    maj7: { label: "com sétima maior", mood: "sonoridade sofisticada, aveludada e moderna" },
    min7: { label: "menor com sétima", mood: "sonoridade quente, suave e contemplativa" },
    sus4: { label: "suspensa (sus4)", mood: "tensão flutuante sem terça definida" },
    sus2: { label: "suspensa (sus2)", mood: "sonoridade aberta e fluida" },
  },
  "en-US": {
    major: { label: "major", mood: "open, stable, and cheerful sound" },
    minor: { label: "minor", mood: "emotional, soulful, and introspective sound" },
    diminished: { label: "diminished", mood: "concentrated tension urging rapid resolution" },
    augmented: { label: "augmented", mood: "mysterious, floating, and suspended sound" },
    dom7: { label: "dominant 7th", mood: "directional pull with strong urge to resolve to tonic" },
    maj7: { label: "major 7th", mood: "sophisticated, lush, and modern harmonic color" },
    min7: { label: "minor 7th", mood: "warm, mellow, and contemplative sound" },
    sus4: { label: "suspended (sus4)", mood: "floating tension without a third" },
    sus2: { label: "suspended (sus2)", mood: "open, spacious, and fluid sound" },
  },
};

export const HARMONIC_FUNCTIONS: Record<
  SupportedLocale,
  Record<string, { label: string; role: string }>
> = {
  "pt-BR": {
    TONIC: {
      label: "Tônica",
      role: "Ponto de repouso, estabilidade absoluta e sensação de 'voltar para casa'.",
    },
    SUBDOMINANT: {
      label: "Subdominante",
      role: "Sensação de afastamento suave, preparando o caminho para uma tensão ou retorno.",
    },
    DOMINANT: {
      label: "Dominante",
      role: "Tensão harmônica ativa com forte atração e necessidade de resolver na tônica.",
    },
    UNKNOWN: {
      label: "Cor harmônica expressiva",
      role: "Acorde fora do campo diatônico direto, trazendo contraste e modulação sutil.",
    },
  },
  "en-US": {
    TONIC: {
      label: "Tonic",
      role: "Point of rest, home stability, and feeling of complete resolution.",
    },
    SUBDOMINANT: {
      label: "Subdominant",
      role: "Gentle departure away from tonic, preparing tension or return.",
    },
    DOMINANT: {
      label: "Dominant",
      role: "Active harmonic tension pulling urgently toward tonic resolution.",
    },
    UNKNOWN: {
      label: "Expressive harmonic coloration",
      role: "Non-diatonic chord creating nuanced contrast and subtle modulation.",
    },
  },
};

export const CADENCE_INFO: Record<
  SupportedLocale,
  Record<string, { title: string; education: string }>
> = {
  "pt-BR": {
    authentic: {
      title: "Cadência Autêntica",
      education: "Cadência autêntica: o acorde dominante resolve na tônica — sensação de chegada, como um ponto final.",
    },
    plagal: {
      title: "Cadência Plagal",
      education: "Cadência plagal: do IV para o I — o “amém” das igrejas; chegada suave, sem tensão.",
    },
    deceptive: {
      title: "Cadência de Engano",
      education: "Cadência de engano: o V prometia a tônica e caiu no vi — surpresa que pede continuação.",
    },
    half: {
      title: "Semicadência",
      education: "Semicadência: a frase para no dominante (V) — fica no ar, como uma vírgula.",
    },
  },
  "en-US": {
    authentic: {
      title: "Authentic Cadence",
      education: "Authentic cadence: dominant chord resolves to tonic — conclusive arrival, like a period.",
    },
    plagal: {
      title: "Plagal Cadence",
      education: "Plagal cadence: from IV to I — church 'Amen'; gentle landing without tension.",
    },
    deceptive: {
      title: "Deceptive Cadence",
      education: "Deceptive cadence: dominant promised tonic and landed on vi — surprise inviting continuation.",
    },
    half: {
      title: "Half Cadence",
      education: "Half cadence: the phrase pauses on dominant (V) — suspended in the air, like a comma.",
    },
  },
};

export const LEARN_LEVELS_BY_LOCALE: Record<SupportedLocale, readonly LearnLevelInfo[]> = {
  "pt-BR": [
    { id: "notes", title: "Notas", shortDescription: "Alturas fundamentais e notas cantadas", order: 1 },
    { id: "intervals", title: "Intervalos", shortDescription: "Distância e relação entre duas notas", order: 2 },
    { id: "scales", title: "Escalas", shortDescription: "A família de notas da tonalidade", order: 3 },
    { id: "chords", title: "Acordes", shortDescription: "Tríades e combinações sonoras", order: 4 },
    { id: "functions", title: "Funções Harmônicas", shortDescription: "Tônica, Subdominante e Dominante", order: 5 },
    { id: "progressions", title: "Progressões", shortDescription: "Caminhos e encadeamentos de acordes", order: 6 },
    { id: "cadence", title: "Cadências", shortDescription: "Pontuações e respirações de frase", order: 7 },
    { id: "voiceLeading", title: "Condução de Vozes", shortDescription: "Movimento suave e notas compartilhadas", order: 8 },
    { id: "modulation", title: "Modulação", shortDescription: "Mudanças de tonalidade e novo centro", order: 9 },
  ],
  "en-US": [
    { id: "notes", title: "Notes", shortDescription: "Fundamental pitches and sung notes", order: 1 },
    { id: "intervals", title: "Intervals", shortDescription: "Pitch distance and relationship between notes", order: 2 },
    { id: "scales", title: "Scales", shortDescription: "The family of notes in the active key", order: 3 },
    { id: "chords", title: "Chords", shortDescription: "Triads and harmonic sonorities", order: 4 },
    { id: "functions", title: "Harmonic Functions", shortDescription: "Tonic, Subdominant, and Dominant roles", order: 5 },
    { id: "progressions", title: "Progressions", shortDescription: "Chains and journeys of chords", order: 6 },
    { id: "cadence", title: "Cadences", shortDescription: "Phrase endings and musical punctuation", order: 7 },
    { id: "voiceLeading", title: "Voice Leading", shortDescription: "Smooth step-wise motion and common tones", order: 8 },
    { id: "modulation", title: "Modulation", shortDescription: "Key shifts and changing tonal centers", order: 9 },
  ],
};

export function getLearnLevels(locale: SupportedLocale = "pt-BR"): readonly LearnLevelInfo[] {
  return LEARN_LEVELS_BY_LOCALE[locale] ?? LEARN_LEVELS_BY_LOCALE["pt-BR"];
}

export function friendlyNoteName(midiOrPc: number, locale: SupportedLocale = "pt-BR"): string {
  const pc = mod12(midiOrPc);
  const solf = SOLFEGE_NAMES[locale]?.[pc] ?? SOLFEGE_NAMES["pt-BR"][pc];
  return `${PC_NAMES[pc]} (${solf})`;
}

export function keyDisplayName(
  root: number,
  mode: "major" | "minor",
  locale: SupportedLocale = "pt-BR",
): string {
  const rootCipher = PC_NAMES[mod12(root)];
  if (locale === "en-US") {
    return `${rootCipher} ${mode === "major" ? "Major" : "Minor"}`;
  }
  return `${rootCipher} ${mode === "major" ? "Maior" : "Menor"}`;
}

export const UI_I18N: Record<
  SupportedLocale,
  {
    headerTitle: string;
    headerSubtitle: string;
    fullTrack: string;
    close: string;
    screenReaderActive: string;
    screenReaderSilent: string;
    screenReaderTooltip: string;
    levelsTablistLabel: string;
    emptyNotesSummary: string;
    emptyNotesDetails: string;
    emptyIntervalsSummary: string;
    emptyIntervalsDetails: string;
    emptyChordsSummary: string;
    emptyChordsDetails: string;
    emptyFunctionsSummary: string;
    emptyProgressionsSummary: string;
    emptyProgressionsDetails: string;
    emptyCadenceSummary: string;
    emptyCadenceDetails: string;
    emptyVoiceLeadingSummary: string;
    stableKeySummary: (keyLabel: string) => string;
    modulationDetail: string;
  }
> = {
  "pt-BR": {
    headerTitle: "O QUE ACABOU DE ACONTECER?",
    headerSubtitle: "Teoria musical viva gerada diretamente da sua voz e da banda.",
    fullTrack: "TRILHA COMPLETA",
    close: "✕",
    screenReaderActive: "Leitor: Ativo",
    screenReaderSilent: "Leitor: Silencioso",
    screenReaderTooltip: "Alternar leitura em voz alta no leitor de tela (aria-live)",
    levelsTablistLabel: "Níveis de aprendizado",
    emptyNotesSummary: "Aguardando som: cante ou toque uma nota contínua no microfone.",
    emptyNotesDetails: "A afinação precisa de uma onda sonora estável para identificar a nota fundamental.",
    emptyIntervalsSummary: "Cante duas notas diferentes para ouvir e analisar o intervalo.",
    emptyIntervalsDetails: "O intervalo é a distância em altura entre duas notas.",
    emptyChordsSummary: "Cante notas como C, E e G para formar um acorde.",
    emptyChordsDetails: "A harmonia é construída a partir da sobreposição de notas da melodia.",
    emptyFunctionsSummary: "Aguardando acorde para identificar a função (Tônica, Subdominante ou Dominante).",
    emptyProgressionsSummary: "Nenhum acorde tocado ainda para analisar a progressão.",
    emptyProgressionsDetails: "Uma progressão é a viagem musical contada pela mudança de acordes ao longo do tempo.",
    emptyCadenceSummary: "Aguardando o final de uma frase musical para detectar a cadência.",
    emptyCadenceDetails: "Cadências são como vírgulas e pontos finais musicais ao fim de uma frase.",
    emptyVoiceLeadingSummary: "Aguardando transição entre dois acordes para analisar a condução das vozes.",
    stableKeySummary: (k) => `Música estabelecida no tom de ${k}.`,
    modulationDetail: "Se você cantar consistentemente notas de outra tonalidade, o motor detectará uma modulação.",
  },
  "en-US": {
    headerTitle: "WHAT JUST HAPPENED?",
    headerSubtitle: "Living music theory generated directly from your voice and band.",
    fullTrack: "FULL CURRICULUM",
    close: "✕",
    screenReaderActive: "Screen Reader: On",
    screenReaderSilent: "Screen Reader: Off",
    screenReaderTooltip: "Toggle screen reader live announcements (aria-live)",
    levelsTablistLabel: "Learning levels",
    emptyNotesSummary: "Waiting for sound: sing or play a sustained note into the microphone.",
    emptyNotesDetails: "Pitch detection needs a stable acoustic wave to identify the fundamental note.",
    emptyIntervalsSummary: "Sing at least two different consecutive notes to hear and analyze the interval.",
    emptyIntervalsDetails: "An interval is the pitch distance between two notes.",
    emptyChordsSummary: "Sing three notes such as C, E, and G to form a chord.",
    emptyChordsDetails: "Harmony is built from overlapping melodic notes over time.",
    emptyFunctionsSummary: "Waiting for chord to identify harmonic function (Tonic, Subdominant, or Dominant).",
    emptyProgressionsSummary: "No chords played yet to analyze the harmonic progression.",
    emptyProgressionsDetails: "A progression is the musical journey told through chord changes over time.",
    emptyCadenceSummary: "Waiting for phrase boundary to detect cadence resolution.",
    emptyCadenceDetails: "Cadences act like musical commas and periods at phrase endings.",
    emptyVoiceLeadingSummary: "Waiting for transition between chords to analyze voice leading motion.",
    stableKeySummary: (k) => `Music firmly established in the key of ${k}.`,
    modulationDetail: "Singing consistent notes from another scale center will trigger modulation detection.",
  },
};
