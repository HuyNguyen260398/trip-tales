# Triptales — Web App Development Plan (Solo, Phase 1)

> Working name: **Triptales** (swap freely). A travel app that turns each day of a
> trip into a short, music-backed highlight reel and plots your photos on a map.

This plan covers the **web app first**. It deliberately scopes to what a Next.js
web app can do *well* in the browser today, and is architected so the same codebase
becomes the UI layer of a native (Capacitor) iOS app later — without a rewrite.

---

## 1. Scope: what "web first" means

A web app cannot, on iOS, read the whole camera roll, run at 12 PM in the
background, or write into the Photos app's albums. So Phase 1 swaps those native
behaviours for web-native equivalents that prove out the *same core experience*:

| Original requirement | Web-first version (Phase 1) | Becomes (native, later) |
|---|---|---|
| Auto-collect the day's photos at 12 PM | User **selects** the day's photos/videos via the picker | PhotoKit auto-fetch by date |
| Generate a daily highlight reel + music | In-browser render (Canvas + MediaRecorder, then ffmpeg.wasm) | Same logic, AVFoundation render |
| Save into an iOS Photos album named by location | **Download / share** the reel + a manifest | PhotoKit album write |
| Map view of photos | ✅ Built in full (MapLibre + EXIF GPS) | Reuse, or swap to MapKit |
| Set trip start/end dates | ✅ Built in full | Reuse as-is |
| No database, all on device | ✅ IndexedDB + OPFS (best-effort) | App sandbox + Photos library |

**In scope (Phase 1):** trip setup, media import + EXIF parsing, day grouping,
per-day photo reel with music, photo map, local persistence, PWA install,
Amplify deploy.

**Explicitly out of scope (deferred to native):** automatic background collection,
exact 12 PM trigger, writing to the iOS Photos app, true offline persistence
guarantees. These are the reasons Phase 2 goes native — Phase 1 makes everything
*else* solid first.

---

## 2. Tech stack

- **Framework:** Next.js (App Router, TypeScript), configured for **static export
  (`output: 'export'`)** from day one — this is what makes the later Capacitor wrap
  clean. Keep everything client-side; avoid server actions / route handlers.
- **Package manager:** **pnpm** — `pnpm add [-D] <pkg>`, `pnpm dev/build/test`,
  `pnpm exec <bin>`; the committed lockfile is `pnpm-lock.yaml`.
- **UI:** Tailwind CSS + a small headless component lib (Radix / shadcn). A web app
  for **desktop browsers and phones**: design mobile-first with large tap targets and
  safe-area awareness, then layer up to a desktop **adaptive shell** (sidebar +
  multi-column) via Tailwind breakpoints — one component tree, no separate
  desktop/mobile renders.
- **EXIF:** `exifr` (reads date + GPS from JPEG/HEIC, fast, tree-shakeable).
- **HEIC display:** `heic2any` fallback for thumbnails (iOS Safari renders HEIC
  natively, but other browsers don't — handle both).
- **Reel render:** Phase A → Canvas + `MediaRecorder` + Web Audio API (light,
  works on iOS Safari ≥14.3). Phase B → `ffmpeg.wasm` for stitching real video clips.
- **Map:** **MapLibre GL JS** (no API token, OSM tiles) for the iOS-Photos-like
  clustered map; `supercluster` for marker clustering. (Leaflet is the simpler
  fallback if MapLibre perf is a problem on older phones.)
- **Local storage:** **Dexie.js** (IndexedDB wrapper) for trip/metadata, **OPFS**
  (Origin Private File System) for the media blobs and rendered reels. Call
  `navigator.storage.persist()` to reduce eviction risk.
- **Reverse geocoding (trip name):** Nominatim (OSM, free, rate-limited — cache
  results, attribute, and always allow a manual override).
- **PWA:** `next-pwa` or a hand-rolled service worker + manifest for install +
  offline shell.
- **Hosting:** AWS **Amplify Hosting** (serves the static export). Optional later:
  Cognito if you ever add accounts; otherwise AWS footprint stays near zero.

---

## 3. Architecture (client-only, on-device)

Everything runs in the browser. No backend, no DB server — matching your
"all resources on the device" principle.

```
[ File Picker ] → [ EXIF parse: date + GPS + thumb ]
                        │
                        ▼
              [ Dexie (IndexedDB) ]  ← trip, day, media-metadata records
              [ OPFS ]               ← original blobs + rendered reels
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  [ Day grouping ]  [ Map view ]   [ Reel renderer ]
  by creationDate   MapLibre +     Canvas/MediaRecorder
  + GPS cluster     supercluster   (+ ffmpeg.wasm later)
                        │
                        ▼
              [ Preview → Download / Web Share ]
```

**Data model (Dexie):**
- `trips`: `{ id, name, location, startDate, endDate, createdAt }`
- `media`: `{ id, tripId, dayKey, takenAt, lat, lng, type, opfsPath, thumbPath }`
- `reels`: `{ id, tripId, dayKey, opfsPath, musicId, createdAt, durationSec }`

`dayKey` = local-date string (`YYYY-MM-DD`) derived from each photo's EXIF
`takenAt`, so grouping a day's media is a simple indexed query.

---

## 4. Milestones (solo-friendly, sequential)

Each milestone is independently shippable and demoable. Effort is relative
(S/M/L), not calendar time — pace it to your evenings/weekends.

### M0 — Foundation (S)
Next.js + TS + Tailwind, `output: 'export'` configured, PWA manifest, deploy a
"hello" build to Amplify Hosting, confirm install-to-home-screen works on your
iPhone.
**Done when:** the empty shell installs on your phone and loads offline.

### M1 — Trips (S)
Create / list / edit / delete trips with a name and start/end date. Persist in
Dexie. Request `storage.persist()`.
**Done when:** you can create a trip, close the app, reopen, and it's still there.

### M2 — Media import + EXIF (L) ← *core risk lives here*
File picker (`accept="image/*,video/*" multiple`). For each file: parse `takenAt`
+ GPS with `exifr`, generate a thumbnail, store the blob in OPFS, write a `media`
record. Group by `dayKey`; show a per-day timeline within the trip.
Handle HEIC (display + the fact that iOS may re-encode on upload, stripping some
metadata — detect missing GPS gracefully).
**Done when:** you select a folder of trip photos and see them grouped by day with
locations detected.

### M3 — Photo map (M)
MapLibre map of all media for a trip, clustered by GPS. Tap a cluster → day; tap a
pin → photo preview. Reverse-geocode the trip's dominant location to suggest the
trip/album name (with manual override).
**Done when:** the map mirrors the feel of the iOS Photos map for your real trip.
*(This reuses the exact EXIF-GPS logic from our metadata-extraction work.)*

### M4 — Daily reel v1: photos + music (L)
For a selected day, build a slideshow reel: draw photos to a canvas with Ken-Burns
pan/zoom and crossfades, capture via `canvas.captureStream()`, mix a bundled
royalty-free track through Web Audio, record with `MediaRecorder`. Preview in-app;
**download** or Web-Share the result.
**Done when:** one tap turns a day's photos into a ~20–30s watchable reel with music.

### M5 — Daily reel v2: include video clips (M)
Bring `ffmpeg.wasm` in to trim and concatenate short video clips alongside the
photo segments; expose simple options (length, music choice, resolution cap).
**Done when:** reels can include actual video footage, not just stills.

### M6 — Polish + PWA hardening (M)
Offline shell, day-timeline UX, multi-track music picker, trip export (zip of reels
+ a JSON manifest as the "album by location"), settings, empty/error states.
**Done when:** it feels like a real product on your phone end-to-end.

---

## 5. Key risks & mitigations

- **In-browser video is the hard part.** `MediaRecorder` MP4/H.264 support varies
  on Safari, and `ffmpeg.wasm` is memory-hungry on mobile. *Mitigate:* start
  photos-only (M4), cap output at 720p / ~30s, render incrementally, test on your
  actual iPhone early and often, feature-detect codecs.
- **iOS clears web storage.** OPFS/IndexedDB can be evicted after weeks of
  inactivity, and `persist()` is best-effort on iOS. *Mitigate:* treat web storage
  as a working cache, not a vault; let users export trips; set this expectation in
  the UI. (This limitation is precisely why Phase 2 goes native.)
- **HEIC + metadata stripping on upload.** iOS may convert HEIC→JPEG and drop EXIF
  depending on camera settings. *Mitigate:* parse metadata immediately on import,
  degrade gracefully when GPS/date are missing, allow manual date/location entry.
- **Music licensing.** *Mitigate:* ship a small CC0 / properly-licensed track set;
  never bundle copyrighted songs.
- **Geocoding limits.** Nominatim is rate-limited. *Mitigate:* cache, debounce,
  attribute, and always allow manual naming.

---

## 6. Deployment

- **Amplify Hosting** serves the static export; connect your Git repo for
  push-to-deploy. (As a DevOps/AWS person you can wire this with the Amplify CLI or
  a minimal CDK/Terraform stack — Amplify Hosting is the only AWS resource Phase 1
  needs.) The build enables Corepack and runs `pnpm install --frozen-lockfile`, then
  `pnpm build`.
- Add the **PWA manifest** + icons so "Add to Home Screen" gives a full-screen,
  installable app. On iOS 26, home-screen sites default to web-app mode, which helps.
- No secrets, no backend — so no IAM/data-handling surface to worry about in Phase 1.

---

## 7. Definition of done (Phase 1 MVP)

On your iPhone, installed from the home screen, you can: create a trip with dates →
import that trip's photos/videos → see them grouped by day and plotted on a map →
generate a music-backed highlight reel for each day → preview and save/share it →
and have it all persist between sessions (best-effort).

---

## 8. Bridge to native (Phase 2 preview)

Because the app is a static-exportable, client-only React UI, the migration is
additive, not a rewrite:

- **Wrap** the existing build in **Capacitor** → instant iOS shell from the same code.
- **Add small Swift plugins** for the three things the web can't do:
  - `PhotoKit` fetch by `creationDate` → replaces manual import (M2).
  - `PHAssetCollectionChangeRequest` → write reels into a location-named Photos album.
  - `AVFoundation` render → replaces the in-browser renderer (M4/M5) for quality + speed.
- **Add `BGTaskScheduler` + a local notification** for the "end of day" trigger
  (note: iOS runs background tasks opportunistically, so pair it with on-open
  processing — don't promise an exact 12 PM).

Everything from M1, M3, M6 (trips, map, UX, storage model) carries straight over.
