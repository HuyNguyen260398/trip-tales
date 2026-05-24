import type { Media } from "../types";

export interface ReelOptions {
  perPhotoSec: number;
  crossfadeSec: number;
}

export const DEFAULT_REEL_OPTS: ReelOptions = { perPhotoSec: 3, crossfadeSec: 0.5 };

export interface Segment {
  mediaId: string;
  opfsPath: string;
  startSec: number;
  endSec: number;
  /** true = Ken-Burns zooms in over the segment, false = zooms out. */
  zoomIn: boolean;
}

export function buildStoryboard(media: Media[], opts: ReelOptions): Segment[] {
  const photos = media.filter((m) => m.type === "photo");
  const { perPhotoSec, crossfadeSec } = opts;
  const step = perPhotoSec - crossfadeSec;
  return photos.map((m, i) => {
    const startSec = i === 0 ? 0 : i * step;
    return {
      mediaId: m.id,
      opfsPath: m.opfsPath,
      startSec,
      endSec: startSec + perPhotoSec,
      zoomIn: i % 2 === 0,
    };
  });
}

export function storyboardDuration(segs: Segment[]): number {
  return segs.length ? segs[segs.length - 1].endSec : 0;
}
