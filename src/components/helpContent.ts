/**
 * Help system content (Phase 10): keyboard shortcuts + minimal glossary.
 * Pure data rendered by `HelpDialog.tsx`. Tested: every global shortcut the
 * app actually listens to must be documented here.
 */
import { GESTURE_CONTROLS, GESTURE_KEYBOARD } from "@/features/gestures/mapping";
import type { GestureKind } from "@/domain/types";

export type ShortcutScope = "global" | "home" | "session";

export interface Shortcut {
  keys: string;
  action: string;
  scope: ShortcutScope;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "?", action: "Abrir esta ajuda", scope: "global" },
  { keys: "D", action: "Mostrar/ocultar diagnósticos", scope: "global" },
  { keys: "Esc", action: "Fechar ajuda", scope: "global" },
  { keys: "Tab / Shift+Tab", action: "Navegar por todos os controles", scope: "global" },
  { keys: "Espaço / Enter", action: "Ativar o botão focado", scope: "global" },
  { keys: "S", action: "Iniciar/parar a escuta", scope: "home" },
  ...Object.entries(GESTURE_KEYBOARD).map(([gesture, key]) => {
    const kind = gesture as GestureKind;
    return {
      keys: key.replace("Arrow", "") + (key.startsWith("Arrow") ? " (seta)" : ""),
      action: `Regência: ${GESTURE_CONTROLS[kind].label} — ${GESTURE_CONTROLS[kind].hint}`,
      scope: "session" as ShortcutScope,
    };
  }),
];

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: "Nota", definition: "Um som sustentado com altura estável (ex.: G4). Blocos na linha do tempo." },
  { term: "Acorde", definition: "Conjunto de notas que acompanha sua voz (ex.: C maior). Um por compasso." },
  { term: "Tom", definition: "A escala “casa” da música (ex.: G maior). Revisado à medida que você canta." },
  { term: "BPM", definition: "Batidas por minuto — o andamento. Segue sua voz, sem saltos bruscos." },
  { term: "Compasso", definition: "Grupo de tempos (ex.: 4/4). Entradas e saídas da banda acontecem na fronteira." },
  { term: "Energia", definition: "Intensidade da sua voz (0–100%). Controla quantos instrumentos tocam." },
  { term: "Frase", definition: "Um fôlego musical: notas agrupadas entre silêncios." },
];
