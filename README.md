# OpenBeats

Drum machine and related UI built with [Tone.js](https://tonejs.github.io), [OpenUI Lang](https://openui.com), and a shared [Zustand](https://github.com/pmndrs/zustand) store.

## Overview

- **Audio** (`src/audio/`): JSX describes the graph (`Song`, `Sequencer`, `Track`, `Synth`, `Sampler`). Components attach Tone nodes (mostly in effects); many components render no DOM.
- **Generative UI** (`src/genui/`, `src/components/GenerativePanel.tsx`): Custom controls are registered with `defineComponent` from `@openuidev/react-lang`; the API route streams model output; `<Renderer>` turns that into React.

The audio and generative layers share the store only. They do not import each other.

## Main files

| Area                  | Path                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| Audio components      | [`src/audio/`](src/audio/)                                                 |
| Control definitions   | [`src/genui/controls.tsx`](src/genui/controls.tsx)                         |
| Library + prompt text | [`src/genui/library.ts`](src/genui/library.ts)                             |
| Generation API        | [`src/app/api/generate/route.ts`](src/app/api/generate/route.ts)           |
| Prompt UI             | [`src/components/GenerativePanel.tsx`](src/components/GenerativePanel.tsx) |

The app includes an offline “demo layout” path that uses the same renderer without calling the model.

## Example audio tree

```tsx
<Song tempo={120}>
  <Sequencer resolution={16} bars={1}>
    <Track name="Kick" pattern={[0, 4, 8, 12]}>
      <Synth type="kick" />
    </Track>
    <Track name="Snare" pattern={[4, 12]}>
      <Synth type="snare" />
    </Track>
    <Track name="Hat" pattern={[0, 2, 4, 6, 8, 10, 12, 14]}>
      <Synth type="hat" />
    </Track>
  </Sequencer>
</Song>
```

- `Song` — `Tone.Transport`, audio context resume on user gesture (`src/audio/Song.tsx`).
- `Sequencer` — single sequence, `(time, step)` to tracks.
- `Track` — triggers children on pattern steps.
- `Synth` — built-in drum types; `Sampler` — `Tone.Player` when a sample URL is set.

## Dependencies (high level)

- Next.js 16, React 19, TypeScript, Tailwind 4
- `@openuidev/react-lang`, `@openuidev/react-ui`, `@openuidev/react-headless`, `@openuidev/lang-core`
- `tone`, `openai` (OpenAI-compatible HTTP API in the generate route)

## Setup

```bash
# Optional: copy for OPENAI_BASE_URL / OPENAI_MODEL server overrides (see .env.example).
cp .env.example .env
npm install
npm run dev
```

App: <http://localhost:3000>. Paste your OpenAI API key in the generative panel when you want model output (it is not stored). Do not commit `.env`.

If `npm install` fails on a peer dependency conflict between OpenUI packages and Zustand, use `npm install --legacy-peer-deps` (or set `legacy-peer-deps=true` in `.npmrc`).

## Tests

Business logic is covered with [Vitest](https://vitest.dev/) (pure helpers, store behavior, harmonics math, presets, and the OpenUI control library metadata). Run:

```bash
npm run test
```


| Issue                                          | Notes                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AudioContext blocked / silence                 | Start playback from a user click (e.g. Play). `Tone.start()` runs from that path.                                        |
| `param must be an AudioParam` (often with SSR) | Do not construct Tone nodes in render or at module scope; use client `useEffect`.                                        |
| Generation 429 / quota                         | Use offline demo layout in the UI, or check the key in the panel, billing, or `OPENAI_BASE_URL`. Default model: `OPENAI_MODEL` or `gpt-5.2` in code. |

## References

- [FormidableLabs / react-music](https://github.com/FormidableLabs/react-music) — declarative audio with React.
- [Ken Wheeler — react-amsterdam-demos](https://github.com/kenwheeler/react-amsterdam-demos) — Tone + React examples.
