import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "./db";
import { createTrip } from "./trips";
import { importFile, mediaByDay, listMediaByTrip } from "./media";

beforeEach(async () => {
  await db.trips.clear();
  await db.media.clear();
});

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

const deps = {
  parseExif: vi.fn(),
  makeThumbnail: vi.fn(async () => new Blob(["t"])),
  writeBlob: vi.fn(async (path: string) => path),
};

beforeEach(() => {
  deps.parseExif.mockReset();
  deps.makeThumbnail.mockClear();
  deps.writeBlob.mockClear();
});

describe("importFile", () => {
  it("derives dayKey from EXIF takenAt and stores GPS", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValue({
      takenAt: new Date(2026, 3, 7, 9, 0).getTime(),
      lat: 35, lng: 139,
    });
    const m = await importFile(trip.id, fileOf("a.jpg", "image/jpeg"), deps);
    expect(m.dayKey).toBe("2026-04-07");
    expect(m.lat).toBe(35);
    expect(m.type).toBe("photo");
    expect(deps.writeBlob).toHaveBeenCalledTimes(2); // original + thumb
  });

  it("falls back to import time when takenAt is missing", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValue({}); // stripped metadata
    const before = Date.now();
    const m = await importFile(trip.id, fileOf("b.jpg", "image/jpeg"), deps);
    expect(m.takenAt).toBeGreaterThanOrEqual(before);
    expect(m.lat).toBeUndefined();
  });

  it("detects video type from mime", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValue({});
    const m = await importFile(trip.id, fileOf("c.mov", "video/quicktime"), deps);
    expect(m.type).toBe("video");
  });
});

describe("mediaByDay", () => {
  it("groups a trip's media into ascending day buckets", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValueOnce({ takenAt: new Date(2026, 3, 8, 9).getTime() });
    deps.parseExif.mockResolvedValueOnce({ takenAt: new Date(2026, 3, 7, 9).getTime() });
    await importFile(trip.id, fileOf("d1.jpg", "image/jpeg"), deps);
    await importFile(trip.id, fileOf("d2.jpg", "image/jpeg"), deps);

    const groups = await mediaByDay(trip.id);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-04-07", "2026-04-08"]);
    expect(groups[0].items).toHaveLength(1);
    expect(await listMediaByTrip(trip.id)).toHaveLength(2);
  });
});
