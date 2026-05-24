import { describe, it, expect } from "vitest";
import { buildIndex, centroid, toFeatures } from "./cluster";
import type { Media } from "./types";

function m(id: string, lat?: number, lng?: number): Media {
  return { id, tripId: "t", dayKey: "2026-04-07", takenAt: 0, lat, lng,
    type: "photo", opfsPath: "o", thumbPath: "th" };
}

describe("toFeatures", () => {
  it("keeps only geo-tagged media", () => {
    const feats = toFeatures([m("a", 35, 139), m("b"), m("c", 36, 140)]);
    expect(feats).toHaveLength(2);
    expect(feats[0].geometry.coordinates).toEqual([139, 35]); // [lng, lat]
  });
});

describe("centroid", () => {
  it("averages geo-tagged coordinates", () => {
    const c = centroid([m("a", 10, 20), m("b", 30, 40), m("c")]);
    expect(c).toEqual({ lat: 20, lng: 30 });
  });

  it("returns null when nothing is geo-tagged", () => {
    expect(centroid([m("a")])).toBeNull();
  });
});

describe("buildIndex", () => {
  it("clusters nearby points and separates far ones at low zoom", () => {
    const index = buildIndex([
      m("a", 35.0, 139.0), m("b", 35.001, 139.001), // Tokyo-ish, together
      m("c", 48.85, 2.35), // Paris, alone
    ]);
    const clusters = index.getClusters([-180, -85, 180, 85], 3);
    // At world zoom we expect 2 groupings: Tokyo cluster + Paris point.
    expect(clusters.length).toBe(2);
  });
});
