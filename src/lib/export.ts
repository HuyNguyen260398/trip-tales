import { zipSync, type Zippable } from "fflate";
import { db } from "./db";
import { listMediaByTrip } from "./media";
import { listReelsByTrip } from "./reels";
import { readBlob } from "./opfs";
import type { Media, Reel, Trip } from "./types";

export interface TripManifest {
  version: 1;
  exportedAt: number;
  trip: Trip;
  days: string[];
  media: Media[];
  reels: Reel[];
}

/** Gather a trip's records into the manifest that defines the export ("album"). */
export async function buildTripManifest(tripId: string): Promise<TripManifest> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const media = await listMediaByTrip(tripId);
  const reels = await listReelsByTrip(tripId);
  const days = [...new Set(media.map((m) => m.dayKey))].sort();
  return { version: 1, exportedAt: Date.now(), trip, days, media, reels };
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Build a downloadable zip: manifest.json + every reel + original media blob.
 * This is the durable artifact users keep, since web storage is best-effort.
 */
export async function exportTrip(tripId: string): Promise<Blob> {
  const manifest = await buildTripManifest(tripId);
  const files: Zippable = {
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  };

  for (const reel of manifest.reels) {
    files[`reels/${reel.dayKey}-${reel.id}.mp4`] = await blobToBytes(await readBlob(reel.opfsPath));
  }
  for (const m of manifest.media) {
    const name = m.opfsPath.split("/").pop() ?? `${m.id}.bin`;
    files[`media/${m.dayKey}/${name}`] = await blobToBytes(await readBlob(m.opfsPath));
  }

  const zipped = zipSync(files, { level: 0 }); // store-only: media is already compressed
  return new Blob([zipped], { type: "application/zip" });
}
