/** A trip the user is documenting. */
export interface Trip {
  id: string;
  name: string;
  /** Reverse-geocoded or user-entered dominant location. Optional in M1. */
  location?: string;
  /** Local date YYYY-MM-DD. */
  startDate: string;
  /** Local date YYYY-MM-DD. */
  endDate: string;
  createdAt: number; // epoch ms
}

export type MediaType = "photo" | "video";

/** One imported photo or video and its parsed metadata. */
export interface Media {
  id: string;
  tripId: string;
  /** Local date YYYY-MM-DD derived from takenAt; the day-grouping key. */
  dayKey: string;
  /** Epoch ms when the media was captured (from EXIF), or import time fallback. */
  takenAt: number;
  lat?: number;
  lng?: number;
  type: MediaType;
  /** OPFS path to the original blob. */
  opfsPath: string;
  /** OPFS path to the generated thumbnail. */
  thumbPath: string;
}

/** A rendered daily highlight reel. */
export interface Reel {
  id: string;
  tripId: string;
  dayKey: string;
  /** OPFS path to the rendered video. */
  opfsPath: string;
  musicId: string;
  createdAt: number; // epoch ms
  durationSec: number;
}
