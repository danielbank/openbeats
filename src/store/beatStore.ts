import { create } from "zustand";
import type { VoiceType } from "@/audio";

/**
 * The single shared store that bridges the two layers. The audio engine reads
 * pattern/tempo/params from here (via the page binding) and the controls — plain
 * React in milestone 2, OpenUI-generated in milestone 3 — write to it. Neither
 * layer imports the other; they only meet at this store.
 */
export interface TrackState {
  id: string;
  name: string;
  voice: VoiceType;
  /** When set, the track plays this audio sample instead of the synth `voice`. */
  sampleUrl?: string;
  /** One boolean per step; length === totalSteps (resolution × bars). */
  steps: boolean[];
  muted: boolean;
  /** Per-hit velocity, 0–1. */
  velocity: number;
  /** When true, row survives the next generative BeatPattern apply (merged with new rows). */
  locked?: boolean;
}

export interface BeatState {
  bpm: number;
  /** Steps per bar. */
  resolution: number;
  bars: number;
  tracks: TrackState[];
  /** Master low-pass filter cutoff in Hz (20000 ≈ fully open). */
  filterFreq: number;
  /** Master output gain, 0–1. */
  masterVolume: number;
  /** Row selected in the step grid. */
  selectedTrackId: string | null;
  /** Track that last fired on the sequencer clock (playhead / row highlight). */
  activeHitTrackId: string | null;

  // --- actions ---
  setBpm: (bpm: number) => void;
  toggleStep: (trackId: string, step: number) => void;
  toggleMute: (trackId: string) => void;
  setVelocity: (trackId: string, velocity: number) => void;
  clearTrack: (trackId: string) => void;
  /** Clear every track's step pattern (mutes and velocities unchanged). */
  clearAllTracks: () => void;
  setFilterFreq: (hz: number) => void;
  setMasterVolume: (v: number) => void;
  setSelectedTrackId: (id: string) => void;
  setActiveHitTrackId: (id: string | null) => void;
  /** Toggle per-row lock: locked rows are kept when merging a new BeatPattern. */
  toggleTrackLock: (trackId: string) => void;
  /** Replace the whole pattern set (used by presets / generated controls). */
  setTracks: (tracks: TrackState[]) => void;
  /** Apply a preset: swap the tracks and tempo together. */
  applyPreset: (tracks: TrackState[], bpm: number) => void;
  /** Number of bars in the pattern (1–4). Resizes every track's `steps` to resolution × bars. */
  setBars: (bars: number) => void;
}

/** Fingerprint of the full kit pattern (steps, velocity, mute per row) for UI that should follow edits. */
export function kitSequenceSignature(tracks: TrackState[]): string {
  return tracks
    .map(
      (t) =>
        `${t.id}:${t.steps.map((on) => (on ? "1" : "0")).join("")}:${t.velocity}:${t.muted ? "1" : "0"}`,
    )
    .join("|");
}

function reconcileSelection(
  prevSelected: string | null,
  newTracks: TrackState[],
): string | null {
  const ids = new Set(newTracks.map((t) => t.id));
  if (prevSelected !== null && ids.has(prevSelected)) return prevSelected;
  return newTracks[0]?.id ?? null;
}

/** Total steps in the grid for the current resolution/bars. */
export const totalSteps = (s: Pick<BeatState, "resolution" | "bars">): number =>
  s.resolution * s.bars;

export const MIN_BARS = 1;
export const MAX_BARS = 4;

const emptySteps = (n: number): boolean[] => Array.from({ length: n }, () => false);

const stepsFrom = (n: number, on: readonly number[]): boolean[] =>
  Array.from({ length: n }, (_, i) => on.includes(i));

/** Pad or trim a step row to match the current grid length. */
export function reconcileStepsToLength(steps: boolean[], targetLen: number): boolean[] {
  if (steps.length === targetLen) return steps;
  if (steps.length > targetLen) return steps.slice(0, targetLen);
  return [...steps, ...emptySteps(targetLen - steps.length)];
}

export function reconcileTracksStepLengths(
  tracks: TrackState[],
  targetLen: number,
): TrackState[] {
  return tracks.map((t) => ({
    ...t,
    steps: reconcileStepsToLength(t.steps, targetLen),
  }));
}

/**
 * Merge a new generated kit with previously locked rows. Kept rows stay first,
 * unchanged; incoming rows get unique ids vs kept ids and `locked: false`.
 */
export function mergeBeatPatternTracks(
  prev: TrackState[],
  incoming: TrackState[],
): TrackState[] {
  const kept = prev.filter((t) => t.locked === true);
  const usedIds = new Set(kept.map((t) => t.id));
  const reassigned = incoming.map((t) => {
    let candidate = t.id;
    let n = 0;
    while (usedIds.has(candidate)) {
      n += 1;
      candidate = `${t.voice}-x${n}`;
    }
    usedIds.add(candidate);
    return { ...t, id: candidate, locked: false };
  });
  return [...kept, ...reassigned];
}

const N = 16;

const DEFAULT_TRACKS: TrackState[] = [
  { id: "kick", name: "Kick", voice: "kick", muted: false, velocity: 1, steps: stepsFrom(N, [0, 4, 8, 12]) },
  { id: "snare", name: "Snare", voice: "snare", muted: false, velocity: 0.9, steps: stepsFrom(N, [4, 12]) },
  { id: "hat", name: "Hat", voice: "hat", muted: false, velocity: 0.7, steps: stepsFrom(N, [0, 2, 4, 6, 8, 10, 12, 14]) },
];

export const useBeatStore = create<BeatState>((set) => ({
  bpm: 120,
  resolution: 16,
  bars: 1,
  tracks: DEFAULT_TRACKS,
  filterFreq: 20000,
  masterVolume: 0.9,
  selectedTrackId: DEFAULT_TRACKS[0]?.id ?? null,
  activeHitTrackId: null,

  setBpm: (bpm) => set({ bpm: Math.round(bpm) }),

  setFilterFreq: (hz) =>
    set({ filterFreq: Math.min(20000, Math.max(60, Math.round(hz))) }),

  setMasterVolume: (v) => set({ masterVolume: Math.min(1, Math.max(0, v)) }),

  toggleStep: (trackId, step) =>
    set((state) => {
      const len = totalSteps(state);
      if (step < 0 || step >= len) return {};
      return {
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, steps: t.steps.map((on, i) => (i === step ? !on : on)) }
            : t,
        ),
      };
    }),

  toggleMute: (trackId) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t,
      ),
    })),

  setVelocity: (trackId, velocity) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, velocity: Math.min(1, Math.max(0, velocity)) }
          : t,
      ),
    })),

  clearTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, steps: emptySteps(t.steps.length) } : t,
      ),
    })),

  clearAllTracks: () =>
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        steps: emptySteps(t.steps.length),
      })),
    })),

  setSelectedTrackId: (id) => set({ selectedTrackId: id }),

  setActiveHitTrackId: (id) => set({ activeHitTrackId: id }),

  toggleTrackLock: (trackId) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t,
      ),
    })),

  setTracks: (tracks) =>
    set((state) => {
      const len = totalSteps(state);
      const next = reconcileTracksStepLengths(tracks, len);
      return {
        tracks: next,
        selectedTrackId: reconcileSelection(state.selectedTrackId, next),
        activeHitTrackId: null,
      };
    }),

  applyPreset: (tracks, bpm) =>
    set((state) => {
      const len = totalSteps(state);
      // Full scene change: strip row locks from the preset payload.
      const next = reconcileTracksStepLengths(
        tracks.map((t) => ({ ...t, locked: false })),
        len,
      );
      return {
        tracks: next,
        bpm: Math.round(bpm),
        selectedTrackId: reconcileSelection(state.selectedTrackId, next),
        activeHitTrackId: null,
      };
    }),

  setBars: (bars) =>
    set((state) => {
      const b = Math.min(MAX_BARS, Math.max(MIN_BARS, Math.round(bars)));
      if (b === state.bars) return {};
      const len = state.resolution * b;
      return {
        bars: b,
        tracks: reconcileTracksStepLengths(state.tracks, len),
        activeHitTrackId: null,
      };
    }),
}));

/** Reset pattern/tempo/UI state to built-in defaults (for tests and dev resets). */
export function resetBeatStore() {
  useBeatStore.setState({
    bpm: 120,
    resolution: 16,
    bars: 1,
    tracks: DEFAULT_TRACKS.map((t) => ({
      ...t,
      steps: [...t.steps],
      locked: false,
    })),
    filterFreq: 20000,
    masterVolume: 0.9,
    selectedTrackId: DEFAULT_TRACKS[0]?.id ?? null,
    activeHitTrackId: null,
  });
}
