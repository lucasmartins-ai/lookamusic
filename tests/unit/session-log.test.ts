/** Session diagnostics log (TDR-25): what lands on disk for each usage. */
import { describe, expect, it } from "vitest";
import { SessionLog, audioExt, observationsCsv, sessionId } from "@/features/diagnostics/session-log";

function fakeDisk() {
  const files = new Map<string, string>();
  const persist = async (session: string, name: string, data: Uint8Array) => {
    files.set(`${session}/${name}`, new TextDecoder().decode(data));
    return `/x/sessoes/${session}/${name}`;
  };
  return { files, persist };
}

const obs = (t: number, hz: number) => ({ frequency: hz, midiNote: 69 + 12 * Math.log2(hz / 440), confidence: 0.9, clarity: 0.9, timestamp: t, rms: 0.05 });

describe("session log", () => {
  it("folder names are filesystem-safe local timestamps", () => {
    expect(sessionId(new Date(2026, 9, 11, 9, 5, 3))).toBe("2026-10-11_09-05-03");
  });

  it("writes meta, events, observations, notes, composition and the take", async () => {
    const { files, persist } = fakeDisk();
    const log = new SessionLog(persist, () => true);
    log.begin("cantarolar-primeiro", { mic: { echoCancellation: false } }, 1000);
    log.setPhase("captura");
    log.obs(obs(1010, 440));
    log.obs(obs(1021, 441));
    log.event("tocar-banda", { tempo: 119.75 }, 1500);
    await log.write("composition.json", JSON.stringify({ tempo: 119.75 }));
    await log.writeAudio(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mp4" }));
    await log.flush();
    const id = log.session!;
    expect([...files.keys()].sort()).toEqual(
      ["composition.json", "events.jsonl", "meta.json", "observations.csv", "take.m4a"].map((n) => `${id}/${n}`),
    );
    expect(JSON.parse(files.get(`${id}/meta.json`)!).mic).toEqual({ echoCancellation: false });
    const csv = files.get(`${id}/observations.csv`)!.trim().split("\n");
    expect(csv[0]).toBe("t_ms,hz,midi,confidence,rms,phase");
    expect(csv[1]).toBe("10.0,440.00,69.00,0.900,0.0500,captura");
    expect(files.get(`${id}/events.jsonl`)).toContain('"event":"tocar-banda"');
    expect(log.lastLocation).toBe(`/x/sessoes/${id}`);
  });

  it("switched off → nothing is recorded or written", async () => {
    const { files, persist } = fakeDisk();
    const log = new SessionLog(persist, () => false);
    log.begin("ao-vivo", {});
    log.obs(obs(1, 440));
    await log.flush();
    expect(log.active).toBe(false);
    expect(files.size).toBe(0);
  });

  it("a failing disk never throws into the app", async () => {
    const log = new SessionLog(async () => {
      throw new Error("disk full");
    }, () => true);
    log.begin("cantarolar-primeiro", {});
    await expect(log.flush()).resolves.toBeUndefined();
  });

  it("csv / audio helpers", () => {
    expect(observationsCsv([], 0)).toBe("t_ms,hz,midi,confidence,rms,phase\n");
    expect(audioExt("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExt("audio/mp4")).toBe("m4a");
  });
});
