"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrackState } from "@/store/beatStore";
import {
  getOrAnalyzeTrackMixHarmonics,
  reconstruct,
  trackMixAnalysisKey,
  type HarmonicAnalysis,
} from "@/audio/harmonics";

/** Avoid re-running offline analysis on every pointermove while dragging dials. */
const DIAL_DEBOUNCE_MS = 280;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export interface HarmonicScopeProps {
  tracks: readonly TrackState[];
  bpm: number;
  resolution: number;
  bars: number;
  filterFreq: number;
  masterVolume: number;
  /** Highest harmonic to sum. */
  maxHarmonics: number;
  /** Heading label; falls back to a default mix title. */
  title?: string;
}

const STEP_MS = 350; // how often a harmonic is added during auto-animation

// Time-domain panel geometry.
const TW = 480;
const TH = 150;
const PAD = 10;
const AMP = (TH / 2 - PAD) / 1.2;

// Spectrum panel geometry.
const SW = 480;
const SH = 90;

interface SweepState {
  key: string;
  k: number;
  auto: boolean;
}

function polyline(values: number[]): string {
  const len = values.length;
  return values
    .map((v, i) => {
      const x = PAD + (i / (len - 1)) * (TW - 2 * PAD);
      const y = TH / 2 - v * AMP;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Fourier-synthesis scope for the full kit: offline-renders one pattern loop
 * (all unmuted tracks), then shows that mix waveform rebuilt from harmonics
 * plus magnitude bars. Does not use the live transport.
 */
export function HarmonicScope({
  tracks,
  bpm,
  resolution,
  bars,
  filterFreq,
  masterVolume,
  maxHarmonics,
  title,
}: HarmonicScopeProps) {
  const debouncedFilter = useDebounced(filterFreq, DIAL_DEBOUNCE_MS);
  const debouncedVolume = useDebounced(masterVolume, DIAL_DEBOUNCE_MS);

  const sourceKey = trackMixAnalysisKey(
    {
      tracks,
      bpm,
      resolution,
      bars,
      filterFrequency: debouncedFilter,
      masterGain: debouncedVolume,
    },
    maxHarmonics,
  );

  const [displayAnalysis, setDisplayAnalysis] = useState<HarmonicAnalysis | null>(
    null,
  );
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const sweepKey = readyKey ?? sourceKey;
  const [sweepState, setSweepState] = useState<SweepState>({
    key: sweepKey,
    k: 1,
    auto: true,
  });

  const currentSweep =
    sweepState.key === sweepKey ? sweepState : { key: sweepKey, k: 1, auto: true };
  const k = currentSweep.k;
  const auto = currentSweep.auto && k < maxHarmonics;

  useEffect(() => {
    if (sourceKey === readyKey && displayAnalysis !== null) {
      return;
    }

    let cancelled = false;

    const mixParams = {
      tracks,
      bpm,
      resolution,
      bars,
      filterFrequency: debouncedFilter,
      masterGain: debouncedVolume,
    };

    void (async () => {
      setFetchError(null);
      try {
        const next = await getOrAnalyzeTrackMixHarmonics(mixParams, maxHarmonics);
        if (cancelled) return;
        setDisplayAnalysis(next);
        setReadyKey(sourceKey);
        setFetchError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    sourceKey,
    maxHarmonics,
    tracks,
    bpm,
    resolution,
    bars,
    debouncedFilter,
    debouncedVolume,
    readyKey,
    displayAnalysis,
  ]);

  useEffect(() => {
    if (!readyKey) return;
    const id = requestAnimationFrame(() => {
      setSweepState({ key: readyKey, k: 1, auto: true });
    });
    return () => cancelAnimationFrame(id);
  }, [readyKey]);

  useEffect(() => {
    if (!auto || !displayAnalysis) return;
    const id = setInterval(() => {
      setSweepState((prev) => {
        const prevK = prev.key === sweepKey ? prev.k : 1;
        return {
          key: sweepKey,
          k: Math.min(prevK + 1, maxHarmonics),
          auto: true,
        };
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [auto, displayAnalysis, maxHarmonics, sweepKey]);

  const reconstruction = useMemo(
    () => (displayAnalysis ? reconstruct(displayAnalysis, k) : []),
    [displayAnalysis, k],
  );

  const isUpdating =
    displayAnalysis !== null &&
    readyKey !== null &&
    sourceKey !== readyKey &&
    !fetchError;

  const hasSynthRow = tracks.some((t) => !t.muted && !t.sampleUrl);
  const hasSampleRow = tracks.some((t) => !t.muted && t.sampleUrl);
  const sourceLabel =
    hasSynthRow && hasSampleRow ? "mix" : hasSampleRow ? "sample" : "synth";

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">
          {title ?? "Harmonic Scope — full mix"}
        </h3>
        <span className="text-[11px] text-neutral-500">
          Fourier synthesis · {sourceLabel}
        </span>
      </div>

      {fetchError ? (
        <p className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
          Couldn’t analyze full mix: {fetchError}
        </p>
      ) : null}

      <div
        className={`relative flex min-h-[268px] flex-col gap-2 ${displayAnalysis ? "" : "justify-center"}`}
      >
        {isUpdating ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end pt-1"
            aria-live="polite"
          >
            <span className="rounded bg-neutral-950/80 px-2 py-0.5 text-[10px] text-neutral-400">
              Updating…
            </span>
          </div>
        ) : null}

        {!displayAnalysis ? (
          <p className="py-8 text-center text-xs text-neutral-500">
            Analyzing full mix…
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${TW} ${TH}`}
              className={`w-full ${isUpdating ? "opacity-60" : ""}`}
            >
              <line
                x1={PAD}
                y1={TH / 2}
                x2={TW - PAD}
                y2={TH / 2}
                className="stroke-neutral-700"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <polyline
                points={polyline(displayAnalysis.target)}
                fill="none"
                className="stroke-neutral-600"
                strokeWidth="1.5"
              />
              <polyline
                points={polyline(reconstruction)}
                fill="none"
                className="stroke-emerald-400"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>

            <svg
              viewBox={`0 0 ${SW} ${SH}`}
              className={`w-full ${isUpdating ? "opacity-60" : ""}`}
            >
              {Array.from({ length: maxHarmonics }, (_, idx) => {
                const harmonic = idx + 1;
                const mag = displayAnalysis.magnitudes[harmonic] ?? 0;
                const barW = (SW - 2 * PAD) / maxHarmonics;
                const x = PAD + idx * barW;
                const h = mag * (SH - 2 * PAD);
                const lit = harmonic <= k;
                return (
                  <rect
                    key={harmonic}
                    x={x + barW * 0.15}
                    y={SH - PAD - h}
                    width={barW * 0.7}
                    height={Math.max(0, h)}
                    className={lit ? "fill-emerald-500" : "fill-neutral-700"}
                  />
                );
              })}
              <line
                x1={PAD}
                y1={SH - PAD}
                x2={SW - PAD}
                y2={SH - PAD}
                className="stroke-neutral-700"
                strokeWidth="1"
              />
            </svg>

            <div className="flex items-center gap-3">
              <span className="w-24 text-xs tabular-nums text-neutral-300">
                harmonics: {k} / {maxHarmonics}
              </span>
              <input
                type="range"
                min={1}
                max={maxHarmonics}
                step={1}
                value={k}
                onChange={(e) => {
                  setSweepState({
                    key: sweepKey,
                    k: Number(e.target.value),
                    auto: false,
                  });
                }}
                className="flex-1 accent-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  setSweepState({ key: sweepKey, k: 1, auto: true });
                }}
                className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-emerald-500 hover:text-white"
              >
                ↻ replay
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
