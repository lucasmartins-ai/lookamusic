/** Fake VoiceSink: records every call. No Web Audio, no timers. */
import type {
  NoiseParams,
  ToneParams,
  VoiceSink,
} from "@/features/instruments/audio-sink";

export class FakeSink implements VoiceSink {
  tones: ToneParams[] = [];
  noises: NoiseParams[] = [];
  cancels = 0;
  volumes: number[] = [];
  pans: number[] = [];
  disposed = false;

  tone(p: ToneParams): void {
    this.tones.push({ ...p });
  }

  noise(p: NoiseParams): void {
    this.noises.push({ ...p });
  }

  cancel(): void {
    this.cancels += 1;
  }

  setVolume(v: number): void {
    this.volumes.push(v);
  }

  setPan(p: number): void {
    this.pans.push(p);
  }

  dispose(): void {
    this.disposed = true;
  }

  get calls(): number {
    return this.tones.length + this.noises.length;
  }

  reset(): void {
    this.tones = [];
    this.noises = [];
    this.cancels = 0;
    this.volumes = [];
    this.pans = [];
  }
}
