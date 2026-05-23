import Dexie, { type Table } from "dexie";
import type { Trip, Media, Reel } from "./types";

export class TriptalesDB extends Dexie {
  trips!: Table<Trip, string>;
  media!: Table<Media, string>;
  reels!: Table<Reel, string>;

  constructor() {
    super("triptales");
    this.version(1).stores({
      trips: "id, createdAt, startDate",
      media: "id, tripId, dayKey, [tripId+dayKey], takenAt",
      reels: "id, tripId, [tripId+dayKey]",
    });
  }
}

export const db = new TriptalesDB();
