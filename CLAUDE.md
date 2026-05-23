# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Greenfield. The repo currently contains only `triptales-web-mvp-plan.md` (the full
development plan) and no commits — there is no `package.json`, build tooling, or
source yet. The plan document is the source of truth for intent, scope, and
architecture; read it before scaffolding or implementing anything.

## What Triptales is

A travel PWA that turns each day of a trip into a short, music-backed highlight reel
and plots the trip's photos on a clustered map. Phase 1 is **web-first**; Phase 2
wraps the same codebase in Capacitor for native iOS — so Phase 1 decisions are made
to keep that later wrap a no-rewrite.

## Hard architectural constraints

These are easy to violate and exist to protect the Phase 2 native bridge and the
"all data on device" principle. Do not break them without explicit discussion:

- **Static export only.** Next.js App Router with `output: 'export'`. No server
  actions, no route handlers, no SSR/server-only code. Everything is client-side so
  the build is a static bundle Capacitor can wrap.
- **No backend, no database server.** All persistence is on-device:
  - **Dexie.js** (IndexedDB) for structured records (trips, media metadata, reels).
  - **OPFS** (Origin Private File System) for media blobs and rendered reels.
  - Treat web storage as a best-effort working cache, not durable storage (iOS evicts
    it). Call `navigator.storage.persist()`, and let users export trips.
- **No secrets / no auth in Phase 1.** Reverse geocoding (Nominatim) and OSM tiles
  are token-free. Cache geocoding results, attribute OSM, and always allow manual
  override of suggested names.

## Intended tech stack (per the plan)

- Next.js (App Router, TypeScript), Tailwind CSS, Radix/shadcn for headless UI.
  **pnpm** is the package manager. This is a web app for **desktop browsers and
  phones**: a responsive **adaptive shell** built from one component tree —
  mobile-first single-column with a bottom nav, scaling up to a desktop sidebar +
  multi-column layouts via Tailwind breakpoints; safe-area aware. One component tree
  (no separate desktop/mobile renders) keeps the Phase-2 Capacitor wrap clean.
- `exifr` for EXIF date + GPS; `heic2any` as a HEIC display fallback (iOS Safari
  renders HEIC natively, other browsers don't).
- Reel render: Phase A = Canvas + `canvas.captureStream()` + `MediaRecorder` + Web
  Audio. Phase B = `ffmpeg.wasm` to add real video clips.
- Map: MapLibre GL JS + `supercluster` for clustering.
- PWA via `next-pwa` or a hand-rolled service worker + manifest.
- Hosting: AWS Amplify Hosting (serves the static export; the only AWS resource in
  Phase 1).

## Data model (Dexie)

- `trips`: `{ id, name, location, startDate, endDate, createdAt }`
- `media`: `{ id, tripId, dayKey, takenAt, lat, lng, type, opfsPath, thumbPath }`
- `reels`: `{ id, tripId, dayKey, opfsPath, musicId, createdAt, durationSec }`

`dayKey` is a local-date `YYYY-MM-DD` string derived from each photo's EXIF
`takenAt`. Day grouping is therefore a simple indexed query on `dayKey`, not
computed at read time. Parse metadata immediately on import and degrade gracefully
when GPS/date are missing (iOS may strip EXIF on HEIC→JPEG upload) — allow manual
date/location entry.

## Milestones

Work is sequenced M0→M6 in the plan, each independently shippable: M0 foundation +
PWA install, M1 trips CRUD, M2 media import + EXIF (the core risk), M3 photo map, M4
photos+music reel, M5 video clips via ffmpeg.wasm, M6 polish + export. The riskiest
work (in-browser video, storage eviction, HEIC/metadata) is called out in the plan's
"Key risks" section — test on a real iPhone early when touching reel rendering.

## Commands

The package manager is **pnpm**. App scripts aren't established yet (no
`package.json`). Once the Next.js app is scaffolded, update this section with the
real commands — expect `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm exec vitest run
<file>`, and `pnpm add [-D] <pkg>` for deps. The committed lockfile is
`pnpm-lock.yaml` (never `package-lock.json`).
