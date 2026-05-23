import { db } from "./db";
import { newId } from "./id";
import { dayKeyFromEpoch } from "./dayKey";
import { parseExif as realParseExif } from "./exif";
import { makeThumbnail as realMakeThumbnail } from "./thumbnail";
import { writeBlob as realWriteBlob, deleteFile } from "./opfs";
import type { Media, MediaType } from "./types";

export interface ImportDeps {
  parseExif: typeof realParseExif;
  makeThumbnail: typeof realMakeThumbnail;
  writeBlob: typeof realWriteBlob;
}

const defaultDeps: ImportDeps = {
  parseExif: realParseExif,
  makeThumbnail: realMakeThumbnail,
  writeBlob: realWriteBlob,
};

function mediaType(file: File): MediaType {
  return file.type.startsWith("video/") ? "video" : "photo";
}

export async function importFile(
  tripId: string,
  file: File,
  deps: ImportDeps = defaultDeps
): Promise<Media> {
  const exif = await deps.parseExif(file);
  const takenAt = exif.takenAt ?? Date.now();
  const id = newId();
  const ext = file.name.split(".").pop() ?? "bin";

  const opfsPath = await deps.writeBlob(`${id}.${ext}`, file);
  const thumb = await deps.makeThumbnail(file);
  const thumbPath = await deps.writeBlob(`${id}.thumb.jpg`, thumb);

  const record: Media = {
    id,
    tripId,
    dayKey: dayKeyFromEpoch(takenAt),
    takenAt,
    lat: exif.lat,
    lng: exif.lng,
    type: mediaType(file),
    opfsPath,
    thumbPath,
  };
  await db.media.add(record);
  return record;
}

export async function importMedia(
  tripId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<Media[]> {
  const out: Media[] = [];
  for (let i = 0; i < files.length; i++) {
    out.push(await importFile(tripId, files[i]));
    onProgress?.(i + 1, files.length);
  }
  return out;
}

export function listMediaByTrip(tripId: string): Promise<Media[]> {
  return db.media.where("tripId").equals(tripId).sortBy("takenAt");
}

export interface DayGroup {
  dayKey: string;
  items: Media[];
}

export async function mediaByDay(tripId: string): Promise<DayGroup[]> {
  const all = await listMediaByTrip(tripId);
  const map = new Map<string, Media[]>();
  for (const m of all) {
    (map.get(m.dayKey) ?? map.set(m.dayKey, []).get(m.dayKey)!).push(m);
  }
  return [...map.keys()]
    .sort()
    .map((dayKey) => ({ dayKey, items: map.get(dayKey)! }));
}

export async function updateMedia(
  id: string,
  changes: Partial<Pick<Media, "takenAt" | "dayKey" | "lat" | "lng">>
): Promise<void> {
  const next = { ...changes };
  if (changes.takenAt !== undefined && changes.dayKey === undefined) {
    next.dayKey = dayKeyFromEpoch(changes.takenAt);
  }
  await db.media.update(id, next);
}

export async function deleteMedia(id: string): Promise<void> {
  const m = await db.media.get(id);
  if (!m) return;
  await deleteFile(m.opfsPath);
  await deleteFile(m.thumbPath);
  await db.media.delete(id);
}
