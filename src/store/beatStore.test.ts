import { beforeEach, describe, expect, it } from "vitest";
import type { TrackState } from "./beatStore";
import {
  kitSequenceSignature,
  mergeBeatPatternTracks,
  reconcileStepsToLength,
  reconcileTracksStepLengths,
  resetBeatStore,
  totalSteps,
  useBeatStore,
} from "./beatStore";

describe("totalSteps", () => {
  it("multiplies resolution by bars", () => {
    expect(totalSteps({ resolution: 16, bars: 1 })).toBe(16);
    expect(totalSteps({ resolution: 16, bars: 2 })).toBe(32);
    expect(totalSteps({ resolution: 4, bars: 4 })).toBe(16);
  });
});

describe("reconcileStepsToLength", () => {
  it("returns same array when length matches", () => {
    const s = [true, false, true];
    expect(reconcileStepsToLength(s, 3)).toEqual(s);
  });

  it("truncates when longer than target", () => {
    expect(reconcileStepsToLength([true, false, true, false], 2)).toEqual([true, false]);
  });

  it("pads with false when shorter than target", () => {
    expect(reconcileStepsToLength([true], 4)).toEqual([true, false, false, false]);
  });
});

describe("reconcileTracksStepLengths", () => {
  it("reconciles every track's steps", () => {
    const tracks: TrackState[] = [
      {
        id: "1",
        name: "A",
        voice: "kick",
        muted: false,
        velocity: 1,
        steps: [true, false],
      },
      {
        id: "2",
        name: "B",
        voice: "snare",
        muted: true,
        velocity: 0.5,
        steps: [false, false, false, false],
      },
    ];
    const out = reconcileTracksStepLengths(tracks, 3);
    expect(out[0]!.steps).toEqual([true, false, false]);
    expect(out[1]!.steps).toEqual([false, false, false]);
  });
});

describe("mergeBeatPatternTracks", () => {
  const step16 = Array.from({ length: 16 }, () => false);

  it("returns only incoming when nothing is locked", () => {
    const prev = [
      {
        id: "kick-0",
        name: "Kick",
        voice: "kick" as const,
        muted: false,
        velocity: 1,
        steps: [...step16],
      },
    ];
    const incoming = [
      {
        id: "kick-0",
        name: "Kick",
        voice: "kick" as const,
        muted: false,
        velocity: 1,
        locked: false as const,
        steps: step16.map((_, i) => i === 0),
      },
    ];
    const out = mergeBeatPatternTracks(prev, incoming);
    expect(out).toEqual(incoming);
  });

  it("keeps locked rows first and reassigns colliding incoming ids", () => {
    const prev = [
      {
        id: "kick-0",
        name: "Locked kick",
        voice: "kick" as const,
        muted: false,
        velocity: 0.8,
        locked: true,
        steps: step16.map((_, i) => i === 4),
      },
      {
        id: "snare-0",
        name: "Snare",
        voice: "snare" as const,
        muted: false,
        velocity: 1,
        steps: [...step16],
      },
    ];
    const incoming = [
      {
        id: "kick-0",
        name: "New kick",
        voice: "kick" as const,
        muted: false,
        velocity: 1,
        locked: false as const,
        steps: step16.map((_, i) => i % 4 === 0),
      },
      {
        id: "hat-0",
        name: "Hat",
        voice: "hat" as const,
        muted: false,
        velocity: 0.7,
        locked: false as const,
        steps: [...step16],
      },
    ];
    const out = mergeBeatPatternTracks(prev, incoming);
    expect(out).toHaveLength(3);
    expect(out[0]!.id).toBe("kick-0");
    expect(out[0]!.locked).toBe(true);
    expect(out[0]!.steps[4]).toBe(true);
    expect(out[1]!.id).toBe("kick-x1");
    expect(out[1]!.voice).toBe("kick");
    expect(out[1]!.locked).toBe(false);
    expect(out[2]!.id).toBe("hat-0");
  });

  it("increments disambiguation suffix until id is unique", () => {
    const prev = [
      {
        id: "kick-0",
        name: "A",
        voice: "kick" as const,
        muted: false,
        velocity: 1,
        locked: true,
        steps: [...step16],
      },
      {
        id: "kick-x1",
        name: "B",
        voice: "kick" as const,
        muted: false,
        velocity: 1,
        locked: true,
        steps: [...step16],
      },
    ];
    const incoming = [
      {
        id: "kick-0",
        name: "C",
        voice: "kick" as const,
        muted: false,
        velocity: 1,
        locked: false as const,
        steps: [...step16],
      },
    ];
    const out = mergeBeatPatternTracks(prev, incoming);
    expect(out).toHaveLength(3);
    expect(out[2]!.id).toBe("kick-x2");
  });
});

describe("kitSequenceSignature", () => {
  it("encodes steps, velocity, and mute in a stable string", () => {
    const a: TrackState = {
      id: "k",
      name: "Kick",
      voice: "kick",
      muted: false,
      velocity: 1,
      steps: [true, false, true],
    };
    expect(kitSequenceSignature([a])).toBe("k:101:1:0");
    expect(kitSequenceSignature([{ ...a, muted: true }])).toBe("k:101:1:1");
  });
});

describe("useBeatStore actions", () => {
  beforeEach(() => {
    resetBeatStore();
  });

  it("clamps BPM and filter on setters", () => {
    useBeatStore.getState().setBpm(88.2);
    expect(useBeatStore.getState().bpm).toBe(88);
    useBeatStore.getState().setFilterFreq(10);
    expect(useBeatStore.getState().filterFreq).toBe(60);
    useBeatStore.getState().setFilterFreq(999999);
    expect(useBeatStore.getState().filterFreq).toBe(20000);
  });

  it("clamps master volume", () => {
    useBeatStore.getState().setMasterVolume(-1);
    expect(useBeatStore.getState().masterVolume).toBe(0);
    useBeatStore.getState().setMasterVolume(2);
    expect(useBeatStore.getState().masterVolume).toBe(1);
  });

  it("toggleStep ignores out-of-range steps", () => {
    const id = useBeatStore.getState().tracks[0]!.id;
    const before = [...useBeatStore.getState().tracks[0]!.steps];
    useBeatStore.getState().toggleStep(id, -1);
    useBeatStore.getState().toggleStep(id, 99);
    expect(useBeatStore.getState().tracks[0]!.steps).toEqual(before);
  });

  it("toggleStep flips one cell", () => {
    const id = useBeatStore.getState().tracks[0]!.id;
    const wasOn = useBeatStore.getState().tracks[0]!.steps[0];
    useBeatStore.getState().toggleStep(id, 0);
    expect(useBeatStore.getState().tracks[0]!.steps[0]).toBe(!wasOn);
  });

  it("clearTrack zeroes steps only on that row", () => {
    const id = useBeatStore.getState().tracks[0]!.id;
    useBeatStore.getState().clearTrack(id);
    expect(useBeatStore.getState().tracks[0]!.steps.every((x) => !x)).toBe(true);
    expect(useBeatStore.getState().tracks[1]!.steps.some((x) => x)).toBe(true);
  });

  it("clearAllTracks clears every row's steps but keeps velocity and mute", () => {
    useBeatStore.getState().toggleMute(useBeatStore.getState().tracks[0]!.id);
    useBeatStore.getState().setVelocity(useBeatStore.getState().tracks[1]!.id, 0.25);
    useBeatStore.getState().clearAllTracks();
    for (const t of useBeatStore.getState().tracks) {
      expect(t.steps.every((x) => !x)).toBe(true);
    }
    expect(useBeatStore.getState().tracks[0]!.muted).toBe(true);
    expect(useBeatStore.getState().tracks[1]!.velocity).toBe(0.25);
  });

  it("setTracks pads tracks to current grid length", () => {
    const short: TrackState = {
      id: "x",
      name: "X",
      voice: "tom",
      muted: false,
      velocity: 1,
      steps: [true, false],
    };
    useBeatStore.getState().setTracks([short]);
    expect(useBeatStore.getState().tracks[0]!.steps.length).toBe(16);
    expect(useBeatStore.getState().tracks[0]!.steps.slice(0, 2)).toEqual([true, false]);
    expect(useBeatStore.getState().tracks[0]!.steps.slice(2).every((v) => !v)).toBe(true);
  });

  it("setBars resizes all step rows", () => {
    useBeatStore.getState().setBars(2);
    expect(useBeatStore.getState().bars).toBe(2);
    expect(useBeatStore.getState().tracks.every((t) => t.steps.length === 32)).toBe(true);
  });

  it("preserves selection when still valid after setTracks", () => {
    const firstId = useBeatStore.getState().tracks[0]!.id;
    useBeatStore.getState().setSelectedTrackId(firstId);
    useBeatStore.getState().setTracks(
      useBeatStore.getState().tracks.map((t) => ({ ...t, id: t.id })),
    );
    expect(useBeatStore.getState().selectedTrackId).toBe(firstId);
  });

  it("falls back to first track when selection id missing after setTracks", () => {
    useBeatStore.getState().setSelectedTrackId("ghost");
    useBeatStore.getState().setTracks([
      {
        id: "only",
        name: "O",
        voice: "kick",
        muted: false,
        velocity: 1,
        steps: Array.from({ length: 16 }, () => false),
      },
    ]);
    expect(useBeatStore.getState().selectedTrackId).toBe("only");
  });

  it("toggleTrackLock flips locked flag", () => {
    const id = useBeatStore.getState().tracks[0]!.id;
    expect(useBeatStore.getState().tracks[0]!.locked).toBeFalsy();
    useBeatStore.getState().toggleTrackLock(id);
    expect(useBeatStore.getState().tracks[0]!.locked).toBe(true);
    useBeatStore.getState().toggleTrackLock(id);
    expect(useBeatStore.getState().tracks[0]!.locked).toBe(false);
  });

  it("applyPreset clears row locks", () => {
    const id = useBeatStore.getState().tracks[0]!.id;
    useBeatStore.getState().toggleTrackLock(id);
    expect(useBeatStore.getState().tracks[0]!.locked).toBe(true);
    useBeatStore.getState().applyPreset(
      [
        {
          id: "kick",
          name: "Kick",
          voice: "kick",
          muted: false,
          velocity: 1,
          locked: true,
          steps: Array.from({ length: 16 }, (_, i) => i === 0),
        },
      ],
      99,
    );
    expect(useBeatStore.getState().tracks[0]!.locked).toBe(false);
    expect(useBeatStore.getState().bpm).toBe(99);
  });
});
