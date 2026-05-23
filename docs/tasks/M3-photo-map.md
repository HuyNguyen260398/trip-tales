# M3 — Photo Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a trip's GPS-tagged media on a clustered MapLibre map (OSM tiles, no token); tap a cluster to zoom, tap a pin to preview the photo; reverse-geocode the trip's dominant location to suggest a name with manual override.

**Architecture:** A pure `supercluster` index built from the trip's geo-tagged media drives the markers; the React layer just renders MapLibre and asks the index for clusters at the current zoom/bounds. Reverse geocoding goes through a cached, rate-limited `geocode` module (Nominatim) whose cache lives in a small Dexie table so we never re-hit the API for a coordinate we've seen. Name suggestion = reverse-geocode the centroid of the trip's points; the user can always override.

**Tech Stack:** maplibre-gl, supercluster, Nominatim (OSM), Dexie (geocode cache), Vitest.

**Done when:** the map mirrors the feel of the iOS Photos map for your real trip, and the suggested trip name reflects the dominant location.

---

## File Structure

- `src/lib/geocache.ts` — Dexie table (v2 upgrade) + cached `reverseGeocode`
- `src/lib/geocode.ts` — raw Nominatim fetch + label extraction
- `src/lib/geocode.test.ts`
- `src/lib/cluster.ts` — `buildIndex`, `clustersInView`, `centroid`
- `src/lib/cluster.test.ts`
- `src/components/PhotoMap.tsx` — MapLibre map + cluster/pin layers
- `src/components/MediaPreview.tsx` — full-size single-photo overlay
- `src/components/TripNameSuggest.tsx` — "Name this trip <X>?" with override
- `src/app/map/page.tsx` — `/map?trip=<id>` route
- Modify: `src/app/trip/page.tsx` — add a "Map" link + name suggestion

---

## Task 1: Install map deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install maplibre-gl supercluster
npm install -D @types/supercluster
```

- [ ] **Step 2: Import MapLibre CSS once**

In `src/app/layout.tsx`, add near the top with the other imports:

```tsx
import "maplibre-gl/dist/maplibre-gl.css";
```

- [ ] **Step 3: Verify build; commit**

```bash
npm run build
git add package.json package-lock.json src/app/layout.tsx
git commit -m "chore: add maplibre-gl + supercluster"
```

---

## Task 2: Clustering logic (TDD)

**Files:**
- Create: `src/lib/cluster.ts`, `src/lib/cluster.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cluster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildIndex, centroid, toFeatures } from "./cluster";
import type { Media } from "./types";

function m(id: string, lat?: number, lng?: number): Media {
  return { id, tripId: "t", dayKey: "2026-04-07", takenAt: 0, lat, lng,
    type: "photo", opfsPath: "o", thumbPath: "th" };
}

describe("toFeatures", () => {
  it("keeps only geo-tagged media", () => {
    const feats = toFeatures([m("a", 35, 139), m("b"), m("c", 36, 140)]);
    expect(feats).toHaveLength(2);
    expect(feats[0].geometry.coordinates).toEqual([139, 35]); // [lng, lat]
  });
});

describe("centroid", () => {
  it("averages geo-tagged coordinates", () => {
    const c = centroid([m("a", 10, 20), m("b", 30, 40), m("c")]);
    expect(c).toEqual({ lat: 20, lng: 30 });
  });

  it("returns null when nothing is geo-tagged", () => {
    expect(centroid([m("a")])).toBeNull();
  });
});

describe("buildIndex", () => {
  it("clusters nearby points and separates far ones at low zoom", () => {
    const index = buildIndex([
      m("a", 35.0, 139.0), m("b", 35.001, 139.001), // Tokyo-ish, together
      m("c", 48.85, 2.35), // Paris, alone
    ]);
    const clusters = index.getClusters([-180, -85, 180, 85], 3);
    // At world zoom we expect 2 groupings: Tokyo cluster + Paris point.
    expect(clusters.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/lib/cluster.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/cluster.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
npx vitest run src/lib/cluster.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cluster.ts src/lib/cluster.test.ts
git commit -m "feat: supercluster index + centroid for photo map (TDD)"
```

---

## Task 3: Geocode cache table (Dexie v2)

**Files:**
- Modify: `src/lib/db.ts`
- Create: `src/lib/geocache.ts`

- [ ] **Step 1: Add the cache table as schema version 2**

In `src/lib/db.ts`, add the table type and a `version(2)` upgrade (keep `version(1)`
intact — Dexie applies upgrades in order):

```ts
import type { Trip, Media, Reel } from "./types";

export interface GeoCacheEntry {
  /** rounded "lat,lng" key. */
  key: string;
  label: string;
  cachedAt: number;
}
```

Add `geocache!: Table<GeoCacheEntry, string>;` to the class fields, and after the
existing `this.version(1).stores({...})`:

```ts
this.version(2).stores({
  geocache: "key, cachedAt",
});
```

- [ ] **Step 2: Verify build; commit**

```bash
npm run build
git add src/lib/db.ts
git commit -m "feat: add geocache table (Dexie v2)"
```

---

## Task 4: Nominatim geocoding with cache (TDD)

**Files:**
- Create: `src/lib/geocode.ts`, `src/lib/geocache.ts`, `src/lib/geocode.test.ts`

- [ ] **Step 1: Write the failing tests (mock fetch + cache)**

Create `src/lib/geocode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "./db";
import { reverseGeocodeCached, geoKey } from "./geocache";

beforeEach(async () => {
  await db.geocache.clear();
  vi.restoreAllMocks();
});

describe("geoKey", () => {
  it("rounds coordinates to ~100m so nearby points share a cache entry", () => {
    expect(geoKey(35.681236, 139.767125)).toBe(geoKey(35.681244, 139.767180));
  });
});

describe("reverseGeocodeCached", () => {
  it("calls Nominatim once then serves from cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ address: { city: "Tokyo", country: "Japan" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const a = await reverseGeocodeCached(35.68, 139.76);
    const b = await reverseGeocodeCached(35.68, 139.76);

    expect(a).toBe("Tokyo, Japan");
    expect(b).toBe("Tokyo, Japan");
    expect(fetchMock).toHaveBeenCalledTimes(1); // second hit was cached
  });

  it("returns null on network failure (caller falls back to manual name)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await reverseGeocodeCached(1, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/lib/geocode.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the raw geocoder**

Create `src/lib/geocode.ts`:

```ts
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
```

- [ ] **Step 4: Implement the cached wrapper**

Create `src/lib/geocache.ts`:

```ts
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
```

- [ ] **Step 5: Run to verify it passes**

Run:
```bash
npx vitest run src/lib/geocode.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/geocode.ts src/lib/geocache.ts src/lib/geocode.test.ts
git commit -m "feat: cached Nominatim reverse geocoding (TDD)"
```

---

## Task 5: MediaPreview overlay

**Files:**
- Create: `src/components/MediaPreview.tsx`

- [ ] **Step 1: Implement (full-size original from OPFS)**

Create `src/components/MediaPreview.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { objectUrl } from "@/lib/opfs";

export default function MediaPreview({
  thumbOrPath,
  onClose,
}: {
  thumbOrPath: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let u: string | null = null;
    objectUrl(thumbOrPath).then((x) => {
      u = x;
      setUrl(x);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [thumbOrPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build; commit**

```bash
npm run build
git add src/components/MediaPreview.tsx
git commit -m "feat: full-size media preview overlay"
```

---

## Task 6: PhotoMap component (MapLibre + clusters)

**Files:**
- Create: `src/components/PhotoMap.tsx`

> MapLibre rendering can't be unit-tested in jsdom; the clustering math behind it
> is already covered (Task 2). Verified here by build + the M3 manual check.

- [ ] **Step 1: Implement**

Create `src/components/PhotoMap.tsx`. Uses the raster OSM style (token-free) and
GeoJSON cluster layers fed by the supercluster features.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listMediaByTrip } from "@/lib/media";
import { toFeatures, centroid } from "@/lib/cluster";
import MediaPreview from "./MediaPreview";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function PhotoMap({ tripId }: { tripId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const media = useLiveQuery(() => listMediaByTrip(tripId), [tripId]);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1,
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !media) return;

    const features = toFeatures(media);
    const apply = () => {
      const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      if (map.getSource("media")) {
        (map.getSource("media") as maplibregl.GeoJSONSource).setData(data);
        return;
      }
      map.addSource("media", { type: "geojson", data, cluster: true, clusterRadius: 60 });
      map.addLayer({
        id: "clusters", type: "circle", source: "media", filter: ["has", "point_count"],
        paint: { "circle-color": "#fff", "circle-radius": 18, "circle-opacity": 0.85 },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: "media", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13 },
      });
      map.addLayer({
        id: "points", type: "circle", source: "media", filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": "#3b82f6", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
      // Tap a cluster → zoom in.
      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const id = f.properties?.cluster_id;
        (map.getSource("media") as maplibregl.GeoJSONSource)
          .getClusterExpansionZoom(id)
          .then((z) => map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
      });
      // Tap a pin → preview.
      map.on("click", "points", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.thumbPath) setPreviewPath(f.properties.thumbPath as string);
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    // Frame the trip on first data.
    const c = centroid(media);
    if (c) map.easeTo({ center: [c.lng, c.lat], zoom: 9 });
  }, [media]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {previewPath && <MediaPreview thumbOrPath={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify build; commit**

```bash
npm run build
git add src/components/PhotoMap.tsx
git commit -m "feat: clustered MapLibre photo map (tap cluster to zoom, pin to preview)"
```

---

## Task 7: Map route

**Files:**
- Create: `src/app/map/page.tsx`

- [ ] **Step 1: Implement `/map?trip=<id>`**

Create `src/app/map/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PhotoMap from "@/components/PhotoMap";

function MapView() {
  const router = useRouter();
  const tripId = useSearchParams().get("trip") ?? "";
  if (!tripId) return <p className="p-6 text-neutral-500">No trip selected.</p>;

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={() => router.push(`/trip?id=${tripId}`)} className="text-sm text-neutral-400">
          ← Trip
        </button>
        <h1 className="text-lg font-medium">Map</h1>
      </header>
      <div className="flex-1">
        <PhotoMap tripId={tripId} />
      </div>
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <MapView />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify export builds the route**

Run:
```bash
npm run build
test -f out/map/index.html && echo "MAP ROUTE EXPORTED"
```
Expected: `MAP ROUTE EXPORTED`.

- [ ] **Step 3: Commit**

```bash
git add src/app/map/page.tsx
git commit -m "feat: /map route hosting the clustered photo map"
```

---

## Task 8: Trip-name suggestion + map link

**Files:**
- Create: `src/components/TripNameSuggest.tsx`
- Modify: `src/app/trip/page.tsx`

- [ ] **Step 1: Implement the suggestion component**

Create `src/components/TripNameSuggest.tsx`. It reverse-geocodes the centroid of the
trip's media and offers to set the trip's `location`/`name` — always overridable.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listMediaByTrip } from "@/lib/media";
import { centroid } from "@/lib/cluster";
import { reverseGeocodeCached } from "@/lib/geocache";
import { updateTrip } from "@/lib/trips";

export default function TripNameSuggest({ tripId }: { tripId: string }) {
  const media = useLiveQuery(() => listMediaByTrip(tripId), [tripId]);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    const c = centroid(media);
    if (!c) return;
    reverseGeocodeCached(c.lat, c.lng).then(setSuggestion);
  }, [media]);

  if (!suggestion) return null;

  return (
    <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-3 text-sm">
      <span className="text-neutral-400">Looks like <b className="text-neutral-100">{suggestion}</b></span>
      <button
        onClick={() => updateTrip(tripId, { location: suggestion, name: suggestion })}
        className="rounded-lg bg-white px-3 py-1.5 font-medium text-neutral-950"
      >
        Use as name
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add the suggestion + a Map link to the trip page**

In `src/app/trip/page.tsx`, add imports:

```tsx
import Link from "next/link";
import TripNameSuggest from "@/components/TripNameSuggest";
```

In the non-editing branch, just above `<MediaImporter ... />` add:

```tsx
<TripNameSuggest tripId={trip.id} />
<Link href={`/map?trip=${trip.id}`} className="rounded-xl bg-neutral-800 px-4 py-2 text-center text-sm">
  View map
</Link>
```

- [ ] **Step 3: Run suite + build**

Run:
```bash
npm test && npm run build
```
Expected: all tests pass; export builds (`/map` and `/trip` present).

- [ ] **Step 4: Commit**

```bash
git add src/components/TripNameSuggest.tsx src/app/trip/page.tsx
git commit -m "feat: reverse-geocoded trip-name suggestion + map link"
```

---

## Task 9: Manual verification — real trip on the map

> MapLibre tiles + Nominatim are network-dependent and visual; verify on device.

- [ ] **Step 1:** Open a trip that has GPS-tagged photos (from M2). Tap **View map**.
- [ ] **Step 2:** Confirm OSM tiles load with **OpenStreetMap attribution** visible
  and clustered white circles with counts appear over your photo locations.
- [ ] **Step 3:** Tap a cluster → the map zooms in and the cluster splits.
- [ ] **Step 4:** Tap an individual blue pin → the **full-size photo** opens; tap to close.
- [ ] **Step 5:** On the trip page, confirm the **"Looks like <City, Country>"**
  suggestion appears; tap **Use as name** → the trip name updates. Confirm you can
  still edit it manually afterward (override).
- [ ] **Step 6:** Reload and revisit the map; confirm geocode results came from
  cache (no flicker / no repeated network call — check DevTools Network if needed).

If the map mirrors the iOS Photos map feel and the name suggestion reflects the
dominant location, **M3 is done.**

---

## Self-Review

- **Spec coverage:** MapLibre clustered map (Tasks 6, 7); tap cluster→zoom, tap
  pin→preview (Task 6); reverse-geocode dominant location → name suggestion with
  manual override (Tasks 4, 8). Caching + attribution + rate-limit mitigation
  (Task 4). All M3 items covered.
- **Type consistency:** reuses `listMediaByTrip` (M2), `Media`/`Trip` types,
  `updateTrip` (M1). `centroid`/`toFeatures` shared between map and name
  suggestion. Geocode cache is Dexie v2 (additive, no breakage).
- **Constraint check:** no API tokens (OSM tiles + Nominatim are free); geocode
  cached in IndexedDB; query-param route under `<Suspense>`. Static-export safe.
