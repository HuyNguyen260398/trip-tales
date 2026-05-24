import { describe, it, expect } from "vitest";
import { buildStoryboard, DEFAULT_REEL_OPTS } from "./storyboard";
import type { Media } from "../types";

function photo(id: string): Media {
  return { id, tripId: "t", dayKey: "2026-04-07", takenAt: Number(id),
    type: "photo", opfsPath: `${id}.jpg`, thumbPath: `${id}.t.jpg` };
}

describe("buildStoryboard", () => {
  it("creates one segment per photo in capture order", () => {
    const segs = buildStoryboard([photo("1"), photo("2"), photo("3")], DEFAULT_REEL_OPTS);
    expect(segs.map((s) => s.mediaId)).toEqual(["1", "2", "3"]);
  });

  it("excludes videos in v1 (photos only)", () => {
    const vid: Media = { ...photo("v"), type: "video" };
    const segs = buildStoryboard([photo("1"), vid], DEFAULT_REEL_OPTS);
    expect(segs.map((s) => s.mediaId)).toEqual(["1"]);
  });

  it("segments are contiguous and overlap by the crossfade amount", () => {
    const segs = buildStoryboard([photo("1"), photo("2")], DEFAULT_REEL_OPTS);
    // segment 2 starts crossfade seconds before segment 1 ends
    const overlap = segs[0].endSec - segs[1].startSec;
    expect(overlap).toBeCloseTo(DEFAULT_REEL_OPTS.crossfadeSec, 5);
  });

  it("total duration scales with photo count and stays near the per-photo budget", () => {
    const segs = buildStoryboard([photo("1"), photo("2"), photo("3")], DEFAULT_REEL_OPTS);
    const total = segs[segs.length - 1].endSec;
    // 3 photos * 3s, minus 2 overlaps * 0.5s = 8s
    expect(total).toBeCloseTo(8, 5);
  });

  it("assigns a deterministic alternating Ken-Burns direction", () => {
    const segs = buildStoryboard([photo("1"), photo("2")], DEFAULT_REEL_OPTS);
    expect(segs[0].zoomIn).not.toBe(segs[1].zoomIn);
  });
});
