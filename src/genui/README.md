# `src/genui` — the OpenBeats control library

This folder is the **generative-UI** half of OpenBeats: a small library of
controls an LLM can compose into a live drum-machine panel by emitting
[OpenUI Lang](https://openui.com). The model writes a short program; `<Renderer>`
turns it into real, interactive React that drives the audio engine.

```
prompt ──▶ /api/generate ──▶ OpenUI Lang (streamed) ──▶ <Renderer> ──▶ controls ──▶ store ──▶ audio
```

| File | Role |
|------|------|
| [`controls.tsx`](./controls.tsx) | The controls themselves — one `defineComponent` each. |
| [`library.ts`](./library.ts) | Bundles the controls into a `Library` and defines the system prompt. |

The renderer and prompt UI live one level up in
[`../components/GenerativePanel.tsx`](../components/GenerativePanel.tsx).

---

## Anatomy of a control

Every control is a single `defineComponent`. Four fields, each with a distinct job:

```tsx
export const TempoSlider = defineComponent({
  name: "TempoSlider",                       // 1. what the model writes
  description: "Horizontal BPM/tempo slider (60–200 BPM), bound to the song tempo.", // 2. docs for the model
  props: z.object({}),                       // 3. typed signature + validation
  component: () => <TempoControl />,          // 4. thin React adapter → store
});
```

1. **`name`** — the identifier the model emits, e.g. `TempoSlider()`.
2. **`description`** — natural-language documentation **for the model**. It is
   injected into the system prompt and is the biggest lever on whether the model
   reaches for the control correctly. Write it like an API doc: what it does, when
   to use it, gotchas.
3. **`props`** — a [Zod](https://zod.dev) schema that does double duty: it
   validates parsed output **and** becomes the typed signature the model sees.
   Every `.describe(...)` is prompt text, so keep field docs tight and
   example-driven. Arguments are **positional** in OpenUI Lang.
4. **`component`** — a thin React renderer. It receives the parsed, typed `props`
   (via `z.infer`) plus `renderNode` for child slots, and translates them to and
   from the shared store. Components carry **no** model logic.

Nesting is expressed with refs: a parent slot uses `z.array(Child.ref)` (see
`BeatPattern` holding `DrumTrack.ref`, or `Rack` holding everything).

---

## The store bridge

Controls never touch the audio engine directly. They read and write
[`useBeatStore`](../store/beatStore.ts); the engine in [`../audio`](../audio)
plays whatever the store holds. The same store backs the hand-built
[`<StepSequencer>`](../components/StepSequencer.tsx), so a model-generated knob and
a human click change sound through the exact same path.

```
DrumTrack (data) ──▶ BeatPattern.component ──▶ store.setTracks() ──▶ engine
Knob("filter")   ──▶ ControlKnob.component ──▶ store.setFilterFreq() ──▶ engine
```

This is the one rule worth keeping if you fork the library: **controls are
adapters over a store, not over the engine.**

---

## Streaming safety

`<Renderer>` re-parses on **every streamed token**, so a `component` can be called
with half-finished props (a `steps` array mid-write, a `harmonics` value that will
change next token). Read-only controls don't care, but any control that *commits*
state to the engine must guard:

- Call [`useIsStreaming()`](https://openui.com) and bail while it's `true`.
- Skip nodes still flagged `partial`.

See `BeatPatternComponent` (doesn't push patterns until the stream settles) and
`HarmonicScopeComponent` (pins `harmonics` to a safe default while streaming) in
[`controls.tsx`](./controls.tsx).

---

## Adding a new control

1. **Write a render component** (a normal React function) in the "Render
   components" section of `controls.tsx`. Wire it to `useBeatStore`. If it commits
   state, add the streaming guard above.
2. **Define it** with `defineComponent` in the "Component definitions" section.
   Invest in the `description` and per-prop `.describe(...)` — that text is the UX
   for the model.
3. **Register it** in the `components` array of [`library.ts`](./library.ts).
4. **Let parents hold it**: add its `.ref` to `Rack`'s `controls` union (and
   `controlStripSlot` if it's compact enough for a horizontal strip).
5. **Teach the model when to use it**: add a one-line rule to `additionalRules` in
   `library.ts`, and a worked `examples` entry if the usage isn't obvious.

Reuse the shared `ui` design tokens and the `useTargetTrack` / `MissingTarget`
helpers where they fit, so new controls match the rest visually and behaviorally.

---

## Reusing this in your own OpenUI project

The reusable parts are the **patterns**, not the drum-specific wiring:

- **The `defineComponent` shape** and the description/`.describe` conventions —
  copy these wholesale.
- **The store-as-bridge architecture** — swap `useBeatStore` for your own state
  (Zustand, Redux, context, anything). Controls stay thin adapters.
- **The streaming-guard pattern** for any control that mutates external state.
- **The `ui` design tokens** in `controls.tsx` — retheme the whole library from
  one object instead of hunting class strings per component.
- **`library.ts`'s prompt shape** — `preamble` + `additionalRules` + `examples`
  is a clean, portable way to steer the model toward valid programs.

Strip the audio engine and presets, point the components at your own state, and
you have a generative control panel for whatever you're building.
