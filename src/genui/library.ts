import { createLibrary } from "@openuidev/react-lang";
import type { PromptOptions } from "@openuidev/lang-core";
import {
  BeatPattern,
  ClearPattern,
  ClearTrack,
  ControlKnob,
  ControlStrip,
  DrumTrack,
  HarmonicScopeControl,
  KitPicker,
  PresetPicker,
  Rack,
  RhythmHint,
  StepGrid,
  TempoSlider,
  TrackMute,
  TrackVelocityFader,
  TransportButton,
} from "./controls";

/** The beat-control component library exposed to the model. */
export const controlLibrary = createLibrary({
  components: [
    TransportButton,
    TempoSlider,
    DrumTrack,
    BeatPattern,
    StepGrid,
    ControlKnob,
    PresetPicker,
    KitPicker,
    HarmonicScopeControl,
    TrackVelocityFader,
    TrackMute,
    ClearTrack,
    ClearPattern,
    RhythmHint,
    ControlStrip,
    Rack,
  ],
  root: "Rack",
});

/**
 * How the model is steered toward valid OpenUI Lang programs:
 * - `preamble` frames the task (compose both the pattern and the panel).
 * - `additionalRules` are hard constraints layered on top of each component's
 *   own `description`.
 * - `examples` are full, known-good programs the model can pattern-match against.
 *
 * `controlLibrary.prompt(controlPromptOptions)` (see GenerativePanel) renders all
 * of this — plus the component signatures — into the final system prompt.
 */
export const controlPromptOptions: PromptOptions = {
  preamble:
    "You are the layout generator for OpenBeats, a browser drum machine. Given a " +
    "natural-language request, emit OpenUI Lang that defines BOTH the drum " +
    "sequence (via BeatPattern + DrumTrack) AND the control panel (knobs, grids, transport). " +
    "Controls and patterns are wired to the same live audio engine.",
  additionalRules: [
    "Always return exactly one `root = Rack(title, controls)` with a short, fitting title.",
    "Always include exactly one BeatPattern with DrumTrack entries that match the user's musical request — which drum rows/voices, which steps. Omit tracks the user did not ask for.",
    "Always include exactly one TransportButton and exactly one StepGrid (to show/edit the pattern).",
    "DrumTrack steps use 0-based indices on the live grid: length = resolution×bars (default 16×1 = steps 0–15). Quarter notes in the first bar on 16ths = [0,4,8,12], eighths = [0,2,4,6,8,10,12,14], backbeat snare = [4,12]. For 2 bars (32 steps), repeat patterns in bar 2 with +16 (e.g. second-bar kick hits [16,20,24,28]).",
    "For eighth-note triplets or 'triplet hi-hats', only use integers 0–15 (no fractions). Good one-bar triplet hat = [0,1,3,4,5,7,8,9,11,12,13,15]; simpler variant = [0,3,5,8,11,13].",
    "DrumTrack optional `kit` selects hosted samples: cr78 (CR-78), acoustic, linn (LinnDrum-style). Optional `sampleUrl` overrides kit. Positional order is name, voice, steps, optional velocity, optional kit, optional sampleUrl — pass velocity (e.g. 1) before `kit` when using positionals.",
    "Add a TempoSlider whenever tempo/BPM is mentioned or implied.",
    "Use Knob(\"filter\", ...) for any filter/cutoff/brightness request, and Knob(\"volume\", ...) for loudness/master/gain.",
    "Add PresetPicker when the user wants the full preset list (synth + sample). Add KitPicker when they ask specifically for sample kits, CR-78, acoustic, or Linn-style machine drums.",
    "Add TrackVelocityFader or TrackMute with `target` set to a voice string (e.g. \\\"kick\\\") or a numeric row index when the user wants explicit per-row gain or mute controls. With duplicate voices (layered kicks), use a numeric row index to target a specific row; voice strings match the first row with that voice.",
    "When the user asks to layer, overdub, or keep existing drums while adding new ones, BeatPattern may list only the new or changed DrumTracks; rows the user locked in the step grid (Keep) are preserved client-side and need not be repeated in BeatPattern.",
    "Add RhythmHint when the user asks for a step-index legend, rhythm theory on the grid, or help avoiding bad step arrays.",
    "Use ControlStrip to group compact horizontal controls (transport, tempo, knobs, KitPicker, TrackMute, etc.); never put BeatPattern, StepGrid, or HarmonicScope inside a ControlStrip.",
    "Add a HarmonicScope when the user asks to visualize/analyze the beat's frequency content, harmonics, FFT, spectrum, or Fourier breakdown. It always analyzes the full current mix (one offline-rendered loop of all unmuted tracks through the master filter and volume). Optional `track` in the schema is ignored (legacy). Prefer `HarmonicScope()`; use `harmonics` for max partial count when relevant.",
    "Arguments are positional. Rack's title is required because controls follow it — never omit it.",
    "Only use the listed components. Do not invent component names or props.",
  ],
  examples: [
    [
      'root = Rack("Quarter-Note Hi-Hat", [transport, pattern, grid])',
      "transport = TransportButton()",
      "pattern = BeatPattern([hat])",
      'hat = DrumTrack("Hi-Hat", "hat", [0, 4, 8, 12])',
      'grid = StepGrid("Pattern")',
    ].join("\n"),
    [
      'root = Rack("Drum Machine", [transport, pattern, tempo, grid, filter])',
      "transport = TransportButton()",
      "pattern = BeatPattern([kick, snare, hat])",
      'kick = DrumTrack("Kick", "kick", [0, 4, 8, 12])',
      'snare = DrumTrack("Snare", "snare", [4, 12])',
      'hat = DrumTrack("Hat", "hat", [0, 2, 4, 6, 8, 10, 12, 14])',
      "tempo = TempoSlider()",
      'grid = StepGrid("Pattern")',
      'filter = Knob("filter", "Filter")',
    ].join("\n"),
    [
      'root = Rack("Beat harmonics", [transport, pattern, grid, scope])',
      "transport = TransportButton()",
      "pattern = BeatPattern([kick])",
      'kick = DrumTrack("Kick", "kick", [0, 4, 8, 12])',
      'grid = StepGrid("Pattern")',
      "scope = HarmonicScope()",
    ].join("\n"),
    [
      'root = Rack("CR-78 kit", [kits, transport, pattern, tempo, grid, hint])',
      'kits = KitPicker("Sample kits")',
      "transport = TransportButton()",
      "pattern = BeatPattern([k, s, h])",
      'k = DrumTrack("Kick", "kick", [0, 8], 1, "cr78")',
      's = DrumTrack("Snare", "snare", [4, 12], 0.9, "cr78")',
      'h = DrumTrack("Hat", "hat", [0, 2, 4, 6, 8, 10, 12, 14], 0.7, "cr78")',
      "tempo = TempoSlider()",
      'grid = StepGrid("Pattern")',
      'hint = RhythmHint("16-step legend")',
    ].join("\n"),
  ],
};
