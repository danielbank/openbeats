import { describe, expect, it } from "vitest";
import type { TrackState } from "@/store/beatStore";
import {
  effectiveHarmonicScopeMax,
  isDrumTrackNode,
  normalizeStepIndices,
  resolveTrackId,
  trackFromDrumTrack,
} from "./controlLogic";

const kickRow: TrackState = {
  id: "a",
  name: "Kick",
  voice: "kick",
  muted: false,
  velocity: 1,
  steps: Array.from({ length: 16 }, () => false),
};

const snareRow: TrackState = {
  id: "b",
  name: "Snare",
  voice: "snare",
  muted: false,
  velocity: 0.9,
  steps: Array.from({ length: 16 }, () => false),
};

describe("resolveTrackId", () => {
  it("returns id by 0-based row index", () => {
    expect(resolveTrackId([kickRow, snareRow], 0)).toBe("a");
    expect(resolveTrackId([kickRow, snareRow], 1)).toBe("b");
  });

  it("returns null for out-of-range index", () => {
    expect(resolveTrackId([kickRow], 1)).toBeNull();
    expect(resolveTrackId([], 0)).toBeNull();
  });

  it("ignores non-integer numeric targets", () => {
    expect(resolveTrackId([kickRow, snareRow], 0.5)).toBeNull();
  });

  it("returns first row id matching voice", () => {
    expect(resolveTrackId([kickRow, snareRow], "snare")).toBe("b");
    expect(resolveTrackId([snareRow, kickRow], "kick")).toBe("a");
  });

  it("returns null when no row has that voice", () => {
    expect(resolveTrackId([kickRow], "hat")).toBeNull();
  });
});

describe("isDrumTrackNode", () => {
  it("accepts element nodes typed DrumTrack", () => {
    expect(
      isDrumTrackNode({
        type: "element",
        typeName: "DrumTrack",
        props: { name: "K", voice: "kick", steps: [0] },
      }),
    ).toBe(true);
  });

  it("rejects wrong type or typeName", () => {
    expect(isDrumTrackNode({ type: "text", typeName: "DrumTrack" })).toBe(false);
    expect(isDrumTrackNode({ type: "element", typeName: "BeatPattern" })).toBe(false);
    expect(isDrumTrackNode(null)).toBe(false);
    expect(isDrumTrackNode("x")).toBe(false);
  });
});

describe("normalizeStepIndices", () => {
  it("dedupes, sorts, rounds, and clamps to grid length", () => {
    expect(normalizeStepIndices([3.2, 3.8, 0, 0, 99, NaN, "x"], 16)).toEqual([0, 3, 4]);
  });

  it("returns empty for non-array or empty input", () => {
    expect(normalizeStepIndices(undefined, 8)).toEqual([]);
    expect(normalizeStepIndices([], 8)).toEqual([]);
  });
});

describe("trackFromDrumTrack", () => {
  const node = (props: Record<string, unknown>) => ({
    type: "element" as const,
    typeName: "DrumTrack" as const,
    props,
  });

  it("builds step booleans from indices and default velocity", () => {
    const t = trackFromDrumTrack(node({ name: "Hat", voice: "hat", steps: [0, 2, 15] }), 0, 16);
    expect(t.id).toBe("hat-0");
    expect(t.name).toBe("Hat");
    expect(t.voice).toBe("hat");
    expect(t.velocity).toBe(1);
    expect(t.muted).toBe(false);
    expect(t.locked).toBe(false);
    expect(t.steps.filter(Boolean).length).toBe(3);
    expect(t.steps[0]).toBe(true);
    expect(t.steps[2]).toBe(true);
    expect(t.steps[15]).toBe(true);
  });

  it("uses default track name when name missing", () => {
    const t = trackFromDrumTrack(node({ voice: "kick", steps: [] }), 2, 8);
    expect(t.name).toBe("Track 3");
  });

  it("prefers explicit sampleUrl over kit", () => {
    const t = trackFromDrumTrack(
      node({
        name: "K",
        voice: "kick",
        steps: [0],
        kit: "cr78",
        sampleUrl: "  https://x/y.mp3  ",
      }),
      0,
      16,
    );
    expect(t.sampleUrl).toBe("https://x/y.mp3");
  });

  it("maps known kit to hosted sample when no sampleUrl", () => {
    const t = trackFromDrumTrack(
      node({ name: "K", voice: "kick", steps: [0], kit: "cr78" }),
      0,
      16,
    );
    expect(t.sampleUrl).toMatch(/CR78\/kick\.mp3$/);
  });

  it("ignores whitespace-only sampleUrl and falls back to kit", () => {
    const t = trackFromDrumTrack(
      node({ name: "K", voice: "snare", steps: [], kit: "linn", sampleUrl: "   " }),
      0,
      16,
    );
    expect(t.sampleUrl).toMatch(/LINN\/snare\.mp3$/);
  });
});

describe("effectiveHarmonicScopeMax", () => {
  it("defaults to 24 when harmonics missing or NaN", () => {
    expect(effectiveHarmonicScopeMax(undefined, false)).toBe(24);
    expect(effectiveHarmonicScopeMax(Number.NaN, false)).toBe(24);
  });

  it("clamps to 1..64 when not streaming", () => {
    expect(effectiveHarmonicScopeMax(0.4, false)).toBe(1);
    expect(effectiveHarmonicScopeMax(80, false)).toBe(64);
    expect(effectiveHarmonicScopeMax(12.3, false)).toBe(12);
  });

  it("caps at 24 while streaming regardless of prop", () => {
    expect(effectiveHarmonicScopeMax(64, true)).toBe(24);
    expect(effectiveHarmonicScopeMax(undefined, true)).toBe(24);
  });
});
