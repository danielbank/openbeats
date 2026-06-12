"use client";

import { useBeatStore } from "@/store/beatStore";

/** BPM slider bound to the shared store. */
export function TempoControl() {
  const bpm = useBeatStore((s) => s.bpm);
  const setBpm = useBeatStore((s) => s.setBpm);

  return (
    <label className="flex items-center gap-3 text-sm text-neutral-300">
      <span className="w-10 tabular-nums">{bpm}</span>
      <span className="text-neutral-500">BPM</span>
      <input
        type="range"
        min={60}
        max={200}
        step={1}
        value={bpm}
        onChange={(e) => setBpm(Number(e.target.value))}
        className="w-48 accent-emerald-500"
      />
    </label>
  );
}
