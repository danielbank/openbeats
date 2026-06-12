"use client";

import { useEffect } from "react";
import { useSequencer } from "./Sequencer";
import { useTrack } from "./Track";
import { createSampleVoice } from "./voices";

export interface SamplerProps {
  /** URL of the audio sample to load and trigger. */
  url: string;
}

/**
 * `<Sampler>` loads an audio sample and hands its trigger to the parent
 * `<Track>` — the sample-based counterpart to `<Synth>`. Renders no DOM.
 */
export function Sampler({ url }: SamplerProps) {
  const { setTrigger } = useTrack();
  const { destination } = useSequencer();

  useEffect(() => {
    if (!destination) return;
    const voice = createSampleVoice(url, destination);
    setTrigger(voice.trigger);
    return () => {
      setTrigger(null);
      voice.dispose();
    };
  }, [url, destination, setTrigger]);

  return null;
}
