/**
 * Domain types for Educational Mode (Phase 13, §4).
 * Pure TypeScript — no React, no Web Audio.
 */

export type LearnLevel =
  | "notes"
  | "intervals"
  | "scales"
  | "chords"
  | "functions"
  | "progressions"
  | "cadence"
  | "voiceLeading"
  | "modulation";

export interface LearnLevelInfo {
  readonly id: LearnLevel;
  readonly title: string;
  readonly shortDescription: string;
  readonly order: number;
}

export const LEARN_LEVELS: readonly LearnLevelInfo[] = [
  { id: "notes", title: "Notas", shortDescription: "Alturas fundamentais e notas cantadas", order: 1 },
  { id: "intervals", title: "Intervalos", shortDescription: "Distância e relação entre duas notas", order: 2 },
  { id: "scales", title: "Escalas", shortDescription: "A família de notas da tonalidade", order: 3 },
  { id: "chords", title: "Acordes", shortDescription: "Tríades e combinações sonoras", order: 4 },
  { id: "functions", title: "Funções Harmônicas", shortDescription: "Tônica, Subdominante e Dominante", order: 5 },
  { id: "progressions", title: "Progressões", shortDescription: "Caminhos e encadeamentos de acordes", order: 6 },
  { id: "cadence", title: "Cadências", shortDescription: "Pontuações e respirações de frase", order: 7 },
  { id: "voiceLeading", title: "Condução de Vozes", shortDescription: "Movimento suave e notas compartilhadas", order: 8 },
  { id: "modulation", title: "Modulação", shortDescription: "Mudanças de tonalidade e novo centro", order: 9 },
] as const;

export interface EducationalSnippet {
  level: LearnLevel | "rhythm";
  title: string;
  summary: string;
  details?: string;
  technicalDetails?: string;
  confidence?: number;
}

export interface MusicalExplanation {
  primary: EducationalSnippet;
  secondary: EducationalSnippet[];
  level: LearnLevel;
  activeLevelTitle: string;
  timestamp: number;
}

export type SupportedLocale = "pt-BR" | "en-US";

export interface LearnSettings {
  enabled: boolean;
  level: LearnLevel;
  screenReaderAnnounce: boolean;
  locale: SupportedLocale;
}
