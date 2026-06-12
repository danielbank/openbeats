"use client";

import { useBeatStore } from "@/store/beatStore";
import { TrackLockButton } from "./TrackLockButton";

/**
 * Always-mounted chrome: per-row “keep on regenerate” toggles wired to the same
 * store as {@link StepSequencer}, so locks work before/without a streamed StepGrid.
 */
export function TrackLockStrip() {
  const tracks = useBeatStore((s) => s.tracks);
  const toggleTrackLock = useBeatStore((s) => s.toggleTrackLock);

  return (
    <section
      className="sticky top-0 z-10 -mx-1 rounded-xl border border-neutral-800 bg-neutral-950/90 px-3 py-2.5 shadow-lg shadow-black/20 backdrop-blur-md sm:mx-0"
      aria-label="Track keep locks for regeneration"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-300">
          Keep on regenerate
        </h2>
        <p className="max-w-56 text-[10px] leading-snug text-neutral-500 sm:max-w-none">
          Locked rows stay when you run Generate; unlocked rows come from the new pattern.
        </p>
      </div>
      {tracks.length === 0 ? (
        <p className="text-xs text-neutral-500">No tracks yet — generate a layout or load the demo.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tracks.map((track, index) => (
            <li
              key={track.id}
              className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 ${
                track.locked
                  ? "border-amber-700/60 bg-amber-950/25"
                  : "border-neutral-700 bg-neutral-900/60"
              }`}
            >
              <span className="truncate text-[10px] font-mono tabular-nums text-neutral-500">
                {index}
              </span>
              <span className="max-w-28 truncate text-xs font-medium text-neutral-200">
                {track.name}
              </span>
              <TrackLockButton
                locked={track.locked}
                onToggle={() => toggleTrackLock(track.id)}
                compact
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
