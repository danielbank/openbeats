"use client";

import * as Tone from "tone";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { StepCallback } from "./types";

interface SequencerContextValue {
  /** Total number of steps in the pattern (resolution × bars). */
  totalSteps: number;
  /**
   * Master node every voice connects to (lets later milestones insert FX).
   * `null` until the AudioContext-backed node is created in a client effect —
   * instruments wait for it before wiring up.
   */
  destination: Tone.InputNode | null;
  /** Register a per-step callback; returns an unregister function. */
  registerTrack: (cb: StepCallback) => () => void;
}

// The playhead lives in its OWN context. It changes every step, so keeping it
// separate means updating it does NOT recreate the sequencer value above — which
// would otherwise re-run every <Track>'s subscription effect on every step.
const SequencerContext = createContext<SequencerContextValue | null>(null);
const PlayheadContext = createContext<number>(-1);

function createDestinationStore() {
  let destination: Tone.Filter | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => destination,
    getServerSnapshot: () => null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next: Tone.Filter | null) => {
      destination = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export function useSequencer(): SequencerContextValue {
  const ctx = useContext(SequencerContext);
  if (!ctx) throw new Error("useSequencer must be used within a <Sequencer>");
  return ctx;
}

/** The step currently playing, or -1 when stopped. For UI highlighting. */
export function usePlayhead(): number {
  return useContext(PlayheadContext);
}

export interface SequencerProps {
  /** Steps per bar (e.g. 16 → sixteenth-note grid). */
  resolution?: number;
  /** Number of bars the pattern spans. */
  bars?: number;
  /** Master low-pass cutoff in Hz. */
  filterFrequency?: number;
  /** Master output gain, 0–1. */
  masterGain?: number;
  children?: ReactNode;
}

/**
 * `<Sequencer>` provides the timing grid. It drives a single `Tone.Sequence`
 * that fires once per step on the transport clock and fans the `(time, step)`
 * out to every registered `<Track>`. It also publishes the playhead (scheduled
 * on Tone's draw clock) so the UI can highlight it without affecting audio.
 */
export function Sequencer({
  resolution = 16,
  bars = 1,
  filterFrequency = 20000,
  masterGain = 0.9,
  children,
}: SequencerProps) {
  const totalSteps = resolution * bars;
  const [currentStep, setCurrentStep] = useState(-1);
  // Created client-side in an effect (Tone nodes can't be built during SSR).
  // Voices connect to the filter; chain is: voices → filter → gain → speakers.
  const destinationStore = useMemo(() => createDestinationStore(), []);
  const destination = useSyncExternalStore(
    destinationStore.subscribe,
    destinationStore.getSnapshot,
    destinationStore.getServerSnapshot,
  );
  const filterRef = useRef<Tone.Filter | null>(null);
  const gainRef = useRef<Tone.Gain | null>(null);

  // Live registry of track callbacks, held in a ref so the long-lived Sequence
  // callback always sees the current set without being re-created.
  const tracksRef = useRef<Set<StepCallback>>(new Set());

  const subdivision = `${resolution}n` as Tone.Unit.Time;

  // Stable across renders so each <Track> subscribes exactly once.
  const registerTrack = useCallback((cb: StepCallback) => {
    tracksRef.current.add(cb);
    return () => {
      tracksRef.current.delete(cb);
    };
  }, []);

  // Master chain (filter → gain → speakers) — created on the client only.
  useEffect(() => {
    const gain = new Tone.Gain(masterGain).toDestination();
    const filter = new Tone.Filter(filterFrequency, "lowpass").connect(gain);
    gainRef.current = gain;
    filterRef.current = filter;
    destinationStore.set(filter);
    return () => {
      destinationStore.set(null);
      filter.dispose();
      gain.dispose();
      filterRef.current = null;
      gainRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params are applied via the ramp effects below
  }, [destinationStore]);

  // Apply live param changes with a short ramp to avoid zipper noise.
  useEffect(() => {
    filterRef.current?.frequency.rampTo(filterFrequency, 0.05);
  }, [filterFrequency]);

  useEffect(() => {
    gainRef.current?.gain.rampTo(masterGain, 0.05);
  }, [masterGain]);

  useEffect(() => {
    const steps = Array.from({ length: totalSteps }, (_, i) => i);
    const seq = new Tone.Sequence(
      (time, step) => {
        tracksRef.current.forEach((cb) => cb(time, step));
        // Schedule the visual update on Tone's draw clock so it lines up with
        // what's heard, and never blocks the audio thread.
        Tone.getDraw().schedule(() => setCurrentStep(step), time);
      },
      steps,
      subdivision,
    );
    seq.start(0);

    return () => {
      seq.dispose();
      setCurrentStep(-1);
    };
  }, [totalSteps, subdivision]);

  const value = useMemo<SequencerContextValue>(
    () => ({ totalSteps, destination, registerTrack }),
    [totalSteps, destination, registerTrack],
  );

  return (
    <SequencerContext.Provider value={value}>
      <PlayheadContext.Provider value={currentStep}>
        {children}
      </PlayheadContext.Provider>
    </SequencerContext.Provider>
  );
}
