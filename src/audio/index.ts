// Declarative, react-music-style audio engine over Tone.js.
// Components render *sound*, not DOM. Compose them like:
//
//   <Song tempo={120}>
//     <Sequencer resolution={16} bars={1}>
//       <Track pattern={[0, 4, 8, 12]}><Synth type="kick" /></Track>
//     </Sequencer>
//   </Song>

export { Song, useSong, type SongProps } from "./Song";
export {
  Sequencer,
  useSequencer,
  usePlayhead,
  type SequencerProps,
} from "./Sequencer";
export { Track, useTrack, type TrackProps } from "./Track";
export { Synth, type SynthProps } from "./Synth";
export { Sampler, type SamplerProps } from "./Sampler";
export {
  createVoice,
  createSampleVoice,
  createSampleVoiceFromBuffer,
} from "./voices";
export type { Instrument, VoiceType, StepCallback } from "./types";
