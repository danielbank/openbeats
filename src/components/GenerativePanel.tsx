"use client";

import { useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import { TrackLockStrip } from "@/components/TrackLockStrip";
import { controlLibrary, controlPromptOptions } from "@/genui/library";

// The system prompt is derived from the library once, on the client, and sent
// to the streaming route with each request.
const systemPrompt = controlLibrary.prompt(controlPromptOptions);

/** Short chip label + full text sent to the model (include explicit 0-based step indices). */
const SAMPLE_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Brazil — Bossa Nova clave",
    prompt:
      "Brazil — Bossa Nova clave on a 16-step grid (sixteenths in one 4/4 bar). " +
      "Rhythm groups 3+3+4+3+3 = 16; hits x..x..x...x..x.. at steps [0, 3, 6, 10, 13]. " +
      "Put that clave on one track (tom or clap), light kick/hat support if it helps. " +
      "Include TransportButton, StepGrid, TempoSlider, filter Knob, BeatPattern with DrumTrack steps.",
  },
  {
    label: "Cuba — Son clave 3-2",
    prompt:
      "Cuba — Son clave (3-2) on 16 steps — the classic Latin cell behind salsa and countless pop grooves. " +
      "Groups 3+3+4+2+4 = 16; hits x..x..x...x.x... at steps [0, 3, 6, 10, 12]. " +
      "One track for the clave line, optional kick backbeat. TransportButton, StepGrid, TempoSlider, BeatPattern.",
  },
  {
    label: "India — Misra Chapu on 16",
    prompt:
      "India — Carnatic Misra Chapu flavor on a 16-step grid: cross-rhythm in threes against 4/4. " +
      "Use the 16-step grouping 3+3+3+3+4 = 16; hits x..x..x..x..x... at steps [0, 3, 6, 9, 13]. " +
      "Describe as ta-ki-ta / ta-ka-di-mi feel. Tom or clap for the accent pattern, sparse kick. Full rack with grid and tempo.",
  },
  {
    label: "Cameroon — Bikutsi 12-pulse bell",
    prompt:
      "Cameroon — Bikutsi / Central African 6/8 bell pattern. One cycle is 12 pulses: groups 2+2+3+2+3, hits x.x.x..x.x.. at steps [0, 2, 4, 7, 9] within each 12-step cycle. " +
      "Use 3 bars at 16 steps per bar (48 steps total) so four full 12-pulse cycles fit exactly. DrumTrack steps for the bell line: [0,2,4,7,9,12,14,16,19,21,24,26,28,31,33,36,38,40,43,45]. " +
      "Bell/clap line plus rolling kick or tom if it fits the groove. TransportButton, StepGrid, TempoSlider, BeatPattern.",
  },
  {
    label: "USA — Funk (tresillo doubled)",
    prompt:
      "USA — Funk pattern: tresillo doubled on 16 steps — groups 3+3+2+3+3+2 = 16; hits x..x..x.x..x..x. at steps [0, 3, 6, 8, 11, 14]. " +
      "James Brown-style syncopated kick emphasis; snare on 4 and 12 optional. TransportButton, StepGrid, TempoSlider, filter Knob, BeatPattern.",
  },
  {
    label: "Egypt — Maqsum (bonus)",
    prompt:
      "Egypt / Middle East — Maqsum on 16 steps as two 8-pulse cycles (dum-tak feel). Groups 1+2+1+2+2 = 8 per cycle; hits xx.x.x.. at steps [0, 1, 3, 5] then repeat at +8: full bar [0, 1, 3, 5, 8, 9, 11, 13]. " +
      "Kick or tom for dum/tak accents. TransportButton, StepGrid, TempoSlider, BeatPattern.",
  },
];

// A known-good OpenUI Lang program. Used as an offline fallback (and for
// verification) when the model is unreachable — it flows through the exact same
// <Renderer> path as model output.
const DEMO_SPEC = [
  'root = Rack("Drum Machine", [presets, transport, tempo, grid, filter, volume, scope])',
  'presets = PresetPicker("Kits")',
  "transport = TransportButton()",
  "tempo = TempoSlider()",
  'grid = StepGrid("Pattern")',
  'filter = Knob("filter", "Filter")',
  'volume = Knob("volume", "Volume")',
  "scope = HarmonicScope()",
].join("\n");

export function GenerativePanel() {
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async (text: string) => {
    const trimmed = text.trim();
    const key = apiKey.trim();
    if (!key) {
      setError("Add your OpenAI API key below to generate.");
      return;
    }
    if (!trimmed || isStreaming) return;
    setError(null);
    setResponse("");
    setIsStreaming(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ systemPrompt, prompt: trimmed }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "Request failed");
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setResponse(acc);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate(prompt);
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="openai-api-key" className="text-xs font-medium text-neutral-400">
            OpenAI API key
          </label>
          <input
            id="openai-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
          <p className="text-xs leading-relaxed text-neutral-500">
            Not stored by this app — only sent with each generate request so your key never
            stays on the server.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the layout you want — controls, pattern, tempo…"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isStreaming || !prompt.trim() || !apiKey.trim()}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-700"
          >
            {isStreaming ? "Streaming…" : "Generate layout"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map(({ label, prompt: presetPrompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPrompt(presetPrompt);
                void generate(presetPrompt);
              }}
              disabled={isStreaming || !apiKey.trim()}
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setResponse(DEMO_SPEC);
            }}
            disabled={isStreaming}
            className="rounded-full border border-emerald-800 px-3 py-1 text-xs text-emerald-400 transition-colors hover:border-emerald-600 hover:text-emerald-200 disabled:opacity-50"
          >
            ⚡ demo layout (offline)
          </button>
        </div>
      </form>

      <TrackLockStrip />

      {error ? (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          <span>Couldn&apos;t generate layout: {error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setResponse(DEMO_SPEC);
            }}
            className="self-start rounded-md bg-rose-800/60 px-3 py-1 text-xs font-medium text-rose-100 hover:bg-rose-700/60"
          >
            Load demo layout instead (no model needed)
          </button>
        </div>
      ) : null}

      {response !== null ? (
        <Renderer
          response={response}
          library={controlLibrary}
          isStreaming={isStreaming}
        />
      ) : (
        <p className="text-center text-xs text-neutral-600">
          Streamed controls show up here as the model writes OpenUI Lang — all wired to the live engine.
        </p>
      )}
    </div>
  );
}
