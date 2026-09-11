/**
 * Master bus (hotfix som limpo): contained input gain + compressor glue +
 * short procedural room send. Run: npm test -- audio-master-bus
 */
import { describe, expect, it } from "vitest";
import { createMasterBus } from "@/features/instruments/audio-sink";

interface StubNode {
  connections: unknown[];
  gain: { value: number };
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  buffer: unknown;
  connect: (target: unknown) => void;
  disconnect: () => void;
  getChannelData: (ch: number) => Float32Array;
}

function stubNode(): StubNode {
  const node: StubNode = {
    connections: [],
    gain: { value: 0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    buffer: null,
    connect: (target: unknown) => {
      node.connections.push(target);
    },
    disconnect: () => {},
    getChannelData: (_ch: number) => new Float32Array(8),
  };
  return node;
}

function stubCtx() {
  const gains: StubNode[] = [];
  const comps: StubNode[] = [];
  const verbs: StubNode[] = [];
  const ctx = {
    sampleRate: 44100,
    createGain: () => {
      const n = stubNode();
      gains.push(n);
      return n;
    },
    createDynamicsCompressor: () => {
      const n = stubNode();
      comps.push(n);
      return n;
    },
    createConvolver: () => {
      const n = stubNode();
      verbs.push(n);
      return n;
    },
    createBuffer: (_ch: number, len: number, _rate: number) => ({
      getChannelData: (_c: number) => new Float32Array(len),
    }),
  };
  return { ctx, gains, comps, verbs };
}

describe("createMasterBus", () => {
  it("contains the input gain and glues with a gentle compressor", () => {
    const { ctx, comps } = stubCtx();
    const destination = stubNode();
    const bus = createMasterBus(
      ctx as unknown as BaseAudioContext,
      destination as unknown as AudioNode,
    );
    expect(bus.input.gain.value).toBeCloseTo(0.8, 9);
    expect(comps).toHaveLength(1);
    const comp = comps[0];
    expect(comp.threshold.value).toBe(-18);
    expect(comp.ratio.value).toBe(4);
    expect(comp.connections).toContain(destination);
    expect(() => bus.dispose()).not.toThrow();
  });

  it("adds a short procedural room send without assets", () => {
    const { ctx, verbs } = stubCtx();
    const destination = stubNode();
    createMasterBus(ctx as unknown as BaseAudioContext, destination as unknown as AudioNode);
    expect(verbs).toHaveLength(1);
    expect(verbs[0].buffer).not.toBeNull();
  });
});
