import { describe, it, expect } from "vitest";
import { buildConcatPlan, DEFAULT_VIDEO_OPTS } from "./concatPlan";
import type { Media } from "../types";

function item(id: string, type: "photo" | "video"): Media {
  return { id, tripId: "t", dayKey: "d", takenAt: Number(id.replace(/\D/g, "")),
    type, opfsPath: `${id}.bin`, thumbPath: `${id}.t` };
}

describe("buildConcatPlan", () => {
  it("puts the photo slideshow first, then video clips in capture order", () => {
    const media = [item("p1", "photo"), item("v2", "video"), item("p3", "photo"), item("v4", "video")];
    const plan = buildConcatPlan(media, DEFAULT_VIDEO_OPTS);
    expect(plan.hasPhotos).toBe(true);
    expect(plan.clips.map((c) => c.mediaId)).toEqual(["v2", "v4"]);
  });

  it("caps each clip to maxClipSec", () => {
    const plan = buildConcatPlan([item("v1", "video")], { ...DEFAULT_VIDEO_OPTS, maxClipSec: 4 });
    expect(plan.clips[0].trimSec).toBe(4);
  });

  it("omits the photo part when there are no photos", () => {
    const plan = buildConcatPlan([item("v1", "video")], DEFAULT_VIDEO_OPTS);
    expect(plan.hasPhotos).toBe(false);
  });

  it("carries resolution + clip caps through", () => {
    const plan = buildConcatPlan([item("v1", "video")], { maxClipSec: 5, maxHeight: 720 });
    expect(plan.maxHeight).toBe(720);
  });
});
