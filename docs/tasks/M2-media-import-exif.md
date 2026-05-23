# M2 — Media Import + EXIF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This is the core-risk milestone — test on a real iPhone (HEIC, metadata stripping) early.**

**Goal:** Let the user pick photos/videos for a trip; for each file parse `takenAt` + GPS via `exifr`, generate a thumbnail, store the blob in OPFS, write a `media` record; show the trip's media grouped by day.

**Architecture:** A pure pipeline of small, individually-tested units: `dayKey` (epoch → local YYYY-MM-DD), `exif` (file → `{ takenAt?, lat?, lng? }`), `thumbnail` (file → small JPEG blob, HEIC-aware), `opfs` (blob ⇄ path). `importMedia` composes them, degrading gracefully when date/GPS are missing (iOS may strip EXIF on HEIC→JPEG upload). The day timeline is a single indexed Dexie query on `[tripId+dayKey]`.

**Tech Stack:** exifr, heic2any, OPFS (`navigator.storage.getDirectory`), Canvas (thumbnail downscale), Dexie, Vitest.

**Done when:** you select a folder of trip photos and see them grouped by day with locations detected.

---

## File Structure

- `src/lib/dayKey.ts` — `dayKeyFromEpoch(ms): "YYYY-MM-DD"`
- `src/lib/dayKey.test.ts`
- `src/lib/exif.ts` — `parseExif(file): Promise<ParsedExif>`
- `src/lib/exif.test.ts`
- `src/lib/opfs.ts` — `writeBlob`, `readBlob`, `deleteFile`, `objectUrl`
- `src/lib/thumbnail.ts` — `makeThumbnail(file): Promise<Blob>` (HEIC fallback)
- `src/lib/media.ts` — `importMedia`, `listMediaByTrip`, `mediaByDay`, `deleteMedia`
- `src/lib/media.test.ts`
- `src/components/MediaImporter.tsx` — file picker + progress
- `src/components/DayTimeline.tsx` — day-grouped thumbnails
- `src/components/MediaThumb.tsx` — single thumb from OPFS
- `src/components/MediaEditDialog.tsx` — manual date/location for missing metadata
- Modify: `src/app/trip/page.tsx` — mount importer + timeline

---

## Task 1: Install parsing/conversion deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
pnpm add exifr heic2any
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add exifr + heic2any for media import"
```

---

## Task 2: dayKey derivation (TDD)

**Files:**
- Create: `src/lib/dayKey.ts`, `src/lib/dayKey.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dayKey.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dayKeyFromEpoch } from "./dayKey";

describe("dayKeyFromEpoch", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    // Build an epoch from explicit local components to stay TZ-independent.
    const ms = new Date(2026, 3, 7, 10, 30).getTime(); // 2026-04-07 local
    expect(dayKeyFromEpoch(ms)).toBe("2026-04-07");
  });

  it("zero-pads month and day", () => {
    const ms = new Date(2026, 0, 3, 0, 0).getTime(); // 2026-01-03 local
    expect(dayKeyFromEpoch(ms)).toBe("2026-01-03");
  });

  it("uses local time, not UTC, for a late-evening timestamp", () => {
    const ms = new Date(2026, 5, 15, 23, 59).getTime(); // local June 15
    expect(dayKeyFromEpoch(ms)).toBe("2026-06-15");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/dayKey.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/dayKey.ts`:

```ts
/**
 * Local-date key (YYYY-MM-DD) for an epoch-ms timestamp. Uses the runtime's
 * local timezone so a photo taken at 11pm groups under that calendar day.
 */
export function dayKeyFromEpoch(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/dayKey.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dayKey.ts src/lib/dayKey.test.ts
git commit -m "feat: dayKeyFromEpoch local-date grouping key (TDD)"
```

---

## Task 3: EXIF parsing wrapper (TDD)

**Files:**
- Create: `src/lib/exif.ts`, `src/lib/exif.test.ts`

- [ ] **Step 1: Write the failing tests (mock exifr)**

We test our *mapping/fallback logic*, not exifr itself. Create `src/lib/exif.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const parse = vi.fn();
vi.mock("exifr", () => ({ default: { parse }, parse }));

import { parseExif } from "./exif";

beforeEach(() => parse.mockReset());

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("parseExif", () => {
  it("maps DateTimeOriginal + GPS to takenAt/lat/lng", async () => {
    parse.mockResolvedValue({
      DateTimeOriginal: new Date(2026, 3, 7, 9, 0),
      latitude: 35.0,
      longitude: 139.0,
    });
    const r = await parseExif(fileOf("a.jpg", "image/jpeg"));
    expect(r.takenAt).toBe(new Date(2026, 3, 7, 9, 0).getTime());
    expect(r.lat).toBe(35.0);
    expect(r.lng).toBe(139.0);
  });

  it("returns undefined fields when metadata is missing (stripped HEIC→JPEG)", async () => {
    parse.mockResolvedValue({});
    const r = await parseExif(fileOf("b.jpg", "image/jpeg"));
    expect(r.takenAt).toBeUndefined();
    expect(r.lat).toBeUndefined();
    expect(r.lng).toBeUndefined();
  });

  it("never throws — returns empty result if exifr rejects", async () => {
    parse.mockRejectedValue(new Error("bad file"));
    const r = await parseExif(fileOf("c.jpg", "image/jpeg"));
    expect(r).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/exif.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/exif.ts`:

```ts
import exifr from "exifr";

export interface ParsedExif {
  /** epoch ms, if a capture date was present. */
  takenAt?: number;
  lat?: number;
  lng?: number;
}

/**
 * Read capture date + GPS from an image file. Never throws: missing or stripped
 * metadata yields an empty/partial result so import can degrade gracefully and
 * prompt for manual entry.
 */
export async function parseExif(file: File): Promise<ParsedExif> {
  try {
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"],
    });
    if (!data) return {};
    const date: Date | undefined = data.DateTimeOriginal ?? data.CreateDate;
    const result: ParsedExif = {};
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      result.takenAt = date.getTime();
    }
    if (typeof data.latitude === "number") result.lat = data.latitude;
    if (typeof data.longitude === "number") result.lng = data.longitude;
    return result;
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/exif.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/exif.ts src/lib/exif.test.ts
git commit -m "feat: exifr wrapper mapping date/GPS with graceful fallback (TDD)"
```

---

## Task 4: OPFS blob helpers

**Files:**
- Create: `src/lib/opfs.ts`

> OPFS isn't available in jsdom, so this module is verified by build + the M2
> manual check rather than a unit test. Keep it tiny and dependency-free.

- [ ] **Step 1: Implement**

Create `src/lib/opfs.ts`:

```ts
/**
 * Thin wrapper over the Origin Private File System. Files are stored under a
 * flat "media/" prefix; paths are the keys we persist in the `media` table.
 */
async function dirHandle(): Promise<FileSystemDirectoryHandle> {
  // @ts-expect-error - getDirectory is OPFS, typed in lib.dom for recent TS.
  const root: FileSystemDirectoryHandle = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("media", { create: true });
}

export async function writeBlob(path: string, blob: Blob): Promise<string> {
  const dir = await dirHandle();
  const handle = await dir.getFileHandle(path, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return path;
}

export async function readBlob(path: string): Promise<Blob> {
  const dir = await dirHandle();
  const handle = await dir.getFileHandle(path);
  return handle.getFile();
}

export async function deleteFile(path: string): Promise<void> {
  const dir = await dirHandle();
  await dir.removeEntry(path).catch(() => {});
}

/** Object URL for display; caller must URL.revokeObjectURL when done. */
export async function objectUrl(path: string): Promise<string> {
  return URL.createObjectURL(await readBlob(path));
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/opfs.ts
git commit -m "feat: OPFS blob read/write/delete helpers"
```

---

## Task 5: Thumbnail generation (HEIC-aware)

**Files:**
- Create: `src/lib/thumbnail.ts`

> Canvas/`createImageBitmap` aren't meaningfully testable in jsdom; verified by
> build + manual check. The HEIC branch is the important bit on iOS.

- [ ] **Step 1: Implement**

Create `src/lib/thumbnail.ts`:

```ts
const MAX_EDGE = 512; // thumbnail longest side, px
const QUALITY = 0.8;

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * Produce a small JPEG thumbnail blob. On browsers that can't decode HEIC
 * (everything except iOS Safari), convert via heic2any first. Falls back to the
 * original file if anything fails so import never blocks on a thumbnail.
 */
export async function makeThumbnail(file: File): Promise<Blob> {
  try {
    let source: Blob = file;
    if (isHeic(file)) {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
      source = Array.isArray(converted) ? converted[0] : converted;
    }

    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        QUALITY
      )
    );
  } catch {
    return file; // graceful fallback
  }
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/thumbnail.ts
git commit -m "feat: HEIC-aware thumbnail generation with fallback"
```

---

## Task 6: Media import pipeline + queries (TDD)

**Files:**
- Create: `src/lib/media.ts`, `src/lib/media.test.ts`

We inject the side-effecting deps (exif, thumbnail, opfs) so the pipeline's
*logic* — dayKey assignment, fallback to import time, type detection, grouping —
is unit-tested without OPFS/Canvas.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/media.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "./db";
import { createTrip } from "./trips";
import { importFile, mediaByDay, listMediaByTrip } from "./media";

beforeEach(async () => {
  await db.trips.clear();
  await db.media.clear();
});

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

const deps = {
  parseExif: vi.fn(),
  makeThumbnail: vi.fn(async () => new Blob(["t"])),
  writeBlob: vi.fn(async (path: string) => path),
};

beforeEach(() => {
  deps.parseExif.mockReset();
  deps.makeThumbnail.mockClear();
  deps.writeBlob.mockClear();
});

describe("importFile", () => {
  it("derives dayKey from EXIF takenAt and stores GPS", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValue({
      takenAt: new Date(2026, 3, 7, 9, 0).getTime(),
      lat: 35, lng: 139,
    });
    const m = await importFile(trip.id, fileOf("a.jpg", "image/jpeg"), deps);
    expect(m.dayKey).toBe("2026-04-07");
    expect(m.lat).toBe(35);
    expect(m.type).toBe("photo");
    expect(deps.writeBlob).toHaveBeenCalledTimes(2); // original + thumb
  });

  it("falls back to import time when takenAt is missing", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValue({}); // stripped metadata
    const before = Date.now();
    const m = await importFile(trip.id, fileOf("b.jpg", "image/jpeg"), deps);
    expect(m.takenAt).toBeGreaterThanOrEqual(before);
    expect(m.lat).toBeUndefined();
  });

  it("detects video type from mime", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValue({});
    const m = await importFile(trip.id, fileOf("c.mov", "video/quicktime"), deps);
    expect(m.type).toBe("video");
  });
});

describe("mediaByDay", () => {
  it("groups a trip's media into ascending day buckets", async () => {
    const trip = await createTrip({ name: "T", startDate: "2026-04-01", endDate: "2026-04-10" });
    deps.parseExif.mockResolvedValueOnce({ takenAt: new Date(2026, 3, 8, 9).getTime() });
    deps.parseExif.mockResolvedValueOnce({ takenAt: new Date(2026, 3, 7, 9).getTime() });
    await importFile(trip.id, fileOf("d1.jpg", "image/jpeg"), deps);
    await importFile(trip.id, fileOf("d2.jpg", "image/jpeg"), deps);

    const groups = await mediaByDay(trip.id);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-04-07", "2026-04-08"]);
    expect(groups[0].items).toHaveLength(1);
    expect(await listMediaByTrip(trip.id)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm exec vitest run src/lib/media.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/media.ts`:

```ts
import { db } from "./db";
import { newId } from "./id";
import { dayKeyFromEpoch } from "./dayKey";
import { parseExif as realParseExif } from "./exif";
import { makeThumbnail as realMakeThumbnail } from "./thumbnail";
import { writeBlob as realWriteBlob, deleteFile } from "./opfs";
import type { Media, MediaType } from "./types";

/** Injectable side-effects so the pipeline is unit-testable. */
export interface ImportDeps {
  parseExif: typeof realParseExif;
  makeThumbnail: typeof realMakeThumbnail;
  writeBlob: typeof realWriteBlob;
}

const defaultDeps: ImportDeps = {
  parseExif: realParseExif,
  makeThumbnail: realMakeThumbnail,
  writeBlob: realWriteBlob,
};

function mediaType(file: File): MediaType {
  return file.type.startsWith("video/") ? "video" : "photo";
}

export async function importFile(
  tripId: string,
  file: File,
  deps: ImportDeps = defaultDeps
): Promise<Media> {
  const exif = await deps.parseExif(file);
  const takenAt = exif.takenAt ?? Date.now();
  const id = newId();
  const ext = file.name.split(".").pop() ?? "bin";

  const opfsPath = await deps.writeBlob(`${id}.${ext}`, file);
  const thumb = await deps.makeThumbnail(file);
  const thumbPath = await deps.writeBlob(`${id}.thumb.jpg`, thumb);

  const record: Media = {
    id,
    tripId,
    dayKey: dayKeyFromEpoch(takenAt),
    takenAt,
    lat: exif.lat,
    lng: exif.lng,
    type: mediaType(file),
    opfsPath,
    thumbPath,
  };
  await db.media.add(record);
  return record;
}

/** Import many files in sequence, reporting progress. */
export async function importMedia(
  tripId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<Media[]> {
  const out: Media[] = [];
  for (let i = 0; i < files.length; i++) {
    out.push(await importFile(tripId, files[i]));
    onProgress?.(i + 1, files.length);
  }
  return out;
}

export function listMediaByTrip(tripId: string): Promise<Media[]> {
  return db.media.where("tripId").equals(tripId).sortBy("takenAt");
}

export interface DayGroup {
  dayKey: string;
  items: Media[];
}

/** All media for a trip, grouped into ascending day buckets. */
export async function mediaByDay(tripId: string): Promise<DayGroup[]> {
  const all = await listMediaByTrip(tripId);
  const map = new Map<string, Media[]>();
  for (const m of all) {
    (map.get(m.dayKey) ?? map.set(m.dayKey, []).get(m.dayKey)!).push(m);
  }
  return [...map.keys()]
    .sort()
    .map((dayKey) => ({ dayKey, items: map.get(dayKey)! }));
}

/** Apply manual corrections (e.g. user-entered date/location). */
export async function updateMedia(
  id: string,
  changes: Partial<Pick<Media, "takenAt" | "dayKey" | "lat" | "lng">>
): Promise<void> {
  const next = { ...changes };
  if (changes.takenAt !== undefined && changes.dayKey === undefined) {
    next.dayKey = dayKeyFromEpoch(changes.takenAt);
  }
  await db.media.update(id, next);
}

export async function deleteMedia(id: string): Promise<void> {
  const m = await db.media.get(id);
  if (!m) return;
  await deleteFile(m.opfsPath);
  await deleteFile(m.thumbPath);
  await db.media.delete(id);
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm exec vitest run src/lib/media.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/media.ts src/lib/media.test.ts
git commit -m "feat: media import pipeline + day grouping queries (TDD)"
```

---

## Task 7: MediaThumb component

**Files:**
- Create: `src/components/MediaThumb.tsx`

- [ ] **Step 1: Implement (loads a thumb blob from OPFS)**

Create `src/components/MediaThumb.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { objectUrl } from "@/lib/opfs";
import type { Media } from "@/lib/types";

export default function MediaThumb({ media }: { media: Media }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    objectUrl(media.thumbPath).then((u) => {
      revoked = u;
      setUrl(u);
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [media.thumbPath]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-neutral-800">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
      {media.type === "video" && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs">▶</span>
      )}
      {media.lat === undefined && (
        <span className="absolute left-1 top-1 rounded bg-amber-500/80 px-1 text-[10px] text-black">
          no GPS
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/components/MediaThumb.tsx
git commit -m "feat: MediaThumb renders OPFS thumbnail with video/no-GPS badges"
```

---

## Task 8: MediaImporter component

**Files:**
- Create: `src/components/MediaImporter.tsx`

- [ ] **Step 1: Implement the picker + progress**

Create `src/components/MediaImporter.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { importMedia } from "@/lib/media";

export default function MediaImporter({ tripId }: { tripId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          setProgress({ done: 0, total: files.length });
          await importMedia(tripId, files, (done, total) => setProgress({ done, total }));
          setProgress(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="w-full rounded-xl bg-white p-3 font-medium text-neutral-950 disabled:opacity-50"
      >
        {progress ? `Importing ${progress.done}/${progress.total}…` : "Add photos & videos"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/components/MediaImporter.tsx
git commit -m "feat: MediaImporter file picker with import progress"
```

---

## Task 9: Manual date/location edit dialog

**Files:**
- Create: `src/components/MediaEditDialog.tsx`

> The plan requires manual entry when iOS strips GPS/date. This dialog covers it.

- [ ] **Step 1: Implement**

Create `src/components/MediaEditDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { updateMedia } from "@/lib/media";
import { dayKeyFromEpoch } from "@/lib/dayKey";
import type { Media } from "@/lib/types";

export default function MediaEditDialog({
  media,
  onClose,
}: {
  media: Media;
  onClose: () => void;
}) {
  const [date, setDate] = useState(dayKeyFromEpoch(media.takenAt));
  const [lat, setLat] = useState(media.lat?.toString() ?? "");
  const [lng, setLng] = useState(media.lng?.toString() ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 lg:items-center lg:justify-center"
      onClick={onClose}
    >
      {/* Bottom sheet on phones; centered modal from lg up. */}
      <div
        className="w-full rounded-t-2xl bg-neutral-900 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-2xl lg:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-medium">Edit metadata</h2>
        <label className="mb-3 flex flex-col gap-1 text-sm">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg bg-neutral-800 p-3" />
        </label>
        <div className="mb-4 flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Latitude
            <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal"
              className="rounded-lg bg-neutral-800 p-3" placeholder="35.0" />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Longitude
            <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal"
              className="rounded-lg bg-neutral-800 p-3" placeholder="139.0" />
          </label>
        </div>
        <button
          onClick={async () => {
            // Local-noon avoids the date shifting across the UTC boundary.
            const takenAt = new Date(`${date}T12:00:00`).getTime();
            await updateMedia(media.id, {
              takenAt,
              dayKey: date,
              lat: lat ? Number(lat) : undefined,
              lng: lng ? Number(lng) : undefined,
            });
            onClose();
          }}
          className="w-full rounded-xl bg-white p-3 font-medium text-neutral-950"
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build; commit**

```bash
pnpm build
git add src/components/MediaEditDialog.tsx
git commit -m "feat: manual date/location edit dialog for stripped metadata"
```

---

## Task 10: DayTimeline + wire into trip page

**Files:**
- Create: `src/components/DayTimeline.tsx`
- Modify: `src/app/trip/page.tsx`

- [ ] **Step 1: Implement the timeline**

Create `src/components/DayTimeline.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { mediaByDay } from "@/lib/media";
import MediaThumb from "./MediaThumb";
import MediaEditDialog from "./MediaEditDialog";
import type { Media } from "@/lib/types";

export default function DayTimeline({ tripId }: { tripId: string }) {
  const groups = useLiveQuery(() => mediaByDay(tripId), [tripId]);
  const [editing, setEditing] = useState<Media | null>(null);

  if (groups === undefined) return <p className="text-neutral-500">Loading…</p>;
  if (groups.length === 0) {
    return <p className="text-neutral-500">No media yet. Add some to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.dayKey}>
          <h2 className="mb-2 text-sm font-medium text-neutral-400">
            {g.dayKey} · {g.items.length} item{g.items.length > 1 ? "s" : ""}
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {g.items.map((m) => (
              <button key={m.id} onClick={() => setEditing(m)} className="text-left">
                <MediaThumb media={m} />
              </button>
            ))}
          </div>
        </section>
      ))}
      {editing && <MediaEditDialog media={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Mount importer + timeline in the trip detail view**

In `src/app/trip/page.tsx`, inside the non-editing branch (after the dates `<p>`,
where the M1 comment "Day timeline + import land here in M2" is), add:

```tsx
import MediaImporter from "@/components/MediaImporter";
import DayTimeline from "@/components/DayTimeline";
```

and replace the `{/* Day timeline + import land here in M2; map link in M3. */}`
comment with:

```tsx
<MediaImporter tripId={trip.id} />
<DayTimeline tripId={trip.id} />
```

- [ ] **Step 3: Run full suite + build**

Run:
```bash
pnpm test && pnpm build
```
Expected: all unit tests pass; static export builds.

- [ ] **Step 4: Commit**

```bash
git add src/components/DayTimeline.tsx src/app/trip/page.tsx
git commit -m "feat: day-grouped media timeline wired into trip page"
```

---

## Task 11: Manual verification — real photos on a real iPhone

> This milestone holds the project's core risk (HEIC + metadata stripping). The
> jsdom tests cover logic; only a device proves the import path. **Do this on your
> iPhone.**

- [ ] **Step 1:** Deploy (or `pnpm build && pnpm dlx serve out`) and open the installed PWA.
- [ ] **Step 2:** Open a trip → **Add photos & videos** → select a real day's mix of
  HEIC photos + a video from the camera roll.
- [ ] **Step 3:** Confirm thumbnails render (HEIC included — the heic2any fallback
  path on non-Safari; native on iOS Safari) and items are **grouped by day**.
- [ ] **Step 4:** Confirm GPS-tagged photos show no "no GPS" badge; deliberately
  pick a screenshot or stripped image and confirm the **"no GPS" badge** appears.
- [ ] **Step 5:** Tap a no-GPS / wrong-date item → edit dialog → set date + lat/lng
  → Save. Confirm it **re-groups under the corrected day**.
- [ ] **Step 6:** Reload; confirm media persists.

If photos appear grouped by day with locations detected (and manual fix works
where metadata was stripped), **M2 is done.**

---

## Self-Review

- **Spec coverage:** picker with `accept="image/*,video/*" multiple` (Task 8);
  exifr date+GPS (Task 3); thumbnail (Task 5); OPFS blob store (Tasks 4, 6);
  `media` record (Task 6); day grouping by `dayKey` (Tasks 2, 6, 10); HEIC handling
  + graceful degradation + manual entry (Tasks 5, 9). All M2 items covered.
- **Type consistency:** uses `Media`/`MediaType` from `types.ts`; `importFile`,
  `mediaByDay`, `updateMedia`, `deleteMedia` signatures identical across tests,
  components, and the M3/M4 consumers. `[tripId+dayKey]` index from M1 backs the
  queries.
- **Responsive:** the day grid scales 3→4→6 columns with the viewport, and the
  metadata editor is a bottom sheet on phones / a centered modal on desktop (`lg:`).
- **Constraint check:** no network calls, blobs in OPFS, records in IndexedDB —
  on-device only, static-export safe.
