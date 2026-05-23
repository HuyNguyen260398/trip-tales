import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  createTrip,
  listTrips,
  getTrip,
  updateTrip,
  deleteTrip,
} from "./trips";

beforeEach(async () => {
  await db.trips.clear();
  await db.media.clear();
  await db.reels.clear();
});

describe("trips CRUD", () => {
  it("creates a trip with an id and createdAt", async () => {
    const trip = await createTrip({
      name: "Tokyo",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
    });
    expect(trip.id).toBeTruthy();
    expect(trip.createdAt).toBeGreaterThan(0);
    expect(await getTrip(trip.id)).toMatchObject({ name: "Tokyo" });
  });

  it("lists trips newest-first", async () => {
    await createTrip({ name: "A", startDate: "2026-01-01", endDate: "2026-01-02" });
    await createTrip({ name: "B", startDate: "2026-02-01", endDate: "2026-02-02" });
    const trips = await listTrips();
    expect(trips.map((t) => t.name)).toEqual(["B", "A"]);
  });

  it("updates a trip", async () => {
    const t = await createTrip({ name: "Old", startDate: "2026-01-01", endDate: "2026-01-02" });
    await updateTrip(t.id, { name: "New" });
    expect((await getTrip(t.id))?.name).toBe("New");
  });

  it("deletes a trip and its media + reels", async () => {
    const t = await createTrip({ name: "Gone", startDate: "2026-01-01", endDate: "2026-01-02" });
    await db.media.add({
      id: "m1", tripId: t.id, dayKey: "2026-01-01", takenAt: 0,
      type: "photo", opfsPath: "p", thumbPath: "tp",
    });
    await db.reels.add({
      id: "r1", tripId: t.id, dayKey: "2026-01-01", opfsPath: "reel.webm",
      musicId: "m1", createdAt: 0, durationSec: 30,
    });
    await deleteTrip(t.id);
    expect(await getTrip(t.id)).toBeUndefined();
    expect(await db.media.where("tripId").equals(t.id).count()).toBe(0);
    expect(await db.reels.where("tripId").equals(t.id).count()).toBe(0);
  });
});
