import { describe, it, expect } from "vitest";
import {
  encodeWav,
  parseWavHeader,
  computeCompositionDuration,
  WAV_HEADER_SIZE,
  DEFAULT_WAV_SAMPLE_RATE,
} from "@/features/export/wav";
import { createDefaultComposition } from "@/features/recording/schema";
import type { Composition } from "@/domain/types";

describe("WAV Audio Export (Phase 12, §40)", () => {
  it("encodes valid canonical 16-bit PCM stereo RIFF WAVE header", () => {
    const sampleRate = 44100;
    const durationSec = 1.5;
    const numSamples = Math.round(durationSec * sampleRate);

    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);

    // Generate a simple test sine wave
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      left[i] = Math.sin(2 * Math.PI * 440 * t);
      right[i] = Math.sin(2 * Math.PI * 880 * t);
    }

    const wavBytes = encodeWav(left, right, sampleRate);
    expect(wavBytes).toBeInstanceOf(Uint8Array);
    expect(wavBytes.length).toBe(WAV_HEADER_SIZE + numSamples * 4);

    const header = parseWavHeader(wavBytes);
    expect(header.chunkId).toBe("RIFF");
    expect(header.format).toBe("WAVE");
    expect(header.subchunk1Id).toBe("fmt ");
    expect(header.subchunk1Size).toBe(16);
    expect(header.audioFormat).toBe(1); // PCM
    expect(header.numChannels).toBe(2); // Stereo
    expect(header.sampleRate).toBe(44100);
    expect(header.bitsPerSample).toBe(16);
    expect(header.blockAlign).toBe(4);
    expect(header.byteRate).toBe(44100 * 4);
    expect(header.subchunk2Id).toBe("data");
    expect(header.numSamples).toBe(numSamples);
    expect(header.durationSec).toBeCloseTo(durationSec, 3);
  });

  it("computes composition duration according to musical boundaries + decay tail", () => {
    // 120 BPM in 4/4: 1 bar = 2.0s
    const comp: Composition = createDefaultComposition({
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
    });

    // 1. Minimum 4 bars floor (4 * 2.0 = 8.0s) + 1.0s tail = 9.0s
    expect(computeCompositionDuration(comp)).toBe(9.0);

    // 2. Melody extending to 12.5s: max(12.5, 8.0) + 1.0 = 13.5s
    comp.melody = [
      {
        id: "long-note",
        pitch: 440,
        midi: 69,
        startTime: 10.0,
        duration: 2.5,
        velocity: 0.8,
        confidence: 1,
        source: "voice",
      },
    ];
    expect(computeCompositionDuration(comp)).toBe(13.5);

    // 3. Chords extending to 8 bars (8 * 2.0 = 16.0s): max(13.5, 16.0) + 1.0 = 17.0s
    comp.chords = [
      {
        id: "c-long",
        chord: { root: 0, quality: "major" },
        startBar: 4,
        durationBars: 4,
        confidence: 1,
      },
    ];
    expect(computeCompositionDuration(comp)).toBe(17.0);
  });

  it("safely clamps audio samples outside [-1.0, 1.0] without numerical overflow", () => {
    const left = new Float32Array([1.5, -2.0, 0.0, 0.5, -0.5]);
    const right = new Float32Array([2.5, -3.0, 0.0, 0.5, -0.5]);

    const wavBytes = encodeWav(left, right, DEFAULT_WAV_SAMPLE_RATE);
    const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);

    // Check sample 0 (originally 1.5 -> clamped to 32767)
    const s0L = view.getInt16(WAV_HEADER_SIZE, true);
    expect(s0L).toBe(32767);

    // Check sample 1 (originally -2.0 -> clamped to -32768)
    const s1L = view.getInt16(WAV_HEADER_SIZE + 4, true);
    expect(s1L).toBe(-32768);

    // Check sample 2 (0.0 -> 0)
    const s2L = view.getInt16(WAV_HEADER_SIZE + 8, true);
    expect(s2L).toBe(0);
  });

  it("rejects corrupt or short WAV headers with descriptive errors", () => {
    expect(() => parseWavHeader(new Uint8Array(20))).toThrowError(/muito curto/);

    const corrupt = new Uint8Array(44);
    expect(() => parseWavHeader(corrupt)).toThrowError(/Cabeçalho RIFF\/WAVE inválido/);
  });

  it("successfully renders a composition offline and encodes a valid WAV blob via renderToWav", async () => {
    // Setup Mock OfflineAudioContext in global window
    class MockAudioNode {
      connect() {}
      disconnect() {}
    }
    class MockAudioParam {
      value = 1;
      setValueAtTime() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
      setTargetAtTime() {}
    }
    class MockGainNode extends MockAudioNode {
      gain = new MockAudioParam();
    }
    class MockOscillatorNode extends MockAudioNode {
      type = "sine";
      frequency = new MockAudioParam();
      detune = new MockAudioParam();
      start() {}
      stop() {}
    }
    class MockBiquadFilterNode extends MockAudioNode {
      type = "lowpass";
      frequency = new MockAudioParam();
    }
    class MockBufferSourceNode extends MockAudioNode {
      buffer: unknown = null;
      loop = false;
      start() {}
      stop() {}
    }
    class MockStereoPannerNode extends MockAudioNode {
      pan = new MockAudioParam();
    }
    class MockAudioBuffer {
      numberOfChannels = 2;
      constructor(public length: number, public sampleRate: number) {}
      getChannelData() {
        return new Float32Array(this.length);
      }
    }
    class MockOfflineAudioContext {
      destination = new MockAudioNode();
      currentTime = 0;
      constructor(public channels: number, public length: number, public sampleRate: number) {}
      createGain() {
        return new MockGainNode();
      }
      createOscillator() {
        return new MockOscillatorNode();
      }
      createBiquadFilter() {
        return new MockBiquadFilterNode();
      }
      createBufferSource() {
        return new MockBufferSourceNode();
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        return new MockAudioBuffer(length, sampleRate);
      }
      createStereoPanner() {
        return new MockStereoPannerNode();
      }
      async startRendering() {
        return new MockAudioBuffer(this.length, this.sampleRate);
      }
    }

    const origWindow = globalThis.window;
    (globalThis as unknown as Record<string, unknown>).window = {
      ...(origWindow ?? {}),
      OfflineAudioContext: MockOfflineAudioContext,
    };

    try {
      const comp = createDefaultComposition({
        name: "WAV Render Test",
        tempo: 120,
      });
      comp.melody = [
        {
          id: "m1",
          pitch: 440,
          midi: 69,
          startTime: 0,
          duration: 1.0,
          velocity: 0.8,
          confidence: 1,
          source: "voice",
        },
      ];

      const progressLogs: number[] = [];
      const { renderToWav } = await import("@/features/export/wav");
      const result = await renderToWav(comp, {
        onProgress: (pct) => progressLogs.push(pct),
      });

      expect(result).toBeDefined();
      expect(result.durationSec).toBeGreaterThan(0);
      expect(result.rawBytes).toBeInstanceOf(Uint8Array);
      expect(result.blob.type).toBe("audio/wav");

      const header = parseWavHeader(result.rawBytes);
      expect(header.chunkId).toBe("RIFF");
      expect(header.format).toBe("WAVE");
      expect(header.audioFormat).toBe(1);
      expect(header.numChannels).toBe(2);

      // Progress reporting
      expect(progressLogs).toContain(100);
    } finally {
      globalThis.window = origWindow;
    }
  });
});
