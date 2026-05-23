import { db } from "./db";
import { newId } from "./id";
import type { Trip } from "./types";

export type NewTripInput = Pick<Trip, "name" | "startDate" | "endDate"> &
  Partial<Pick<Trip, "location">>;

/** Monotonically-increasing timestamp: guarantees ordering even when two
 *  trips are created within the same millisecond (common in tests). */
let _lastCreatedAt = 0;
function monotonicNow(): number {
  const now = Date.now();
  _lastCreatedAt = now > _lastCreatedAt ? now : _lastCreatedAt + 1;
  return _lastCreatedAt;
}

export async function createTrip(input: NewTripInput): Promise<Trip> {
  const trip: Trip = { id: newId(), createdAt: monotonicNow(), ...input };
  await db.trips.add(trip);
  return trip;
}

export function listTrips(): Promise<Trip[]> {
  // newest-first
  return db.trips.orderBy("createdAt").reverse().toArray();
}

export function getTrip(id: string): Promise<Trip | undefined> {
  return db.trips.get(id);
}

export async function updateTrip(
  id: string,
  changes: Partial<Omit<Trip, "id" | "createdAt">>
): Promise<void> {
  await db.trips.update(id, changes);
}

export async function deleteTrip(id: string): Promise<void> {
  // Cascade: remove the trip's media and reels too (records only; OPFS
  // blob cleanup is handled in M2/M6 where OPFS helpers exist).
  await db.transaction("rw", db.trips, db.media, db.reels, async () => {
    await db.media.where("tripId").equals(id).delete();
    await db.reels.where("tripId").equals(id).delete();
    await db.trips.delete(id);
  });
}
