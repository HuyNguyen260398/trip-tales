# M5 — Daily Reel v2 (Video Clips via ffmpeg.wasm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **ffmpeg.wasm is memory-hungry on mobile — cap resolution/length and test on a real iPhone.**

**Goal:** Extend the reel so it can include short video clips trimmed and concatenated alongside the photo slideshow, with simple options (clip length cap, music, resolution cap).

**Architecture:** Keep the M4 photo pipeline as-is. Videos become their own segments: the M4 photo render produces a `photos.<ext>` blob; `ffmpeg.wasm` then trims each chosen video to the per-clip cap, normalizes all parts to one resolution/codec, concatenates `[photos + clips]` in capture order, and remuxes with the music track. ffmpeg loads lazily (large wasm) and is feature-gated behind `crossOriginIsolated` (required for its threaded build). A pure `buildConcatPlan` decides ordering/trim windows and is unit-tested; the ffmpeg calls themselves are verified on device.

**Tech Stack:** @ffmpeg/ffmpeg + @ffmpeg/util (ffmpeg.wasm), the M4 canvas/recorder pipeline, OPFS, Dexie, Vitest. Requires COOP/COEP headers for SharedArrayBuffer.

**Done when:** reels can include actual video footage, not just stills.

---

## Cross-origin isolation prerequisite

ffmpeg.wasm's multithreaded build needs `SharedArrayBuffer`, which requires the
page to be **cross-origin isolated** (`crossOriginIsolated === true`). That needs
two response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Under `output: 'export'` we can't set headers in Next. Options, in order of
preference:
1. **Amplify custom headers** — add a `customHttp.yml` / console "Rewrites and
   custom headers" rule applying COOP/COEP to all paths. (Used in Task 1.)
2. **Single-thread ffmpeg build** — `@ffmpeg/core` (non-`-mt`) avoids
   `SharedArrayBuffer` entirely but is slower. Fallback if headers can't be set.

The code path **feature-detects** `crossOriginIsolated` and falls back to
single-thread, so the app degrades instead of breaking.

---

## File Structure

- `customHttp.yml` — Amplify COOP/COEP headers
- `src/lib/reel/concatPlan.ts` — `buildConcatPlan(media, opts)` (pure)
- `src/lib/reel/concatPlan.test.ts`
- `src/lib/reel/ffmpeg.ts` — lazy ffmpeg loader + `trimClip`, `concatParts`, `muxAudio`
- `src/lib/reel/videoReel.ts` — orchestrates photo-render + clip-trim + concat + mux
- `src/components/ReelBuilder.tsx` — add "Include videos", length & resolution options
- `next.config.ts` — dev-only COOP/COEP headers so local testing is isolated

---

## Task 1: ffmpeg deps + cross-origin isolation

**Files:**
- Modify: `package.json`, `next.config.ts`
- Create: `customHttp.yml`

- [ ] **Step 1: Install ffmpeg.wasm**

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

- [ ] **Step 2: Add COOP/COEP headers for local dev**

`output: 'export'` ignores `headers()` in production, but Next's dev server honors
it — so local testing is cross-origin isolated. Add to `next.config.ts`:

```ts
// Dev-only: production headers are set by the host (see customHttp.yml).
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    },
  ];
},
```

(Add it as a property of the existing `nextConfig` object.)

- [ ] **Step 3: Add Amplify production headers**

Create `customHttp.yml`:

```yaml
customHeaders:
  - pattern: "**"
    headers:
      - key: Cross-Origin-Opener-Policy
        value: same-origin
      - key: Cross-Origin-Embedder-Policy
        value: require-corp
```

- [ ] **Step 4: Verify isolation locally**

Run:
```bash
npm run dev
```
In the browser console at `http://localhost:3000`, run `crossOriginIsolated`.
Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts customHttp.yml
git commit -m "chore: add ffmpeg.wasm + COOP/COEP cross-origin isolation"
```

---

## Task 2: Concat plan (TDD)

**Files:**
- Create: `src/lib/reel/concatPlan.ts`, `src/lib/reel/concatPlan.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reel/concatPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildConcatPlan, DEFAULT_VIDEO_OPTS } from "./concatPlan";
import type { Media } from "../types";

function item(id: string, type: "photo" | "video"): Media {
  return { id, tripId: "t", dayKey: "d", takenAt: Number(id.replace(/\D/g, "")),
    type, opfsPath: `${id}.bin`, thumbPath: `${id}.t` };
}

describe("buildConcatPlan", () => {
  it("puts the photo slideshow first, then video clips in capture order", () => {
    const media = [item("p1", "photo"), item("v2", "video"), item("p3", "photo"), item("v4", "video")];
    const plan = buildConcatPlan(media, DEFAULT_VIDEO_OPTS);
    expect(plan.hasPhotos).toBe(true);
    expect(plan.clips.map((c) => c.mediaId)).toEqual(["v2", "v4"]);
  });

  it("caps each clip to maxClipSec", () => {
    const plan = buildConcatPlan([item("v1", "video")], { ...DEFAULT_VIDEO_OPTS, maxClipSec: 4 });
    expect(plan.clips[0].trimSec).toBe(4);
  });

  it("omits the photo part when there are no photos", () => {
    const plan = buildConcatPlan([item("v1", "video")], DEFAULT_VIDEO_OPTS);
    expect(plan.hasPhotos).toBe(false);
  });

  it("carries resolution + clip caps through", () => {
    const plan = buildConcatPlan([item("v1", "video")], { maxClipSec: 5, maxHeight: 720 });
    expect(plan.maxHeight).toBe(720);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/lib/reel/concatPlan.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/reel/concatPlan.ts`:

```ts
import type { Media } from "../types";

export interface VideoReelOptions {
  /** Trim each clip to at most this many seconds. */
  maxClipSec: number;
  /** Cap output height (px); width scales to keep aspect. */
  maxHeight: number;
}

export const DEFAULT_VIDEO_OPTS: VideoReelOptions = { maxClipSec: 5, maxHeight: 720 };

export interface ClipPart {
  mediaId: string;
  opfsPath: string;
  trimSec: number;
}

export interface ConcatPlan {
  hasPhotos: boolean;
  clips: ClipPart[];
  maxHeight: number;
}

/**
 * Decide the assembly order: the photo slideshow (rendered by the M4 pipeline)
 * comes first, then each video clip trimmed to the cap, in capture order.
 */
export function buildConcatPlan(media: Media[], opts: VideoReelOptions): ConcatPlan {
  const ordered = [...media].sort((a, b) => a.takenAt - b.takenAt);
  const clips: ClipPart[] = ordered
    .filter((m) => m.type === "video")
    .map((m) => ({ mediaId: m.id, opfsPath: m.opfsPath, trimSec: opts.maxClipSec }));
  return {
    hasPhotos: ordered.some((m) => m.type === "photo"),
    clips,
    maxHeight: opts.maxHeight,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
npx vitest run src/lib/reel/concatPlan.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reel/concatPlan.ts src/lib/reel/concatPlan.test.ts
git commit -m "feat: video reel concat plan (photos-first, capped clips) (TDD)"
```

---

## Task 3: ffmpeg.wasm wrapper

**Files:**
- Create: `src/lib/reel/ffmpeg.ts`

> The wasm calls can't run in jsdom; verified by build + on-device manual check.
> The ordering logic they consume is covered by Task 2.

- [ ] **Step 1: Implement the lazy loader + ops**

Create `src/lib/reel/ffmpeg.ts`:

```ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegSingleton: FFmpeg | null = null;

/** Lazily load ffmpeg.wasm. Picks the threaded core only when cross-origin isolated. */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const ff = new FFmpeg();
  const mt = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  const base = mt
    ? "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm"
    : "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    ...(mt
      ? { workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript") }
      : {}),
  });
  ffmpegSingleton = ff;
  return ff;
}

/** Trim a clip to `trimSec`, normalize to `height` and a common codec. */
export async function trimAndNormalize(
  ff: FFmpeg,
  input: Blob,
  outName: string,
  trimSec: number,
  height: number
): Promise<string> {
  const inName = `in_${outName}`;
  await ff.writeFile(inName, await fetchFile(input));
  await ff.exec([
    "-i", inName,
    "-t", String(trimSec),
    "-vf", `scale=-2:${height},fps=30,setsar=1`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-an", // strip clip audio; music is added at the end
    outName,
  ]);
  await ff.deleteFile(inName);
  return outName;
}

/** Concatenate normalized parts (same codec/resolution) into one silent video. */
export async function concatParts(ff: FFmpeg, parts: string[], out: string): Promise<string> {
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ff.writeFile("concat.txt", new TextEncoder().encode(list));
  await ff.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", out]);
  return out;
}

/** Mux a music track over the (silent) concatenated video, ending at video length. */
export async function muxAudio(ff: FFmpeg, video: string, music: Blob, out: string): Promise<Blob> {
  await ff.writeFile("music.mp3", await fetchFile(music));
  await ff.exec([
    "-i", video, "-i", "music.mp3",
    "-c:v", "copy", "-c:a", "aac", "-shortest",
    "-map", "0:v:0", "-map", "1:a:0",
    out,
  ]);
  const data = await ff.readFile(out);
  return new Blob([data], { type: "video/mp4" });
}
```

- [ ] **Step 2: Verify build; commit**

```bash
npm run build
git add src/lib/reel/ffmpeg.ts
git commit -m "feat: ffmpeg.wasm wrapper (lazy load, trim, concat, mux)"
```

---

## Task 4: Video reel orchestration

**Files:**
- Create: `src/lib/reel/videoReel.ts`

- [ ] **Step 1: Implement**

Reuse the M4 photo render for the slideshow part (recorded silently), then stitch
clips with ffmpeg. Create `src/lib/reel/videoReel.ts`:

```ts
import type { Media } from "../types";
import { buildStoryboard, DEFAULT_REEL_OPTS, storyboardDuration } from "./storyboard";
import { createCanvasRender } from "./canvasRenderer";
import { pickRecorderMime, extForMime } from "./codec";
import { CodecUnsupportedError } from "./recorder";
import { buildConcatPlan, type VideoReelOptions } from "./concatPlan";
import { getFFmpeg, trimAndNormalize, concatParts, muxAudio } from "./ffmpeg";
import { readBlob } from "../opfs";

/** Record the photo slideshow as a silent video blob (audio added later by mux). */
async function renderSilentPhotos(media: Media[]): Promise<{ blob: Blob; ext: string } | null> {
  const segs = buildStoryboard(media, DEFAULT_REEL_OPTS);
  if (segs.length === 0) return null;
  const mime = pickRecorderMime();
  if (!mime) throw new CodecUnsupportedError();

  const render = await createCanvasRender(segs);
  const stream = render.canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (recorder.onstop = () => res(new Blob(chunks, { type: mime }))));
  recorder.start();
  await render.play();
  recorder.stop();
  return { blob: await done, ext: extForMime(mime) };
}

export interface VideoReelResult {
  blob: Blob;
  durationSec: number;
}

/**
 * Build a reel that includes both photos and video clips:
 * render photos → trim/normalize clips → concat [photos, ...clips] → mux music.
 */
export async function renderVideoReel(
  media: Media[],
  musicSrc: string,
  opts: VideoReelOptions
): Promise<VideoReelResult> {
  const plan = buildConcatPlan(media, opts);
  const ff = await getFFmpeg();
  const parts: string[] = [];

  if (plan.hasPhotos) {
    const photos = await renderSilentPhotos(media);
    if (photos) {
      const norm = await trimAndNormalize(
        ff, photos.blob, "photos.mp4",
        storyboardDuration(buildStoryboard(media, DEFAULT_REEL_OPTS)),
        plan.maxHeight
      );
      parts.push(norm);
    }
  }

  for (let i = 0; i < plan.clips.length; i++) {
    const clip = plan.clips[i];
    const blob = await readBlob(clip.opfsPath);
    parts.push(await trimAndNormalize(ff, blob, `clip${i}.mp4`, clip.trimSec, plan.maxHeight));
  }

  const concatenated = await concatParts(ff, parts, "concat.mp4");
  const music = await fetch(musicSrc).then((r) => r.blob());
  const blob = await muxAudio(ff, concatenated, music, "reel.mp4");

  // Best-effort cleanup of the virtual FS.
  for (const p of [...parts, "concat.mp4", "reel.mp4", "music.mp3"]) {
    await ff.deleteFile(p).catch(() => {});
  }

  // Duration ≈ photo slideshow + sum of clip caps.
  const photoDur = plan.hasPhotos
    ? storyboardDuration(buildStoryboard(media, DEFAULT_REEL_OPTS)) : 0;
  const durationSec = photoDur + plan.clips.reduce((s, c) => s + c.trimSec, 0);
  return { blob, durationSec };
}
```

- [ ] **Step 2: Verify build; commit**

```bash
npm run build
git add src/lib/reel/videoReel.ts
git commit -m "feat: video reel orchestration (photos + ffmpeg-stitched clips)"
```

---

## Task 5: ReelBuilder — video options

**Files:**
- Modify: `src/components/ReelBuilder.tsx`

- [ ] **Step 1: Add the "Include videos" toggle + resolution/clip-length options**

In `src/components/ReelBuilder.tsx`, add imports and state:

```tsx
import { renderVideoReel } from "@/lib/reel/videoReel";
import { DEFAULT_VIDEO_OPTS } from "@/lib/reel/concatPlan";
```

Add state near the other `useState` calls:

```tsx
const [includeVideos, setIncludeVideos] = useState(false);
const [maxHeight, setMaxHeight] = useState(DEFAULT_VIDEO_OPTS.maxHeight);
const videoCount = day?.items.filter((m) => m.type === "video").length ?? 0;
```

Add controls above the render button:

```tsx
{videoCount > 0 && (
  <>
    <label className="flex items-center justify-between text-sm">
      Include {videoCount} video clip{videoCount !== 1 ? "s" : ""}
      <input type="checkbox" checked={includeVideos}
        onChange={(e) => setIncludeVideos(e.target.checked)} />
    </label>
    {includeVideos && (
      <label className="flex flex-col gap-1 text-sm">
        Resolution cap
        <select value={maxHeight} onChange={(e) => setMaxHeight(Number(e.target.value))}
          className="rounded-lg bg-neutral-900 p-3">
          <option value={480}>480p (fast)</option>
          <option value={720}>720p</option>
        </select>
      </label>
    )}
  </>
)}
```

- [ ] **Step 2: Branch the render path**

Replace the body of `handleRender` so it uses the video path when enabled:

```tsx
const track = TRACKS.find((t) => t.id === musicId);
if (!day || !track) return;
setStatus("rendering");
setError(null);
try {
  let blob: Blob, durationSec: number, ext = "mp4";
  if (includeVideos && videoCount > 0) {
    const r = await renderVideoReel(day.items, track.src, { ...DEFAULT_VIDEO_OPTS, maxHeight });
    blob = r.blob; durationSec = r.durationSec;
  } else {
    const segs = buildStoryboard(day.items, DEFAULT_REEL_OPTS);
    const r = await renderReel(segs, track.src);
    blob = r.blob; durationSec = r.durationSec; ext = extForMime(r.mime);
  }
  await saveReel({ tripId, dayKey, musicId, durationSec, blob, ext });
  setStatus("idle");
} catch (e) {
  setStatus("error");
  setError(e instanceof CodecUnsupportedError
    ? "Your browser can't record video. Try Safari or Chrome."
    : "Reel render failed. Try fewer/shorter clips or a lower resolution.");
}
```

- [ ] **Step 3: Verify build + suite**

Run:
```bash
npm test && npm run build
```
Expected: tests pass; export builds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReelBuilder.tsx
git commit -m "feat: ReelBuilder video options (include clips, resolution cap)"
```

---

## Task 6: Manual verification — a reel with real footage on a real iPhone

> ffmpeg.wasm is the memory-hungry, device-sensitive part. **Test on your iPhone.**

- [ ] **Step 1:** Open a day that has both photos and at least one video clip.
- [ ] **Step 2:** Enable **Include videos**, pick **720p**, choose music → **Make reel**.
- [ ] **Step 3:** Confirm rendering completes (first run downloads the wasm core —
  expect a pause) and the preview plays **photos first, then the trimmed clip(s)**,
  all at one consistent resolution, with music over the whole thing.
- [ ] **Step 4:** Confirm each clip is trimmed to the cap (≤ 5s by default).
- [ ] **Step 5 (isolation check):** In the console, `crossOriginIsolated` should be
  `true` on the deployed site (proves COOP/COEP from `customHttp.yml`). If `false`,
  the single-thread core still works but slower.
- [ ] **Step 6 (memory):** If iOS reloads the tab mid-render, drop to **480p** and
  fewer/shorter clips — this is the documented mobile memory limit; note it in the
  UI per M6.

If reels can include actual video footage, **M5 is done.**

---

## Self-Review

- **Spec coverage:** ffmpeg.wasm trims + concatenates clips alongside photo
  segments (Tasks 3, 4); simple options for length, music, resolution (Tasks 2, 5).
  Memory mitigations: resolution/length caps, lazy load, single-thread fallback,
  test-on-device (Tasks 1, 3, 6). All M5 items covered.
- **Type consistency:** reuses `Media`, `buildStoryboard`/`storyboardDuration`,
  `createCanvasRender`, `pickRecorderMime`/`extForMime`, `CodecUnsupportedError`,
  `saveReel` from M4. `VideoReelOptions`/`ConcatPlan` defined once and shared by
  orchestrator + UI.
- **Constraint check:** ffmpeg runs in-browser (no backend); the only change to the
  static contract is host-set COOP/COEP headers (Amplify `customHttp.yml`), which
  don't add an AWS compute resource. Routes unchanged. Static-export safe.
