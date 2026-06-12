import type { VoiceType } from "@/audio";
import type { TrackState } from "@/store/beatStore";

export interface Preset {
  id: string;
  name: string;
  bpm: number;
  tracks: TrackState[];
}

const S = (on: number[]): boolean[] =>
  Array.from({ length: 16 }, (_, i) => on.includes(i));

const KIT = "https://tonejs.github.io/audio/drum-samples";

/**
 * Sample-backed kits exposed by KitPicker and DrumTrack `kit=…`.
 * (Tone.js does not ship an `808/` folder; `linn` uses the LINN machine kit.)
 */
export const SAMPLE_KIT_IDS = ["cr78", "acoustic", "linn"] as const;
export type SampleKitId = (typeof SAMPLE_KIT_IDS)[number];

/** Sample URL per voice for each named kit (used when DrumTrack sets `kit` without `sampleUrl`). */
export const KIT_SAMPLE_URLS: Record<
  SampleKitId,
  Partial<Record<VoiceType, string>>
> = {
  cr78: {
    kick: `${KIT}/CR78/kick.mp3`,
    snare: `${KIT}/CR78/snare.mp3`,
    hat: `${KIT}/CR78/hihat.mp3`,
    openhat: `${KIT}/CR78/hihat.mp3`,
    clap: `${KIT}/CR78/snare.mp3`,
    tom: `${KIT}/CR78/tom1.mp3`,
  },
  acoustic: {
    kick: `${KIT}/acoustic-kit/kick.mp3`,
    snare: `${KIT}/acoustic-kit/snare.mp3`,
    hat: `${KIT}/acoustic-kit/hihat.mp3`,
    openhat: `${KIT}/acoustic-kit/hihat.mp3`,
    clap: `${KIT}/acoustic-kit/snare.mp3`,
    tom: `${KIT}/acoustic-kit/kick.mp3`,
  },
  linn: {
    kick: `${KIT}/LINN/kick.mp3`,
    snare: `${KIT}/LINN/snare.mp3`,
    hat: `${KIT}/LINN/hihat.mp3`,
    openhat: `${KIT}/LINN/hihat.mp3`,
    clap: `${KIT}/LINN/snare.mp3`,
    tom: `${KIT}/LINN/tom1.mp3`,
  },
};

export function sampleUrlForKit(kit: SampleKitId, voice: VoiceType): string | undefined {
  return KIT_SAMPLE_URLS[kit][voice];
}

/** A few starter patterns — synth kits and sample-based kits. */
export const PRESETS: Preset[] = [
  {
    id: "fourfloor",
    name: "Four on the Floor",
    bpm: 120,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", muted: false, velocity: 1, steps: S([0, 4, 8, 12]) },
      { id: "snare", name: "Snare", voice: "snare", muted: false, velocity: 0.9, steps: S([4, 12]) },
      { id: "hat", name: "Hat", voice: "hat", muted: false, velocity: 0.7, steps: S([0, 2, 4, 6, 8, 10, 12, 14]) },
    ],
  },
  {
    id: "house",
    name: "House",
    bpm: 124,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", muted: false, velocity: 1, steps: S([0, 4, 8, 12]) },
      { id: "clap", name: "Clap", voice: "clap", muted: false, velocity: 0.9, steps: S([4, 12]) },
      { id: "openhat", name: "Open Hat", voice: "openhat", muted: false, velocity: 0.6, steps: S([2, 6, 10, 14]) },
      { id: "hat", name: "Hat", voice: "hat", muted: false, velocity: 0.55, steps: S([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) },
    ],
  },
  {
    id: "boombap",
    name: "Boom Bap",
    bpm: 90,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", muted: false, velocity: 1, steps: S([0, 3, 8, 10]) },
      { id: "snare", name: "Snare", voice: "snare", muted: false, velocity: 0.95, steps: S([4, 12]) },
      { id: "hat", name: "Hat", voice: "hat", muted: false, velocity: 0.65, steps: S([0, 2, 4, 6, 8, 10, 12, 14]) },
      { id: "tom", name: "Tom", voice: "tom", muted: true, velocity: 0.8, steps: S([14, 15]) },
    ],
  },
  {
    id: "trap",
    name: "Trap",
    bpm: 140,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", muted: false, velocity: 1, steps: S([0, 6, 10]) },
      { id: "clap", name: "Clap", voice: "clap", muted: false, velocity: 0.9, steps: S([8]) },
      { id: "hat", name: "Hat", voice: "hat", muted: false, velocity: 0.6, steps: S([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]) },
    ],
  },
  {
    id: "linn",
    name: "LinnDrum (samples)",
    bpm: 118,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", sampleUrl: `${KIT}/LINN/kick.mp3`, muted: false, velocity: 1, steps: S([0, 4, 8, 12]) },
      { id: "snare", name: "Snare", voice: "snare", sampleUrl: `${KIT}/LINN/snare.mp3`, muted: false, velocity: 0.92, steps: S([4, 12]) },
      { id: "hihat", name: "Hi-hat", voice: "hat", sampleUrl: `${KIT}/LINN/hihat.mp3`, muted: false, velocity: 0.72, steps: S([0, 2, 4, 6, 8, 10, 12, 14]) },
      { id: "tom", name: "Tom", voice: "tom", sampleUrl: `${KIT}/LINN/tom1.mp3`, muted: true, velocity: 0.75, steps: S([14]) },
    ],
  },
  {
    id: "cr78",
    name: "CR-78 (samples)",
    bpm: 110,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", sampleUrl: `${KIT}/CR78/kick.mp3`, muted: false, velocity: 1, steps: S([0, 8]) },
      { id: "snare", name: "Snare", voice: "snare", sampleUrl: `${KIT}/CR78/snare.mp3`, muted: false, velocity: 0.9, steps: S([4, 12]) },
      { id: "hihat", name: "Hi-hat", voice: "hat", sampleUrl: `${KIT}/CR78/hihat.mp3`, muted: false, velocity: 0.7, steps: S([0, 2, 4, 6, 8, 10, 12, 14]) },
      { id: "tom", name: "Tom", voice: "tom", sampleUrl: `${KIT}/CR78/tom1.mp3`, muted: true, velocity: 0.8, steps: S([14]) },
    ],
  },
  {
    id: "acoustic",
    name: "Acoustic (samples)",
    bpm: 100,
    tracks: [
      { id: "kick", name: "Kick", voice: "kick", sampleUrl: `${KIT}/acoustic-kit/kick.mp3`, muted: false, velocity: 1, steps: S([0, 8, 11]) },
      { id: "snare", name: "Snare", voice: "snare", sampleUrl: `${KIT}/acoustic-kit/snare.mp3`, muted: false, velocity: 0.9, steps: S([4, 12]) },
      { id: "hihat", name: "Hi-hat", voice: "hat", sampleUrl: `${KIT}/acoustic-kit/hihat.mp3`, muted: false, velocity: 0.6, steps: S([0, 2, 4, 6, 8, 10, 12, 14]) },
    ],
  },
];

export const getPreset = (id: string): Preset | undefined =>
  PRESETS.find((p) => p.id === id);
