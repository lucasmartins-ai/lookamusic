/**
 * Hotfix cantarolar — mudo global de captura, tomada limpa e trio de base.
 * Pedido do usuário: "as músicas estão tocando quando clico no cantarolar",
 * "deixar só violão, piano e drum ativos" e "identificou mais de 14 notas".
 * Run: npm test -- conductor-capture-silence
 */
import { describe, expect, it } from "vitest";
import { EventBus } from "@/lib/events";
import { config } from "@/lib/config";
import type { InstrumentId } from "@/domain/types";
import type { InstrumentEngine, MusicalEvent, ScheduleContext } from "@/features/instruments/types";
import { Conductor, createEngines } from "@/features/conductor/conductor";
import { g4Observations } from "@/features/conductor/fixture";

const IDS: InstrumentId[] = ["drums", "bass", "piano", "guitar", "violao", "strings", "violin", "sax", "accordion"];

class RecEngine implements InstrumentEngine {
  readonly volumes: number[] = [];
  scheduled = 0;
  constructor(readonly id: InstrumentId) {}
  schedule(events: MusicalEvent[], _ctx: ScheduleContext): void {
    this.scheduled += events.length;
  }
  stop(): void {}
  setVolume(v: number): void {
    this.volumes.push(v);
  }
  setPan(): void {}
  get lastVolume(): number | undefined {
    return this.volumes[this.volumes.length - 1];
  }
}

function setup() {
  const events = new EventBus();
  const engines = createEngines(events, {
    drums: true, bass: false, piano: true, guitar: false, violao: true,
    strings: false, violin: false, sax: false, accordion: false,
  });
  const rec = {} as Record<InstrumentId, RecEngine>;
  for (const id of IDS) rec[id] = new RecEngine(id);
  let nowSec = 0;
  const conductor = new Conductor(engines, { band: rec, schedulerNow: () => nowSec, seed: "silence-test" }, events);
  conductor.reset(0);
  return { events, engines, rec, conductor, setNow: (s: number) => { nowSec = s; } };
}

describe("captura silenciosa (hum-first)", () => {
  it("silencia TODOS os canais, não só os que estão no ar", () => {
    const s = setup();
    s.conductor.setBandSilenced(true);
    expect(s.conductor.isBandSilenced()).toBe(true);
    for (const id of IDS) expect(s.rec[id].lastVolume).toBe(0);
  });

  it("continua mudo quando o Auto acrescenta vozes durante a captura", () => {
    const s = setup();
    s.conductor.setBandSilenced(true);
    // Energia alta no modo Auto acrescentaria strings/violino/etc.
    s.conductor.pushEnergy(0.95, 1000);
    s.setNow(1.0);
    s.conductor.tick(1.0, { phraseBoundary: true });
    for (const id of IDS) expect(s.rec[id].lastVolume).toBe(0);
  });

  it("restaura o mix quando a captura termina", () => {
    const s = setup();
    s.conductor.setBandSilenced(true);
    s.conductor.setBandSilenced(false);
    expect(s.conductor.isBandSilenced()).toBe(false);
    expect(s.rec.drums.lastVolume).toBeGreaterThan(0);
    expect(s.rec.piano.lastVolume).toBeGreaterThan(0);
  });

  it("clearCapture começa uma tomada limpa (contagem volta a zero)", () => {
    const s = setup();
    const t0 = 1_000_000;
    s.conductor.reset(t0 / 1000);
    for (const obs of g4Observations(t0, t0 + 1200)) s.conductor.pushObservation(obs);
    expect(s.conductor.state.melodyNotes().length).toBeGreaterThan(0);

    s.conductor.clearCapture(t0 / 1000);
    expect(s.conductor.state.melodyNotes()).toHaveLength(0);
    expect(s.conductor.state.phraseRecords()).toHaveLength(0);
    expect(s.conductor.state.chordEvents()).toHaveLength(0);
  });
});

describe("trio de base", () => {
  it("o Auto nunca passa de bateria + piano + violão", () => {
    const s = setup();
    const core = new Set(config.arrangement.coreEnsemble);
    expect([...core].sort()).toEqual(["drums", "piano", "violao"]);
    s.conductor.pushEnergy(0.99, 500);
    s.setNow(1.0);
    s.conductor.tick(1.0, { phraseBoundary: true });
    const active = s.conductor.state.snapshot().arrangement.active;
    const on = (Object.keys(active) as InstrumentId[]).filter((id) => active[id]);
    expect(on.every((id) => core.has(id))).toBe(true);
    expect(on).toContain("piano");
  });

  it("ligar à mão continua valendo (pin vence o Auto)", () => {
    const s = setup();
    s.conductor.toggleInstrument("sax", 1.0);
    s.setNow(1.05);
    s.conductor.tick(1.05, { phraseBoundary: true });
    expect(s.conductor.state.snapshot().arrangement.active.sax).toBe(true);
    expect(s.conductor.pinnedList()).toContain("sax");
  });
});
