import type { VoiceType } from "@/audio";
import { SAMPLE_KIT_IDS, sampleUrlForKit, type SampleKitId } from "@/presets";
import type { TrackState } from "@/store/beatStore";

/** Shape of a parsed OpenUI Lang element node, as seen inside slot props. */
export type ElementNodeLike = {
  type?: string;
  typeName?: string;
  props?: Record<string, unknown>;
  partial?: boolean;
};

/** Resolve a `target` (voice name or row index) to a live track id, or `null`. */
export function resolveTrackId(
  tracks: TrackState[],
  target: VoiceType | number,
): string | null {
  if (typeof target === "number" && Number.isInteger(target) && target >= 0) {
    return tracks[target]?.id ?? null;
  }
  if (typeof target === "string") {
    return tracks.find((t) => t.voice === target)?.id ?? null;
  }
  return null;
}

/** Narrow an unknown slot value to a parsed `DrumTrack` element node. */
export function isDrumTrackNode(value: unknown): value is ElementNodeLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ElementNodeLike).type === "element" &&
    (value as ElementNodeLike).typeName === "DrumTrack"
  );
}

/** Map model step output onto the integer grid (handles fractional "triplet" math). */
export function normalizeStepIndices(raw: unknown, stepCount: number): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const x of raw) {
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    const r = Math.round(x);
    if (r >= 0 && r < stepCount) set.add(r);
  }
  return [...set].sort((a, b) => a - b);
}

/** Convert one parsed `DrumTrack` node into a store {@link TrackState}. */
export function trackFromDrumTrack(
  node: ElementNodeLike,
  index: number,
  stepCount: number,
): TrackState {
  const name = String(node.props?.name ?? `Track ${index + 1}`);
  const voice = node.props?.voice as VoiceType;
  const stepIndices = normalizeStepIndices(node.props?.steps, stepCount);
  const velocity =
    typeof node.props?.velocity === "number" ? node.props.velocity : 1;

  const rawUrl = node.props?.sampleUrl;
  const kit = node.props?.kit as SampleKitId | undefined;
  let sampleUrl: string | undefined;
  if (typeof rawUrl === "string" && rawUrl.trim().length > 0) {
    sampleUrl = rawUrl.trim();
  } else if (kit && (SAMPLE_KIT_IDS as readonly string[]).includes(kit)) {
    sampleUrl = sampleUrlForKit(kit, voice);
  }

  return {
    id: `${voice}-${index}`,
    name,
    voice,
    muted: false,
    locked: false,
    velocity,
    steps: Array.from({ length: stepCount }, (_, i) => stepIndices.includes(i)),
    ...(sampleUrl ? { sampleUrl } : {}),
  };
}

/**
 * Max harmonic count passed to HarmonicScope: clamp 1–64, default 24, and cap at
 * 24 while OpenUI is streaming so partial parses do not trigger mismatched analyses.
 */
export function effectiveHarmonicScopeMax(
  harmonicsProp: number | undefined,
  isStreaming: boolean,
): number {
  const parsed =
    typeof harmonicsProp === "number" && !Number.isNaN(harmonicsProp)
      ? Math.min(64, Math.max(1, Math.round(harmonicsProp)))
      : 24;
  return isStreaming ? 24 : parsed;
}
