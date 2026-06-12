"use client";

import { AudioEngine } from "@/components/AudioEngine";
import { GenerativePanel } from "@/components/GenerativePanel";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900 p-8 text-neutral-100">
      <div className="flex flex-col items-center gap-2 pt-8">
        <h1 className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          OpenBeats
        </h1>
        <p className="max-w-md text-center text-sm text-neutral-400">
          Describe a control layout and groove — the model streams OpenUI Lang into live
          knobs and grids on top of the same declarative Tone.js engine as the built-in
          sequencer. Synths, sample kits, presets, and filter are already there; the LLM
          composes the panel.
        </p>
      </div>

      {/* Engine + store run regardless of panel layout. Streamed OpenUI controls
          read/write the same store as the hand-built sequencer. */}
      <AudioEngine>
        <GenerativePanel />
      </AudioEngine>
    </main>
  );
}
