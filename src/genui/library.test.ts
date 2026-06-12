import { describe, expect, it } from "vitest";
import { controlLibrary, controlPromptOptions } from "./library";

describe("controlLibrary", () => {
  it("uses Rack as root and registers every model-facing control", () => {
    expect(controlLibrary.root).toBe("Rack");
    const names = new Set(
      Object.values(controlLibrary.components).map((c) => c.name),
    );
    for (const required of [
      "TransportButton",
      "TempoSlider",
      "DrumTrack",
      "BeatPattern",
      "StepGrid",
      "Knob",
      "PresetPicker",
      "KitPicker",
      "HarmonicScope",
      "TrackVelocityFader",
      "TrackMute",
      "ClearTrack",
      "ClearPattern",
      "RhythmHint",
      "ControlStrip",
      "Rack",
    ]) {
      expect(names.has(required), `missing ${required}`).toBe(true);
    }
  });
});

describe("controlPromptOptions", () => {
  it("steers the model with preamble, rules, and concrete examples", () => {
    expect(controlPromptOptions.preamble).toContain("OpenBeats");
    expect(controlPromptOptions.preamble).toContain("OpenUI Lang");
    expect(controlPromptOptions.additionalRules?.length).toBeGreaterThan(5);
    expect(controlPromptOptions.additionalRules?.some((r) => r.includes("Rack"))).toBe(
      true,
    );
    expect(controlPromptOptions.examples?.length).toBeGreaterThanOrEqual(3);
    expect(controlPromptOptions.examples?.every((e) => e.includes("root = Rack"))).toBe(
      true,
    );
  });
});
