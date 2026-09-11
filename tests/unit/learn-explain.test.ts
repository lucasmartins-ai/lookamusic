import { describe, expect, it } from "vitest";
import {
  explainNote,
  explainInterval,
  explainScale,
  explainChord,
  explainMelodyPcs,
  explainFunctions,
  explainProgression,
  explainCadence,
  explainVoiceLeading,
  explainModulation,
  explainRhythm,
  explainState,
} from "@/features/learn/explain";
import {
  readLearnEnabled,
  writeLearnEnabled,
  readLearnLevel,
  writeLearnLevel,
} from "@/features/learn/useLearnSettings";
import { LEARN_LEVELS, type LearnLevel } from "@/features/learn/types";
import { getScale } from "@/features/music/theory/scales";
import type { Chord, KeyEstimate, MusicalState, NoteEvent } from "@/domain/types";

function mockNote(midi: number, startTime = 0, duration = 0.5): NoteEvent {
  return {
    id: `note-${midi}-${startTime}`,
    pitch: 440,
    midi,
    startTime,
    duration,
    velocity: 0.8,
    confidence: 0.95,
    source: "voice",
  };
}

function mockState(overrides: Partial<MusicalState> = {}): MusicalState {
  const defaultKey: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
  return {
    tempo: { estimated: 90, target: 90, playback: 90, confidence: 0.8 },
    timeSignature: { numerator: 4, denominator: 4 },
    key: defaultKey,
    scale: getScale("major"),
    melody: [],
    chords: [],
    rhythm: {
      tempo: { estimated: 90, target: 90, playback: 90, confidence: 0.8 },
      meter: { numerator: 4, denominator: 4 },
      density: 0.5,
      onsets: [],
    },
    arrangement: {
      active: { drums: true, bass: true, piano: true, guitar: false, violao: false, strings: false, violin: false, sax: false, accordion: false },
      energy: 0.5,
    },
    dynamics: { inputEnergy: 0.5, smoothedEnergy: 0.5, level: "medium" },
    ...overrides,
  };
}

describe("Fase 13: Motor Educacional — Tabela Canônica e Critérios de Aceite", () => {
  it("aceite 1: cantar C–E–G mostra 'tríade de C maior'", () => {
    // 1. Diretamente via pitch classes melódicas
    const pcs = [0, 4, 7]; // C, E, G
    const snippet = explainMelodyPcs(pcs);
    expect(snippet.summary.toLowerCase()).toContain("tríade de c maior");

    // 2. Via explainChord
    const cMajorChord: Chord = { root: 0, quality: "major" };
    const chordSnippet = explainChord(cMajorChord);
    expect(chordSnippet.summary.toLowerCase()).toContain("tríade de c maior");

    // 3. Via MusicalState com as 3 notas cantadas na melodia
    const state = mockState({
      melody: [mockNote(60, 0), mockNote(64, 0.5), mockNote(67, 1.0)],
    });
    const explanation = explainState(state, "chords");
    expect(explanation.primary.summary.toLowerCase()).toContain("tríade de c maior");
  });

  it("aceite 2: G–D–Em–C mostra funções I–V–vi–IV em G", () => {
    const keyG: KeyEstimate = { root: 7, mode: "major", confidence: 0.95 };
    const chords: Chord[] = [
      { root: 7, quality: "major" }, // G = I
      { root: 2, quality: "major" }, // D = V
      { root: 4, quality: "minor" }, // Em = vi
      { root: 0, quality: "major" }, // C = IV
    ];

    const snippet = explainProgression(chords, keyG);
    expect(snippet.summary).toContain("funções I–V–vi–IV em G");
    expect(snippet.details).toContain("I–V–vi–IV em G");

    // Via explainState com chords carregados
    const state = mockState({
      key: keyG,
      chords: chords.map((c, i) => ({
        id: `c-${i}`,
        chord: c,
        startBar: i,
        durationBars: 1,
        confidence: 0.9,
      })),
    });
    const explanation = explainState(state, "progressions");
    expect(explanation.primary.summary).toContain("funções I–V–vi–IV em G");
  });

  it("cadências canônicas: autêntica, plagal, engano e semicadência", () => {
    const keyC: KeyEstimate = { root: 0, mode: "major", confidence: 0.95 };
    const G: Chord = { root: 7, quality: "major" };
    const C: Chord = { root: 0, quality: "major" };
    const F: Chord = { root: 5, quality: "major" };
    const Am: Chord = { root: 9, quality: "minor" };

    // Autêntica: V → I
    const auth = explainCadence({ type: "authentic", from: G, to: C }, keyC);
    expect(auth.title).toBe("Cadência Autêntica");
    expect(auth.summary).toContain("Cadência autêntica");
    expect(auth.summary).toContain("resolve na tônica");

    // Plagal: IV → I
    const plagal = explainCadence({ type: "plagal", from: F, to: C }, keyC);
    expect(plagal.title).toBe("Cadência Plagal");
    expect(plagal.summary).toContain("Cadência plagal");
    expect(plagal.summary).toContain("IV para o I");

    // Deceptive: V → vi
    const decept = explainCadence({ type: "deceptive", from: G, to: Am }, keyC);
    expect(decept.title).toBe("Cadência de Engano");
    expect(decept.summary).toContain("Cadência de engano");
    expect(decept.summary).toContain("caiu no vi");

    // Half: I → V
    const half = explainCadence({ type: "half", from: C, to: G }, keyC);
    expect(half.title).toBe("Semicadência");
    expect(half.summary).toContain("Semicadência");
    expect(half.summary).toContain("dominante (V)");
  });

  it("intervalos canônicos: uníssono a oitava", () => {
    const unisson = explainInterval(60, 60);
    expect(unisson.title).toContain("P1");

    const m2 = explainInterval(60, 61);
    expect(m2.title).toContain("m2");

    const M2 = explainInterval(60, 62);
    expect(M2.title).toContain("M2");

    const m3 = explainInterval(60, 63);
    expect(m3.title).toContain("m3");

    const M3 = explainInterval(60, 64);
    expect(M3.title).toContain("M3");
    expect(M3.summary).toContain("terça maior");

    const P4 = explainInterval(60, 65);
    expect(P4.title).toContain("P4");

    const TT = explainInterval(60, 66);
    expect(TT.title).toContain("TT");

    const P5 = explainInterval(60, 67);
    expect(P5.title).toContain("P5");
    expect(P5.summary).toContain("quinta justa");

    const P8 = explainInterval(60, 72);
    expect(P8.title).toContain("P8");
    expect(P8.summary).toContain("oitava");
  });

  it("escalas: maior e menor", () => {
    const keyC: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
    const scMajor = explainScale(keyC);
    expect(scMajor.title).toBe("Escala de C Maior");
    expect(scMajor.summary).toContain("C – D – E – F – G – A – B");

    const keyAm: KeyEstimate = { root: 9, mode: "minor", confidence: 0.9 };
    const scMinor = explainScale(keyAm);
    expect(scMinor.title).toBe("Escala de A Menor");
  });

  it("funções harmônicas diatônicas", () => {
    const keyC: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
    const C: Chord = { root: 0, quality: "major" };
    const F: Chord = { root: 5, quality: "major" };
    const G: Chord = { root: 7, quality: "major" };

    const fnTonic = explainFunctions(C, keyC);
    expect(fnTonic.title).toContain("Tônica");
    expect(fnTonic.title).toContain("I");

    const fnSub = explainFunctions(F, keyC);
    expect(fnSub.title).toContain("Subdominante");
    expect(fnSub.title).toContain("IV");

    const fnDom = explainFunctions(G, keyC);
    expect(fnDom.title).toContain("Dominante");
    expect(fnDom.title).toContain("V");
  });

  it("condução de vozes e notas comuns", () => {
    const C: Chord = { root: 0, quality: "major" }; // C, E, G
    const Am: Chord = { root: 9, quality: "minor" }; // A, C, E
    const vl = explainVoiceLeading(C, Am);
    expect(vl.title).toBe("Condução de Vozes");
    expect(vl.summary).toContain("Condução suave de C para Am");
    expect(vl.details).toContain("nota comum");
  });

  it("modulação tonal", () => {
    const fromKey: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
    const toKey: KeyEstimate = { root: 7, mode: "major", confidence: 0.9 };
    const mod = explainModulation(fromKey, toKey);
    expect(mod.title).toBe("Modulação Tonal");
    expect(mod.summary).toContain("Modulação de C Maior para G Maior");
    expect(mod.details).toContain("quinta justa acima");
  });

  it("ritmo e compasso", () => {
    const rhythm = explainRhythm({ estimated: 120, target: 120, playback: 120, confidence: 0.9 }, { numerator: 4, denominator: 4 });
    expect(rhythm.title).toContain("4/4 a 120 BPM");
    expect(rhythm.summary).toContain("quaternário");

    const waltz = explainRhythm({ estimated: 90, target: 90, playback: 90, confidence: 0.9 }, { numerator: 3, denominator: 4 });
    expect(waltz.title).toContain("3/4 a 90 BPM");
    expect(waltz.summary).toContain("ternário");
  });
});

describe("Fase 13: Robustez — Entradas Atonais, Ruído e Fallbacks Graciosos", () => {
  it("não quebra com estado musical vazio", () => {
    const empty = mockState();
    expect(() => explainState(empty)).not.toThrow();
    const explanation = explainState(empty, "chords");
    expect(explanation.primary).toBeDefined();
    expect(explanation.primary.title).toBeDefined();
    expect(explanation.primary.summary).toBeDefined();
    expect(explanation.secondary.length).toBeGreaterThan(0);
  });

  it("não quebra com entrada melódica atonal / ruído cromático", () => {
    const atonalPcs = [1, 6, 8, 11]; // C#, F#, G#, B (não forma tríade)
    expect(() => explainMelodyPcs(atonalPcs)).not.toThrow();
    const snippet = explainMelodyPcs(atonalPcs);
    expect(snippet.title).toBe("Conjunto melódico livre");
    expect(snippet.summary).toContain("sonoridade livre e moderna");
  });

  it("lida com notas de MIDI negativo ou unvoiced sem lançar erro", () => {
    expect(() => explainNote(-1)).not.toThrow();
    const snippet = explainNote(-1);
    expect(snippet.title).toBe("Sem nota detectada");
    expect(snippet.summary).toContain("Aguardando som");
  });

  it("lida com intervalos indefinidos sem erro", () => {
    expect(() => explainInterval(-1, 60)).not.toThrow();
    const snippet = explainInterval(-1, 60);
    expect(snippet.title).toBe("Intervalo indefinido");
  });

  it("lida com progressão vazia sem erro", () => {
    const key: KeyEstimate = { root: 0, mode: "major", confidence: 0.5 };
    expect(() => explainProgression([], key)).not.toThrow();
    const snippet = explainProgression([], key);
    expect(snippet.title).toBe("Aguardando progressão");
  });

  it("lida com acordes cromáticos não-diatônicos sem erro", () => {
    const keyC: KeyEstimate = { root: 0, mode: "major", confidence: 0.9 };
    const chromaticChord: Chord = { root: 1, quality: "diminished" }; // C#dim
    expect(() => explainFunctions(chromaticChord, keyC)).not.toThrow();
    const fnSnippet = explainFunctions(chromaticChord, keyC);
    expect(fnSnippet.title).toContain("Cor harmônica expressiva");
  });
});

describe("Fase 13: Escopo Progressivo e Configurações de Aprendizado", () => {
  it("cada um dos 9 níveis progressivos é suportado e retorna snippet apropriado", () => {
    const state = mockState({
      melody: [mockNote(60, 0), mockNote(64, 0.5), mockNote(67, 1.0)],
      chords: [
        { id: "c1", chord: { root: 0, quality: "major" }, startBar: 0, durationBars: 1, confidence: 0.9 },
        { id: "c2", chord: { root: 7, quality: "major" }, startBar: 1, durationBars: 1, confidence: 0.9 },
      ],
    });

    for (const lvl of LEARN_LEVELS) {
      const exp = explainState(state, lvl.id);
      expect(exp.level).toBe(lvl.id);
      expect(exp.activeLevelTitle).toBe(lvl.title);
      expect(exp.primary).toBeDefined();
      expect(exp.primary.title).toBeDefined();
      expect(exp.primary.summary).toBeDefined();
    }
  });

  it("leitura e escrita das configurações de modo educacional", () => {
    // Teste de fallback seguro
    const defEnabled = readLearnEnabled();
    expect(typeof defEnabled).toBe("boolean");

    const defLvl = readLearnLevel();
    expect(LEARN_LEVELS.some((l) => l.id === defLvl)).toBe(true);

    // Salvar e recuperar
    writeLearnEnabled(true);
    expect(readLearnEnabled()).toBe(true);

    writeLearnLevel("progressions");
    expect(readLearnLevel()).toBe("progressions");

    // Limpeza
    writeLearnEnabled(false);
    writeLearnLevel("chords");
  });
});
