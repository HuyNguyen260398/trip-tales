import { db } from "./db";
import { reverseGeocode } from "./geocode";

/** Round to 3 dp (~100 m) so nearby points reuse one cache entry + one API call. */
export function geoKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/**
 * Reverse-geocode with a persistent cache. Returns null on failure so callers
 * fall back to a manual name (Nominatim is rate-limited and best-effort).
 */
export async function reverseGeocodeCached(lat: number, lng: number): Promise<string | null> {
  const key = geoKey(lat, lng);
  const hit = await db.geocache.get(key);
  if (hit) return hit.label;
  try {
    const label = await reverseGeocode(lat, lng);
    if (label) {
      await db.geocache.put({ key, label, cachedAt: Date.now() });
    }
    return label;
  } catch {
    return null;
  }
}
