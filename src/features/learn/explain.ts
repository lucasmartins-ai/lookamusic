/**
 * Music-theory educational explanation engine (Phase 13, §4).
 * Pure TypeScript — no React, no Web Audio, no LLM.
 *
 * Converts structured musical representations (MusicalState, NoteEvent,
 * Chord, Cadence, etc.) into clear, accessible explanations in pt-BR and en-US.
 * Never consumes raw audio samples. Graceful fallbacks for noisy, atonal,
 * or empty inputs.
 */

import type {
  Chord,
  KeyEstimate,
  MusicalState,
  NoteEvent,
  PitchClass,
  Scale,
  TempoState,
  TimeSignature,
} from "@/domain/types";
import { config } from "@/lib/config";
import { chordFromPcs, chordName, chordTones, PC_NAMES } from "@/features/music/theory/chords";
import { semitonesToInterval } from "@/features/music/theory/intervals";
import { getFunction } from "@/features/music/theory/functions";
import { getScale } from "@/features/music/theory/scales";
import { degreeOf, type HarmonyReason } from "@/features/music/harmony/candidates";
import { chordToRoman, analyzeProgression } from "@/features/music/harmony/progressions";
import {
  type Cadence,
  type CadenceType,
  detectCadenceInKey,
} from "@/features/music/harmony/cadence";
import { midiToNoteName } from "@/features/pitch/conversions";
import type {
  EducationalSnippet,
  LearnLevel,
  MusicalExplanation,
  SupportedLocale,
} from "./types";
import {
  CADENCE_INFO,
  CHORD_QUALITIES,
  friendlyNoteName as friendlyNoteNameI18n,
  getLearnLevels,
  HARMONIC_FUNCTIONS,
  INTERVAL_CHARACTERS,
  INTERVAL_NAMES,
  keyDisplayName,
  SOLFEGE_NAMES,
  UI_I18N,
} from "./i18n";

function mod12(n: number): PitchClass {
  return (((Math.round(n) % 12) + 12) % 12) as PitchClass;
}

/** Human friendly note label, e.g. "C (Dó)" or "C (Do)". */
export function friendlyNoteName(
  midiOrPc: number,
  locale: SupportedLocale = "pt-BR",
): string {
  return friendlyNoteNameI18n(midiOrPc, locale);
}

/**
 * 1. Notes (Notas): Explica a última nota cantada ou registrada.
 */
export function explainNote(
  note: NoteEvent | number,
  key?: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const midi = typeof note === "number" ? note : note.midi;
  const isEn = locale === "en-US";

  if (!Number.isFinite(midi) || midi < 0) {
    return {
      level: "notes",
      title: isEn ? "No note detected" : "Sem nota detectada",
      summary: UI_I18N[locale].emptyNotesSummary,
      details: UI_I18N[locale].emptyNotesDetails,
    };
  }

  const pc = mod12(midi);
  const noteLabel = midiToNoteName(Math.round(midi));
  const solfege = SOLFEGE_NAMES[locale]?.[pc] ?? SOLFEGE_NAMES["pt-BR"][pc];
  const cipher = PC_NAMES[pc];

  let relationship = "";
  if (key && key.confidence > 0.3) {
    const deg = degreeOf(pc, key.root);
    const keyName = keyDisplayName(key.root, key.mode, locale);
    if (isEn) {
      if (deg === 0) relationship = `It is the tonic (home resting pitch) of ${keyName}.`;
      else if (deg === 7) relationship = `It is the perfect fifth (stability and support pitch) of ${keyName}.`;
      else if (deg === 4 || deg === 3) relationship = `It is the third (defines major/minor character) of ${keyName}.`;
      else relationship = `Scale degree ${deg} in ${keyName}.`;
    } else {
      if (deg === 0) relationship = `É a tônica (centro de repouso) de ${keyName}.`;
      else if (deg === 7) relationship = `É a quinta justa (nota de estabilidade e apoio) de ${keyName}.`;
      else if (deg === 4 || deg === 3) relationship = `É a terça (define o caráter alegre/triste) de ${keyName}.`;
      else relationship = `Grau ${deg} em relação ao tom de ${keyName}.`;
    }
  }

  return {
    level: "notes",
    title: isEn ? `Note ${noteLabel}` : `Nota ${noteLabel}`,
    summary: isEn
      ? `Sung note: ${cipher} (${solfege}) — clean in-tune pitch.`
      : `Nota cantada: ${cipher} (${solfege}) — altura afinada com som estável.`,
    details: relationship
      ? isEn
        ? `Frequency corresponds to ${cipher} in the respective octave. ${relationship}`
        : `A frequência corresponde à nota ${cipher} na oitava correspondente. ${relationship}`
      : isEn
        ? `Frequency corresponds to note ${cipher}, detected accurately.`
        : `A frequência corresponde à nota ${cipher}, identificada com precisão.`,
    technicalDetails: `MIDI ${Math.round(midi)} · Pitch class ${pc}`,
    confidence: typeof note === "object" ? note.confidence : 1,
  };
}

/**
 * 2. Intervals (Intervalos): Distância e relação melódica entre duas notas.
 */
export function explainInterval(
  first: NoteEvent | number,
  second: NoteEvent | number,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const m1 = typeof first === "number" ? first : first.midi;
  const m2 = typeof second === "number" ? second : second.midi;
  const isEn = locale === "en-US";

  if (!Number.isFinite(m1) || !Number.isFinite(m2) || m1 < 0 || m2 < 0) {
    return {
      level: "intervals",
      title: isEn ? "Undefined interval" : "Intervalo indefinido",
      summary: UI_I18N[locale].emptyIntervalsSummary,
      details: UI_I18N[locale].emptyIntervalsDetails,
    };
  }

  const diff = Math.round(m2) - Math.round(m1);
  const semitones = Math.abs(diff);
  const direction = isEn
    ? diff > 0
      ? "ascending"
      : diff < 0
        ? "descending"
        : "unison"
    : diff > 0
      ? "ascendente"
      : diff < 0
        ? "descendente"
        : "uníssono";

  const info = semitonesToInterval(semitones);
  const n1Name = friendlyNoteName(m1, locale);
  const n2Name = friendlyNoteName(m2, locale);

  const character =
    INTERVAL_CHARACTERS[locale]?.[semitones % 12] ??
    (isEn
      ? "Compound interval extended beyond an octave."
      : "Intervalo composto estendido além de uma oitava.");

  const base = semitones % 12;
  const octs = Math.floor(semitones / 12);
  let nameStr = INTERVAL_NAMES[locale]?.[base] ?? info.name;
  if (octs > 0 && base === 0) {
    if (isEn) {
      nameStr = octs === 1 ? "octave" : `${octs} octaves`;
    } else {
      nameStr = octs === 1 ? "oitava" : `${octs} oitavas`;
    }
  } else if (octs > 0) {
    if (isEn) {
      nameStr = `${octs === 1 ? "octave" : `${octs} octaves`} + ${INTERVAL_NAMES[locale]?.[base] ?? info.name}`;
    } else {
      nameStr = `${octs === 1 ? "oitava" : `${octs} oitavas`} + ${INTERVAL_NAMES[locale]?.[base] ?? info.name}`;
    }
  }

  return {
    level: "intervals",
    title: isEn ? `Interval: ${nameStr} (${info.short})` : `Intervalo: ${nameStr} (${info.short})`,
    summary: isEn
      ? `${direction} leap of ${nameStr} (${semitones} semitones) between ${n1Name} and ${n2Name}.`
      : `Salto ${direction} de ${nameStr} (${semitones} semitons) entre ${n1Name} e ${n2Name}.`,
    details: character,
    technicalDetails: `${info.short} · ${semitones} ${isEn ? "semitones" : "semitons"} · ${n1Name} → ${n2Name}`,
  };
}

/**
 * 3. Scales (Escalas): Família de notas da tonalidade ativa.
 */
export function explainScale(
  key: KeyEstimate,
  scale?: Scale,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const rootName = PC_NAMES[key.root];
  const solfege = SOLFEGE_NAMES[locale]?.[key.root] ?? SOLFEGE_NAMES["pt-BR"][key.root];
  const modeName = isEn
    ? key.mode === "major"
      ? "Major"
      : "Minor"
    : key.mode === "major"
      ? "Maior"
      : "Menor";

  const sc = scale ?? getScale(key.mode === "minor" ? "natural-minor" : "major");

  const notesInScale = sc.intervals
    .map((i) => PC_NAMES[mod12(key.root + i)])
    .join(" – ");

  const formula = isEn
    ? key.mode === "major"
      ? "Tone – Tone – Semitone – Tone – Tone – Tone – Semitone"
      : "Tone – Semitone – Tone – Tone – Semitone – Tone – Tone"
    : key.mode === "major"
      ? "Tom – Tom – Semitom – Tom – Tom – Tom – Semitom"
      : "Tom – Semitom – Tom – Tom – Semitom – Tom – Tom";

  const description = isEn
    ? key.mode === "major"
      ? `The ${rootName} Major scale (${solfege}) carries a bright, uplifting, and affirmative character.`
      : `The ${rootName} Minor scale (${solfege}) carries an introspective, expressive, and deep character.`
    : key.mode === "major"
      ? `A escala de ${rootName} Maior (${solfege}) tem sonoridade solar, clara e afirmativa.`
      : `A escala de ${rootName} Menor (${solfege}) tem sonoridade introspectiva, expressiva e profunda.`;

  return {
    level: "scales",
    title: isEn ? `${rootName} ${modeName} Scale` : `Escala de ${rootName} ${modeName}`,
    summary: isEn
      ? `${rootName} ${modeName} scale: the governing notes of this musical landscape (${notesInScale}).`
      : `Escala de ${rootName} ${modeName}: as notas que organizam o universo desta música (${notesInScale}).`,
    details: isEn
      ? `${description} Interval pattern: ${formula}.`
      : `${description} Padrão intervalar: ${formula}.`,
    technicalDetails: `${isEn ? "Key" : "Tonalidade"} ${rootName} ${key.mode} · ${isEn ? "Confidence" : "Confiança"} ${(key.confidence * 100).toFixed(0)}%`,
    confidence: key.confidence,
  };
}

/**
 * 4. Chords (Acordes): Tríades e estruturas harmônicas formadas.
 */
export function explainChord(
  chord: Chord,
  key?: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const cName = chordName(chord);
  const rootCipher = PC_NAMES[chord.root];
  const rootSolfege = SOLFEGE_NAMES[locale]?.[chord.root] ?? SOLFEGE_NAMES["pt-BR"][chord.root];
  const tones = chordTones(chord).map(
    (p) => `${PC_NAMES[p]} (${SOLFEGE_NAMES[locale]?.[p] ?? SOLFEGE_NAMES["pt-BR"][p]})`,
  );

  const qInfo = CHORD_QUALITIES[locale]?.[chord.quality] ?? {
    label: chord.quality,
    mood: isEn ? "harmonic sonority" : "combinação harmônica",
  };

  const triadPhrase = isEn
    ? `${rootCipher} ${qInfo.label} triad`
    : `tríade de ${rootCipher} ${qInfo.label}`;

  let romanInfo = "";
  if (key) {
    const roman = chordToRoman(chord, key);
    if (roman !== "?") {
      romanInfo = isEn
        ? ` (Degree ${roman} in ${PC_NAMES[key.root]} ${key.mode})`
        : ` (Grau ${roman} em ${PC_NAMES[key.root]} ${key.mode})`;
    }
  }

  return {
    level: "chords",
    title: isEn ? `Chord ${cName}` : `Acorde ${cName}`,
    summary: isEn
      ? `Chord ${cName}: ${triadPhrase}${romanInfo}, formed by pitches ${tones.join(", ")}.`
      : `Acorde ${cName}: ${triadPhrase}${romanInfo}, formado pelas notas ${tones.join(", ")}.`,
    details: isEn
      ? `Harmonic combination built on root ${rootCipher} (${rootSolfege}), generating ${qInfo.mood}.`
      : `Combinação harmônica construída sobre a fundamental ${rootCipher} (${rootSolfege}), gerando ${qInfo.mood}.`,
    technicalDetails: `${isEn ? "Quality" : "Qualidade"}: ${chord.quality} · ${isEn ? "Pitches" : "Notas"}: ${tones.join(" - ")}`,
  };
}

/**
 * Análise melódica para acordes arpejados (ex: cantar C–E–G).
 */
export function explainMelodyPcs(
  pcs: readonly number[],
  key?: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const uniq = [...new Set(pcs.map(mod12))].sort((a, b) => a - b);

  if (uniq.length === 0) {
    return {
      level: "chords",
      title: isEn ? "No notes" : "Sem notas",
      summary: UI_I18N[locale].emptyChordsSummary,
      details: UI_I18N[locale].emptyChordsDetails,
    };
  }

  const detected = chordFromPcs(uniq);
  if (detected) {
    const rootName = PC_NAMES[detected.root];
    const qInfo = CHORD_QUALITIES[locale]?.[detected.quality] ?? {
      label: detected.quality,
      mood: "",
    };
    const notesStr = uniq.map((p) => PC_NAMES[p]).join(", ");

    return {
      level: "chords",
      title: isEn
        ? `${rootName} ${qInfo.label} Triad`
        : `Tríade de ${rootName} ${qInfo.label}`,
      summary: isEn
        ? `You sang the notes ${notesStr}, forming the ${rootName} ${qInfo.label} triad.`
        : `Você cantou as notas ${notesStr}, formando a tríade de ${rootName} ${qInfo.label}.`,
      details: isEn
        ? `Recognized arpeggio: melodic notes in sequence assemble the chord ${chordName(detected)}.`
        : `Arpejo reconhecido: as notas cantadas no tempo montam o acorde ${chordName(detected)}.`,
      technicalDetails: `${isEn ? "Detected chord" : "Acorde detectado"}: ${chordName(detected)} ${isEn ? "from" : "a partir de"} [${notesStr}]`,
    };
  }

  // Se são 2 notas, explica como intervalo harmônico
  if (uniq.length === 2) {
    return explainInterval(uniq[0], uniq[1], locale);
  }

  // Entrada atonal ou conjunto cromático
  const noteList = uniq.map((p) => PC_NAMES[p]).join(", ");
  return {
    level: "chords",
    title: isEn ? "Free melodic cluster" : "Conjunto melódico livre",
    summary: isEn
      ? `You sang notes ${noteList}: a modern and expressive soundscape.`
      : `Você cantou as notas ${noteList}: uma sonoridade livre e moderna.`,
    details: isEn
      ? "The sung notes do not outline a standard triad, creating rich contemporary colors."
      : "As notas cantadas não formam uma tríade padrão clássica, criando cores cromáticas e expressivas contemporâneas.",
    technicalDetails: `Pitch classes: [${uniq.join(", ")}]`,
  };
}

/**
 * 5. Harmonic Functions (Funções): Papel do acorde na tonalidade.
 */
export function explainFunctions(
  chord: Chord,
  key: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const cName = chordName(chord);
  const fn = getFunction(chord, key);
  const roman = chordToRoman(chord, key);
  const keyLabel = keyDisplayName(key.root, key.mode, locale);

  const fInfo = HARMONIC_FUNCTIONS[locale]?.[fn] ?? HARMONIC_FUNCTIONS[locale].UNKNOWN;

  return {
    level: "functions",
    title: isEn
      ? `${fInfo.label} Function (${roman})`
      : `Função ${fInfo.label} (${roman})`,
    summary: isEn
      ? `Chord ${cName} acts as ${fInfo.label} (${roman}) in the key of ${keyLabel}.`
      : `O acorde ${cName} exerce a função de ${fInfo.label} (${roman}) no tom de ${keyLabel}.`,
    details: `${isEn ? "Musical role" : "Papel musical"}: ${fInfo.role}`,
    technicalDetails: `${isEn ? "Degree" : "Grau"} ${roman} · ${isEn ? "Function" : "Função"} ${fn} · ${isEn ? "Key" : "Tonalidade"} ${keyLabel}`,
  };
}

/**
 * 6. Progressions (Progressões): Caminho e encadeamento de acordes.
 */
export function explainProgression(
  chords: readonly Chord[],
  key: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";

  if (chords.length === 0) {
    return {
      level: "progressions",
      title: isEn ? "Waiting for progression" : "Aguardando progressão",
      summary: UI_I18N[locale].emptyProgressionsSummary,
      details: UI_I18N[locale].emptyProgressionsDetails,
    };
  }

  const keyLabel = keyDisplayName(key.root, key.mode, locale);
  const keyRootName = PC_NAMES[key.root];
  const chordNames = chords.map(chordName).join(" → ");
  const romans = analyzeProgression(chords, key);
  const romanPath = romans.join("–");

  // Canonical check: G–D–Em–C em G mostra "funções I–V–vi–IV em G"
  const isPopClassic = romanPath === "I–V–vi–IV";
  const isSensitive = romanPath === "vi–IV–I–V";
  const isJazzTwoFiveOne = romanPath.includes("ii–V–I");

  let story = isEn
    ? `Harmonic pathway in ${keyLabel}: ${chordNames}.`
    : `Caminho harmônico no tom de ${keyLabel}: ${chordNames}.`;

  if (isEn) {
    if (isPopClassic) {
      story = `Displays I–V–vi–IV functions in ${keyRootName}: the most famous pop/folk progression in music history (Tonic → Dominant → Relative Minor → Subdominant).`;
    } else if (isSensitive) {
      story = `Displays vi–IV–I–V functions in ${keyRootName}: nostalgic, emotional progression prevalent in ballads and contemporary pop.`;
    } else if (isJazzTwoFiveOne) {
      story = `Displays classic jazz ii–V–I in ${keyRootName}: gentle preparation, peak tension, and elegant resolution.`;
    }
  } else {
    if (isPopClassic) {
      story = `Mostra funções I–V–vi–IV em ${keyRootName}: a progressão pop/folk mais famosa da história (Tônica → Dominante → Tônica relativa → Subdominante).`;
    } else if (isSensitive) {
      story = `Mostra funções vi–IV–I–V em ${keyRootName}: progressão emotiva e nostálgica, muito usada em baladas e pop moderno.`;
    } else if (isJazzTwoFiveOne) {
      story = `Mostra a clássica fórmula de jazz ii–V–I em ${keyRootName}: preparação suave, máxima tensão e resolução elegante.`;
    }
  }

  return {
    level: "progressions",
    title: isEn ? `Progression ${romanPath}` : `Progressão ${romanPath}`,
    summary: isEn
      ? `Chord sequence ${chordNames} expresses ${romanPath} functions in ${keyRootName}.`
      : `A sequência de acordes ${chordNames} expressa funções ${romanPath} em ${keyRootName}.`,
    details: story,
    technicalDetails: `${isEn ? "Chords" : "Acordes"}: ${chordNames} · ${isEn ? "Degrees" : "Graus"}: ${romanPath} · ${isEn ? "Key" : "Tom"}: ${keyLabel}`,
  };
}

/**
 * 7. Cadence (Cadências): Fechamento e pontuação das frases musicais.
 */
export function explainCadence(
  cadence: Cadence | { type: CadenceType; from: Chord; to: Chord },
  key?: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const type = cadence.type;
  const fromName = chordName(cadence.from);
  const toName = chordName(cadence.to);
  const cDef = CADENCE_INFO[locale]?.[type] ?? {
    title: isEn ? "Cadence" : "Cadência",
    education: "",
  };

  return {
    level: "cadence",
    title: cDef.title,
    summary: `${cDef.title} (${fromName} → ${toName}): ${cDef.education}`,
    details: isEn
      ? `Harmonic resolution closing the musical phrase: from ${fromName} to ${toName}.`
      : `Transição harmônica no fechamento da frase musical: de ${fromName} para ${toName}.`,
    technicalDetails: `${isEn ? "Type" : "Tipo"}: ${type} · ${isEn ? "Transition" : "Transição"}: ${fromName} → ${toName}${key ? ` ${isEn ? "in" : "em"} ${PC_NAMES[key.root]}` : ""}`,
  };
}

/**
 * 8. Voice Leading (Condução de Vozes): Movimento suave entre notas de acordes vizinhos.
 */
export function explainVoiceLeading(
  from: Chord,
  to: Chord,
  _reasons?: readonly HarmonyReason[],
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const fromName = chordName(from);
  const toName = chordName(to);
  const fromTones = chordTones(from);
  const toTones = chordTones(to);

  // Identifica notas comuns mantidas
  const commonTones = fromTones
    .filter((p) => toTones.includes(p))
    .map((p) => PC_NAMES[p]);

  const hasCommon = commonTones.length > 0;
  let commonText: string;
  if (isEn) {
    commonText = hasCommon
      ? `Shared pitch ${commonTones.join(", ")} remains stationary, acting as an acoustic bridge.`
      : "Voices move smoothly via concise, elegant steps.";
  } else {
    commonText = hasCommon
      ? `A nota comum ${commonTones.join(", ")} permanece parada, servindo de ponte sonora.`
      : "As vozes movem-se por passos pequenos e elegantes.";
  }

  return {
    level: "voiceLeading",
    title: isEn ? "Voice Leading" : "Condução de Vozes",
    summary: isEn
      ? `Smooth transition from ${fromName} to ${toName}: seamless voice leading across ensemble instruments.`
      : `Condução suave de ${fromName} para ${toName}: movimento melódico contínuo entre os instrumentos da banda.`,
    details: isEn
      ? `${commonText} This eliminates abrupt leaps and makes the music sound organic and integrated.`
      : `${commonText} Isso evita saltos bruscos e faz a música soar natural e integrada ao ouvido.`,
    technicalDetails: `${isEn ? "From" : "De"} ${fromName} ${isEn ? "to" : "para"} ${toName} · ${isEn ? "Common tones" : "Notas em comum"}: ${commonTones.join(", ") || (isEn ? "none (stepwise motion)" : "nenhuma (movimento por grau conjunto)")}`,
  };
}

/**
 * 9. Modulation (Modulação): Mudança de centro tonal.
 */
export function explainModulation(
  fromKey: KeyEstimate,
  toKey: KeyEstimate,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const fromName = keyDisplayName(fromKey.root, fromKey.mode, locale);
  const toName = keyDisplayName(toKey.root, toKey.mode, locale);

  const diff = mod12(toKey.root - fromKey.root);
  let relation = isEn ? "new harmonic center" : "novo centro harmônico";
  if (isEn) {
    if (diff === 7) relation = "dominant center (perfect fifth up), bringing brilliance and lift";
    else if (diff === 5) relation = "subdominant center (fourth up), providing warmth and release";
    else if (diff === 9 && fromKey.mode === "major" && toKey.mode === "minor") {
      relation = "relative minor, deepening emotional resonance without altering scale notes";
    }
  } else {
    if (diff === 7) relation = "tonalidade dominante (quinta justa acima), trazendo mais brilho e elevação";
    else if (diff === 5) relation = "tonalidade subdominante (quarta justa acima), trazendo sensação de descanso e expansão";
    else if (diff === 9 && fromKey.mode === "major" && toKey.mode === "minor") {
      relation = "relativa menor, aprofundando o tom com introspecção sem alterar a escala base";
    }
  }

  return {
    level: "modulation",
    title: isEn ? "Key Modulation" : "Modulação Tonal",
    summary: isEn
      ? `Modulation from ${fromName} to ${toName}: the tonal center moved, transforming the emotional mood.`
      : `Modulação de ${fromName} para ${toName}: o centro musical mudou, transformando o clima da música.`,
    details: isEn
      ? `Transition to ${relation}. This renews listener interest and injects fresh vitality into the melody.`
      : `Transição para a ${relation}. Isso renova o interesse de quem ouve e dá nova energia à melodia.`,
    technicalDetails: `${fromName} → ${toName} · ${isEn ? "Shift" : "Deslocamento"}: ${diff} ${isEn ? "semitones" : "semitons"}`,
  };
}

/**
 * Ritmo & Andamento (Explicador de suporte rítmico).
 */
export function explainRhythm(
  tempo: TempoState,
  meter: TimeSignature,
  locale: SupportedLocale = "pt-BR",
): EducationalSnippet {
  const isEn = locale === "en-US";
  const bpm = Math.round(tempo.playback || tempo.estimated || config.rhythm.defaultBpm);
  const meterStr = `${meter.numerator}/${meter.denominator}`;

  let meterText = isEn
    ? "steady quadruple pulse (4 beats per bar)"
    : "quaternário estável (4 tempos por compasso)";
  if (meter.numerator === 3) {
    meterText = isEn
      ? "flowing triple pulse (waltz feel, 3 beats per bar)"
      : "ternário fluido (estilo valsa, 3 tempos por compasso)";
  } else if (meter.numerator === 6) {
    meterText = isEn
      ? "balanced compound meter (2 pulses subdivided into triplets)"
      : "composto balanceado (2 pulsos subdivididos em 3 partes)";
  }

  let tempoText = isEn ? "moderate tempo" : "andamento moderado";
  if (bpm < 70) tempoText = isEn ? "slow and calm tempo" : "andamento lento e calmo";
  else if (bpm > 120) tempoText = isEn ? "brisk and upbeat tempo" : "andamento enérgico e rápido";

  return {
    level: "rhythm",
    title: isEn ? `Rhythm ${meterStr} at ${bpm} BPM` : `Ritmo ${meterStr} a ${bpm} BPM`,
    summary: isEn
      ? `Time signature ${meterStr} at ${bpm} BPM: ${meterText} with ${tempoText}.`
      : `Compasso ${meterStr} a ${bpm} BPM: pulsação ${meterText} com ${tempoText}.`,
    details: isEn
      ? "Tempo shapes breathing space for instruments, with drums anchoring strong beats to support your voice."
      : "O andamento dita a respiração dos instrumentos e a bateria pontua os tempos fortes para guiar a voz.",
    technicalDetails: `${bpm} BPM · ${meterStr} · ${isEn ? "Confidence" : "Confiança"} ${(tempo.confidence * 100).toFixed(0)}%`,
    confidence: tempo.confidence,
  };
}

/**
 * 10. Agregador Principal: MusicalState estruturado → MusicalExplanation.
 * Nunca consome áudio bruto. Seleciona o melhor snippet de acordo com o nível solicitado.
 */
export function explainState(
  state: MusicalState,
  targetLevel: LearnLevel = "chords",
  locale: SupportedLocale = "pt-BR",
): MusicalExplanation {
  const now = Date.now();
  const secondary: EducationalSnippet[] = [];
  const isEn = locale === "en-US";

  // 1. Extração segura de notas recentes
  const recentNotes = state.melody.slice(-config.learn.recentNotesWindow);
  const lastNote = recentNotes.length > 0 ? recentNotes[recentNotes.length - 1] : null;

  // 2. Extração segura de acordes recentes
  const recentChords = state.chords.slice(-config.learn.recentChordsWindow).map((c) => c.chord);
  const lastChord = recentChords.length > 0 ? recentChords[recentChords.length - 1] : null;
  const prevChord = recentChords.length > 1 ? recentChords[recentChords.length - 2] : null;

  // 3. Cadência recente (se houver 2 acordes)
  let recentCadence: Cadence | null = null;
  if (prevChord && lastChord) {
    recentCadence = detectCadenceInKey(prevChord, lastChord, state.key);
  }

  // Prepara explicações por nível
  const noteSnippet = lastNote
    ? explainNote(lastNote, state.key, locale)
    : {
        level: "notes" as const,
        title: isEn ? "Notes" : "Notas",
        summary: UI_I18N[locale].emptyNotesSummary,
        details: UI_I18N[locale].emptyNotesDetails,
      };

  const intervalSnippet =
    recentNotes.length >= 2
      ? explainInterval(
          recentNotes[recentNotes.length - 2],
          recentNotes[recentNotes.length - 1],
          locale,
        )
      : {
          level: "intervals" as const,
          title: isEn ? "Intervals" : "Intervalos",
          summary: UI_I18N[locale].emptyIntervalsSummary,
          details: UI_I18N[locale].emptyIntervalsDetails,
        };

  const scaleSnippet = explainScale(state.key, state.scale, locale);

  // Para acordes: se houver arpejo cantado na melodia recente, prioriza
  let chordSnippet: EducationalSnippet;
  if (recentNotes.length >= 3) {
    const melodyPcs = recentNotes.map((n) => mod12(n.midi));
    chordSnippet = explainMelodyPcs(melodyPcs, state.key, locale);
  } else if (lastChord) {
    chordSnippet = explainChord(lastChord, state.key, locale);
  } else {
    chordSnippet = {
      level: "chords" as const,
      title: isEn ? "Chords" : "Acordes",
      summary: UI_I18N[locale].emptyChordsSummary,
      details: UI_I18N[locale].emptyChordsDetails,
    };
  }

  const functionSnippet = lastChord
    ? explainFunctions(lastChord, state.key, locale)
    : {
        level: "functions" as const,
        title: isEn ? "Harmonic Functions" : "Funções Harmônicas",
        summary: UI_I18N[locale].emptyFunctionsSummary,
      };

  const progressionSnippet =
    recentChords.length >= 2
      ? explainProgression(recentChords, state.key, locale)
      : {
          level: "progressions" as const,
          title: isEn ? "Progressions" : "Progressões",
          summary: UI_I18N[locale].emptyProgressionsSummary,
          details: UI_I18N[locale].emptyProgressionsDetails,
        };

  const cadenceSnippet = recentCadence
    ? explainCadence(recentCadence, state.key, locale)
    : {
        level: "cadence" as const,
        title: isEn ? "Cadences" : "Cadências",
        summary: UI_I18N[locale].emptyCadenceSummary,
        details: UI_I18N[locale].emptyCadenceDetails,
      };

  const voiceLeadingSnippet =
    prevChord && lastChord
      ? explainVoiceLeading(prevChord, lastChord, undefined, locale)
      : {
          level: "voiceLeading" as const,
          title: isEn ? "Voice Leading" : "Condução de Vozes",
          summary: UI_I18N[locale].emptyVoiceLeadingSummary,
        };

  const keyStr = keyDisplayName(state.key.root, state.key.mode, locale);
  const modulationSnippet = {
    level: "modulation" as const,
    title: isEn ? "Stable Key" : "Tonalidade Estável",
    summary: UI_I18N[locale].stableKeySummary(keyStr),
    details: UI_I18N[locale].modulationDetail,
  };

  const rhythmSnippet = explainRhythm(state.tempo, state.timeSignature, locale);

  // Mapeamento de snippets por nível
  const snippetMap: Record<LearnLevel, EducationalSnippet> = {
    notes: noteSnippet,
    intervals: intervalSnippet,
    scales: scaleSnippet,
    chords: chordSnippet,
    functions: functionSnippet,
    progressions: progressionSnippet,
    cadence: cadenceSnippet,
    voiceLeading: voiceLeadingSnippet,
    modulation: modulationSnippet,
  };

  const primary = snippetMap[targetLevel] ?? chordSnippet;

  // Monta secundários relevantes para enriquecer o contexto
  if (targetLevel !== "notes") secondary.push(noteSnippet);
  const chordDefaultTitle = isEn ? "Chords" : "Acordes";
  if (targetLevel !== "chords" && chordSnippet.title !== chordDefaultTitle) {
    secondary.push(chordSnippet);
  }
  if (targetLevel !== "scales") secondary.push(scaleSnippet);
  secondary.push(rhythmSnippet);

  const levels = getLearnLevels(locale);
  const levelInfo = levels.find((l) => l.id === targetLevel) ?? levels[3];

  return {
    primary,
    secondary,
    level: targetLevel,
    activeLevelTitle: levelInfo.title,
    timestamp: now,
  };
}
