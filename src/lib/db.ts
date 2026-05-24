import Dexie, { type Table } from "dexie";
import type { Trip, Media, Reel } from "./types";

/** A cached reverse-geocode result, keyed by a rounded "lat,lng" coordinate. */
export interface GeoCacheEntry {
  /** rounded "lat,lng" key. */
  key: string;
  label: string;
  cachedAt: number;
}

export class TriptalesDB extends Dexie {
  trips!: Table<Trip, string>;
  media!: Table<Media, string>;
  reels!: Table<Reel, string>;
  geocache!: Table<GeoCacheEntry, string>;

  constructor() {
    super("triptales");
    this.version(1).stores({
      trips: "id, createdAt, startDate",
      media: "id, tripId, dayKey, [tripId+dayKey], takenAt",
      reels: "id, tripId, [tripId+dayKey]",
    });
    this.version(2).stores({
      geocache: "key, cachedAt",
    });
  }
}

export const db = new TriptalesDB();
