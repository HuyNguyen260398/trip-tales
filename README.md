# Triptales

> Turn each day of a trip into a short, music-backed highlight reel — and plot your photos on a clustered map. Everything runs on your device: no backend, no accounts, no cloud.

Triptales is a travel **PWA** (progressive web app). You set up a trip, import the photos and videos you took, and the app groups them by day, maps them by GPS, and renders a watchable highlight reel for each day that you can save or share.

> [!NOTE]
> Triptales is in early development. This repo currently holds the development plan ([`triptales-web-mvp-plan.md`](./triptales-web-mvp-plan.md)) and project docs — the Next.js app hasn't been scaffolded yet. The [Getting started](#getting-started) commands describe the intended workflow once `package.json` lands.

## Why web first

A web app on iOS can't read the whole camera roll, run at a fixed time in the background, or write into the Photos app. Phase 1 swaps those native behaviours for web-native equivalents that prove out the *same core experience*, and is architected so the same codebase becomes the UI layer of a native (Capacitor) iOS app later — without a rewrite.

| Native goal | Web-first version (Phase 1) | Becomes (native, later) |
|---|---|---|
| Auto-collect the day's photos | You **select** the day's media via the picker | PhotoKit auto-fetch by date |
| Daily highlight reel + music | In-browser render (Canvas + MediaRecorder, then ffmpeg.wasm) | AVFoundation render |
| Save into a location-named Photos album | **Download / share** the reel + a manifest | PhotoKit album write |
| Map view of photos | Built in full (MapLibre + EXIF GPS) | Reuse, or swap to MapKit |
| All data on device | IndexedDB + OPFS (best-effort) | App sandbox + Photos library |

## Features

- **Trips** — create, edit, and delete trips with a name, location, and start/end dates.
- **Media import + EXIF** — pick photos/videos; the app reads each file's capture date and GPS, generates a thumbnail, and groups everything by day.
- **Photo map** — a clustered MapLibre map of a trip's media, plotted from EXIF GPS, in the spirit of the iOS Photos map.
- **Daily reels** — turn a day's photos into a ~20–30s slideshow with Ken-Burns motion, crossfades, and a royalty-free music track; later, stitch in real video clips via `ffmpeg.wasm`.
- **On-device & offline** — all data lives in your browser (IndexedDB + OPFS); installs to your home screen and loads offline.
- **Export** — download a trip as a zip of reels plus a JSON manifest, since web storage is best-effort.

## How it works

Everything happens in the browser. There is no server and no database server — all persistence is on-device.

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
  by dayKey         MapLibre +     Canvas/MediaRecorder
  + GPS cluster     supercluster   (+ ffmpeg.wasm later)
                        │
                        ▼
              [ Preview → Download / Web Share ]
```

`dayKey` is a local-date `YYYY-MM-DD` string derived from each photo's EXIF capture time, so grouping a day's media is a simple indexed query rather than a read-time computation.

### Data model (Dexie)

| Store | Fields |
|---|---|
| `trips` | `id, name, location, startDate, endDate, createdAt` |
| `media` | `id, tripId, dayKey, takenAt, lat, lng, type, opfsPath, thumbPath` |
| `reels` | `id, tripId, dayKey, opfsPath, musicId, createdAt, durationSec` |

## Tech stack

- **[Next.js](https://nextjs.org/)** (App Router, TypeScript) configured for **static export** (`output: 'export'`) — fully client-side, which is what keeps the later Capacitor wrap clean.
- **[Tailwind CSS](https://tailwindcss.com/)** + headless components (Radix / shadcn), mobile-first and safe-area aware.
- **[exifr](https://github.com/MikeKovarik/exifr)** for EXIF date + GPS; **[heic2any](https://github.com/alexcorvi/heic2any)** as a HEIC display fallback.
- **[MapLibre GL JS](https://maplibre.org/)** + **[supercluster](https://github.com/mapbox/supercluster)** for the clustered photo map (OSM tiles, no API token).
- **[Dexie.js](https://dexie.org/)** (IndexedDB) for structured records and **OPFS** for media blobs and rendered reels.
- **Canvas + `MediaRecorder` + Web Audio** for reels, then **[ffmpeg.wasm](https://ffmpegwasm.netlify.app/)** for stitching real video clips.
- **[Nominatim](https://nominatim.org/)** for reverse geocoding the suggested trip name (cached, attributed, always overridable).
- Hosting: **AWS Amplify Hosting** serves the static export (the only AWS resource in Phase 1).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- A modern browser; for reel/storage testing, **a real iPhone** is strongly recommended (Safari quirks around HEIC, MediaRecorder codecs, and storage eviction only show up on-device)

### Run locally

```bash
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:3000
```

### Build the static export

```bash
npm run build    # produces a static bundle in ./out, ready for Amplify or Capacitor
```

> [!IMPORTANT]
> Keep the app client-only: no server actions, route handlers, or SSR. The static export is what makes the Phase 2 native wrap a no-rewrite, and the "all data on device" model depends on it.

## Roadmap

Work is sequenced into independently shippable milestones. See the [development plan](./triptales-web-mvp-plan.md) for full detail.

- **M0 — Foundation** — Next.js + Tailwind, static export, PWA manifest, deploy a shell that installs to the home screen.
- **M1 — Trips** — create/list/edit/delete trips persisted in Dexie.
- **M2 — Media import + EXIF** — file picker, EXIF parsing, thumbnails, OPFS storage, day grouping. *(Core risk lives here.)*
- **M3 — Photo map** — clustered MapLibre map + reverse-geocoded trip name.
- **M4 — Daily reel v1** — photos + music slideshow with Ken-Burns and crossfades.
- **M5 — Daily reel v2** — include trimmed video clips via `ffmpeg.wasm`.
- **M6 — Polish + PWA hardening** — offline shell, music picker, trip export, settings, empty/error states.

## Privacy & data

Triptales has no backend and no accounts — your photos, metadata, and reels never leave your device. Persistence uses IndexedDB and OPFS, which browsers (especially iOS Safari) may **evict after extended inactivity**. Treat on-device storage as a best-effort working cache and use **Export** to keep anything you want to retain. This limitation is precisely why Phase 2 goes native.

## Phase 2: native (preview)

Because the app is a static-exportable, client-only React UI, the migration is additive rather than a rewrite: wrap the existing build in **[Capacitor](https://capacitorjs.com/)** for an iOS shell, then add small Swift plugins for the three things the web can't do — PhotoKit fetch by capture date, writing reels into a location-named Photos album, and an AVFoundation render. Trips, the map, UX, and the storage model all carry straight over.
