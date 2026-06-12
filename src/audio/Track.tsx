"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useSequencer } from "./Sequencer";
import type { Instrument } from "./types";

interface TrackContextValue {
  /** Called by the child instrument to (un)register its trigger function. */
  setTrigger: (fn: Instrument["trigger"] | null) => void;
}

const TrackContext = createContext<TrackContextValue | null>(null);

export function useTrack(): TrackContextValue {
  const ctx = useContext(TrackContext);
  if (!ctx) throw new Error("useTrack must be used within a <Track>");
  return ctx;
}

export interface TrackProps {
  /** Display name (used by UI, not the engine). */
  name?: string;
  /** Stable id for UI/store callbacks (e.g. harmonic scope live hits). */
  trackId?: string;
  /** Called on the transport clock immediately before a hit fires on this track. */
  onStepHit?: (trackId: string) => void;
  /** Step indices (0-based) on which this track fires. */
  pattern: readonly number[];
  /** Per-hit velocity, 0–1. */
  velocity?: number;
  children?: ReactNode;
}

/**
 * `<Track>` binds a step pattern to a single instrument child. It registers one
 * callback with the `<Sequencer>`; on each step it checks pattern membership and
 * triggers its instrument at the exact transport time.
 */
export function Track({
  pattern,
  velocity = 1,
  trackId,
  onStepHit,
  children,
}: TrackProps) {
  const { registerTrack } = useSequencer();

  const triggerRef = useRef<Instrument["trigger"] | null>(null);

  useEffect(() => {
    const unregister = registerTrack((time, step) => {
      if (pattern.includes(step)) {
        if (trackId) onStepHit?.(trackId);
        triggerRef.current?.(time, velocity);
      }
    });
    return unregister;
  }, [registerTrack, pattern, trackId, onStepHit, velocity]);

  const setTrigger = useCallback((fn: Instrument["trigger"] | null) => {
    triggerRef.current = fn;
  }, []);

  const value = useMemo<TrackContextValue>(() => ({ setTrigger }), [setTrigger]);

  return <TrackContext.Provider value={value}>{children}</TrackContext.Provider>;
}
