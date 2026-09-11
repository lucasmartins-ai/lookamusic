/**
 * Gesture → arrangement mapping (Phase 9, §27–28 + §44). Pure data +
 * pure functions — no React, no Web Audio, and NEVER an import of
 * `features/instruments` (boundary: vision posts `GestureEvent`; only
 * arrangement/conductor consume it; synthesis is unreachable from here
 * even by accident — see `gestures-boundary.test.ts`).
 *
 * Vocabulary (normative, `docs/gesture-architecture.md`):
 *
 * | Gesto          | Intenção            | Equivalente UI/teclado        |
 * |----------------|---------------------|-------------------------------|
 * | OPEN_HAND      | add selected        | Adicionar + `O`               |
 * | CLOSED_HAND    | remove selected     | Remover + `C`                 |
 * | ONE_FINGER     | energy → low        | Suave + `1`                   |
 * | TWO_FINGERS    | energy → medium     | Média + `2`                   |
 * | THREE_FINGERS  | energy → high       | Cheia + `3`                   |
 * | SWIPE_UP       | energy +1 step      | Energia + + `ArrowUp`         |
 * | SWIPE_DOWN     | energy −1 step      | Energia − + `ArrowDown`       |
 * | SWIPE_LEFT     | select previous     | Seleção ← + `ArrowLeft`       |
 * | SWIPE_RIGHT    | select next         | Seleção → + `ArrowRight`      |
 *
 * Selection cycles the canonical `INSTRUMENTS` order. Fingers set an
 * explicit energy level (same as the Suave/Média/Cheia buttons);
 * vertical swipes step the level relatively (same as Energia ±).
 */
import { INSTRUMENTS, type GestureKind, type InstrumentId } from "@/domain/types";
import type { EnergyLevel } from "@/features/music/rhythm/energy";

export type ArrangementGestureIntent =
  | { type: "add-selected" }
  | { type: "remove-selected" }
  | { type: "energy-level"; level: EnergyLevel }
  | { type: "energy-step"; delta: 1 | -1 }
  | { type: "select-step"; delta: 1 | -1 };

/** First instrument the open/close gestures act on (quartet is on by default). */
export const DEFAULT_GESTURE_SELECTED: InstrumentId = "guitar";

export const ENERGY_ORDER: readonly EnergyLevel[] = ["low", "medium", "high"] as const;

/** Runtime guard for bus input (the bus carries `unknown` at runtime). */
export function isGestureKind(k: unknown): k is GestureKind {
  return typeof k === "string" && (GESTURE_ORDER as readonly string[]).includes(k);
}

/** Pure: every vocab gesture resolves to exactly one arrangement intent. */
export function gestureToIntent(kind: GestureKind): ArrangementGestureIntent {
  switch (kind) {
    case "OPEN_HAND":
      return { type: "add-selected" };
    case "CLOSED_HAND":
      return { type: "remove-selected" };
    case "ONE_FINGER":
      return { type: "energy-level", level: "low" };
    case "TWO_FINGERS":
      return { type: "energy-level", level: "medium" };
    case "THREE_FINGERS":
      return { type: "energy-level", level: "high" };
    case "SWIPE_UP":
      return { type: "energy-step", delta: 1 };
    case "SWIPE_DOWN":
      return { type: "energy-step", delta: -1 };
    case "SWIPE_LEFT":
      return { type: "select-step", delta: -1 };
    case "SWIPE_RIGHT":
      return { type: "select-step", delta: 1 };
    default:
      throw new Error(`unknown gesture: ${String(kind)}`);
  }
}

/** Keyboard equivalent per gesture (§44) — global shortcuts, see useGestures. */
export const GESTURE_KEYBOARD: Record<GestureKind, string> = {
  OPEN_HAND: "o",
  CLOSED_HAND: "c",
  ONE_FINGER: "1",
  TWO_FINGERS: "2",
  THREE_FINGERS: "3",
  SWIPE_UP: "ArrowUp",
  SWIPE_DOWN: "ArrowDown",
  SWIPE_LEFT: "ArrowLeft",
  SWIPE_RIGHT: "ArrowRight",
};

/** Reverse lookup: physical key → gesture (first match wins). */
export function gestureForKey(key: string): GestureKind | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  for (const [kind, bound] of Object.entries(GESTURE_KEYBOARD) as [GestureKind, string][]) {
    if (bound.length === 1 ? bound.toLowerCase() === k : bound === key) return kind;
  }
  return null;
}

/** pt-BR button labels: every gesture action exists as a control (§44). */
export const GESTURE_CONTROLS: Record<GestureKind, { label: string; hint: string }> = {
  OPEN_HAND: { label: "Adicionar", hint: "Mão aberta — adiciona o instrumento selecionado" },
  CLOSED_HAND: { label: "Remover", hint: "Mão fechada — remove o instrumento selecionado" },
  ONE_FINGER: { label: "Suave", hint: "1 dedo — energia suave" },
  TWO_FINGERS: { label: "Média", hint: "2 dedos — energia média" },
  THREE_FINGERS: { label: "Cheia", hint: "3 dedos — energia cheia" },
  SWIPE_UP: { label: "Energia +", hint: "Deslizar p/ cima — sobe um nível de energia" },
  SWIPE_DOWN: { label: "Energia −", hint: "Deslizar p/ baixo — desce um nível de energia" },
  SWIPE_LEFT: { label: "Seleção ←", hint: "Deslizar p/ esquerda — instrumento anterior" },
  SWIPE_RIGHT: { label: "Seleção →", hint: "Deslizar p/ direita — próximo instrumento" },
};

export const GESTURE_ORDER: readonly GestureKind[] = [
  "OPEN_HAND",
  "CLOSED_HAND",
  "ONE_FINGER",
  "TWO_FINGERS",
  "THREE_FINGERS",
  "SWIPE_UP",
  "SWIPE_DOWN",
  "SWIPE_LEFT",
  "SWIPE_RIGHT",
] as const;

/** Cyclic instrument selection driven by SWIPE_LEFT/RIGHT. */
export class GestureSelection {
  private selected: InstrumentId;

  constructor(initial: InstrumentId = DEFAULT_GESTURE_SELECTED) {
    this.selected = (INSTRUMENTS as readonly string[]).includes(initial) ? initial : "drums";
  }

  current(): InstrumentId {
    return this.selected;
  }

  set(id: InstrumentId): void {
    if ((INSTRUMENTS as readonly string[]).includes(id)) this.selected = id;
  }

  step(delta: 1 | -1): InstrumentId {
    const idx = (INSTRUMENTS as readonly InstrumentId[]).indexOf(this.selected);
    const next = (idx + delta + INSTRUMENTS.length) % INSTRUMENTS.length;
    this.selected = INSTRUMENTS[next];
    return this.selected;
  }
}

/** Arrangement-side effects the bridge may trigger (implemented by conductor). */
export interface GestureActionSink {
  addSelected(): void;
  removeSelected(): void;
  setEnergyLevel(level: EnergyLevel): void;
  stepEnergy(delta: 1 | -1): void;
  stepSelection(delta: 1 | -1): void;
}

/**
 * Routes validated `GestureEvent`s to arrangement effects. Constructed
 * ONLY from bus events (never from raw landmarks/frames), so partial or
 * low-confidence gestures — which never become events — can't reach here.
 */
export class GestureArrangementBridge {
  readonly selection: GestureSelection;

  constructor(private readonly sink: GestureActionSink, selection?: GestureSelection) {
    this.selection = selection ?? new GestureSelection();
  }

  selected(): InstrumentId {
    return this.selection.current();
  }

  /** Route one bus event to exactly one sink call (total function). */
  handle(kind: GestureKind): void {
    const intent = gestureToIntent(kind);
    switch (intent.type) {
      case "add-selected":
        this.sink.addSelected();
        break;
      case "remove-selected":
        this.sink.removeSelected();
        break;
      case "energy-level":
        this.sink.setEnergyLevel(intent.level);
        break;
      case "energy-step":
        this.sink.stepEnergy(intent.delta);
        break;
      case "select-step":
        this.sink.stepSelection(intent.delta);
        break;
    }
  }
}
