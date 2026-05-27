import type { Media } from "../types";

export interface VideoReelOptions {
  /** Trim each clip to at most this many seconds. */
  maxClipSec: number;
  /** Cap output height (px); width scales to keep aspect. */
  maxHeight: number;
}

export const DEFAULT_VIDEO_OPTS: VideoReelOptions = { maxClipSec: 5, maxHeight: 720 };

export interface ClipPart {
  mediaId: string;
  opfsPath: string;
  trimSec: number;
}

export interface ConcatPlan {
  hasPhotos: boolean;
  clips: ClipPart[];
  maxHeight: number;
}

/**
 * Decide the assembly order: the photo slideshow (rendered by the M4 pipeline)
 * comes first, then each video clip trimmed to the cap, in capture order.
 */
export function buildConcatPlan(media: Media[], opts: VideoReelOptions): ConcatPlan {
  const ordered = [...media].sort((a, b) => a.takenAt - b.takenAt);
  const clips: ClipPart[] = ordered
    .filter((m) => m.type === "video")
    .map((m) => ({ mediaId: m.id, opfsPath: m.opfsPath, trimSec: opts.maxClipSec }));
  return {
    hasPhotos: ordered.some((m) => m.type === "photo"),
    clips,
    maxHeight: opts.maxHeight,
  };
}
