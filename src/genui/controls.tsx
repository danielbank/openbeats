"use client";

/**
 * OpenBeats control library — the generative-UI half of the app.
 *
 * Every export below is a model-facing **control**: a widget the LLM can place
 * in a panel by emitting OpenUI Lang. They are gathered into a library in
 * `./library.ts` and rendered by `<Renderer>` in `../components/GenerativePanel.tsx`.
 *
 * ## Anatomy of a control
 *
 * Each control is one `defineComponent({ name, description, props, component })`:
 *
 * - **`name`** — the identifier the model writes, e.g. `TempoSlider()`.
 * - **`description`** — natural-language docs *for the model*. This is the single
 *   most important field: it is injected into the system prompt and decides
 *   whether the model reaches for the control correctly. Write it like an API doc.
 * - **`props`** — a Zod schema that does double duty: it validates parsed output
 *   **and** becomes the typed signature the model sees. `.describe(...)` on each
 *   field is prompt text, so keep it tight and example-driven.
 * - **`component`** — a thin React adapter. It receives the parsed `props` (typed
 *   via `z.infer`) and `renderNode` for child slots, and wires them to the shared
 *   {@link useBeatStore}. Components hold **no** model logic — they only translate
 *   props ⇄ store.
 *
 * ## The store bridge
 *
 * Controls never talk to the audio engine directly. They read and write
 * {@link useBeatStore}; the engine (`../audio/`) plays whatever the store holds.
 * That decoupling is the whole point: the same store is driven by the hand-built
 * `<StepSequencer>` and by model-generated controls, so generated widgets change
 * real sound with no extra glue.
 *
 * ## Streaming safety
 *
 * `<Renderer>` re-parses on every streamed token, so a `component` can be invoked
 * with half-finished props. Controls that *commit* state to the engine (e.g.
 * {@link BeatPattern}, {@link HarmonicScopeControl}) guard on {@link useIsStreaming}
 * and skip partial nodes — see the comments at each call site.
 *
 * ## Reusing this library
 *
 * To lift these into your own OpenUI project: swap {@link useBeatStore} for your
 * own state, restyle via the {@link ui} tokens below, and register your controls
 * with `createLibrary(...)`. The `defineComponent` shape and the prop-description
 * conventions are the reusable parts — see `./README.md`.
 */

import { useEffect } from "react";
import { defineComponent, useIsStreaming } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { HarmonicScope } from "@/components/HarmonicScope";
import { Knob } from "@/components/Knob";
import { StepSequencer } from "@/components/StepSequencer";
import { TempoControl } from "@/components/TempoControl";
import { TransportBar } from "@/components/TransportBar";
import {
  effectiveHarmonicScopeMax,
  isDrumTrackNode,
  resolveTrackId,
  trackFromDrumTrack,
} from "@/genui/controlLogic";
import {
  mergeBeatPatternTracks,
  totalSteps,
  useBeatStore,
  type TrackState,
} from "@/store/beatStore";
import { PRESETS, SAMPLE_KIT_IDS, getPreset, type SampleKitId } from "@/presets";
import type { VoiceType } from "@/audio";

// ---------------------------------------------------------------------------
// Constants & shared schema fragments
// ---------------------------------------------------------------------------

/** The synthesized drum voices a {@link DrumTrack} can play. */
const VOICE_TYPES = ["kick", "snare", "hat", "openhat", "clap", "tom"] as const;

/** Zod enum of the hosted sample-kit ids (cr78 | acoustic | linn). */
const DRUM_SAMPLE_KIT = z.enum(
  SAMPLE_KIT_IDS as unknown as [SampleKitId, SampleKitId, ...SampleKitId[]],
);

/**
 * Shared props for the per-row controls ({@link TrackVelocityFader},
 * {@link TrackMute}, {@link ClearTrack}). A `target` selects one grid row either
 * by drum voice or by numeric index, so all three controls speak one language.
 */
const trackTargetProps = z.object({
  target: z
    .union([
      z.enum(VOICE_TYPES).describe("First row with this drum voice"),
      z.number().int().min(0).max(31).describe("0-based row index (StepGrid top to bottom)"),
    ])
    .describe("Row selector: pass a voice name string OR a numeric row index"),
  label: z.string().optional().describe("Optional heading or button text"),
});

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

/**
 * Tailwind class tokens shared across controls. Centralizing them keeps the
 * library visually consistent and lets you retheme everything from one place —
 * the first thing you'll want to change when dropping these into another project.
 */
const ui = {
  /** Caption above a control group (PresetPicker, faders, …). */
  caption: "text-xs font-medium text-neutral-400",
  /** Heading for a titled control (StepGrid, RhythmHint, …). */
  heading: "text-sm font-semibold text-neutral-300",
  /** Base styling for a pill-shaped picker button; append a `hover:*` accent. */
  pill:
    "rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors",
  /** Placeholder shown when a control can't resolve the row it points at. */
  placeholder:
    "rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 text-xs text-neutral-500",
} as const;

// ---------------------------------------------------------------------------
// Store helpers (props ⇄ store, no rendering)
// ---------------------------------------------------------------------------

/** Subscribe to the live track a `target`-driven control points at (or `null`). */
function useTargetTrack(target: VoiceType | number): TrackState | null {
  const tracks = useBeatStore((s) => s.tracks);
  const id = resolveTrackId(tracks, target);
  return id ? tracks.find((t) => t.id === id) ?? null : null;
}

/** Fallback rendered by per-row controls when no row matches their `target`. */
function MissingTarget() {
  return <div className={ui.placeholder}>No track for this target.</div>;
}

// ---------------------------------------------------------------------------
// Render components
//
// Each function below is the `component` for one definition further down. They
// are kept separate from the `defineComponent(...)` calls so the definitions at
// the bottom read as a clean catalog of the library's surface.
// ---------------------------------------------------------------------------

/**
 * Commits the model's drum sequence to the audio engine. Renders nothing — it is
 * a side-effecting bridge from parsed `DrumTrack` nodes to {@link useBeatStore}.
 */
function BeatPatternComponent({ props }: { props: { tracks: unknown[] } }) {
  const isStreaming = useIsStreaming();
  useEffect(() => {
    const nodes = props.tracks.filter(isDrumTrackNode);
    const hasPartial = nodes.some((n) => n.partial);
    // Don't push partial or superseded patterns into the audio engine while the
    // model is still streaming — intermediate parses can be complete but wrong.
    if (isStreaming) return;
    if (nodes.length === 0 || hasPartial) return;

    const state = useBeatStore.getState();
    const stepCount = totalSteps(state);
    const tracks = nodes.map((node, i) => trackFromDrumTrack(node, i, stepCount));
    const prev = state.tracks;
    const hasLocks = prev.some((t) => t.locked === true);
    if (hasLocks) {
      if (tracks.length === 0) return;
      state.setTracks(mergeBeatPatternTracks(prev, tracks));
    } else {
      state.setTracks(tracks);
    }
  }, [props.tracks, isStreaming]);

  return null;
}

/** A rotary {@link Knob} bound to either the master filter cutoff or volume. */
function ControlKnobComponent({
  props,
}: {
  props: { binding: "filter" | "volume"; label?: string };
}) {
  const filterFreq = useBeatStore((s) => s.filterFreq);
  const masterVolume = useBeatStore((s) => s.masterVolume);
  const setFilterFreq = useBeatStore((s) => s.setFilterFreq);
  const setMasterVolume = useBeatStore((s) => s.setMasterVolume);

  if (props.binding === "volume") {
    return (
      <Knob
        label={props.label ?? "Volume"}
        value={masterVolume}
        min={0}
        max={1}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={setMasterVolume}
      />
    );
  }
  return (
    <Knob
      label={props.label ?? "Filter"}
      value={filterFreq}
      min={60}
      max={20000}
      logarithmic
      format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)}
      onChange={setFilterFreq}
    />
  );
}

/** Buttons for every preset (synth + sample). Each click swaps pattern and tempo. */
function PresetPickerComponent({ props }: { props: { label?: string } }) {
  const applyPreset = useBeatStore((s) => s.applyPreset);
  return (
    <div className="flex flex-col gap-2">
      <span className={ui.caption}>{props.label ?? "Presets"}</span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.tracks, p.bpm)}
            className={`${ui.pill} hover:border-emerald-500 hover:text-white`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Fourier-synthesis scope of the live mix; guards harmonic count while streaming. */
function HarmonicScopeComponent({
  props,
}: {
  props: { track?: VoiceType; harmonics?: number; title?: string };
}) {
  const isStreaming = useIsStreaming();
  const tracks = useBeatStore((s) => s.tracks);
  const bpm = useBeatStore((s) => s.bpm);
  const resolution = useBeatStore((s) => s.resolution);
  const bars = useBeatStore((s) => s.bars);
  const filterFreq = useBeatStore((s) => s.filterFreq);
  const masterVolume = useBeatStore((s) => s.masterVolume);

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-xs text-neutral-500">
        No tracks to analyze.
      </div>
    );
  }
  const maxH = effectiveHarmonicScopeMax(props.harmonics, isStreaming);
  return (
    <HarmonicScope
      tracks={tracks}
      bpm={bpm}
      resolution={resolution}
      bars={bars}
      filterFreq={filterFreq}
      masterVolume={masterVolume}
      maxHarmonics={maxH}
      title={props.title}
    />
  );
}

/** Buttons for sample-backed kits only (CR-78, acoustic, LinnDrum-style). */
function KitPickerComponent({ props }: { props: { label?: string } }) {
  const applyPreset = useBeatStore((s) => s.applyPreset);
  return (
    <div className="flex flex-col gap-2">
      <span className={ui.caption}>{props.label ?? "Sample kits"}</span>
      <div className="flex flex-wrap gap-2">
        {SAMPLE_KIT_IDS.map((id) => {
          const p = getPreset(id);
          if (!p) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(p.tracks, p.bpm)}
              className={`${ui.pill} hover:border-sky-500 hover:text-white`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Horizontal velocity (gain) fader for one row resolved from `target`. */
function TrackVelocityFaderComponent({
  props,
}: {
  props: { target: VoiceType | number; label?: string };
}) {
  const setVelocity = useBeatStore((s) => s.setVelocity);
  const track = useTargetTrack(props.target);
  if (!track) return <MissingTarget />;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {props.label ? <span className={ui.caption}>{props.label}</span> : null}
      <label className="flex min-w-0 items-center gap-2 text-xs text-neutral-300">
        <span className="max-w-20 shrink-0 truncate font-medium text-neutral-200">
          {track.name}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={track.velocity}
          onChange={(e) => setVelocity(track.id, Number(e.target.value))}
          className="min-w-0 flex-1 accent-emerald-500"
          title={`Velocity ${Math.round(track.velocity * 100)}%`}
        />
        <span className="w-8 shrink-0 tabular-nums text-neutral-500">
          {Math.round(track.velocity * 100)}%
        </span>
      </label>
    </div>
  );
}

/** Mute/unmute toggle for one row resolved from `target`. */
function TrackMuteComponent({
  props,
}: {
  props: { target: VoiceType | number; label?: string };
}) {
  const toggleMute = useBeatStore((s) => s.toggleMute);
  const track = useTargetTrack(props.target);
  if (!track) return <MissingTarget />;
  return (
    <div className="flex items-center gap-2">
      {props.label ? <span className={ui.caption}>{props.label}</span> : null}
      <button
        type="button"
        onClick={() => toggleMute(track.id)}
        aria-pressed={track.muted}
        className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
          track.muted
            ? "border-rose-700 bg-rose-950/50 text-rose-200 hover:border-rose-500"
            : "border-neutral-600 bg-neutral-800/80 text-neutral-200 hover:border-neutral-500"
        }`}
      >
        {track.muted ? "Unmute" : "Mute"} {track.name}
      </button>
    </div>
  );
}

/** Button that clears the step hits on one row resolved from `target`. */
function ClearTrackComponent({
  props,
}: {
  props: { target: VoiceType | number; label?: string };
}) {
  const clearTrack = useBeatStore((s) => s.clearTrack);
  const track = useTargetTrack(props.target);
  if (!track) return <MissingTarget />;
  return (
    <button
      type="button"
      onClick={() => clearTrack(track.id)}
      className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-100/90 transition-colors hover:border-amber-600 hover:bg-amber-950/50"
    >
      {props.label ?? `Clear ${track.name}`}
    </button>
  );
}

/** Button that wipes every row's steps (mutes and velocities are preserved). */
function ClearPatternComponent({ props }: { props: { label?: string } }) {
  const clearAllTracks = useBeatStore((s) => s.clearAllTracks);
  return (
    <button
      type="button"
      onClick={() => clearAllTracks()}
      className="rounded-md border border-rose-900/50 bg-rose-950/25 px-3 py-1.5 text-xs font-medium text-rose-100/90 transition-colors hover:border-rose-600 hover:bg-rose-950/45"
    >
      {props.label ?? "Clear entire pattern"}
    </button>
  );
}

/** Read-only cheatsheet of step indices for the current grid length. */
function RhythmHintComponent({ props }: { props: { title?: string } }) {
  const stepCount = useBeatStore((s) => totalSteps(s));
  const indices = Array.from({ length: Math.min(stepCount, 32) }, (_, i) => i);
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-xs leading-relaxed text-neutral-400">
      {props.title ? (
        <div className="mb-2 font-medium text-neutral-300">{props.title}</div>
      ) : null}
      <p className="mb-2">
        Step indices are 0-based through {stepCount - 1} (resolution × bars). With 16 steps per bar,
        quarter notes in the first bar are [0,4,8,12]; eighth notes [0,2,4,6,8,10,12,14]; backbeat
        snare [4,12]; four-on-the-floor kick [0,4,8,12]. Bar 2 on a 32-step grid repeats the same
        shape offset by 16 (e.g. kick [16,20,24,28]). Triplet eighths on 16ths (no fractions):
        [0,1,3,4,5,7,8,9,11,12,13,15] or shorter [0,3,5,8,11,13].
      </p>
      <div className="break-all font-mono text-[10px] text-neutral-500">{indices.join(" ")}</div>
    </div>
  );
}

// ===========================================================================
// Component definitions
//
// The model-facing surface of the library. Each `description` is prompt text —
// edit it like documentation, because that is exactly how the model reads it.
// ===========================================================================

// --- Transport & tempo -----------------------------------------------------

export const TransportButton = defineComponent({
  name: "TransportButton",
  description: "Play/stop transport button. Unlocks audio on first click. Include exactly one.",
  props: z.object({}),
  component: () => <TransportBar />,
});

export const TempoSlider = defineComponent({
  name: "TempoSlider",
  description: "Horizontal BPM/tempo slider (60–200 BPM), bound to the song tempo.",
  props: z.object({}),
  component: () => <TempoControl />,
});

// --- Pattern: data (DrumTrack) → engine (BeatPattern) → view (StepGrid) -----

/** Data-only track definition consumed by {@link BeatPattern}. Not rendered on its own. */
export const DrumTrack = defineComponent({
  name: "DrumTrack",
  description:
    "One drum track in the sequence. voice is kick|snare|hat|openhat|clap|tom. " +
    "steps lists active step indices from 0 through (resolution×bars − 1), integers only — " +
    "typically resolution 16 and 1 bar → 0–15; with 2 bars → 0–31 (second bar kick e.g. 16,20,24,28). " +
    "Quarter notes in bar 1 on 16ths: [0,4,8,12]; eighths: [0,2,4,6,8,10,12,14]. " +
    "Eighth-note triplets (approximate on 16ths): full bar hi-hat example " +
    "[0,1,3,4,5,7,8,9,11,12,13,15] — three hits per quarter, never fractional indices. " +
    "Optional sampleUrl plays that audio file instead of the synth. Optional kit " +
    "(cr78|acoustic|linn) assigns Tone.js hosted samples for that voice; kit is ignored when sampleUrl is set. " +
    "Positional prop order: name, voice, steps, optional velocity, optional kit, optional sampleUrl — " +
    "when using kit positionally, pass velocity first (e.g. 1) before the kit id. " +
    "Only define tracks the user asked for.",
  props: z.object({
    name: z.string().describe("Display name, e.g. Hi-Hat"),
    voice: z.enum(VOICE_TYPES).describe("Drum voice to play"),
    steps: z
      .array(z.number())
      .describe("Active step indices (0-based) for the current pattern length (resolution × bars)"),
    velocity: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Hit velocity 0–1, default 1"),
    kit: DRUM_SAMPLE_KIT.optional().describe(
      "Sample kit: cr78, acoustic, or linn (LinnDrum-style). Ignored when sampleUrl is set.",
    ),
    sampleUrl: z
      .string()
      .min(1)
      .optional()
      .describe("Optional sample URL; when set, plays this sample instead of the synth"),
  }),
  component: () => null,
});

/** Applies the generated drum sequence to the live audio engine. */
export const BeatPattern = defineComponent({
  name: "BeatPattern",
  description:
    "Defines the drum sequence that plays. Include exactly one BeatPattern that " +
    "matches the user's musical request — which drums, which rhythmic pattern. " +
    "Omit drum rows the user did not ask for.",
  props: z.object({
    tracks: z.array(DrumTrack.ref).describe("Drum tracks to play"),
  }),
  component: BeatPatternComponent,
});

export const StepGrid = defineComponent({
  name: "StepGrid",
  description:
    "The editable step-sequencer grid showing the current drum tracks. " +
    "Displays whatever BeatPattern configured. Clickable cells, per-row mute and velocity.",
  props: z.object({
    title: z.string().optional().describe("Optional heading shown above the grid"),
  }),
  component: ({ props }) => (
    <div className="flex flex-col gap-2">
      {props.title ? <h3 className={ui.heading}>{props.title}</h3> : null}
      <StepSequencer />
    </div>
  ),
});

// --- Master parameters -----------------------------------------------------

export const ControlKnob = defineComponent({
  name: "Knob",
  description:
    "A rotary knob. binding='filter' controls a master low-pass filter cutoff (the classic 'filter knob'); binding='volume' controls master output volume.",
  props: z.object({
    binding: z
      .enum(["filter", "volume"])
      .describe("Which audio parameter this knob controls"),
    label: z.string().optional().describe("Optional custom label"),
  }),
  component: ControlKnobComponent,
});

// --- Presets & kits --------------------------------------------------------

export const PresetPicker = defineComponent({
  name: "PresetPicker",
  description:
    "A row of preset buttons (synth and sample-based drum kits). Clicking one loads its pattern and tempo. Include when the user wants presets, kits, styles, or starting points.",
  props: z.object({
    label: z.string().optional().describe("Optional heading"),
  }),
  component: PresetPickerComponent,
});

export const KitPicker = defineComponent({
  name: "KitPicker",
  description:
    "Buttons for sample-backed kits only (CR-78, acoustic, LinnDrum-style). " +
    "Each loads that kit's pattern and tempo. Use when the user wants sample drums, " +
    "machine kits, or realistic kits without browsing every synth preset. " +
    "Prefer PresetPicker for the full list including synth styles.",
  props: z.object({
    label: z.string().optional().describe("Optional heading"),
  }),
  component: KitPickerComponent,
});

// --- Analysis --------------------------------------------------------------

export const HarmonicScopeControl = defineComponent({
  name: "HarmonicScope",
  description:
    "A Fourier-synthesis scope for the full drum mix: offline-renders one loop of the " +
    "current pattern (all unmuted tracks) through the master filter and volume, then shows " +
    "that waveform rebuilt from the fundamental plus progressively higher harmonics, " +
    "alongside magnitude spectrum bars. Use when the user wants to visualize or analyze " +
    "the beat's frequency content, harmonics, FFT, spectrum, or Fourier breakdown. " +
    "The optional `track` argument is accepted for backward compatibility but ignored — " +
    "analysis is always the whole kit.",
  props: z.object({
    track: z
      .enum(VOICE_TYPES)
      .optional()
      .describe("Deprecated: ignored; whole mix is always analyzed"),
    harmonics: z
      .number()
      .min(1)
      .max(64)
      .optional()
      .describe("Highest harmonic to sum, default 24"),
    title: z.string().optional().describe("Optional heading"),
  }),
  component: HarmonicScopeComponent,
});

// --- Per-row controls (share `trackTargetProps`) ---------------------------

export const TrackVelocityFader = defineComponent({
  name: "TrackVelocityFader",
  description:
    "Horizontal fader for one row's hit velocity (gain). `target` is either a voice " +
    "(kick|snare|hat|openhat|clap|tom) for the first matching row, or a 0-based row index number. " +
    "Use when the user wants per-drum level control outside the main grid. " +
    "With duplicate voices, use a numeric index to target a specific row.",
  props: trackTargetProps,
  component: TrackVelocityFaderComponent,
});

export const TrackMute = defineComponent({
  name: "TrackMute",
  description:
    "Mute/unmute one drum row. `target` is a voice string or numeric row index (same as TrackVelocityFader). " +
    "If multiple rows share the same voice (layered pattern), a voice string targets the first match; use a numeric index for a specific row.",
  props: trackTargetProps,
  component: TrackMuteComponent,
});

export const ClearTrack = defineComponent({
  name: "ClearTrack",
  description:
    "Clears step hits on one row. `target` is a voice string or numeric row index.",
  props: trackTargetProps,
  component: ClearTrackComponent,
});

export const ClearPattern = defineComponent({
  name: "ClearPattern",
  description:
    "One button that clears every track's steps (mutes and velocities stay). Use when the user wants a blank grid or full pattern wipe.",
  props: z.object({
    label: z.string().optional().describe("Button label, default 'Clear entire pattern'"),
  }),
  component: ClearPatternComponent,
});

// --- Teaching aid ----------------------------------------------------------

export const RhythmHint = defineComponent({
  name: "RhythmHint",
  description:
    "Read-only step-index cheatsheet (quarters, eighths, triplets on 16ths). " +
    "Include when teaching step numbers or reducing invalid step arrays in the UI.",
  props: z.object({
    title: z.string().optional().describe("Optional heading"),
  }),
  component: RhythmHintComponent,
});

// ===========================================================================
// Composition: ControlStrip (horizontal group) and Rack (root container)
// ===========================================================================

/** Controls allowed inside a {@link ControlStrip} — compact widgets only. */
const controlStripSlot = z.union([
  TransportButton.ref,
  TempoSlider.ref,
  ControlKnob.ref,
  PresetPicker.ref,
  KitPicker.ref,
  TrackVelocityFader.ref,
  TrackMute.ref,
  ClearTrack.ref,
  ClearPattern.ref,
  RhythmHint.ref,
]);

export const ControlStrip = defineComponent({
  name: "ControlStrip",
  description:
    "Horizontal flex row for compact controls (transport, tempo, knobs, kit picker, per-track actions, rhythm hint). " +
    "Do not place BeatPattern, StepGrid, or HarmonicScope inside a strip — keep those full-width in the Rack.",
  props: z.object({
    controls: z.array(controlStripSlot).describe("Controls laid out left-to-right with wrap"),
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-row flex-wrap items-end gap-4 rounded-lg border border-neutral-800/80 bg-neutral-950/30 p-3">
      {renderNode(props.controls)}
    </div>
  ),
});

/**
 * Root container. The model returns a single `Rack(...)` whose `controls` slot
 * holds any mix of the controls above, laid out top to bottom.
 */
export const Rack = defineComponent({
  name: "Rack",
  description:
    "Root container for the control panel. Put all controls in the `controls` slot. Always return exactly one Rack.",
  props: z.object({
    title: z.string().optional().describe("Title shown at the top of the panel"),
    controls: z
      .array(
        z.union([
          TransportButton.ref,
          TempoSlider.ref,
          BeatPattern.ref,
          StepGrid.ref,
          ControlKnob.ref,
          PresetPicker.ref,
          HarmonicScopeControl.ref,
          KitPicker.ref,
          TrackVelocityFader.ref,
          TrackMute.ref,
          ClearTrack.ref,
          ClearPattern.ref,
          RhythmHint.ref,
          ControlStrip.ref,
        ]),
      )
      .describe("The controls to render, top to bottom"),
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-col gap-5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
      {props.title ? (
        <h2 className="text-lg font-bold text-neutral-100">{props.title}</h2>
      ) : null}
      <div className="flex flex-col gap-5">{renderNode(props.controls)}</div>
    </div>
  ),
});
