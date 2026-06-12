"use client";

import type { ReactNode } from "react";
import { Sampler, Sequencer, Song, Synth, Track } from "@/audio";
import { useBeatStore } from "@/store/beatStore";

/**
 * Binding layer: subscribes to the shared store and feeds its values into the
 * pure audio-engine components as props. The engine never imports the store;
 * this component is the only place the two meet on the audio side.
 *
 * `children` render inside the `<Sequencer>` so UI can read transport state
 * (`useSong`) and the playhead (`useSequencer`).
 */
export function AudioEngine({ children }: { children?: ReactNode }) {
  const bpm = useBeatStore((s) => s.bpm);
  const resolution = useBeatStore((s) => s.resolution);
  const bars = useBeatStore((s) => s.bars);
  const tracks = useBeatStore((s) => s.tracks);
  const filterFreq = useBeatStore((s) => s.filterFreq);
  const masterVolume = useBeatStore((s) => s.masterVolume);
  const setActiveHitTrackId = useBeatStore((s) => s.setActiveHitTrackId);

  return (
    <Song tempo={bpm}>
      <Sequencer
        resolution={resolution}
        bars={bars}
        filterFrequency={filterFreq}
        masterGain={masterVolume}
      >
        {tracks.map((t) => {
          // Muted tracks keep their voice mounted but fire on no steps.
          const pattern = t.muted
            ? []
            : t.steps.flatMap((on, i) => (on ? [i] : []));
          return (
            <Track
              key={t.id}
              name={t.name}
              trackId={t.id}
              onStepHit={setActiveHitTrackId}
              pattern={pattern}
              velocity={t.velocity}
            >
              {t.sampleUrl ? (
                <Sampler url={t.sampleUrl} />
              ) : (
                <Synth type={t.voice} />
              )}
            </Track>
          );
        })}
        {children}
      </Sequencer>
    </Song>
  );
}
