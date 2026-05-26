import { db } from "./db";
import { newId } from "./id";
import { writeBlob as realWriteBlob, deleteFile } from "./opfs";
import type { Reel } from "./types";

export interface SaveReelInput {
  tripId: string;
  dayKey: string;
  musicId: string;
  durationSec: number;
  blob: Blob;
  ext: string;
}

export interface ReelDeps {
  writeBlob: typeof realWriteBlob;
}

const defaultDeps: ReelDeps = { writeBlob: realWriteBlob };

export async function saveReel(
  input: SaveReelInput,
  deps: ReelDeps = defaultDeps
): Promise<Reel> {
  const existing = await getReelForDay(input.tripId, input.dayKey);
  if (existing) {
    await deleteFile(existing.opfsPath).catch(() => {});
    await db.reels.delete(existing.id);
  }

  const id = newId();
  const opfsPath = await deps.writeBlob(`reel-${id}.${input.ext}`, input.blob);
  const reel: Reel = {
    id,
    tripId: input.tripId,
    dayKey: input.dayKey,
    opfsPath,
    musicId: input.musicId,
    createdAt: Date.now(),
    durationSec: input.durationSec,
  };
  await db.reels.add(reel);
  return reel;
}

export function listReelsByTrip(tripId: string): Promise<Reel[]> {
  return db.reels.where("tripId").equals(tripId).toArray();
}

export async function getReelForDay(tripId: string, dayKey: string): Promise<Reel | undefined> {
  return db.reels.where("[tripId+dayKey]").equals([tripId, dayKey]).first();
}

export async function deleteReel(id: string): Promise<void> {
  const reel = await db.reels.get(id);
  if (!reel) return;
  await deleteFile(reel.opfsPath).catch(() => {});
  await db.reels.delete(id);
}
