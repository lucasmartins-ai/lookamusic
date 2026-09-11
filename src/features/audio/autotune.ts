/**
 * Autotune Engine & Audio Controller.
 * Pure logic calculations + Web Audio Node integration.
 */
import type {
  AutotuneConfig,
  AutotuneSnapMode,
  AutotuneSpeed,
  KeyEstimate,
  PitchObservation,
} from "@/domain/types";
import { config } from "@/lib/config";
import { midiToFreq } from "@/features/pitch/conversions";
import { nearestScaleTone } from "@/features/music/theory/scales";

export function computeTargetMidi(
  currentMidi: number,
  snapMode: AutotuneSnapMode,
  key?: KeyEstimate | null,
): number {
  if (currentMidi <= 0) return -1;
  const roundMidi = Math.round(currentMidi);
  if (snapMode === "chromatic" || !key || key.confidence < 0.25) {
    return roundMidi;
  }
  const scaleId = key.mode === "minor" ? "natural-minor" : "major";
  return nearestScaleTone(roundMidi, key.root, scaleId);
}

export function computePitchRatio(currentMidi: number, targetMidi: number): number {
  if (currentMidi <= 0 || targetMidi <= 0) return 1.0;
  const currentFreq = midiToFreq(currentMidi);
  const targetFreq = midiToFreq(targetMidi);
  if (currentFreq <= 0 || targetFreq <= 0) return 1.0;
  const ratio = targetFreq / currentFreq;
  return Math.max(0.5, Math.min(2.0, ratio));
}

export function speedToMs(speed: AutotuneSpeed): number {
  return config.autotune.speeds[speed] ?? 50;
}

export class AutotuneController {
  private config: AutotuneConfig = {
    enabled: false,
    speed: "pop",
    snapMode: "chromatic",
    amount: config.autotune.defaultAmount,
    monitorVolume: config.autotune.defaultMonitorVolume,
  };

  private node: AudioWorkletNode | null = null;
  private monitorGain: GainNode | null = null;
  private currentRatio = 1.0;
  private lastTargetMidi = -1;

  getConfig(): AutotuneConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<AutotuneConfig>): AutotuneConfig {
    this.config = { ...this.config, ...patch };
    this.syncNode();
    return this.getConfig();
  }

  attach(ctx: AudioContext, sourceNode: AudioNode): AudioNode | null {
    try {
      this.node = new AudioWorkletNode(ctx, "looka-autotune", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      this.monitorGain = ctx.createGain();
      this.monitorGain.gain.setValueAtTime(this.config.monitorVolume, ctx.currentTime);

      sourceNode.connect(this.node);
      this.node.connect(this.monitorGain);
      this.monitorGain.connect(ctx.destination);

      this.syncNode();
      return this.node;
    } catch {
      return null;
    }
  }

  detach(): void {
    try {
      this.node?.disconnect();
      this.monitorGain?.disconnect();
    } catch {
      // ignore
    }
    this.node = null;
    this.monitorGain = null;
  }

  processObservation(
    obs: PitchObservation,
    key?: KeyEstimate | null,
  ): { targetMidi: number; ratio: number } {
    if (!this.config.enabled || obs.frequency <= 0 || obs.confidence < 0.3) {
      this.currentRatio = 1.0;
      this.lastTargetMidi = -1;
      this.postToWorklet({ targetRatio: 1.0 });
      return { targetMidi: -1, ratio: 1.0 };
    }

    const targetMidi = computeTargetMidi(obs.midiNote, this.config.snapMode, key);
    const ratio = computePitchRatio(obs.midiNote, targetMidi);
    this.currentRatio = ratio;
    this.lastTargetMidi = targetMidi;

    this.postToWorklet({
      targetRatio: ratio,
      amount: this.config.amount,
      speedMs: speedToMs(this.config.speed),
    });

    return { targetMidi, ratio };
  }

  private syncNode(): void {
    if (this.monitorGain) {
      // Safety cap at 0.95 to prevent hardware clipping
      const safeVolume = Math.min(0.95, Math.max(0, this.config.monitorVolume));
      this.monitorGain.gain.value = this.config.enabled ? safeVolume : 0;
    }

    this.postToWorklet({
      enabled: this.config.enabled,
      amount: this.config.amount,
      speedMs: speedToMs(this.config.speed),
      targetRatio: this.currentRatio,
    });
  }

  private postToWorklet(msg: Record<string, unknown>): void {
    try {
      this.node?.port.postMessage(msg);
    } catch {
      // ignore if disconnected
    }
  }
}
