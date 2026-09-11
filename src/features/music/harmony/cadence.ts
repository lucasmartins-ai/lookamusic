/**
 * Cadence detection (Phase 4, §16). Pure detector + thin bus tracker.
 * Thresholds: none (functional music math on degrees + `getFunction`).
 *
 * On `PhraseEnded` the tracker resolves the last two observed chords into a
 * cadence (authentic / plagal / deceptive / half), exposes an arrangement
 * transition hint + a user-facing education string (pt-BR), and re-affirms
 * the closing chord via `ChordChanged` so arrangement/instruments share one
 * transition anchor. Chord history arrives over the bus (`ChordChanged`);
 * tests can also drive `detectCadence` purely.
 */
import { bus, type EventBus } from "@/lib/events";
import { newId } from "@/lib/ids";
import { getFunction } from "../theory/functions";
import { degreeOf } from "./candidates";
import type { Chord, ChordEvent, KeyEstimate } from "@/domain/types";

export type CadenceType = "authentic" | "plagal" | "deceptive" | "half";

export interface Cadence {
  type: CadenceType;
  from: Chord;
  to: Chord;
  /** Arrangement transition hint (machine-facing, English). */
  hint: string;
  /** User-facing explanation (pt-BR, feeds Phase 13). */
  education: string;
}

const HINTS: Record<CadenceType, string> = {
  authentic: "full-close: resolve tension, land the section",
  plagal: "soft-close: gentle amen landing, keep energy low",
  deceptive: "deflect: expected tonic dodged — lift into the next phrase",
  half: "half-close: tension held on V — breathe, then continue",
};

const EDUCATION: Record<CadenceType, string> = {
  authentic:
    "Cadência autêntica: o acorde dominante resolve na tônica — sensação de chegada, como um ponto final.",
  plagal:
    "Cadência plagal: do IV para o I — o “amém” das igrejas; chegada suave, sem tensão.",
  deceptive:
    "Cadência de engano: o V prometia a tônica e caiu no vi — surpresa que pede continuação.",
  half: "Semicadência: a frase para no dominante (V) — fica no ar, como uma vírgula.",
};

export function transitionHint(type: CadenceType): string {
  return HINTS[type];
}

export function educationString(type: CadenceType): string {
  return EDUCATION[type];
}

function build(type: CadenceType, from: Chord, to: Chord): Cadence {
  return { type, from, to, hint: HINTS[type], education: EDUCATION[type] };
}

/**
 * Two chords → cadence or null. Degree + function based, major and minor:
 * authentic V/vii°→I/i · deceptive V→vi/VI · plagal IV/iv→I/i · half *→V.
 */
export function detectCadence(
  prev: Chord,
  next: Chord,
  keyRoot: number,
  prevFn: ReturnType<typeof getFunction>,
  nextFn: ReturnType<typeof getFunction>,
): Cadence | null {
  const prevDeg = degreeOf(prev.root, keyRoot);
  const nextDeg = degreeOf(next.root, keyRoot);
  if (prevDeg === 7 && nextDeg === 9) return build("deceptive", prev, next);
  if (prevFn === "DOMINANT" && nextFn === "TONIC" && nextDeg === 0) {
    return build("authentic", prev, next);
  }
  if (prevDeg === 5 && nextDeg === 0 && nextFn === "TONIC") {
    return build("plagal", prev, next);
  }
  if (nextDeg === 7 && nextFn === "DOMINANT") return build("half", prev, next);
  return null;
}

/** Convenience wrapper that derives functions from the key. */
export function detectCadenceInKey(
  prev: Chord,
  next: Chord,
  key: KeyEstimate,
): Cadence | null {
  return detectCadence(
    prev,
    next,
    key.root,
    getFunction(prev, key),
    getFunction(next, key),
  );
}

export class CadenceTracker {
  private history: ChordEvent[] = [];
  private last: Cadence | null = null;
  private key: KeyEstimate | null = null;
  private off: (() => void)[] = [];

  constructor(private readonly events: EventBus = bus) {
    this.off = [
      events.on("ChordChanged", (e) => {
        this.history.push(e);
        if (this.history.length > 2) this.history.shift();
      }),
      events.on("PhraseEnded", () => this.onPhraseEnded()),
    ];
  }

  /** Detach bus subscriptions (tests / teardown). */
  dispose(): void {
    this.off.forEach((fn) => fn());
    this.off = [];
  }

  reset(): void {
    this.history.length = 0;
    this.last = null;
    this.key = null;
  }

  /** The harmony engine feeds the current key here (detection is key-aware). */
  observeKey(key: KeyEstimate): void {
    this.key = { ...key };
  }

  /** Cadence resolved at the last phrase end (null when none). */
  lastCadence(): Cadence | null {
    return this.last ? { ...this.last } : null;
  }

  private onPhraseEnded(): void {
    this.last = null;
    if (!this.key || this.history.length < 2) return;
    const [from, to] = this.history.slice(-2);
    const found = detectCadenceInKey(from.chord, to.chord, this.key);
    if (!found) return;
    this.last = found;
    // Re-affirm the closing chord: same musical content, fresh event id —
    // one shared transition anchor for arrangement/instruments/UI.
    this.events.emit("ChordChanged", { ...to, id: newId("chord") });
  }
}
