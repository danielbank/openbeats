"use client";

import { useEffect } from "react";
import { useSequencer } from "./Sequencer";
import { useTrack } from "./Track";
import { createVoice } from "./voices";
import type { VoiceType } from "./types";

export interface SynthProps {
  /** Which built-in drum voice to synthesize. */
  type: VoiceType;
}

/**
 * `<Synth>` creates a synthesized drum voice and hands its trigger to the
 * parent `<Track>`. Renders no DOM. The voice is created/disposed in an effect
 * so React StrictMode double-mounts and hot reloads clean up correctly.
 */
export function Synth({ type }: SynthProps) {
  const { setTrigger } = useTrack();
  const { destination } = useSequencer();

  useEffect(() => {
    // Wait for the Sequencer's master node, which is created in a client effect.
    if (!destination) return;
    const voice = createVoice(type, destination);
    setTrigger(voice.trigger);
    return () => {
      setTrigger(null);
      voice.dispose();
    };
  }, [type, destination, setTrigger]);

  return null;
}
