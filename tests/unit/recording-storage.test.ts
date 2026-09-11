import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultComposition } from "@/features/recording/schema";
import {
  clearAllCompositions,
  deleteComposition,
  listCompositions,
  loadComposition,
  saveComposition,
} from "@/features/recording/storage";

describe("recording storage (IndexedDB / Memory fallback)", () => {
  beforeEach(async () => {
    await clearAllCompositions();
  });

  it("saves and loads a valid composition", async () => {
    const comp = createDefaultComposition({
      id: "comp-test-1",
      name: "Samba da Madrugada",
      tempo: 104,
      melody: [
        {
          id: "n1",
          pitch: 261.63,
          midi: 60,
          startTime: 0.5,
          duration: 1.0,
          velocity: 0.9,
          confidence: 0.95,
          source: "voice",
        },
      ],
    });

    await saveComposition(comp);

    const loaded = await loadComposition("comp-test-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("comp-test-1");
    expect(loaded?.name).toBe("Samba da Madrugada");
    expect(loaded?.tempo).toBe(104);
    expect(loaded?.melody.length).toBe(1);
    expect(loaded?.melody[0].midi).toBe(60);
  });

  it("returns null for non-existent composition id", async () => {
    const loaded = await loadComposition("non-existent-id");
    expect(loaded).toBeNull();
  });

  it("lists compositions with accurate summary data", async () => {
    const compA = createDefaultComposition({ id: "comp-a", name: "Tema A", tempo: 90 });
    const compB = createDefaultComposition({
      id: "comp-b",
      name: "Tema B",
      tempo: 120,
      melody: [
        {
          id: "m1",
          pitch: 329.63,
          midi: 64,
          startTime: 0,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
        {
          id: "m2",
          pitch: 392.0,
          midi: 67,
          startTime: 0.5,
          duration: 0.5,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ],
    });

    await saveComposition(compA);
    await saveComposition(compB);

    const list = await listCompositions();
    expect(list.length).toBe(2);

    const summaryB = list.find((item) => item.id === "comp-b");
    expect(summaryB).toBeDefined();
    expect(summaryB?.name).toBe("Tema B");
    expect(summaryB?.noteCount).toBe(2);
  });

  it("deletes a composition cleanly", async () => {
    const comp = createDefaultComposition({ id: "comp-to-delete", name: "Deletar" });
    await saveComposition(comp);

    let loaded = await loadComposition("comp-to-delete");
    expect(loaded).not.toBeNull();

    await deleteComposition("comp-to-delete");
    loaded = await loadComposition("comp-to-delete");
    expect(loaded).toBeNull();
  });
});
