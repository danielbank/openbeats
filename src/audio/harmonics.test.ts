import { describe, expect, it } from "vitest";
import type { TrackState } from "@/store/beatStore";
import {
  analyzeHarmonics,
  harmonicAnalysisKey,
  reconstruct,
  trackMixAnalysisKey,
  type HarmonicAnalysis,
  type TrackMixRenderParams,
} from "./harmonics";

describe("harmonicAnalysisKey", () => {
  it("includes voice, synth sentinel, and max harmonics", () => {
    expect(harmonicAnalysisKey("kick", undefined, 12)).toBe("kick:synth:12");
    expect(harmonicAnalysisKey("hat", "https://a/b.wav", 8)).toBe("hat:https://a/b.wav:8");
  });
});

describe("trackMixAnalysisKey", () => {
  const baseTracks: TrackState[] = [
    {
      id: "k",
      name: "K",
      voice: "kick",
      muted: false,
      velocity: 1,
      steps: [true, false],
    },
  ];

  it("changes when pattern signature or mix params change", () => {
    const p: TrackMixRenderParams = {
      tracks: baseTracks,
      bpm: 120,
      resolution: 16,
      bars: 1,
      filterFrequency: 8000,
      masterGain: 0.9,
    };
    const k1 = trackMixAnalysisKey(p, 24);
    expect(k1.startsWith("mix:")).toBe(true);
    const k2 = trackMixAnalysisKey({ ...p, bpm: 121 }, 24);
    expect(k1).not.toBe(k2);
    const k3 = trackMixAnalysisKey({ ...p, masterGain: 0.5 }, 24);
    expect(k1).not.toBe(k3);
  });
});

describe("analyzeHarmonics", () => {
  it("produces normalized magnitudes and reconstructible coefficients", () => {
    const len = 4096;
    const samples = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      samples[i] = Math.sin((2 * Math.PI * 3 * i) / 512);
    }
    const n = 8;
    const a = analyzeHarmonics(samples, n);
    expect(a.target).toHaveLength(256);
    expect(a.a).toHaveLength(n + 1);
    expect(a.b).toHaveLength(n + 1);
    expect(a.magnitudes).toHaveLength(n + 1);
    expect(a.magnitudes.slice(1).every((m) => m >= 0 && m <= 1)).toBe(true);
    expect(Math.max(...a.magnitudes.slice(1))).toBeCloseTo(1, 5);
  });
});

describe("reconstruct", () => {
  it("includes DC and increases energy as more harmonics are summed", () => {
    const analysis: HarmonicAnalysis = {
      target: new Array(256).fill(0),
      a0: 2,
      a: [0, 0.5, 0, 0, 0, 0, 0, 0, 0],
      b: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      magnitudes: [0, 1, 0, 0, 0, 0, 0, 0, 0],
    };
    const r0 = reconstruct(analysis, 0, 64);
    const r1 = reconstruct(analysis, 1, 64);
    expect(r0.every((v) => v === 1)).toBe(true);
    const max1 = Math.max(...r1.map(Math.abs));
    expect(max1).toBeGreaterThan(1);
  });
});
