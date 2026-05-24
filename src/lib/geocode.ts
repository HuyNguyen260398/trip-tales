export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
}

/** Human label like "Tokyo, Japan" from a Nominatim address object. */
export function labelFromAddress(addr: NominatimAddress | undefined): string | null {
  if (!addr) return null;
  const place = addr.city ?? addr.town ?? addr.village ?? addr.state;
  if (place && addr.country) return `${place}, ${addr.country}`;
  return place ?? addr.country ?? null;
}

/** Raw Nominatim reverse geocode. Throws on network/HTTP error. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // Nominatim's reverse endpoint takes `lat` and `lon` (not `lng`); zoom=10 ≈ city.
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10` +
    `&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  return labelFromAddress(data.address);
}
