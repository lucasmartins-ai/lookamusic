/**
 * Gesture → arrangement mapping (Phase 9, §27–28 + §44). Vocabulary
 * matrix, keyboard parity, selection cycling, bridge routing. Run:
 * npm test -- gestures-mapping
 */
import { describe, expect, it } from "vitest";
import { INSTRUMENTS, type GestureKind } from "@/domain/types";
import {
  DEFAULT_GESTURE_SELECTED,
  ENERGY_ORDER,
  GESTURE_CONTROLS,
  GESTURE_KEYBOARD,
  GESTURE_ORDER,
  GestureArrangementBridge,
  GestureSelection,
  gestureForKey,
  gestureToIntent,
  type ArrangementGestureIntent,
} from "@/features/gestures/mapping";
import type { EnergyLevel } from "@/features/music/rhythm/energy";

const MATRIX: Record<GestureKind, ArrangementGestureIntent> = {
  OPEN_HAND: { type: "add-selected" },
  CLOSED_HAND: { type: "remove-selected" },
  ONE_FINGER: { type: "energy-level", level: "low" },
  TWO_FINGERS: { type: "energy-level", level: "medium" },
  THREE_FINGERS: { type: "energy-level", level: "high" },
  SWIPE_UP: { type: "energy-step", delta: 1 },
  SWIPE_DOWN: { type: "energy-step", delta: -1 },
  SWIPE_LEFT: { type: "select-step", delta: -1 },
  SWIPE_RIGHT: { type: "select-step", delta: 1 },
};

describe("vocabulary matrix: each gesture → exactly the spec action", () => {
  for (const kind of GESTURE_ORDER) {
    it(`${kind} → ${JSON.stringify(MATRIX[kind])}`, () => {
      expect(gestureToIntent(kind)).toEqual(MATRIX[kind]);
    });
  }

  it("covers the full 9-gesture vocabulary, no more", () => {
    expect(GESTURE_ORDER).toHaveLength(9);
    expect(new Set(GESTURE_ORDER).size).toBe(9);
    expect(Object.keys(MATRIX).sort()).toEqual([...GESTURE_ORDER].sort());
  });
});

describe("keyboard + button parity (§44)", () => {
  it("every gesture has a distinct keyboard binding", () => {
    const keys = GESTURE_ORDER.map((k) => GESTURE_KEYBOARD[k]);
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(9);
  });

  it("every binding round-trips back to its gesture (case-insensitive)", () => {
    for (const kind of GESTURE_ORDER) {
      expect(gestureForKey(GESTURE_KEYBOARD[kind])).toBe(kind);
    }
    expect(gestureForKey("O")).toBe("OPEN_HAND");
    expect(gestureForKey("o")).toBe("OPEN_HAND");
  });

  it("unbound keys resolve to null (never a phantom gesture)", () => {
    expect(gestureForKey("q")).toBeNull();
    expect(gestureForKey("Enter")).toBeNull();
    expect(gestureForKey("")).toBeNull();
  });

  it("every gesture has a non-empty pt-BR button label + hint", () => {
    for (const kind of GESTURE_ORDER) {
      expect(GESTURE_CONTROLS[kind].label.length).toBeGreaterThan(0);
      expect(GESTURE_CONTROLS[kind].hint.length).toBeGreaterThan(0);
    }
  });

  it("energy order is low → medium → high", () => {
    expect(ENERGY_ORDER).toEqual(["low", "medium", "high"]);
  });
});

describe("GestureSelection", () => {
  it("defaults to guitar (quartet plays by default, guitar is the selection target)", () => {
    expect(DEFAULT_GESTURE_SELECTED).toBe("guitar");
    expect(new GestureSelection().current()).toBe("guitar");
  });

  it("steps through the canonical order and wraps", () => {
    const sel = new GestureSelection("accordion");
    expect(sel.step(1)).toBe("drums");
    expect(sel.step(-1)).toBe("accordion");
    expect(new GestureSelection("drums").step(-1)).toBe("accordion");
  });

  it("ignores unknown instruments (never a hole in the selection)", () => {
    const sel = new GestureSelection("piano");
    // @ts-expect-error — hostile input probe
    sel.set("kazoo");
    expect(sel.current()).toBe("piano");
    // @ts-expect-error — hostile input probe
    expect(new GestureSelection("kazoo").current()).toBe("drums");
  });
});

describe("GestureArrangementBridge: one event → exactly one sink call", () => {
  function harness() {
    const calls: string[] = [];
    const bridge = new GestureArrangementBridge({
      addSelected: () => calls.push("add"),
      removeSelected: () => calls.push("remove"),
      setEnergyLevel: (l: EnergyLevel) => calls.push(`level:${l}`),
      stepEnergy: (d: 1 | -1) => calls.push(`estep:${d}`),
      stepSelection: (d: 1 | -1) => calls.push(`sstep:${d}`),
    });
    return { bridge, calls };
  }

  const EXPECTED: Record<GestureKind, string> = {
    OPEN_HAND: "add",
    CLOSED_HAND: "remove",
    ONE_FINGER: "level:low",
    TWO_FINGERS: "level:medium",
    THREE_FINGERS: "level:high",
    SWIPE_UP: "estep:1",
    SWIPE_DOWN: "estep:-1",
    SWIPE_LEFT: "sstep:-1",
    SWIPE_RIGHT: "sstep:1",
  };

  for (const kind of GESTURE_ORDER) {
    it(`${kind} → ${EXPECTED[kind]} (and nothing else)`, () => {
      const { bridge, calls } = harness();
      bridge.handle(kind);
      expect(calls).toEqual([EXPECTED[kind]]);
    });
  }

  it("exposes the shared selection (swipes move the open/close target)", () => {
    const { bridge } = harness();
    expect(bridge.selected()).toBe("guitar");
    expect(INSTRUMENTS).toContain(bridge.selected());
  });
});
