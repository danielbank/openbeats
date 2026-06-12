import * as Tone from "tone";
import {
  kitSequenceSignature,
  type TrackState,
} from "@/store/beatStore";
import {
  createSampleVoiceFromBuffer,
  createVoice,
} from "./voices";
import type { Instrument, VoiceType } from "./types";

// Window analyzed as one "period" of the Fourier series, and the number of
// points the waveform is drawn with.
const WINDOW = 512;
const DRAW_POINTS = 256;

export interface HarmonicAnalysis {
  /** The captured single-period waveform, normalized to [-1, 1], DRAW_POINTS long. */
  target: number[];
  /** DC term (the reconstruction uses a0 / 2). */
  a0: number;
  /** Cosine coefficients, index 1..N. */
  a: number[];
  /** Sine coefficients, index 1..N. */
  b: number[];
  /** Per-harmonic magnitude (the "FFT" bars), index 1..N, normalized to max 1. */
  magnitudes: number[];
}

/**
 * Render a voice's waveform offline (deterministic, no playback) — or load the
 * track's sample — and return its raw mono samples. Client-only (uses an
 * OfflineAudioContext / fetch).
 */
export async function getVoiceWaveform(
  voice: VoiceType,
  sampleUrl?: string,
): Promise<Float32Array> {
  if (sampleUrl) {
    const buffer = await Tone.ToneAudioBuffer.fromUrl(sampleUrl);
    return buffer.getChannelData(0);
  }
  const buffer = await Tone.Offline((ctx) => {
    const voiceInstance = createVoice(voice, ctx.destination);
    voiceInstance.trigger(0);
  }, 0.5);
  return buffer.getChannelData(0);
}

/**
 * Treat a window of the waveform (taken from the loudest region) as one period
 * and compute its Fourier-series coefficients for harmonics 1..N. The partial
 * sums of these converge back to the window — that's what {@link reconstruct}
 * animates.
 */
export function analyzeHarmonics(
  samples: Float32Array,
  n: number,
): HarmonicAnalysis {
  // Anchor the window just before the loudest sample so we capture real energy
  // rather than leading silence.
  let peakIdx = 0;
  let peakVal = 0;
  for (let i = 0; i < samples.length; i++) {
    const amp = Math.abs(samples[i]);
    if (amp > peakVal) {
      peakVal = amp;
      peakIdx = i;
    }
  }
  let start = Math.max(0, peakIdx - 8);
  if (start + WINDOW > samples.length) {
    start = Math.max(0, samples.length - WINDOW);
  }

  const win = new Float32Array(WINDOW);
  let max = 1e-9;
  for (let i = 0; i < WINDOW; i++) {
    const s = samples[start + i] ?? 0;
    win[i] = s;
    const amp = Math.abs(s);
    if (amp > max) max = amp;
  }
  for (let i = 0; i < WINDOW; i++) win[i] /= max; // normalize to [-1, 1]

  const a = new Array<number>(n + 1).fill(0);
  const b = new Array<number>(n + 1).fill(0);

  let dc = 0;
  for (let i = 0; i < WINDOW; i++) dc += win[i];
  const a0 = (2 / WINDOW) * dc;

  for (let k = 1; k <= n; k++) {
    let ak = 0;
    let bk = 0;
    const w = (2 * Math.PI * k) / WINDOW;
    for (let i = 0; i < WINDOW; i++) {
      ak += win[i] * Math.cos(w * i);
      bk += win[i] * Math.sin(w * i);
    }
    a[k] = (2 / WINDOW) * ak;
    b[k] = (2 / WINDOW) * bk;
  }

  const magnitudes = new Array<number>(n + 1).fill(0);
  let maxMag = 1e-9;
  for (let k = 1; k <= n; k++) {
    const m = Math.hypot(a[k], b[k]);
    magnitudes[k] = m;
    if (m > maxMag) maxMag = m;
  }
  for (let k = 1; k <= n; k++) magnitudes[k] /= maxMag;

  const target = new Array<number>(DRAW_POINTS);
  for (let p = 0; p < DRAW_POINTS; p++) {
    target[p] = win[Math.floor((p * WINDOW) / DRAW_POINTS)];
  }

  return { target, a0, a, b, magnitudes };
}

const analysisCache = new Map<string, HarmonicAnalysis>();
const analysisInFlight = new Map<string, Promise<HarmonicAnalysis>>();

export function harmonicAnalysisKey(
  voice: VoiceType,
  sampleUrl: string | undefined,
  maxHarmonics: number,
): string {
  return `${voice}:${sampleUrl ?? "synth"}:${maxHarmonics}`;
}

/** Params for offline full-kit mix render (matches store + master chain). */
export interface TrackMixRenderParams {
  readonly tracks: readonly TrackState[];
  readonly bpm: number;
  readonly resolution: number;
  readonly bars: number;
  readonly filterFrequency: number;
  readonly masterGain: number;
}

const MIX_TAIL_SEC = 0.65;

export function trackMixAnalysisKey(
  p: TrackMixRenderParams,
  maxHarmonics: number,
): string {
  return [
    "mix",
    kitSequenceSignature([...p.tracks]),
    p.bpm,
    p.resolution,
    p.bars,
    Math.round(p.filterFrequency),
    p.masterGain.toFixed(4),
    maxHarmonics,
  ].join(":");
}

const mixAnalysisCache = new Map<string, HarmonicAnalysis>();
const mixAnalysisInFlight = new Map<string, Promise<HarmonicAnalysis>>();

/**
 * Offline-render one loop of the current kit (all unmuted rows at their step
 * times) through the same filter→gain topology as the live {@link Sequencer}.
 */
export async function getTrackMixWaveform(
  p: TrackMixRenderParams,
): Promise<Float32Array> {
  const totalSteps = p.resolution * p.bars;
  if (totalSteps <= 0) {
    return new Float32Array(1);
  }

  const stepDur = (60 / p.bpm) * (4 / p.resolution);
  const loopDur = totalSteps * stepDur;
  const duration = loopDur + MIX_TAIL_SEC;

  const sampleUrls = [
    ...new Set(
      p.tracks
        .map((t) => t.sampleUrl)
        .filter((u): u is string => typeof u === "string" && u.length > 0),
    ),
  ];
  const urlToBuffer = new Map<string, Tone.ToneAudioBuffer>();
  await Promise.all(
    sampleUrls.map(async (url) => {
      const buf = await Tone.ToneAudioBuffer.fromUrl(url);
      urlToBuffer.set(url, buf);
    }),
  );

  const buffer = await Tone.Offline(() => {
    const gain = new Tone.Gain(p.masterGain).toDestination();
    const filter = new Tone.Filter(
      p.filterFrequency,
      "lowpass",
    ).connect(gain);

    const rows: { track: TrackState; inst: Instrument }[] = [];

    for (const t of p.tracks) {
      if (t.muted) continue;
      const inst =
        t.sampleUrl && urlToBuffer.has(t.sampleUrl)
          ? createSampleVoiceFromBuffer(urlToBuffer.get(t.sampleUrl)!, filter)
          : createVoice(t.voice, filter);
      rows.push({ track: t, inst });
    }

    for (let step = 0; step < totalSteps; step++) {
      const time = step * stepDur;
      for (const { track: t, inst } of rows) {
        if (!t.steps[step]) continue;
        inst.trigger(time, t.velocity);
      }
    }
  }, duration, 1);

  return buffer.getChannelData(0);
}

/**
 * Cached Fourier analysis of the full-kit offline mix for the current pattern.
 */
export function getOrAnalyzeTrackMixHarmonics(
  p: TrackMixRenderParams,
  maxHarmonics: number,
): Promise<HarmonicAnalysis> {
  const key = trackMixAnalysisKey(p, maxHarmonics);
  const cached = mixAnalysisCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = mixAnalysisInFlight.get(key);
  if (pending) return pending;

  const promise = getTrackMixWaveform(p)
    .then((samples) => {
      const analysis = analyzeHarmonics(samples, maxHarmonics);
      mixAnalysisCache.set(key, analysis);
      mixAnalysisInFlight.delete(key);
      return analysis;
    })
    .catch((err) => {
      mixAnalysisInFlight.delete(key);
      throw err;
    });
  mixAnalysisInFlight.set(key, promise);
  return promise;
}

/**
 * Returns cached Fourier analysis for a voice/sample pair, or computes it once
 * and caches (dedupes concurrent requests for the same key).
 */
export function getOrAnalyzeHarmonics(
  voice: VoiceType,
  sampleUrl: string | undefined,
  maxHarmonics: number,
): Promise<HarmonicAnalysis> {
  const key = harmonicAnalysisKey(voice, sampleUrl, maxHarmonics);
  const cached = analysisCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = analysisInFlight.get(key);
  if (pending) return pending;

  const promise = getVoiceWaveform(voice, sampleUrl)
    .then((samples) => {
      const analysis = analyzeHarmonics(samples, maxHarmonics);
      analysisCache.set(key, analysis);
      analysisInFlight.delete(key);
      return analysis;
    })
    .catch((err) => {
      analysisInFlight.delete(key);
      throw err;
    });
  analysisInFlight.set(key, promise);
  return promise;
}

/** Partial Fourier sum using the first `k` harmonics, sampled at `points`. */
export function reconstruct(
  analysis: HarmonicAnalysis,
  k: number,
  points = DRAW_POINTS,
): number[] {
  const out = new Array<number>(points);
  for (let p = 0; p < points; p++) {
    const i = (p * WINDOW) / points;
    let s = analysis.a0 / 2;
    for (let j = 1; j <= k; j++) {
      const w = (2 * Math.PI * j) / WINDOW;
      s += analysis.a[j] * Math.cos(w * i) + analysis.b[j] * Math.sin(w * i);
    }
    out[p] = s;
  }
  return out;
}
