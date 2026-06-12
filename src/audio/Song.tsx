"use client";

import * as Tone from "tone";
import { useBeatStore } from "@/store/beatStore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SongContextValue {
  /** Has the AudioContext been unlocked by a user gesture yet? */
  isReady: boolean;
  /** Is the transport currently running? */
  isPlaying: boolean;
  /** Start playback. Unlocks the AudioContext on first call (must be from a user gesture). */
  start: () => Promise<void>;
  /** Stop playback and rewind the transport to the start. */
  stop: () => void;
  /** Convenience start/stop toggle. */
  toggle: () => Promise<void>;
}

const SongContext = createContext<SongContextValue | null>(null);

/**
 * `useSong` exposes transport controls to any descendant (e.g. a TransportBar).
 * Throws if used outside a `<Song>` so misuse fails loudly instead of silently.
 */
export function useSong(): SongContextValue {
  const ctx = useContext(SongContext);
  if (!ctx) throw new Error("useSong must be used within a <Song>");
  return ctx;
}

export interface SongProps {
  /** Beats per minute. Updated live on the transport when it changes. */
  tempo?: number;
  children?: ReactNode;
}

/**
 * `<Song>` owns the single global Tone.Transport: tempo, start/stop, and the
 * one-time AudioContext unlock required by browser autoplay policy. It renders
 * its children (sequencers/tracks) but no DOM of its own.
 */
export function Song({ tempo = 120, children }: SongProps) {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Keep transport BPM in sync with the tempo prop.
  useEffect(() => {
    Tone.getTransport().bpm.value = tempo;
  }, [tempo]);

  const start = useCallback(async () => {
    // Tone.start() resumes the AudioContext and MUST be invoked from within a
    // user gesture, otherwise the browser blocks it ("AudioContext was not
    // allowed to start"). We await it before touching the transport.
    await Tone.start();
    setIsReady(true);
    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      transport.start();
      setIsPlaying(true);
    }
  }, []);

  const stop = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    setIsPlaying(false);
    useBeatStore.getState().setActiveHitTrackId(null);
  }, []);

  const toggle = useCallback(async () => {
    if (isPlaying) stop();
    else await start();
  }, [isPlaying, start, stop]);

  // Stop the transport when the <Song> unmounts so dev hot-reloads don't leave
  // a runaway clock behind.
  useEffect(() => stop, [stop]);

  const value = useMemo<SongContextValue>(
    () => ({ isReady, isPlaying, start, stop, toggle }),
    [isReady, isPlaying, start, stop, toggle],
  );

  return <SongContext.Provider value={value}>{children}</SongContext.Provider>;
}
