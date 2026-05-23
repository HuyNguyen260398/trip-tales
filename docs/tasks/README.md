# Triptales — Milestone Task Plans

This folder breaks the master plan (`/triptales-web-mvp-plan.md`) into one
implementation plan per milestone. Each file is a self-contained, TDD-style plan
that an engineer (or an agent) can execute task-by-task.

Read `/CLAUDE.md` and `/triptales-web-mvp-plan.md` first — they are the source of
truth for intent and the hard architectural constraints. These task files tell you
*how* to build each milestone without violating those constraints.

## Milestone order

Milestones are sequential — each builds on the previous one and is independently
shippable.

| File | Milestone | Effort | Depends on |
|---|---|---|---|
| [M0-foundation.md](./M0-foundation.md) | Next.js + Tailwind + static export + PWA install | S | — |
| [M1-trips.md](./M1-trips.md) | Trips CRUD on Dexie | S | M0 |
| [M2-media-import-exif.md](./M2-media-import-exif.md) | Media import + EXIF + day grouping (core risk) | L | M1 |
| [M3-photo-map.md](./M3-photo-map.md) | Clustered photo map + reverse geocode | M | M2 |
| [M4-reel-photos-music.md](./M4-reel-photos-music.md) | Daily reel v1 (photos + music) | L | M2 |
| [M5-reel-video-ffmpeg.md](./M5-reel-video-ffmpeg.md) | Daily reel v2 (video clips via ffmpeg.wasm) | M | M4 |
| [M6-polish-pwa-export.md](./M6-polish-pwa-export.md) | Offline shell, export, polish | M | M3, M4 |

## Shared conventions (apply to every milestone)

These decisions are made once here so the per-milestone plans stay consistent.

### Package manager (pnpm)

This project uses **pnpm**. Scaffold with `pnpm create next-app … --use-pnpm`, add
deps with `pnpm add [-D] <pkg>`, run scripts with `pnpm <script>` (`pnpm dev`,
`pnpm build`, `pnpm test`), and run a one-off binary with `pnpm exec <bin>` (e.g.
`pnpm exec vitest run <file>` for a single test file). The committed lockfile is
`pnpm-lock.yaml` (never `package-lock.json`). CI/hosting installs with
`pnpm install --frozen-lockfile` after enabling Corepack (`corepack enable`).

### Architectural guardrails (from CLAUDE.md — do not break)

- **Static export only:** `next.config.ts` sets `output: 'export'`. No server
  actions, no route handlers, no SSR-only code. Everything is client-side.
- **No backend / no DB server:** Dexie (IndexedDB) for records, OPFS for blobs.
- **No secrets / no auth in Phase 1.** Nominatim + OSM tiles are token-free.

### Routing (static-export safe)

`output: 'export'` cannot pre-render dynamic segments (`/trips/[id]`) because trip
IDs live only in client IndexedDB. **Use query-param routing instead**, read with
`useSearchParams()`:

- `/` — trips list (home)
- `/trip?id=<tripId>` — trip detail / day timeline
- `/map?trip=<tripId>` — clustered photo map
- `/reel?trip=<tripId>&day=<dayKey>` — reel builder/preview

Any client component using `useSearchParams()` must be wrapped in `<Suspense>` to
satisfy the static export build.

### Responsive layout (adaptive shell)

Triptales is a **web app for both desktop browsers and phones**, built mobile-first
and layered up with Tailwind breakpoints — **one component tree**, no separate
desktop/mobile renders (this keeps the Phase-2 Capacitor wrap a no-rewrite).

- **App shell (`AppShell`, M0):** the root layout wraps every page in a responsive
  frame. On desktop (`lg:`) a persistent **left sidebar** holds the brand + primary
  nav; on mobile a fixed, safe-area-aware **bottom nav** is shown instead
  (`lg:hidden`, sidebar is `hidden lg:flex`). Content lives in a `flex-1` region;
  pages keep their own `<main>`.
- **Primary nav grows with routes:** M0 ships **Trips** (home); M6 adds **Settings**.
  Map and Reel are trip-/day-scoped, linked from the trip screen — not global nav.
- **Content width:** pages do **not** hard-cap at `max-w-md`. Reading/form screens
  use the shared container `mx-auto w-full max-w-2xl lg:max-w-4xl`; the map is
  full-bleed (fills the content region beside the sidebar).
- **Grids scale with breakpoints:** trip cards `grid-cols-1 sm:grid-cols-2
  lg:grid-cols-3`; media thumbnails `grid-cols-3 sm:grid-cols-4 lg:grid-cols-6`.
- **Use the extra desktop width:** the reel builder lays controls beside a larger
  preview (`lg:flex-row`); modal dialogs center on desktop (`lg:items-center`)
  rather than sitting as mobile bottom sheets.
- **Safe areas still matter** on mobile (and under Capacitor): keep
  `env(safe-area-inset-*)` padding on the bottom nav and page tops.

### Folder structure (built up across milestones)

```
src/
  app/
    layout.tsx              # root layout, safe-area, PWA meta, AppShell
    page.tsx                # trips list           (M1)
    trip/page.tsx           # trip detail/timeline (M1, M2)
    map/page.tsx            # photo map            (M3)
    reel/page.tsx           # reel builder         (M4, M5)
  components/
    AppShell.tsx            # responsive frame: sidebar + bottom nav   (M0)
    Sidebar.tsx             # desktop left nav (lg:)                    (M0)
    BottomNav.tsx           # mobile bottom nav (lg:hidden)            (M0)
    nav.ts                  # primary nav items (Trips; +Settings M6)   (M0)
    ui/                     # headless primitives (shadcn-style)
  lib/
    db.ts                   # Dexie instance + tables       (M1)
    types.ts                # Trip, Media, Reel interfaces   (M1)
    opfs.ts                 # OPFS read/write/delete helpers (M2)
    exif.ts                 # exifr wrapper                  (M2)
    dayKey.ts               # takenAt -> YYYY-MM-DD          (M2)
    thumbnail.ts            # downscaled JPEG thumbnails     (M2)
    geocode.ts              # Nominatim reverse geocode      (M3)
    reel/
      storyboard.ts         # photos -> timed segments       (M4)
      canvasRenderer.ts     # Ken-Burns draw loop            (M4)
      audioMixer.ts         # Web Audio music track          (M4)
      recorder.ts           # captureStream + MediaRecorder  (M4)
      ffmpeg.ts             # ffmpeg.wasm trim/concat         (M5)
  hooks/
    useLiveQuery.ts         # re-export dexie-react-hooks     (M1)
  test/
    setup.ts                # vitest + jsdom + fake-indexeddb (M0)
public/
  manifest.webmanifest      # PWA manifest    (M0)
  icons/                    # PWA icons       (M0)
  music/                    # CC0 audio tracks (M4)
  sw.js / generated SW      # service worker  (M0, hardened M6)
```

### Test tooling

- **Unit / component:** [Vitest](https://vitest.dev) + `@testing-library/react` +
  `jsdom`. IndexedDB is faked with `fake-indexeddb` in `src/test/setup.ts`.
- **What gets a real automated test:** pure logic and data access — `dayKey`
  derivation, EXIF field mapping, Dexie queries, clustering math, storyboard
  timing, manifest/export shape.
- **What gets a documented manual check instead:** anything device- or codec-
  specific where a jsdom test would be theater — PWA install on a real iPhone,
  reel video playback/quality, OPFS eviction behaviour, MapLibre rendering. These
  appear as explicit **Manual verification** steps with exact expected
  observations. Test on a real iPhone early when touching M4/M5 (per the plan's
  Key Risks).

### Working agreement

- **TDD:** write the failing test, watch it fail, write minimal code, watch it
  pass, refactor, commit. Pure-logic tasks follow this strictly.
- **Frequent commits:** one logical change per commit, conventional-commit
  messages (`feat:`, `fix:`, `chore:`, `test:`).
- **DRY / YAGNI:** build only what the milestone's "Done when" needs.

## Status tracking

Each plan uses checkbox steps (`- [ ]`). Check them off as you go. A milestone is
done when its **Done when** line (carried from the master plan) is satisfied.
