import { describe, it, expect, beforeEach, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { db } from "./db";
import { createTrip } from "./trips";
import { buildTripManifest, exportTrip } from "./export";

vi.mock("./opfs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./opfs")>();
  return {
    ...actual,
    readBlob: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])),
  };
});

beforeEach(async () => {
  await db.trips.clear();
  await db.media.clear();
  await db.reels.clear();
});

describe("buildTripManifest", () => {
  it("captures trip, per-day media, and reels", async () => {
    const trip = await createTrip({ name: "Tokyo", startDate: "2026-04-01", endDate: "2026-04-03" });
    await db.media.bulkAdd([
      { id: "m1", tripId: trip.id, dayKey: "2026-04-01", takenAt: 1, lat: 35, lng: 139, type: "photo", opfsPath: "m1.jpg", thumbPath: "m1.t" },
      { id: "m2", tripId: trip.id, dayKey: "2026-04-02", takenAt: 2, type: "photo", opfsPath: "m2.jpg", thumbPath: "m2.t" },
    ]);
    await db.reels.add({ id: "r1", tripId: trip.id, dayKey: "2026-04-01", opfsPath: "reel-r1.mp4", musicId: "sunrise", createdAt: 1, durationSec: 8 });

    const manifest = await buildTripManifest(trip.id);
    expect(manifest.trip.name).toBe("Tokyo");
    expect(manifest.version).toBe(1);
    expect(manifest.media).toHaveLength(2);
    expect(manifest.reels).toHaveLength(1);
    expect(manifest.days).toEqual(["2026-04-01", "2026-04-02"]);
  });

  it("throws for an unknown trip", async () => {
    await expect(buildTripManifest("nope")).rejects.toThrow();
  });
});

describe("exportTrip", () => {
  it("produces a zip containing manifest, reels, and media files", async () => {
    const trip = await createTrip({ name: "Kyoto", startDate: "2026-04-01", endDate: "2026-04-02" });
    await db.media.add({
      id: "m1",
      tripId: trip.id,
      dayKey: "2026-04-01",
      takenAt: 1,
      lat: 35,
      lng: 139,
      type: "photo",
      opfsPath: "photo-m1.jpg",
      thumbPath: "photo-m1.t",
    });
    await db.reels.add({
      id: "r1",
      tripId: trip.id,
      dayKey: "2026-04-01",
      opfsPath: "reel-r1.mp4",
      musicId: "sunrise",
      createdAt: 1,
      durationSec: 8,
    });

    const zipBlob = await exportTrip(trip.id);
    const bytes = new Uint8Array(await zipBlob.arrayBuffer());
    const files = unzipSync(bytes);

    const keys = Object.keys(files).sort();
    expect(keys).toEqual(
      ["manifest.json", "media/2026-04-01/photo-m1.jpg", "reels/2026-04-01-r1.mp4"].sort(),
    );

    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.trip.name).toBe("Kyoto");
  });
});
