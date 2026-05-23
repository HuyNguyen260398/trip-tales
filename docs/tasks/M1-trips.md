# M1 — Trips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create / list / edit / delete trips (name + start/end date), persisted in Dexie (IndexedDB), with best-effort durable storage requested.

**Architecture:** A single Dexie database (`lib/db.ts`) defines all three tables (`trips`, `media`, `reels`) up front so later milestones add rows without a schema migration. A thin data-access module (`lib/trips.ts`) holds CRUD functions that are unit-tested against `fake-indexeddb`. The UI uses `dexie-react-hooks`' `useLiveQuery` for reactive lists, and query-param routing (`/trip?id=…`) to stay static-export safe.

**Tech Stack:** Dexie.js, dexie-react-hooks, React (App Router client components), Tailwind, Vitest + fake-indexeddb.

**Done when:** you can create a trip, close the app, reopen, and it's still there.

---

## File Structure

- `src/lib/types.ts` — `Trip`, `Media`, `Reel` interfaces (shared across all milestones)
- `src/lib/db.ts` — Dexie instance + table declarations + schema version
- `src/lib/id.ts` — id generator (`crypto.randomUUID` wrapper)
- `src/lib/storage.ts` — `requestPersistentStorage()` helper
- `src/lib/trips.ts` — `createTrip`, `listTrips`, `getTrip`, `updateTrip`, `deleteTrip`
- `src/lib/trips.test.ts` — CRUD unit tests
- `src/hooks/useLiveQuery.ts` — re-export of `dexie-react-hooks`'s `useLiveQuery`
- `src/components/TripForm.tsx` — create/edit form
- `src/components/TripList.tsx` — reactive list of trips
- `src/components/TripList.test.tsx` — list rendering test
- `src/app/page.tsx` — home: list + "New trip"
- `src/app/trip/page.tsx` — trip detail (name, dates, edit/delete) via `?id=`

---

## Task 1: Install Dexie

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
pnpm add dexie dexie-react-hooks
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add Dexie + dexie-react-hooks"
```

---

## Task 2: Shared data-model types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Define the interfaces (matches CLAUDE.md data model)**

Create `src/lib/types.ts`:

```ts
/** A trip the user is documenting. */
export interface Trip {
  id: string;
  name: string;
  /** Reverse-geocoded or user-entered dominant location. Optional in M1. */
  location?: string;
  /** Local date YYYY-MM-DD. */
  startDate: string;
  /** Local date YYYY-MM-DD. */
  endDate: string;
  createdAt: number; // epoch ms
}

export type MediaType = "photo" | "video";

/** One imported photo or video and its parsed metadata. */
export interface Media {
  id: string;
  tripId: string;
  /** Local date YYYY-MM-DD derived from takenAt; the day-grouping key. */
  dayKey: string;
  /** Epoch ms when the media was captured (from EXIF), or import time fallback. */
  takenAt: number;
  lat?: number;
  lng?: number;
  type: MediaType;
  /** OPFS path to the original blob. */
  opfsPath: string;
  /** OPFS path to the generated thumbnail. */
  thumbPath: string;
}

/** A rendered daily highlight reel. */
export interface Reel {
  id: string;
  tripId: string;
  dayKey: string;
  /** OPFS path to the rendered video. */
  opfsPath: string;
  musicId: string;
  createdAt: number; // epoch ms
  durationSec: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: shared Trip/Media/Reel data-model types"
```

---

## Task 3: Dexie database

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Define the database with all three tables**

Create `src/lib/db.ts`. All tables are declared now (even though media/reels are
populated in later milestones) so there's no schema bump later. Indexes match the
queries each milestone needs: media by `tripId`, by `[tripId+dayKey]`, by `dayKey`.

```ts
import Dexie, { type Table } from "dexie";
import type { Trip, Media, Reel } from "./types";

export class TriptalesDB extends Dexie {
  trips!: Table<Trip, string>;
  media!: Table<Media, string>;
  reels!: Table<Reel, string>;

  constructor() {
    super("triptales");
    this.version(1).stores({
      trips: "id, createdAt, startDate",
      media: "id, tripId, dayKey, [tripId+dayKey], takenAt",
      reels: "id, tripId, [tripId+dayKey]",
    });
  }
}

export const db = new TriptalesDB();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: Dexie database with trips/media/reels tables"
```

---

## Task 4: id + storage helpers

**Files:**
- Create: `src/lib/id.ts`, `src/lib/storage.ts`

- [ ] **Step 1: id generator**

Create `src/lib/id.ts`:

```ts
/** Stable unique id for records. crypto.randomUUID is available in Safari 15.4+. */
export function newId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: persistent-storage helper**

Create `src/lib/storage.ts`:

```ts
/**
 * Ask the browser to keep our storage durable (best-effort; iOS may decline).
 * Returns whether storage is persisted after the request.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!("storage" in navigator) || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/id.ts src/lib/storage.ts
git commit -m "feat: id generator + persistent-storage request helper"
```

---

## Task 5: Trips CRUD (TDD)

**Files:**
- Create: `src/lib/trips.ts`, `src/lib/trips.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/trips.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  createTrip,
  listTrips,
  getTrip,
  updateTrip,
  deleteTrip,
} from "./trips";

beforeEach(async () => {
  await db.trips.clear();
  await db.media.clear();
  await db.reels.clear();
});

describe("trips CRUD", () => {
  it("creates a trip with an id and createdAt", async () => {
    const trip = await createTrip({
      name: "Tokyo",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
    });
    expect(trip.id).toBeTruthy();
    expect(trip.createdAt).toBeGreaterThan(0);
    expect(await getTrip(trip.id)).toMatchObject({ name: "Tokyo" });
  });

  it("lists trips newest-first", async () => {
    await createTrip({ name: "A", startDate: "2026-01-01", endDate: "2026-01-02" });
    await createTrip({ name: "B", startDate: "2026-02-01", endDate: "2026-02-02" });
    const trips = await listTrips();
    expect(trips.map((t) => t.name)).toEqual(["B", "A"]);
  });

  it("updates a trip", async () => {
    const t = await createTrip({ name: "Old", startDate: "2026-01-01", endDate: "2026-01-02" });
    await updateTrip(t.id, { name: "New" });
    expect((await getTrip(t.id))?.name).toBe("New");
  });

  it("deletes a trip and its media + reels", async () => {
    const t = await createTrip({ name: "Gone", startDate: "2026-01-01", endDate: "2026-01-02" });
    await db.media.add({
      id: "m1", tripId: t.id, dayKey: "2026-01-01", takenAt: 0,
      type: "photo", opfsPath: "p", thumbPath: "tp",
    });
    await deleteTrip(t.id);
    expect(await getTrip(t.id)).toBeUndefined();
    expect(await db.media.where("tripId").equals(t.id).count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run src/lib/trips.test.ts
```
Expected: FAIL — `./trips` module/functions don't exist yet.

- [ ] **Step 3: Implement the CRUD module**

Create `src/lib/trips.ts`:

```ts
import { db } from "./db";
import { newId } from "./id";
import type { Trip } from "./types";

export type NewTripInput = Pick<Trip, "name" | "startDate" | "endDate"> &
  Partial<Pick<Trip, "location">>;

export async function createTrip(input: NewTripInput): Promise<Trip> {
  const trip: Trip = { id: newId(), createdAt: Date.now(), ...input };
  await db.trips.add(trip);
  return trip;
}

export function listTrips(): Promise<Trip[]> {
  // newest-first
  return db.trips.orderBy("createdAt").reverse().toArray();
}

export function getTrip(id: string): Promise<Trip | undefined> {
  return db.trips.get(id);
}

export async function updateTrip(
  id: string,
  changes: Partial<Omit<Trip, "id" | "createdAt">>
): Promise<void> {
  await db.trips.update(id, changes);
}

export async function deleteTrip(id: string): Promise<void> {
  // Cascade: remove the trip's media and reels too (records only; OPFS
  // blob cleanup is handled in M2/M6 where OPFS helpers exist).
  await db.transaction("rw", db.trips, db.media, db.reels, async () => {
    await db.media.where("tripId").equals(id).delete();
    await db.reels.where("tripId").equals(id).delete();
    await db.trips.delete(id);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run src/lib/trips.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trips.ts src/lib/trips.test.ts
git commit -m "feat: trips CRUD with cascade delete (TDD)"
```

---

## Task 6: useLiveQuery hook re-export

**Files:**
- Create: `src/hooks/useLiveQuery.ts`

- [ ] **Step 1: Re-export**

Create `src/hooks/useLiveQuery.ts` (a thin seam so components import from one place):

```ts
export { useLiveQuery } from "dexie-react-hooks";
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useLiveQuery.ts
git commit -m "feat: useLiveQuery hook re-export"
```

---

## Task 7: Trip list component (TDD)

**Files:**
- Create: `src/components/TripList.tsx`, `src/components/TripList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/TripList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createTrip } from "@/lib/trips";
import TripList from "./TripList";

beforeEach(async () => {
  await db.trips.clear();
});

describe("TripList", () => {
  it("shows an empty state when there are no trips", async () => {
    render(<TripList />);
    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
  });

  it("renders trips from the database", async () => {
    await createTrip({ name: "Kyoto", startDate: "2026-04-01", endDate: "2026-04-05" });
    render(<TripList />);
    expect(await screen.findByText("Kyoto")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run src/components/TripList.test.tsx
```
Expected: FAIL — `TripList` doesn't exist.

- [ ] **Step 3: Implement the component**

Create `src/components/TripList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listTrips } from "@/lib/trips";

export default function TripList() {
  const trips = useLiveQuery(() => listTrips(), []);

  if (trips === undefined) return <p className="text-neutral-500">Loading…</p>;
  if (trips.length === 0) {
    return <p className="text-neutral-500">No trips yet. Create your first one.</p>;
  }

  return (
    // Single column on phones; 2–3 columns as the viewport widens (desktop shell).
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((t) => (
        <li key={t.id}>
          <Link
            href={`/trip?id=${t.id}`}
            className="block h-full rounded-xl bg-neutral-900 p-4 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <span className="font-medium">{t.name}</span>
            <span className="block text-sm text-neutral-500">
              {t.startDate} → {t.endDate}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm exec vitest run src/components/TripList.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/TripList.tsx src/components/TripList.test.tsx
git commit -m "feat: reactive TripList with empty state (TDD)"
```

---

## Task 8: Trip form component

**Files:**
- Create: `src/components/TripForm.tsx`

- [ ] **Step 1: Implement the create/edit form**

Create `src/components/TripForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Trip } from "@/lib/types";

export interface TripFormValues {
  name: string;
  startDate: string;
  endDate: string;
}

export default function TripForm({
  initial,
  submitLabel = "Save",
  onSubmit,
}: {
  initial?: Partial<Trip>;
  submitLabel?: string;
  onSubmit: (values: TripFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const valid = name.trim() && startDate && endDate && startDate <= endDate;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ name: name.trim(), startDate, endDate });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Trip name
        <input
          className="rounded-lg bg-neutral-900 p-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tokyo spring"
          required
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Start
          <input type="date" className="rounded-lg bg-neutral-900 p-3"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          End
          <input type="date" className="rounded-lg bg-neutral-900 p-3"
            value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </label>
      </div>
      <button
        type="submit"
        disabled={!valid}
        className="rounded-xl bg-white p-3 font-medium text-neutral-950 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify it type-checks via build**

Run:
```bash
pnpm build
```
Expected: build succeeds (component compiles; it's wired into pages next).

- [ ] **Step 3: Commit**

```bash
git add src/components/TripForm.tsx
git commit -m "feat: TripForm with start<=end validation"
```

---

## Task 9: Home page — list + create

**Files:**
- Modify: `src/app/page.tsx`
- Update: `src/app/page.test.tsx` (the M0 smoke test still expects the heading)

- [ ] **Step 1: Implement the home page**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TripList from "@/components/TripList";
import TripForm from "@/components/TripForm";
import { createTrip } from "@/lib/trips";
import { requestPersistentStorage } from "@/lib/storage";

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    requestPersistentStorage();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Triptales</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-950"
        >
          {creating ? "Cancel" : "New trip"}
        </button>
      </header>

      {creating && (
        <TripForm
          submitLabel="Create trip"
          onSubmit={async (values) => {
            const trip = await createTrip(values);
            setCreating(false);
            router.push(`/trip?id=${trip.id}`);
          }}
        />
      )}

      <TripList />
    </main>
  );
}
```

- [ ] **Step 2: Keep the smoke test passing**

The M0 test renders `<Home />` and asserts the "Triptales" heading. That still
holds. Run:
```bash
pnpm exec vitest run src/app/page.test.tsx
```
Expected: PASS. (If `useRouter` throws under jsdom, the test still finds the
heading because it renders before navigation; if it fails, mock it — see note
below.)

> Note: `next/navigation`'s `useRouter` works in test render as long as it's not
> *called*. If a future test triggers navigation, add to the test file:
> ```ts
> import { vi } from "vitest";
> vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
> ```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: home page lists trips + inline create, requests persistence"
```

---

## Task 10: Trip detail page — view / edit / delete

**Files:**
- Create: `src/app/trip/page.tsx`

- [ ] **Step 1: Implement the detail page (query-param routing + Suspense)**

Create `src/app/trip/page.tsx`. `useSearchParams()` requires a `<Suspense>`
boundary under static export.

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { getTrip, updateTrip, deleteTrip } from "@/lib/trips";
import TripForm from "@/components/TripForm";

function TripDetail() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const trip = useLiveQuery(() => (id ? getTrip(id) : undefined), [id]);
  const [editing, setEditing] = useState(false);

  if (!id) return <p className="text-neutral-500">No trip selected.</p>;
  if (trip === undefined) return <p className="text-neutral-500">Loading…</p>;
  if (trip === null || !trip) return <p className="text-neutral-500">Trip not found.</p>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <button onClick={() => router.push("/")} className="self-start text-sm text-neutral-400">
        ← All trips
      </button>

      {editing ? (
        <TripForm
          initial={trip}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            await updateTrip(trip.id, values);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="text-neutral-500">{trip.startDate} → {trip.endDate}</p>
          {/* Day timeline + import land here in M2; map link in M3. */}
          <div className="mt-2 flex gap-2">
            <button onClick={() => setEditing(true)} className="rounded-xl bg-neutral-800 px-4 py-2 text-sm">
              Edit
            </button>
            <button
              onClick={async () => {
                if (confirm(`Delete "${trip.name}"? This removes its media too.`)) {
                  await deleteTrip(trip.id);
                  router.push("/");
                }
              }}
              className="rounded-xl bg-red-900/60 px-4 py-2 text-sm text-red-100"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default function TripPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <TripDetail />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify the static export builds with the new route**

Run:
```bash
pnpm build
test -f out/trip/index.html && echo "TRIP ROUTE EXPORTED"
```
Expected: `TRIP ROUTE EXPORTED`.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: all tests pass (trips CRUD + TripList + home smoke).

- [ ] **Step 4: Commit**

```bash
git add src/app/trip/page.tsx
git commit -m "feat: trip detail page with edit + cascade delete (query-param routing)"
```

---

## Task 11: Manual verification — persistence across sessions

> The acceptance check is "close the app, reopen, it's still there." IndexedDB
> persistence can't be proven by a jsdom test.

- [ ] **Step 1:** `pnpm build && pnpm dlx serve out` (or deploy), open in a browser.
- [ ] **Step 2:** Create a trip "Lisbon" with dates. Confirm it appears in the list.
- [ ] **Step 3:** Fully close the tab/app, reopen the URL. Expected: "Lisbon" is
  still listed (loaded from IndexedDB).
- [ ] **Step 4 (iPhone):** repeat in the installed PWA. Confirm the trip survives an
  app relaunch. (Eviction over weeks is expected and out of scope — see M6 export.)

If the trip survives a relaunch, **M1 is done.**

---

## Self-Review

- **Spec coverage:** create/list/edit/delete (Tasks 5, 9, 10), persisted in Dexie
  (Task 3), `storage.persist()` requested (Tasks 4, 9), survives reopen (Task 11).
- **Type consistency:** `Trip`/`Media`/`Reel` defined once in `types.ts`; `db.ts`
  declares all three tables now so M2/M4 add rows without a schema bump. CRUD
  signatures (`createTrip`, `getTrip`, `updateTrip`, `deleteTrip`) are used
  identically in tests and pages.
- **Responsive:** the trips list is a 1→2→3 column grid and pages use the shared
  `max-w-2xl lg:max-w-4xl` container, so the list and detail read well both in the
  desktop App Shell and on phones. pnpm throughout.
- **Constraint check:** all components are `"use client"`, routing is query-param
  based (no dynamic segments), `useSearchParams` wrapped in `<Suspense>` — static
  export stays valid.
