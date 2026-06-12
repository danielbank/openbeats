// Shared types for the declarative audio engine.
// Public APIs here are fully typed — no `any`.

/** Built-in synthesized drum voices. */
export type VoiceType =
  | "kick"
  | "snare"
  | "hat"
  | "openhat"
  | "clap"
  | "tom";

/**
 * A playable instrument. Implementations wrap one or more Tone.js nodes and
 * expose a sample-accurate `trigger` plus a `dispose` for cleanup.
 *
 * `time` is a Tone.js transport time (seconds in the AudioContext clock) and
 * MUST be forwarded to the underlying `triggerAttackRelease` call so hits land
 * on the beat rather than whenever the JS callback happens to run.
 */
export interface Instrument {
  trigger(time: number, velocity?: number): void;
  dispose(): void;
}

/** A per-step callback registered by a `<Track>` with its parent `<Sequencer>`. */
export type StepCallback = (time: number, step: number) => void;
