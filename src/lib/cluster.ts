import Supercluster from "supercluster";
import type { Media } from "./types";

export interface MediaPointProps {
  mediaId: string;
  thumbPath: string;
  dayKey: string;
}

export type MediaFeature = GeoJSON.Feature<GeoJSON.Point, MediaPointProps>;

/** GeoJSON point features for geo-tagged media only ([lng, lat] order). */
export function toFeatures(media: Media[]): MediaFeature[] {
  return media
    .filter((m): m is Media & { lat: number; lng: number } =>
      typeof m.lat === "number" && typeof m.lng === "number"
    )
    .map((m) => ({
      type: "Feature",
      properties: { mediaId: m.id, thumbPath: m.thumbPath, dayKey: m.dayKey },
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
    }));
}

export function buildIndex(media: Media[]): Supercluster<MediaPointProps> {
  const index = new Supercluster<MediaPointProps>({ radius: 60, maxZoom: 16 });
  index.load(toFeatures(media));
  return index;
}

export function centroid(media: Media[]): { lat: number; lng: number } | null {
  const geo = media.filter((m) => typeof m.lat === "number" && typeof m.lng === "number");
  if (geo.length === 0) return null;
  const lat = geo.reduce((s, m) => s + (m.lat as number), 0) / geo.length;
  const lng = geo.reduce((s, m) => s + (m.lng as number), 0) / geo.length;
  return { lat, lng };
}
