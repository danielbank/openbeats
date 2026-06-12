"use client";

import { Volume2, VolumeX } from "lucide-react";

import { usePlayhead } from "@/audio";
import { MAX_BARS, MIN_BARS, totalSteps, useBeatStore } from "@/store/beatStore";
import { TrackLockButton } from "./TrackLockButton";

/**
 * Plain (non-generated) step-sequencer UI, fully bound to the shared store.
 * Clicking a cell dispatches `toggleStep`; the audio engine — driven by the same
 * store — changes what you hear on the next loop. This proves the bridge before
 * any LLM is involved (milestone 3 swaps this for OpenUI-generated controls).
 */
export function StepSequencer() {
  const currentStep = usePlayhead();
  const resolution = useBeatStore((s) => s.resolution);
  const bars = useBeatStore((s) => s.bars);
  const tracks = useBeatStore((s) => s.tracks);
  const selectedTrackId = useBeatStore((s) => s.selectedTrackId);
  const toggleStep = useBeatStore((s) => s.toggleStep);
  const toggleMute = useBeatStore((s) => s.toggleMute);
  const setSelectedTrackId = useBeatStore((s) => s.setSelectedTrackId);
  const setVelocity = useBeatStore((s) => s.setVelocity);
  const clearTrack = useBeatStore((s) => s.clearTrack);
  const setBars = useBeatStore((s) => s.setBars);
  const toggleTrackLock = useBeatStore((s) => s.toggleTrackLock);

  const stepCount = totalSteps({ resolution, bars });
  const stepsPerQuarter =
    resolution > 0 && resolution % 4 === 0 ? resolution / 4 : null;
  const gapClass =
    stepCount > 48 ? "gap-px" : stepCount > 24 ? "gap-0.5" : "gap-1";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 pl-2 text-xs text-neutral-400">
        <span className="font-medium text-neutral-500">Bars</span>
        <div className="flex gap-1">
          {Array.from({ length: MAX_BARS - MIN_BARS + 1 }, (_, i) => MIN_BARS + i).map(
            (n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBars(n)}
                className={`min-w-8 rounded-md border px-2 py-1 font-mono tabular-nums transition-colors ${
                  n === bars
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                    : "border-neutral-700 bg-neutral-900/60 text-neutral-300 hover:border-neutral-500"
                }`}
                aria-pressed={n === bars}
              >
                {n}
              </button>
            ),
          )}
        </div>
        <span className="text-neutral-600">
          {stepCount} steps ({resolution}×{bars})
        </span>
      </div>
      {tracks.map((track) => {
        const selected = track.id === selectedTrackId;
        return (
          <div
            key={track.id}
            className={`grid min-w-0 grid-cols-[2rem_2rem_4rem_minmax(0,1fr)] items-center gap-2 rounded-lg py-0.5 pl-2 transition-colors sm:grid-cols-[2rem_2rem_4rem_minmax(0,1fr)_auto] sm:gap-3 ${
              selected
                ? "border-l-4 border-emerald-500 bg-emerald-950/20"
                : track.locked
                  ? "border-l-4 border-amber-600/80 bg-amber-950/15"
                  : "border-l-4 border-transparent"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleMute(track.id)}
              aria-pressed={track.muted}
              aria-label={track.muted ? "Unmute" : "Mute"}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
                track.muted
                  ? "border-rose-700 bg-rose-950/50 text-rose-300 hover:border-rose-500"
                  : "border-neutral-600 bg-neutral-800/80 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              }`}
              title={track.muted ? "Unmute" : "Mute"}
            >
              {track.muted ? (
                <VolumeX className="h-4 w-4" aria-hidden />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden />
              )}
            </button>
            <TrackLockButton
              locked={track.locked}
              onToggle={() => toggleTrackLock(track.id)}
            />
            <button
              type="button"
              onClick={() => setSelectedTrackId(track.id)}
              className={`min-w-0 truncate rounded-md py-1 text-right text-sm font-medium transition-colors ${
                track.muted
                  ? "text-neutral-600 line-through"
                  : "text-neutral-200 hover:text-white"
              }`}
              title="Select row for harmonic scope"
            >
              {track.name}
            </button>

            <div className="min-w-0 w-full">
              <div
                className={`grid w-full min-w-0 ${gapClass}`}
                style={{
                  gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: stepCount }, (_, step) => {
                  const on = track.steps[step] ?? false;
                  const active = step === currentStep;
                  const beat =
                    stepsPerQuarter !== null ? step % stepsPerQuarter === 0 : false;
                  const barBoundary = step > 0 && step % resolution === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => {
                        setSelectedTrackId(track.id);
                        toggleStep(track.id, step);
                      }}
                      aria-pressed={on}
                      aria-label={`${track.name} step ${step + 1}`}
                      title={`${track.name} · step ${step + 1}`}
                      className={`aspect-square w-full min-h-0 min-w-0 rounded-sm border transition-colors sm:rounded-md ${
                        barBoundary ? "border-l-2 border-l-neutral-500" : ""
                      } ${
                        on
                          ? track.muted
                            ? "border-neutral-600 bg-neutral-600/60"
                            : "border-emerald-400 bg-emerald-500/80 hover:bg-emerald-400"
                          : `${beat ? "border-neutral-600" : "border-neutral-700"} bg-neutral-800/40 hover:bg-neutral-700/60`
                      } ${active ? "z-[1] ring-1 ring-amber-300 ring-offset-1 ring-offset-neutral-950 sm:ring-2" : ""}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="col-span-4 flex items-center justify-end gap-3 sm:col-span-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={track.velocity}
                onChange={(e) => setVelocity(track.id, Number(e.target.value))}
                className="w-20 accent-emerald-500"
                title={`Velocity ${Math.round(track.velocity * 100)}%`}
              />
              <button
                type="button"
                onClick={() => clearTrack(track.id)}
                className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200"
                title="Clear row"
              >
                clear
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
