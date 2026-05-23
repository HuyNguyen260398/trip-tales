# M4 — Daily Reel v1 (Photos + Music) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **In-browser video is the project's hard part — test on a real iPhone early and feature-detect codecs.**

**Goal:** For a selected day, render a slideshow reel — photos drawn to a canvas with Ken-Burns pan/zoom + crossfades, captured via `canvas.captureStream()`, mixed with a bundled CC0 track through Web Audio, recorded with `MediaRecorder`. Preview in-app; download or Web-Share; persist the reel.

**Architecture:** A pure `storyboard` function turns a day's media into deterministic, timed segments (per-photo duration, crossfade windows, Ken-Burns transforms) — fully unit-tested. An imperative `canvasRenderer` plays that storyboard frame-by-frame onto a canvas; `audioMixer` routes a decoded music buffer into the same `MediaStream`; `recorder` wires `captureStream` + audio track into a `MediaRecorder` and resolves a blob. The reel blob goes to OPFS and a `reels` row to Dexie. Codecs are feature-detected (Safari ≠ Chrome).

**Tech Stack:** Canvas 2D, `HTMLCanvasElement.captureStream`, Web Audio API, `MediaRecorder`, Web Share API, OPFS, Dexie, Vitest.

**Done when:** one tap turns a day's photos into a ~20–30s watchable reel with music.

---

## File Structure

- `src/lib/reel/storyboard.ts` — `buildStoryboard(media, opts): Segment[]`
- `src/lib/reel/storyboard.test.ts`
- `src/lib/reel/codec.ts` — `pickRecorderMime()` feature detection
- `src/lib/reel/codec.test.ts`
- `src/lib/reel/kenburns.ts` — `kenBurnsTransform(seg, t): {scale, dx, dy}`
- `src/lib/reel/kenburns.test.ts`
- `src/lib/reel/audioMixer.ts` — decode + loop a track into a MediaStreamTrack
- `src/lib/reel/canvasRenderer.ts` — play storyboard onto a canvas
- `src/lib/reel/recorder.ts` — orchestrate render+record → Blob
- `src/lib/reels.ts` — `saveReel`, `listReelsByTrip`, `getReel`, `deleteReel`
- `src/lib/reels.test.ts`
- `src/lib/music.ts` — bundled track catalogue
- `src/components/ReelBuilder.tsx` — day picker + music picker + render button + preview
- `src/app/reel/page.tsx` — `/reel?trip=<id>&day=<dayKey>`
- `public/music/*.mp3` — CC0 tracks + `public/music/LICENSES.md`
- Modify: `src/app/trip/page.tsx` — per-day "Make reel" entry

---

## Task 1: Storyboard timing (TDD)

**Files:**
- Create: `src/lib/reel/storyboard.ts`, `src/lib/reel/storyboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reel/storyboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStoryboard, DEFAULT_REEL_OPTS } from "./storyboard";
import type { Media } from "../types";

function photo(id: string): Media {
  return { id, tripId: "t", dayKey: "2026-04-07", takenAt: Number(id),
    type: "photo", opfsPath: `${id}.jpg`, thumbPath: `${id}.t.jpg` };
}

describe("buildStoryboard", () => {
  it("creates one segment per photo in capture order", () => {
    const segs = buildStoryboard([photo("1"), photo("2"), photo("3")], DEFAULT_REEL_OPTS);
    expect(segs.map((s) => s.mediaId)).toEqual(["1", "2", "3"]);
  });

  it("excludes videos in v1 (photos only)", () => {
    const vid: Media = { ...photo("v"), type: "video" };
    const segs = buildStoryboard([photo("1"), vid], DEFAULT_REEL_OPTS);
    expect(segs.map((s) => s.mediaId)).toEqual(["1"]);
  });

  it("segments are contiguous and overlap by the crossfade amount", () => {
    const segs = buildStoryboard([photo("1"), photo("2")], DEFAULT_REEL_OPTS);
    // segment 2 starts crossfade seconds before segment 1 ends
    const overlap = segs[0].endSec - segs[1].startSec;
    expect(overlap).toBeCloseTo(DEFAULT_REEL_OPTS.crossfadeSec, 5);
  });

  it("total duration scales with photo count and stays near the per-photo budget", () => {
    const segs = buildStoryboard([photo("1"), photo("2"), photo("3")], DEFAULT_REEL_OPTS);
    const total = segs[segs.length - 1].endSec;
    // 3 photos * 3s, minus 2 overlaps * 0.5s = 8s
    expect(total).toBeCloseTo(8, 5);
  });

  it("assigns a deterministic alternating Ken-Burns direction", () => {
    const segs = buildStoryboard([photo("1"), photo("2")], DEFAULT_REEL_OPTS);
    expect(segs[0].zoomIn).not.toBe(segs[1].zoomIn);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/reel/storyboard.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/reel/storyboard.ts`:

```ts
import type { Media } from "../types";

export interface ReelOptions {
  perPhotoSec: number;
  crossfadeSec: number;
}

export const DEFAULT_REEL_OPTS: ReelOptions = { perPhotoSec: 3, crossfadeSec: 0.5 };

export interface Segment {
  mediaId: string;
  opfsPath: string;
  startSec: number;
  endSec: number;
  /** true = Ken-Burns zooms in over the segment, false = zooms out. */
  zoomIn: boolean;
}

/**
 * Turn a day's media into timed slideshow segments. v1 is photos-only; segments
 * are contiguous and overlap by `crossfadeSec` for crossfades. Deterministic so
 * tests and re-renders match.
 */
export function buildStoryboard(media: Media[], opts: ReelOptions): Segment[] {
  const photos = media.filter((m) => m.type === "photo");
  const { perPhotoSec, crossfadeSec } = opts;
  const step = perPhotoSec - crossfadeSec; // advance per photo after the first
  return photos.map((m, i) => {
    const startSec = i === 0 ? 0 : i * step;
    return {
      mediaId: m.id,
      opfsPath: m.opfsPath,
      startSec,
      endSec: startSec + perPhotoSec,
      zoomIn: i % 2 === 0,
    };
  });
}

/** Total reel length in seconds (end of the last segment). */
export function storyboardDuration(segs: Segment[]): number {
  return segs.length ? segs[segs.length - 1].endSec : 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/reel/storyboard.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reel/storyboard.ts src/lib/reel/storyboard.test.ts
git commit -m "feat: deterministic reel storyboard timing (TDD)"
```

---

## Task 2: Ken-Burns transform (TDD)

**Files:**
- Create: `src/lib/reel/kenburns.ts`, `src/lib/reel/kenburns.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reel/kenburns.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kenBurnsScale } from "./kenburns";

describe("kenBurnsScale", () => {
  it("zoom-in starts at 1.0 and ends at the max scale", () => {
    expect(kenBurnsScale(true, 0)).toBeCloseTo(1.0, 5);
    expect(kenBurnsScale(true, 1)).toBeCloseTo(1.12, 5);
  });

  it("zoom-out starts at max scale and ends at 1.0", () => {
    expect(kenBurnsScale(false, 0)).toBeCloseTo(1.12, 5);
    expect(kenBurnsScale(false, 1)).toBeCloseTo(1.0, 5);
  });

  it("is linear at the midpoint", () => {
    expect(kenBurnsScale(true, 0.5)).toBeCloseTo(1.06, 5);
  });

  it("clamps progress outside [0,1]", () => {
    expect(kenBurnsScale(true, -1)).toBeCloseTo(1.0, 5);
    expect(kenBurnsScale(true, 2)).toBeCloseTo(1.12, 5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/reel/kenburns.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/reel/kenburns.ts`:

```ts
const MAX_SCALE = 1.12;

/** Scale factor for a Ken-Burns effect at progress `t` (0..1) through a segment. */
export function kenBurnsScale(zoomIn: boolean, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return zoomIn ? 1 + (MAX_SCALE - 1) * p : MAX_SCALE - (MAX_SCALE - 1) * p;
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/reel/kenburns.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reel/kenburns.ts src/lib/reel/kenburns.test.ts
git commit -m "feat: Ken-Burns scale curve (TDD)"
```

---

## Task 3: Recorder codec feature detection (TDD)

**Files:**
- Create: `src/lib/reel/codec.ts`, `src/lib/reel/codec.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reel/codec.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { pickRecorderMime, CANDIDATE_MIMES } from "./codec";

afterEach(() => vi.unstubAllGlobals());

describe("pickRecorderMime", () => {
  it("returns the first supported candidate in priority order", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (t: string) => t === CANDIDATE_MIMES[1],
    });
    expect(pickRecorderMime()).toBe(CANDIDATE_MIMES[1]);
  });

  it("returns null when none are supported", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickRecorderMime()).toBeNull();
  });

  it("returns null when MediaRecorder is unavailable", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecorderMime()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/reel/codec.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/reel/codec.ts`:

```ts
/**
 * Output container/codec candidates in preference order. Safari historically
 * records MP4/H.264; Chromium prefers WebM. We try MP4 first for portability,
 * then fall back.
 */
export const CANDIDATE_MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

/** First MediaRecorder mime the runtime supports, or null if none/no recorder. */
export function pickRecorderMime(): string | null {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return null;
  for (const mime of CANDIDATE_MIMES) {
    if (MR.isTypeSupported(mime)) return mime;
  }
  return null;
}

/** File extension for a chosen mime. */
export function extForMime(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/reel/codec.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reel/codec.ts src/lib/reel/codec.test.ts
git commit -m "feat: MediaRecorder codec feature detection (TDD)"
```

---

## Task 4: Bundled CC0 music catalogue

**Files:**
- Create: `public/music/`, `public/music/LICENSES.md`, `src/lib/music.ts`

> Never bundle copyrighted songs. Use CC0 / properly-licensed tracks only.

- [ ] **Step 1: Add tracks + license record**

Place 2–3 CC0 MP3s in `public/music/` (e.g. from Pixabay/FMA CC0). Create
`public/music/LICENSES.md` documenting each track's source + license. Example:

```markdown
# Bundled music — licenses

All tracks are CC0 / public domain, safe to redistribute in the app.

- sunrise.mp3 — "<title>" by <artist>, CC0, <source URL>
- wander.mp3 — "<title>" by <artist>, CC0, <source URL>
```

- [ ] **Step 2: Implement the catalogue**

Create `src/lib/music.ts`:

```ts
export interface Track {
  id: string;
  title: string;
  /** public path served statically. */
  src: string;
}

export const TRACKS: Track[] = [
  { id: "sunrise", title: "Sunrise", src: "/music/sunrise.mp3" },
  { id: "wander", title: "Wander", src: "/music/wander.mp3" },
];

export function getTrack(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}
```

- [ ] **Step 3: Commit**

```bash
git add public/music src/lib/music.ts
git commit -m "feat: bundled CC0 music catalogue + licenses"
```

---

## Task 5: Audio mixer (Web Audio → MediaStreamTrack)

**Files:**
- Create: `src/lib/reel/audioMixer.ts`

> Web Audio decoding isn't testable in jsdom; verified by build + manual reel
> check. Keep the surface minimal.

- [ ] **Step 1: Implement**

Create `src/lib/reel/audioMixer.ts`:

```ts
export interface AudioMix {
  audioTrack: MediaStreamTrack;
  start: () => void;
  stop: () => void;
}

/**
 * Decode a music file and expose it as a MediaStreamTrack to feed into the
 * recorder, plus start/stop controls. The track loops so short songs cover the
 * whole reel.
 */
export async function createAudioMix(src: string): Promise<AudioMix> {
  const ctx = new AudioContext();
  const buf = await fetch(src).then((r) => r.arrayBuffer());
  const audioBuffer = await ctx.decodeAudioData(buf);

  const dest = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(dest);

  return {
    audioTrack: dest.stream.getAudioTracks()[0],
    start: () => {
      ctx.resume();
      source.start();
    },
    stop: () => {
      try { source.stop(); } catch { /* already stopped */ }
      ctx.close();
    },
  };
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/lib/reel/audioMixer.ts
git commit -m "feat: Web Audio music mixer exposing a MediaStreamTrack"
```

---

## Task 6: Canvas renderer (storyboard → frames)

**Files:**
- Create: `src/lib/reel/canvasRenderer.ts`

> Canvas drawing/`requestAnimationFrame` aren't meaningfully testable in jsdom;
> the timing/scale math it relies on is covered by Tasks 1–2. Verified by the
> manual reel check.

- [ ] **Step 1: Implement**

Create `src/lib/reel/canvasRenderer.ts`:

```ts
import type { Segment } from "./storyboard";
import { kenBurnsScale } from "./kenburns";
import { readBlob } from "../opfs";

const WIDTH = 720;
const HEIGHT = 1280; // portrait reel, 720p cap

/** Load each segment's photo into an ImageBitmap keyed by mediaId. */
async function loadBitmaps(segs: Segment[]): Promise<Map<string, ImageBitmap>> {
  const map = new Map<string, ImageBitmap>();
  for (const s of segs) {
    const blob = await readBlob(s.opfsPath);
    map.set(s.mediaId, await createImageBitmap(blob));
  }
  return map;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  scale: number
) {
  const baseScale = Math.max(WIDTH / bmp.width, HEIGHT / bmp.height) * scale;
  const w = bmp.width * baseScale;
  const h = bmp.height * baseScale;
  ctx.drawImage(bmp, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

export interface ReelRender {
  canvas: HTMLCanvasElement;
  durationSec: number;
  /** Plays the slideshow to completion, resolving when the last frame is drawn. */
  play: () => Promise<void>;
}

/** Prepare a canvas-based render of the storyboard. */
export async function createCanvasRender(segs: Segment[]): Promise<ReelRender> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const bitmaps = await loadBitmaps(segs);
  const durationSec = segs.length ? segs[segs.length - 1].endSec : 0;

  function drawAt(elapsed: number) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const s of segs) {
      if (elapsed < s.startSec || elapsed > s.endSec) continue;
      const local = (elapsed - s.startSec) / (s.endSec - s.startSec);
      const bmp = bitmaps.get(s.mediaId)!;
      // Crossfade: fade in over the segment's first 0.5s, out over its last 0.5s.
      const fade = Math.min(1, (elapsed - s.startSec) / 0.5, (s.endSec - elapsed) / 0.5);
      ctx.globalAlpha = Math.max(0, fade);
      drawCover(ctx, bmp, kenBurnsScale(s.zoomIn, local));
      ctx.globalAlpha = 1;
    }
  }

  function play(): Promise<void> {
    return new Promise((resolve) => {
      const startTs = performance.now();
      const frame = (now: number) => {
        const elapsed = (now - startTs) / 1000;
        drawAt(elapsed);
        if (elapsed >= durationSec) {
          bitmaps.forEach((b) => b.close());
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  return { canvas, durationSec, play };
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/lib/reel/canvasRenderer.ts
git commit -m "feat: canvas storyboard renderer with Ken-Burns + crossfade"
```

---

## Task 7: Recorder orchestration

**Files:**
- Create: `src/lib/reel/recorder.ts`

- [ ] **Step 1: Implement**

Create `src/lib/reel/recorder.ts`:

```ts
import type { Segment } from "./storyboard";
import { createCanvasRender } from "./canvasRenderer";
import { createAudioMix } from "./audioMixer";
import { pickRecorderMime } from "./codec";

export interface RenderedReel {
  blob: Blob;
  mime: string;
  durationSec: number;
}

export class CodecUnsupportedError extends Error {
  constructor() {
    super("No supported MediaRecorder video codec on this browser.");
  }
}

/**
 * Render the storyboard to a canvas, capture its stream, mix in music, record
 * with MediaRecorder, and resolve a video blob. Throws CodecUnsupportedError if
 * the browser can't record any candidate format.
 */
export async function renderReel(
  segs: Segment[],
  musicSrc: string
): Promise<RenderedReel> {
  const mime = pickRecorderMime();
  if (!mime) throw new CodecUnsupportedError();

  const render = await createCanvasRender(segs);
  const stream = render.canvas.captureStream(30);
  const audio = await createAudioMix(musicSrc);
  stream.addTrack(audio.audioTrack);

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  recorder.start();
  audio.start();
  await render.play();
  audio.stop();
  recorder.stop();

  return { blob: await done, mime, durationSec: render.durationSec };
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/lib/reel/recorder.ts
git commit -m "feat: reel recorder orchestration (captureStream + audio + MediaRecorder)"
```

---

## Task 8: Reels persistence (TDD)

**Files:**
- Create: `src/lib/reels.ts`, `src/lib/reels.test.ts`

- [ ] **Step 1: Write the failing tests (inject opfs writer)**

Create `src/lib/reels.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "./db";
import { saveReel, listReelsByTrip, getReelForDay } from "./reels";

beforeEach(async () => {
  await db.reels.clear();
});

const writeBlob = vi.fn(async (path: string) => path);

describe("saveReel", () => {
  it("writes the blob to OPFS and stores a reel record", async () => {
    const blob = new Blob(["x"], { type: "video/mp4" });
    const reel = await saveReel(
      { tripId: "t", dayKey: "2026-04-07", musicId: "sunrise", durationSec: 8, blob, ext: "mp4" },
      { writeBlob }
    );
    expect(writeBlob).toHaveBeenCalledOnce();
    expect(reel.opfsPath).toMatch(/\.mp4$/);
    expect(await getReelForDay("t", "2026-04-07")).toMatchObject({ musicId: "sunrise" });
  });

  it("replaces an existing reel for the same day", async () => {
    const mk = (music: string) => ({
      tripId: "t", dayKey: "2026-04-07", musicId: music, durationSec: 8,
      blob: new Blob(["x"]), ext: "mp4",
    });
    await saveReel(mk("a"), { writeBlob });
    await saveReel(mk("b"), { writeBlob });
    const reels = await listReelsByTrip("t");
    expect(reels).toHaveLength(1);
    expect(reels[0].musicId).toBe("b");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/reels.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/reels.ts`:

```ts
import { db } from "./db";
import { newId } from "./id";
import { writeBlob as realWriteBlob, deleteFile } from "./opfs";
import type { Reel } from "./types";

export interface SaveReelInput {
  tripId: string;
  dayKey: string;
  musicId: string;
  durationSec: number;
  blob: Blob;
  ext: string;
}

export interface ReelDeps {
  writeBlob: typeof realWriteBlob;
}

const defaultDeps: ReelDeps = { writeBlob: realWriteBlob };

export async function saveReel(
  input: SaveReelInput,
  deps: ReelDeps = defaultDeps
): Promise<Reel> {
  // One reel per day: drop any existing one (record + blob) first.
  const existing = await getReelForDay(input.tripId, input.dayKey);
  if (existing) {
    await deleteFile(existing.opfsPath).catch(() => {});
    await db.reels.delete(existing.id);
  }

  const id = newId();
  const opfsPath = await deps.writeBlob(`reel-${id}.${input.ext}`, input.blob);
  const reel: Reel = {
    id,
    tripId: input.tripId,
    dayKey: input.dayKey,
    opfsPath,
    musicId: input.musicId,
    createdAt: Date.now(),
    durationSec: input.durationSec,
  };
  await db.reels.add(reel);
  return reel;
}

export function listReelsByTrip(tripId: string): Promise<Reel[]> {
  return db.reels.where("tripId").equals(tripId).toArray();
}

export async function getReelForDay(tripId: string, dayKey: string): Promise<Reel | undefined> {
  return db.reels.where("[tripId+dayKey]").equals([tripId, dayKey]).first();
}

export async function deleteReel(id: string): Promise<void> {
  const reel = await db.reels.get(id);
  if (!reel) return;
  await deleteFile(reel.opfsPath).catch(() => {});
  await db.reels.delete(id);
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/reels.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reels.ts src/lib/reels.test.ts
git commit -m "feat: reels persistence (one per day) with OPFS blob (TDD)"
```

---

## Task 9: ReelBuilder component

**Files:**
- Create: `src/components/ReelBuilder.tsx`

- [ ] **Step 1: Implement (music picker, render, preview, save, share/download)**

Create `src/components/ReelBuilder.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { mediaByDay } from "@/lib/media";
import { buildStoryboard, DEFAULT_REEL_OPTS } from "@/lib/reel/storyboard";
import { renderReel, CodecUnsupportedError } from "@/lib/reel/recorder";
import { extForMime } from "@/lib/reel/codec";
import { saveReel, getReelForDay } from "@/lib/reels";
import { objectUrl } from "@/lib/opfs";
import { TRACKS } from "@/lib/music";

type Status = "idle" | "rendering" | "error";

export default function ReelBuilder({ tripId, dayKey }: { tripId: string; dayKey: string }) {
  const groups = useLiveQuery(() => mediaByDay(tripId), [tripId]);
  const existing = useLiveQuery(() => getReelForDay(tripId, dayKey), [tripId, dayKey]);
  const [musicId, setMusicId] = useState(TRACKS[0]?.id ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const day = groups?.find((g) => g.dayKey === dayKey);
  const photoCount = day?.items.filter((m) => m.type === "photo").length ?? 0;

  // Show the persisted reel if one exists.
  useEffect(() => {
    if (!existing) return;
    let u: string | null = null;
    objectUrl(existing.opfsPath).then((x) => { u = x; setPreviewUrl(x); });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [existing]);

  async function handleRender() {
    if (!day) return;
    const track = TRACKS.find((t) => t.id === musicId);
    if (!track) return;
    setStatus("rendering");
    setError(null);
    try {
      const segs = buildStoryboard(day.items, DEFAULT_REEL_OPTS);
      const { blob, mime, durationSec } = await renderReel(segs, track.src);
      await saveReel({ tripId, dayKey, musicId, durationSec, blob, ext: extForMime(mime) });
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e instanceof CodecUnsupportedError
        ? "Your browser can't record video. Try Safari or Chrome."
        : "Reel render failed. Try fewer photos.");
    }
  }

  async function handleShare() {
    if (!existing) return;
    const blob = await (await fetch(previewUrl!)).blob();
    const file = new File([blob], `${dayKey}.${extForMime(blob.type || "video/mp4")}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Triptales — ${dayKey}` });
    } else {
      const a = document.createElement("a");
      a.href = previewUrl!;
      a.download = file.name;
      a.click();
    }
  }

  return (
    // Controls stack above the preview on phones; sit beside a larger preview on desktop.
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
        <p className="text-sm text-neutral-400">{photoCount} photo{photoCount !== 1 ? "s" : ""} this day</p>

        <label className="flex flex-col gap-1 text-sm">
          Music
          <select value={musicId} onChange={(e) => setMusicId(e.target.value)}
            className="rounded-lg bg-neutral-900 p-3">
            {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>

        <button onClick={handleRender} disabled={status === "rendering" || photoCount === 0}
          className="rounded-xl bg-white p-3 font-medium text-neutral-950 disabled:opacity-40">
          {status === "rendering" ? "Rendering…" : existing ? "Re-render reel" : "Make reel"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {previewUrl && (
        <div className="flex flex-1 flex-col gap-2">
          <video src={previewUrl} controls playsInline className="w-full rounded-xl bg-black" />
          <button onClick={handleShare} className="rounded-xl bg-neutral-800 p-3 text-sm">
            Share / download
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/components/ReelBuilder.tsx
git commit -m "feat: ReelBuilder — render, preview, save, share/download"
```

---

## Task 10: Reel route + per-day entry point

**Files:**
- Create: `src/app/reel/page.tsx`
- Modify: `src/components/DayTimeline.tsx` (add a "Make reel" link per day header)

- [ ] **Step 1: Implement `/reel?trip=<id>&day=<dayKey>`**

Create `src/app/reel/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReelBuilder from "@/components/ReelBuilder";

function ReelView() {
  const router = useRouter();
  const params = useSearchParams();
  const tripId = params.get("trip") ?? "";
  const dayKey = params.get("day") ?? "";
  if (!tripId || !dayKey) return <p className="p-6 text-neutral-500">Missing trip or day.</p>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <button onClick={() => router.push(`/trip?id=${tripId}`)} className="self-start text-sm text-neutral-400">
        ← Trip
      </button>
      <h1 className="text-2xl font-semibold">Reel · {dayKey}</h1>
      <ReelBuilder tripId={tripId} dayKey={dayKey} />
    </main>
  );
}

export default function ReelPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <ReelView />
    </Suspense>
  );
}
```

- [ ] **Step 2: Add a per-day "Make reel" link in DayTimeline**

In `src/components/DayTimeline.tsx`, add `import Link from "next/link";`, and inside
each `<section>`'s header area add a link (the timeline already has `tripId` and
`g.dayKey`):

```tsx
<Link href={`/reel?trip=${tripId}&day=${g.dayKey}`}
  className="text-xs text-blue-400">Make reel →</Link>
```

(Place it next to the existing `<h2>` day label, e.g. wrap them in a flex row.)

- [ ] **Step 3: Verify export builds the route + full suite**

Run:
```bash
pnpm test && pnpm build
test -f out/reel/index.html && echo "REEL ROUTE EXPORTED"
```
Expected: tests pass; `REEL ROUTE EXPORTED`.

- [ ] **Step 4: Commit**

```bash
git add src/app/reel/page.tsx src/components/DayTimeline.tsx
git commit -m "feat: /reel route + per-day Make reel entry point"
```

---

## Task 11: Manual verification — render a real reel on a real iPhone

> This is the milestone's hard part and acceptance check. **Test on your iPhone.**

- [ ] **Step 1:** Open a day that has several photos → **Make reel**.
- [ ] **Step 2:** Confirm rendering completes (no codec error) and a `<video>`
  preview appears that **plays inline** with music.
- [ ] **Step 3:** Confirm the reel is ~`perPhotoSec × photoCount` long, photos
  Ken-Burns pan/zoom, and transitions crossfade.
- [ ] **Step 4:** Tap **Share / download** → confirm the iOS share sheet appears
  with the video file (or it downloads where share isn't available).
- [ ] **Step 5:** Switch the music track and **Re-render** → confirm the new track
  is used and the old reel is replaced (one reel per day).
- [ ] **Step 6:** Reload the reel page → confirm the saved reel reloads from OPFS.
- [ ] **Step 7 (codec sanity):** If render fails on iOS, check `pickRecorderMime()`
  in the console — Safari may only support a subset; adjust `CANDIDATE_MIMES`
  order. Cap photos if memory pressure causes failures.

If one tap turns a day's photos into a ~20–30s watchable reel with music, **M4 is
done.**

---

## Self-Review

- **Spec coverage:** canvas slideshow with Ken-Burns + crossfade (Tasks 1, 2, 6);
  `captureStream` + `MediaRecorder` (Task 7); Web Audio music mix (Task 5);
  preview + download/Web-Share (Task 9); persisted reel (Task 8). 720p / ~30s cap
  + codec feature detection mitigations (Tasks 3, 6). All M4 items covered.
- **Type consistency:** `Segment`/`ReelOptions` from storyboard reused by renderer
  and recorder; `Reel` type from `types.ts`; `mediaByDay` (M2) feeds the builder;
  `getReelForDay` uses the `[tripId+dayKey]` index from M1.
- **Responsive:** the reel builder stacks controls above the preview on phones and
  sits them beside a larger preview on desktop (`lg:flex-row`); the M5 video options
  drop into the same controls column.
- **Constraint check:** rendering and recording are fully client-side; reel blobs
  in OPFS, records in IndexedDB; music is bundled CC0; routes are query-param +
  `<Suspense>`. Static-export safe.
