import * as Tone from "tone";
import type { Instrument, VoiceType } from "./types";

/**
 * Wraps a raw trigger so it never violates Tone's "start time must be strictly
 * greater than previous start time" rule. The built-in drum synths are
 * monophonic sources; if they're retriggered at an equal/earlier transport time
 * — at a stop→replay boundary, or when React StrictMode double-fires in dev —
 * Tone throws. A duplicate hit at the same instant is inaudible, so we drop it.
 */
function guarded(
  fire: (time: number, velocity: number) => void,
): Instrument["trigger"] {
  let last = -Infinity;
  return (time, velocity = 1) => {
    if (time <= last) return;
    last = time;
    try {
      fire(time, velocity);
    } catch {
      // A tempo change or stop/replay can still hand a monophonic Tone source a
      // start time it rejects. A dropped hit is preferable to throwing out of
      // the Sequence callback and crashing the audio graph / React tree.
    }
  };
}

/**
 * Factory for the built-in synthesized drum voices. Each voice is a small
 * Tone.js synth wired to `destination` and exposed through the {@link Instrument}
 * interface so the declarative components never touch Tone directly.
 */
export function createVoice(
  type: VoiceType,
  destination: Tone.InputNode,
): Instrument {
  // Bind every node to the destination's context explicitly. Offline rendering
  // (e.g. the HarmonicScope) temporarily swaps Tone's *global* context, so a
  // node that relied on the global default could otherwise be created in the
  // wrong context and fail to connect to the live master.
  const context = (destination as Tone.ToneAudioNode).context;
  switch (type) {
    case "kick": {
      const synth = new Tone.MembraneSynth({
        context,
        octaves: 4,
        pitchDecay: 0.05,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.2 },
      }).connect(destination);
      return {
        trigger: guarded((time, velocity) =>
          synth.triggerAttackRelease("C1", "8n", time, velocity),
        ),
        dispose: () => synth.dispose(),
      };
    }
    case "snare": {
      const noise = new Tone.NoiseSynth({
        context,
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
      }).connect(destination);
      return {
        trigger: guarded((time, velocity) =>
          noise.triggerAttackRelease("8n", time, velocity),
        ),
        dispose: () => noise.dispose(),
      };
    }
    case "hat": {
      const metal = new Tone.MetalSynth({
        context,
        envelope: { attack: 0.001, decay: 0.08, release: 0.01 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      }).connect(destination);
      metal.volume.value = -12;
      return {
        // MetalSynth extends Monophonic: triggerAttackRelease(note, duration, …).
        // The note sets the cymbal's base frequency; "32n" is the duration.
        trigger: guarded((time, velocity) =>
          metal.triggerAttackRelease(200, "32n", time, velocity),
        ),
        dispose: () => metal.dispose(),
      };
    }
    case "openhat": {
      const metal = new Tone.MetalSynth({
        context,
        envelope: { attack: 0.001, decay: 0.4, release: 0.1 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      }).connect(destination);
      metal.volume.value = -14;
      return {
        trigger: guarded((time, velocity) =>
          metal.triggerAttackRelease(200, "8n", time, velocity),
        ),
        dispose: () => metal.dispose(),
      };
    }
    case "clap": {
      const noise = new Tone.NoiseSynth({
        context,
        noise: { type: "pink" },
        envelope: { attack: 0.002, decay: 0.15, sustain: 0 },
      }).connect(destination);
      return {
        trigger: guarded((time, velocity) =>
          noise.triggerAttackRelease("16n", time, velocity),
        ),
        dispose: () => noise.dispose(),
      };
    }
    case "tom": {
      const synth = new Tone.MembraneSynth({
        context,
        octaves: 3,
        pitchDecay: 0.08,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.6 },
      }).connect(destination);
      return {
        trigger: guarded((time, velocity) =>
          synth.triggerAttackRelease("G2", "8n", time, velocity),
        ),
        dispose: () => synth.dispose(),
      };
    }
  }
}

/**
 * A sample-based voice backed by a one-shot {@link Tone.Player}. The buffer
 * loads asynchronously; triggers before it's ready are no-ops (not errors).
 */
export function createSampleVoice(
  url: string,
  destination: Tone.InputNode,
): Instrument {
  const context = (destination as Tone.ToneAudioNode).context;
  const player = new Tone.Player({ url, fadeOut: 0.01, context }).connect(
    destination,
  );
  return {
    trigger: guarded((time, velocity) => {
      if (!player.loaded) return;
      player.volume.value = Tone.gainToDb(velocity);
      player.start(time);
    }),
    dispose: () => player.dispose(),
  };
}

/**
 * Sample voice from an already-loaded buffer (e.g. offline mix render where URLs
 * are pre-fetched). Same gain/velocity behavior as {@link createSampleVoice}.
 */
export function createSampleVoiceFromBuffer(
  audioBuffer: Tone.ToneAudioBuffer,
  destination: Tone.InputNode,
): Instrument {
  const context = (destination as Tone.ToneAudioNode).context;
  const player = new Tone.Player({
    url: audioBuffer,
    fadeOut: 0.01,
    context,
  }).connect(destination);
  return {
    trigger: guarded((time, velocity) => {
      if (!player.loaded) return;
      player.volume.value = Tone.gainToDb(velocity);
      player.start(time);
    }),
    dispose: () => player.dispose(),
  };
}
