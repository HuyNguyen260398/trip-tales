# M6 — Polish + PWA Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Triptales feel like a real product end-to-end: hardened offline shell, polished day-timeline UX, multi-track music picker, trip export (zip of reels + JSON manifest = the "album by location"), a settings screen, and consistent empty/error states.

**Architecture:** No new data model. Add an `export` module that gathers a trip's records + OPFS blobs into a zip with a manifest JSON (the durable artifact that survives iOS storage eviction). Harden the M0 service worker to precache the built static assets so the installed app's shell is fully offline. Centralize empty/error/loading UI into small shared components so every screen is consistent. A settings screen surfaces storage usage + the persistence/eviction expectation the plan calls for.

**Tech Stack:** fflate (zip), the existing OPFS/Dexie modules, the M0 service worker, Web Share / download, Vitest.

**Done when:** it feels like a real product on your phone end-to-end — installable, offline, with exportable trips.

---

## File Structure

- `src/lib/export.ts` — `buildTripManifest`, `exportTrip` (zip)
- `src/lib/export.test.ts`
- `src/components/states.tsx` — `EmptyState`, `ErrorState`, `Spinner`
- `src/components/ExportButton.tsx` — export + share/download a trip zip
- `src/components/StorageMeter.tsx` — usage estimate + persistence status
- `src/app/settings/page.tsx` — `/settings`
- `src/lib/swAssets.ts` (generated) — list of built asset URLs to precache
- `scripts/gen-precache.mjs` — post-build script writing the precache manifest
- Modify: `public/sw.js` — precache + stale-while-revalidate
- Modify: timeline/map/reel screens — use shared state components
- `public/music/*` — add more CC0 tracks (multi-track picker already reads `TRACKS`)

---

## Task 1: Shared state components

**Files:**
- Create: `src/components/states.tsx`

- [ ] **Step 1: Implement**

Create `src/components/states.tsx`:

```tsx
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-neutral-500">{label}</p>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="font-medium text-neutral-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-neutral-500">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl bg-red-950/40 p-4 text-center">
      <p className="text-sm text-red-200">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded-lg bg-red-900/60 px-3 py-1.5 text-sm">
          Retry
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Adopt them in existing screens**

Replace ad-hoc loading/empty text with these components in `TripList`,
`DayTimeline`, `PhotoMap`'s container, and `ReelBuilder`'s error display. Example in
`DayTimeline.tsx`:

```tsx
import { Spinner, EmptyState } from "./states";
// ...
if (groups === undefined) return <Spinner />;
if (groups.length === 0)
  return <EmptyState title="No media yet" hint="Add photos to build a day timeline." />;
```

- [ ] **Step 3: Verify suite + build; commit**

```bash
npm test && npm run build
git add src/components/states.tsx src/components/DayTimeline.tsx src/components/TripList.tsx src/components/PhotoMap.tsx src/components/ReelBuilder.tsx
git commit -m "feat: shared empty/error/loading state components, adopted across screens"
```

---

## Task 2: Trip export manifest (TDD)

**Files:**
- Create: `src/lib/export.ts`, `src/lib/export.test.ts`

- [ ] **Step 1: Write the failing tests**

We test the manifest shape (the "album by location" record) with injected blob
reads. Create `src/lib/export.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "./db";
import { createTrip } from "./trips";
import { buildTripManifest } from "./export";

beforeEach(async () => {
  await db.trips.clear();
  await db.media.clear();
  await db.reels.clear();
});

describe("buildTripManifest", () => {
  it("captures trip, per-day media, and reels", async () => {
    const trip = await createTrip({ name: "Tokyo", startDate: "2026-04-01", endDate: "2026-04-03" });
    await db.media.bulkAdd([
      { id: "m1", tripId: trip.id, dayKey: "2026-04-01", takenAt: 1, lat: 35, lng: 139, type: "photo", opfsPath: "m1.jpg", thumbPath: "m1.t" },
      { id: "m2", tripId: trip.id, dayKey: "2026-04-02", takenAt: 2, type: "photo", opfsPath: "m2.jpg", thumbPath: "m2.t" },
    ]);
    await db.reels.add({ id: "r1", tripId: trip.id, dayKey: "2026-04-01", opfsPath: "reel-r1.mp4", musicId: "sunrise", createdAt: 1, durationSec: 8 });

    const manifest = await buildTripManifest(trip.id);
    expect(manifest.trip.name).toBe("Tokyo");
    expect(manifest.version).toBe(1);
    expect(manifest.media).toHaveLength(2);
    expect(manifest.reels).toHaveLength(1);
    expect(manifest.days).toEqual(["2026-04-01", "2026-04-02"]);
  });

  it("throws for an unknown trip", async () => {
    await expect(buildTripManifest("nope")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/lib/export.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/export.ts`:

```ts
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
```

- [ ] **Step 4: Install fflate**

```bash
npm install fflate
```

- [ ] **Step 5: Run to verify it passes**

Run:
```bash
npx vitest run src/lib/export.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts package.json package-lock.json
git commit -m "feat: trip export — manifest + zip of reels/media (TDD)"
```

---

## Task 3: Export button

**Files:**
- Create: `src/components/ExportButton.tsx`
- Modify: `src/app/trip/page.tsx`

- [ ] **Step 1: Implement**

Create `src/components/ExportButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { exportTrip } from "@/lib/export";

export default function ExportButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const zip = await exportTrip(tripId);
      const file = new File([zip], `${tripName.replace(/\s+/g, "-")}.zip`, { type: "application/zip" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: tripName });
      } else {
        const url = URL.createObjectURL(zip);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={handleExport} disabled={busy}
      className="rounded-xl bg-neutral-800 px-4 py-2 text-sm disabled:opacity-50">
      {busy ? "Exporting…" : "Export trip"}
    </button>
  );
}
```

- [ ] **Step 2: Add it to the trip page action row**

In `src/app/trip/page.tsx`, import and place `<ExportButton tripId={trip.id} tripName={trip.name} />`
in the Edit/Delete button row.

- [ ] **Step 3: Verify build; commit**

```bash
npm run build
git add src/components/ExportButton.tsx src/app/trip/page.tsx
git commit -m "feat: export trip as a shareable zip from the trip page"
```

---

## Task 4: Settings screen + storage meter

**Files:**
- Create: `src/components/StorageMeter.tsx`, `src/app/settings/page.tsx`
- Modify: `src/app/page.tsx` (settings link)

- [ ] **Step 1: Implement the storage meter**

Create `src/components/StorageMeter.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { requestPersistentStorage } from "@/lib/storage";

export default function StorageMeter() {
  const [usageMb, setUsageMb] = useState<number | null>(null);
  const [quotaMb, setQuotaMb] = useState<number | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      setUsageMb(Math.round((e.usage ?? 0) / 1e6));
      setQuotaMb(Math.round((e.quota ?? 0) / 1e6));
    });
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  return (
    <div className="rounded-xl bg-neutral-900 p-4 text-sm">
      <p className="font-medium">On-device storage</p>
      <p className="mt-1 text-neutral-400">
        {usageMb ?? "–"} MB used{quotaMb ? ` of ~${quotaMb} MB` : ""}
      </p>
      <p className="mt-1 text-neutral-400">
        Durable storage: {persisted === null ? "…" : persisted ? "granted" : "best-effort"}
      </p>
      {persisted === false && (
        <button onClick={() => requestPersistentStorage().then(setPersisted)}
          className="mt-2 rounded-lg bg-white px-3 py-1.5 text-neutral-950">
          Request durable storage
        </button>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        iOS may clear web storage after weeks of inactivity. Export trips you want
        to keep — the zip is the durable copy.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Implement the settings page**

Create `src/app/settings/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import StorageMeter from "@/components/StorageMeter";

export default function SettingsPage() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <button onClick={() => router.push("/")} className="self-start text-sm text-neutral-400">
        ← Home
      </button>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <StorageMeter />
      <p className="text-xs text-neutral-500">
        Triptales stores everything on this device. Maps © OpenStreetMap
        contributors. Music tracks are CC0.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Link settings from the home header**

In `src/app/page.tsx`, add a small settings link/button in the header (e.g. a
gear linking to `/settings`).

- [ ] **Step 4: Verify export builds the route; commit**

```bash
npm run build
test -f out/settings/index.html && echo "SETTINGS ROUTE EXPORTED"
git add src/components/StorageMeter.tsx src/app/settings/page.tsx src/app/page.tsx
git commit -m "feat: settings screen with storage usage + eviction guidance"
```

---

## Task 5: Harden the service worker (precache built assets)

**Files:**
- Create: `scripts/gen-precache.mjs`
- Modify: `public/sw.js`, `package.json`

- [ ] **Step 1: Generate a precache manifest after build**

The M0 SW only cached `/`. To be reliably offline, precache the hashed JS/CSS the
export emits. Create `scripts/gen-precache.mjs`:

```js
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = "out";
const exts = new Set([".html", ".js", ".css", ".webmanifest", ".png", ".woff2"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return exts.has(p.slice(p.lastIndexOf("."))) ? [p] : [];
  });
}

const urls = walk(OUT)
  .map((p) => "/" + relative(OUT, p).split("\\").join("/"))
  .map((u) => (u.endsWith("/index.html") ? u.replace(/index\.html$/, "") : u));

writeFileSync(join(OUT, "precache-manifest.json"), JSON.stringify([...new Set(urls)], null, 2));
console.log(`precache: ${urls.length} assets`);
```

- [ ] **Step 2: Wire it into the build**

In `package.json` scripts, chain it after the export build:

```json
"build": "next build && node scripts/gen-precache.mjs"
```

- [ ] **Step 3: Update the service worker to precache + stale-while-revalidate**

Replace `public/sw.js`:

```js
const CACHE = "triptales-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const manifest = await fetch("/precache-manifest.json", { cache: "no-store" });
        const urls = await manifest.json();
        await cache.addAll(["/", ...urls]);
      } catch {
        await cache.add("/"); // fall back to shell-only
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Don't cache map tiles / Nominatim / ffmpeg cores (cross-origin, large/volatile).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => cached || caches.match("/"));
      return cached || network;
    })
  );
});
```

- [ ] **Step 4: Verify the manifest is generated**

Run:
```bash
npm run build
node -e "const m=require('./out/precache-manifest.json'); console.log('PRECACHE', m.length, 'assets'); if(!m.length) process.exit(1)"
```
Expected: `PRECACHE <n> assets` with n > 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-precache.mjs public/sw.js package.json
git commit -m "feat: precache built assets in service worker for full offline shell"
```

---

## Task 6: Add more CC0 music tracks (multi-track picker)

**Files:**
- Modify: `src/lib/music.ts`, `public/music/`, `public/music/LICENSES.md`

- [ ] **Step 1: Add 2–3 more CC0 tracks**

Drop additional CC0 MP3s into `public/music/`, document each in
`public/music/LICENSES.md`, and append entries to `TRACKS` in `src/lib/music.ts`.
The M4 `ReelBuilder` music `<select>` already renders all `TRACKS`, so no UI change
is needed.

- [ ] **Step 2: Verify build; commit**

```bash
npm run build
git add src/lib/music.ts public/music
git commit -m "feat: expand bundled CC0 music catalogue (multi-track picker)"
```

---

## Task 7: Manual verification — end-to-end on a real iPhone

> The acceptance check is the whole DoD: "feels like a real product on your phone
> end-to-end." Run the full Definition-of-Done flow on the installed PWA.

- [ ] **Step 1 (offline shell):** Open the installed app once online, then enable
  Airplane Mode and relaunch. Confirm the app shell **and previously-viewed
  screens** load (precache working), and cached trips/media render.
- [ ] **Step 2 (full DoD flow):** Online, create a trip with dates → import that
  trip's photos/videos → see them grouped by day and on the map → make a
  music-backed reel for a day → preview and share/download it.
- [ ] **Step 3 (export):** From the trip page tap **Export trip** → confirm the iOS
  share sheet offers the `.zip`; save it to Files. Open the zip and confirm it
  contains `manifest.json`, `reels/…`, and `media/…`.
- [ ] **Step 4 (settings):** Open Settings → confirm storage usage shows and the
  durable-storage status + eviction guidance read clearly.
- [ ] **Step 5 (states):** Visit an empty trip / a trip with no GPS / trigger a
  reel error (e.g. no photos) → confirm friendly empty/error states, not blank
  screens or crashes.
- [ ] **Step 6 (persistence):** Close and reopen; confirm everything persists
  (best-effort), and that the export zip is the documented durable backup.

If the full DoD flow works on your installed iPhone app, **M6 — and Phase 1 — is
done.**

---

## Self-Review

- **Spec coverage:** offline shell hardening (Task 5); day-timeline UX +
  empty/error states (Task 1); multi-track music picker (Task 6); trip export = zip
  of reels + JSON manifest "album by location" (Tasks 2, 3); settings + storage
  expectation (Task 4). Matches the Phase-1 Definition of Done in the master plan.
- **Type consistency:** `TripManifest` reuses `Trip`/`Media`/`Reel`; export reads
  via `listMediaByTrip`/`listReelsByTrip` (M2/M4) and `readBlob` (M2). No data-model
  changes.
- **Constraint check:** export, zip, and SW precache are all client-side; the
  manifest is the durable artifact compensating for best-effort web storage exactly
  as the plan's Key Risks require. Static-export safe; SW skips cross-origin
  tiles/Nominatim/ffmpeg cores.
