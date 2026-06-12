import { describe, expect, it } from "vitest";
import { PRESETS, SAMPLE_KIT_IDS, getPreset, sampleUrlForKit } from "./presets";

describe("SAMPLE_KIT_IDS", () => {
  it("lists the three hosted kits", () => {
    expect(SAMPLE_KIT_IDS).toEqual(["cr78", "acoustic", "linn"]);
  });
});

describe("sampleUrlForKit", () => {
  it("returns a URL for each kit and voice combination we ship", () => {
    for (const kit of SAMPLE_KIT_IDS) {
      for (const voice of ["kick", "snare", "hat", "openhat", "clap", "tom"] as const) {
        const url = sampleUrlForKit(kit, voice);
        expect(url).toBeDefined();
        expect(url as string).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("getPreset", () => {
  it("finds presets by id and returns undefined for unknown ids", () => {
    expect(getPreset("fourfloor")?.name).toBe("Four on the Floor");
    expect(getPreset("cr78")?.tracks.length).toBeGreaterThan(0);
    expect(getPreset("nope")).toBeUndefined();
  });

  it("keeps unique preset ids", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
