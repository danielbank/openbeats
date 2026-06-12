"use client";

import { Lock, Unlock } from "lucide-react";

type TrackLockButtonProps = {
  locked: boolean | undefined;
  onToggle: () => void;
  compact?: boolean;
};

/**
 * Shared “keep row on regenerate” toggle — same semantics in the global strip and
 * the step grid.
 */
export function TrackLockButton({ locked, onToggle, compact }: TrackLockButtonProps) {
  const isOn = locked === true;
  const title = isOn
    ? "Unlock row — it will be replaced on the next generated pattern"
    : "Lock row — keep this pattern when generating a new BeatPattern";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isOn}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border transition-colors ${
        compact ? "h-7 min-w-7 px-1.5" : "h-8 w-8"
      } ${
        isOn
          ? "border-amber-500 bg-amber-950/50 text-amber-200 hover:border-amber-400"
          : "border-neutral-600 bg-neutral-800/80 text-neutral-500 hover:border-neutral-500 hover:text-neutral-200"
      }`}
      title={title}
    >
      {isOn ? <Lock className="h-4 w-4" aria-hidden /> : <Unlock className="h-4 w-4" aria-hidden />}
    </button>
  );
}
