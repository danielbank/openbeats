"use client";

import { useSong } from "@/audio";

/**
 * Start/Stop button wired to the `<Song>` transport. The click is the user
 * gesture that unlocks the AudioContext (via `Tone.start()` inside `start()`),
 * satisfying the browser autoplay policy.
 */
export function TransportBar() {
  const { isPlaying, isReady, toggle } = useSong();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void toggle()}
        className={`flex h-12 w-32 items-center justify-center rounded-full text-base font-semibold transition-colors ${
          isPlaying
            ? "bg-rose-500 text-white hover:bg-rose-400"
            : "bg-emerald-500 text-white hover:bg-emerald-400"
        }`}
      >
        {isPlaying ? "■ Stop" : "▶ Play"}
      </button>
      <span className="text-sm text-neutral-400">
        {isReady ? "audio ready" : "click play to start audio"}
      </span>
    </div>
  );
}
