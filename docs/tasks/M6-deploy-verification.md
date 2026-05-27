# M6 — Deployment verification checklist

> Run this after the M6 branch is deployed to Amplify. Covers Task 7 of
> `M6-polish-pwa-export.md` plus the desktop-export fix that landed as `84636a7`.
> Tick boxes as you go. Record any failures inline (date + browser + observed).

**Deploy:** _<add deploy URL once Amplify is up>_
**Tester:** _<your name>_
**Tested on:** _<date>_

---

## A. Desktop browsers

Open the deployed URL in each browser. Do a fresh hard-reload (Cmd+Shift+R) so
the new service worker installs clean.

### A1. macOS Safari
- [ ] Loads with the desktop sidebar visible (Trips + Settings).
- [ ] Trip cards lay out in multiple columns at wide widths.
- [ ] Create trip → import a few photos → day timeline groups by day.
- [ ] Photo map renders + clusters.
- [ ] Make a reel for one day → preview plays inline with music.
- [ ] **Export trip** → share sheet OR direct download succeeds; zip contains
  `manifest.json`, `reels/…`, `media/…`.
- [ ] Settings page reads cleanly (storage usage shows, durable-storage status
  reads "granted" or "best-effort").

### A2. macOS Edge (where the NotAllowedError bug was found)
- [ ] **Export trip** downloads the `.zip` directly (no more
  `NotAllowedError / Permission denied`). ← *regression check for `84636a7`*
- [ ] Reel preview + share/download works.
- [ ] Sidebar nav + multi-column trip grid render correctly.

### A3. macOS Chrome (smoke)
- [ ] **Export trip** downloads the zip.
- [ ] Map + reel + settings load.

### A4. macOS Firefox (smoke)
- [ ] **Export trip** downloads the zip via the anchor fallback.
- [ ] Map + reel + settings load.

### A5. Empty/error states (any one desktop browser)
- [ ] Empty trips list → friendly empty state (not blank).
- [ ] Trip with no media → DayTimeline shows empty state.
- [ ] Try to render a reel on a day with no photos → friendly error state with
  Retry button (not a crash).

---

## B. iPhone — installed PWA

Open the deployed URL in iOS Safari, tap Share → **Add to Home Screen**, then
launch from the home-screen icon for every test below.

### B1. Offline shell (Task 7, step 1)
- [ ] Open the installed PWA once while online so the service worker installs
  and the precache populates.
- [ ] Enable Airplane Mode → relaunch the PWA.
- [ ] App shell loads (the Trips list page renders, not a "no internet" screen).
- [ ] Navigate to a previously-viewed trip; it loads from cache.
- [ ] Media thumbnails render (these are read from OPFS, not the network).
- [ ] Map page either renders cached tiles or degrades gracefully — note which.

### B2. Full DoD flow (Task 7, step 2)
Online, end-to-end:
- [ ] Create a trip with start/end dates.
- [ ] Import several photos (HEIC + JPEG mix if possible).
- [ ] Photos grouped by day in the timeline.
- [ ] Map shows photos clustered by location.
- [ ] Make a music-backed reel for a day; preview plays with audio.
- [ ] Share or download the rendered reel via the system share sheet.

### B3. Export (Task 7, step 3)
- [ ] From the trip page tap **Export trip**.
- [ ] iOS share sheet offers the `.zip` (Save to Files, Mail, AirDrop, etc.).
- [ ] Save to Files; open the zip in Files.
- [ ] Confirm contents: `manifest.json`, `reels/<dayKey>-<id>.mp4`,
  `media/<dayKey>/<filename>`.
- [ ] Open `manifest.json` and sanity-check `version: 1`, `trip.name`, `days[]`,
  `media[]`, `reels[]`.

### B4. Settings (Task 7, step 4)
- [ ] Open Settings from the bottom nav.
- [ ] Storage usage shows "_N_ MB used of ~_M_ MB" with real numbers.
- [ ] Durable storage status reads "granted" or "best-effort"; if best-effort,
  tap **Request durable storage** and confirm the status flips to "granted"
  (iOS may or may not grant — note the result).
- [ ] iOS eviction copy reads clearly.

### B5. Empty / error states (Task 7, step 5)
- [ ] Open an empty trip → friendly empty state.
- [ ] Visit a trip with media that has no GPS → photo map shows the trip
  without crashing.
- [ ] Try to render a reel on a day with no photos → ErrorState with Retry,
  not a blank screen.

### B6. Persistence (Task 7, step 6)
- [ ] Force-close the PWA (swipe up from app switcher) and reopen.
- [ ] All trips, media, and reels still present.
- [ ] Re-export the same trip and confirm the zip is byte-identical-ish
  (timestamps differ, content shouldn't).

### B7. PWA install hygiene
- [ ] App icon on home screen is the expected Triptales icon (not the
  generic favicon).
- [ ] Standalone launch (no Safari chrome).
- [ ] Safe-area-inset handled (no UI under the notch/home indicator).

---

## C. Service worker hardening (cross-cuts A + B)

Use DevTools → Application → Service Workers on desktop, and
Settings → Safari → Advanced → Web Inspector on iOS for these.

- [ ] After deploy, SW shows as **activated** (`triptales-shell-v2`).
- [ ] Cache `triptales-shell-v2` contains the precached manifest entries
  (Trips/, Settings/, _next/static chunks, etc.).
- [ ] On a subsequent deploy: confirm the new SW installs *and* the old
  cache is purged on activate. (Will fail until `CACHE` is bumped to v3 — see
  follow-ups below.)
- [ ] Cross-origin requests (OSM tiles `tile.openstreetmap.org`, Nominatim,
  unpkg ffmpeg cores) are NOT showing up in the SW cache.

---

## D. Known follow-ups (not blockers — capture if seen in the wild)

These are documented in `M6-polish-pwa-export.md` post-ship list. Flag here only
if a test surfaces one:

1. **Real CC0 music** — placeholders are 5 procedurally-generated tones; replace
   before any public demo. (LICENSES.md sources: Pixabay, Free Music Archive.)
2. **`exportTrip` OOM on multi-GB trips** — no size cap; reads all media into
   memory then zips. Note trip size if export hangs or crashes.
3. **Partial-blob handling** — if any OPFS read fails, the entire export
   rejects. Capture if you see a trip refuse to export.
4. **`cache.addAll` is atomic** — one bad URL silently demotes precache to
   shell-only. Watch the SW install log on first deploy.
5. **`CACHE` name bump per deploy** — `public/sw.js` constant must be bumped
   when SW or precached assets change. Currently `triptales-shell-v2`.
6. **Filename hardening** — trip names with `/`, `:`, `*`, etc. produce zips
   that may not save on Windows.

---

## E. Sign-off

When A + B all pass:

- [ ] Update `MEMORY.md` if anything surprising surfaced (timing, UX, iOS
  quirks) — convert to a `feedback` or `project` memory.
- [ ] Mark Task 7 complete in the task tracker.
- [ ] Merge `feat/m6-polish-pwa-export` (and `feat/m5-reel-video-ffmpeg` if
  it hasn't merged yet) → `main`.
- [ ] Tag the deploy commit (`m6-shipped` or similar) so the post-ship
  follow-ups have a known baseline.

**Phase 1 of Triptales is done when this checklist is green.**
