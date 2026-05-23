# M0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js + TypeScript + Tailwind app configured for static export, installable as a PWA, with a test harness, deployed to Amplify Hosting.

**Architecture:** App Router with `output: 'export'` so the whole app is a static bundle (Capacitor-wrappable later). A web manifest + minimal service worker give "Add to Home Screen" + offline shell. Vitest + jsdom + fake-indexeddb is the test harness every later milestone reuses.

**Tech Stack:** Next.js (App Router, TS), Tailwind CSS, Vitest, @testing-library/react, jsdom, fake-indexeddb, AWS Amplify Hosting.

**Done when:** the empty shell installs on your iPhone home screen and loads offline.

---

## File Structure

- `package.json`, `tsconfig.json`, `next.config.ts` — project config (created by scaffold, then edited)
- `next.config.ts` — set `output: 'export'`, `images.unoptimized: true`
- `src/app/layout.tsx` — root layout: metadata, viewport, manifest link, safe-area, wraps pages in `AppShell`
- `src/app/page.tsx` — placeholder home ("Triptales")
- `src/components/AppShell.tsx` — responsive frame (desktop sidebar + mobile bottom nav)
- `src/components/Sidebar.tsx` — desktop left nav (`lg:`)
- `src/components/BottomNav.tsx` — mobile bottom nav (`lg:hidden`)
- `src/components/nav.ts` — primary nav items (Trips now; Settings added in M6)
- `vitest.config.ts` — test runner config
- `src/test/setup.ts` — jsdom + fake-indexeddb global setup
- `src/app/page.test.tsx` — smoke test for the home page
- `public/manifest.webmanifest` — PWA manifest
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png` — install icons
- `public/sw.js` — minimal offline-shell service worker
- `src/components/RegisterSW.tsx` — registers the service worker on the client
- `amplify.yml` — Amplify Hosting build spec

---

## Task 1: Scaffold the Next.js app

**Files:**
- Create: project root files via `create-next-app`

- [ ] **Step 1: Scaffold**

Run in the repo root (the `.` keeps existing files like `triptales-web-mvp-plan.md` and `CLAUDE.md`):

```bash
pnpm create next-app@latest . \
  --typescript --tailwind --app --src-dir --eslint \
  --import-alias "@/*" --no-turbopack --use-pnpm
```

If prompted to proceed in a non-empty directory, accept.

- [ ] **Step 2: Verify dev server boots**

Run:
```bash
pnpm dev
```
Expected: server starts on `http://localhost:3000`, default page renders. Stop it with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app (TS, Tailwind, App Router, src dir)"
```

---

## Task 2: Configure static export

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Set static export config**

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // next/image optimization needs a server; static export must use raw images.
  images: { unoptimized: true },
  // Emit /trip/index.html style paths so static hosts resolve clean URLs.
  trailingSlash: true,
};

export default nextConfig;
```

- [ ] **Step 2: Verify the export build produces static files**

Run:
```bash
pnpm build
```
Expected: build succeeds and an `out/` directory is created containing `index.html`.

Confirm:
```bash
test -f out/index.html && echo "STATIC EXPORT OK"
```
Expected output: `STATIC EXPORT OK`

- [ ] **Step 3: Ignore build artifacts**

Ensure `.gitignore` contains `/out` (create the line if missing). `create-next-app` already ignores `/.next` and `/node_modules`.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts .gitignore
git commit -m "chore: configure Next.js static export (output: export)"
```

---

## Task 3: Install and configure the test harness

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install test deps**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event fake-indexeddb
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Create the test setup file**

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify Vitest runs (no tests yet)**

Run:
```bash
pnpm test
```
Expected: Vitest reports "No test files found" (exit code may be non-zero) — this confirms the runner is wired. The next task adds a real test.

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts src/test/setup.ts pnpm-lock.yaml
git commit -m "test: add Vitest + jsdom + fake-indexeddb harness"
```

---

## Task 4: Home page smoke test (TDD)

**Files:**
- Test: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the app name", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /triptales/i })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run src/app/page.test.tsx
```
Expected: FAIL — the default scaffold page has no "Triptales" heading.

- [ ] **Step 3: Replace the home page with a minimal shell**

Replace `src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Triptales</h1>
      <p className="text-sm text-neutral-500">
        Your trips, one highlight reel at a time.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm exec vitest run src/app/page.test.tsx
```
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: minimal Triptales home shell with smoke test"
```

---

## Task 5: Root layout + responsive App Shell

The App Shell is the adaptive frame the whole app lives in: a left sidebar on
desktop (`lg:`), a bottom nav on mobile (`lg:hidden`). One component tree driven by
Tailwind breakpoints — see the README's "Responsive layout (adaptive shell)".

**Files:**
- Create: `src/components/nav.ts`, `src/components/Sidebar.tsx`, `src/components/BottomNav.tsx`, `src/components/AppShell.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Define the primary nav items**

Create `src/components/nav.ts`. Map and Reel are trip-scoped (linked from the trip
screen), so the global nav starts with just Trips; M6 appends Settings.

```ts
export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Trips" },
  // M6 adds: { href: "/settings", label: "Settings" },
];
```

- [ ] **Step 2: Desktop sidebar**

Create `src/components/Sidebar.tsx` (shown only at `lg:` and up):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-neutral-800 p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:flex">
      <span className="mb-4 px-2 text-lg font-semibold tracking-tight">Triptales</span>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-2 text-sm ${
            pathname === item.href ? "bg-neutral-800 font-medium" : "text-neutral-400 hover:bg-neutral-900"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </aside>
  );
}
```

- [ ] **Step 3: Mobile bottom nav**

Create `src/components/BottomNav.tsx` (hidden at `lg:` and up):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-neutral-800 bg-neutral-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex-1 py-3 text-center text-xs ${
            pathname === item.href ? "font-medium text-neutral-50" : "text-neutral-500"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: The App Shell**

Create `src/components/AppShell.tsx`. It composes the two navs around the page
content. Pages keep their own `<main>`, so the shell wraps content in a plain
`<div>` (no nested `<main>`). The content gets bottom padding on mobile so it isn't
hidden behind the fixed bottom nav.

```tsx
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:min-h-dvh">
      <Sidebar />
      <div className="flex-1 pb-[max(4rem,env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 5: Wrap the root layout in the App Shell**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triptales",
  description: "Turn each day of a trip into a music-backed highlight reel.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Triptales" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables env(safe-area-inset-*)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-50 antialiased">
        <AppShell>{children}</AppShell>
        <RegisterSW />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify build still succeeds**

Run:
```bash
pnpm build
```
Expected: build succeeds (the `RegisterSW` import resolves after the next task — if you run this step before Task 6, create the file first).

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/components/AppShell.tsx src/components/Sidebar.tsx src/components/BottomNav.tsx src/components/nav.ts
git commit -m "feat: responsive App Shell (desktop sidebar + mobile bottom nav) + root layout"
```

---

## Task 6: Service worker (offline shell) + registration

**Files:**
- Create: `public/sw.js`, `src/components/RegisterSW.tsx`

- [ ] **Step 1: Create a minimal cache-first service worker**

Create `public/sw.js`:

```js
const CACHE = "triptales-shell-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
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

// Network-first for navigations (so updates show), cache fallback when offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
```

- [ ] **Step 2: Create the client registration component**

Create `src/components/RegisterSW.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-fatal; the app still works online.
    });
  }, []);
  return null;
}
```

- [ ] **Step 3: Verify build includes the service worker**

Run:
```bash
pnpm build
test -f out/sw.js && echo "SW PRESENT"
```
Expected: `SW PRESENT` (files in `public/` are copied verbatim into `out/`).

- [ ] **Step 4: Commit**

```bash
git add public/sw.js src/components/RegisterSW.tsx
git commit -m "feat: offline-shell service worker + client registration"
```

---

## Task 7: Web manifest + install icons

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`

- [ ] **Step 1: Create the manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Triptales",
  "short_name": "Triptales",
  "description": "Turn each day of a trip into a music-backed highlight reel.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Add icons**

Add three PNGs to `public/icons/` at the listed sizes. For a placeholder set, generate solid-colour icons with ImageMagick (replace later with real artwork):

```bash
mkdir -p public/icons
magick -size 192x192 xc:#0a0a0a -gravity center -pointsize 48 -fill white \
  -annotate 0 "TT" public/icons/icon-192.png
magick -size 512x512 xc:#0a0a0a -gravity center -pointsize 128 -fill white \
  -annotate 0 "TT" public/icons/icon-512.png
cp public/icons/icon-512.png public/icons/maskable-512.png
```

(If ImageMagick isn't installed: `brew install imagemagick`, or drop in any correctly-sized PNGs.)

- [ ] **Step 3: Verify manifest is served and valid JSON**

Run:
```bash
pnpm build
node -e "JSON.parse(require('fs').readFileSync('out/manifest.webmanifest','utf8')); console.log('MANIFEST OK')"
```
Expected: `MANIFEST OK`

- [ ] **Step 4: Commit**

```bash
git add public/manifest.webmanifest public/icons
git commit -m "feat: PWA manifest + install icons"
```

---

## Task 8: Amplify Hosting build spec

**Files:**
- Create: `amplify.yml`

- [ ] **Step 1: Create the Amplify build spec**

Create `amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - corepack enable
        - pnpm install --frozen-lockfile
    build:
      commands:
        - pnpm build
  artifacts:
    baseDirectory: out
    files:
      - "**/*"
  cache:
    paths:
      - node_modules/**/*
```

- [ ] **Step 2: Connect the repo (manual, one-time)**

In the AWS Amplify console: **Host web app → connect this Git repo → branch `main`**.
Amplify auto-detects `amplify.yml`. Confirm the build's artifact base directory is
`out`. Trigger the first deploy.

(Alternative for the DevOps path: provision with the Amplify CLI or a small CDK
stack — Amplify Hosting is the only AWS resource Phase 1 needs.)

- [ ] **Step 3: Commit**

```bash
git add amplify.yml
git commit -m "chore: Amplify Hosting build spec (static export from out/)"
```

---

## Task 9: Manual verification — install on iPhone, load offline

> No automated test can prove install-to-home-screen on iOS. This is the
> milestone's actual acceptance check — do it on your real iPhone.

- [ ] **Step 1: Confirm the production build is live**

Open the Amplify deploy URL in **mobile Safari**. The Triptales shell loads.

- [ ] **Step 2: Install to home screen**

Safari → Share → **Add to Home Screen** → Add. Expected: a Triptales icon appears
on the home screen using your `icon-192`/`512` artwork.

- [ ] **Step 3: Launch standalone**

Tap the home-screen icon. Expected: it opens **full-screen with no Safari chrome**
(standalone display mode), respecting the notch/safe area.

- [ ] **Step 4: Verify offline shell**

Launch the installed app once (to populate the cache), then enable **Airplane
Mode** and relaunch. Expected: the Triptales home shell still loads (served by the
service worker), not the Safari "no connection" page.

- [ ] **Step 5: Verify the desktop layout**

Open the same deploy URL in a **desktop browser** (or DevTools at ≥`lg` width,
1024px+). Expected: the **left sidebar** ("Triptales" + Trips) is visible and the
content fills the wider area beside it — not a phone-width column. Narrow the window
below `lg`: the sidebar hides and the **bottom nav** appears. This confirms the
adaptive App Shell works in both directions.

- [ ] **Step 6: Record the result**

If all of the above pass, M0 is **done**. If install or offline fails, check: manifest
served at `/manifest.webmanifest`, `display: "standalone"`, valid icons, and that
the SW registered (Safari → Settings → Advanced → Web Inspector, or test via
desktop Chrome DevTools → Application → Service Workers as a first pass).

---

## Self-Review

- **Spec coverage:** Next.js + TS + Tailwind (Task 1), `output: 'export'` (Task 2),
  PWA manifest (Task 7), deploy to Amplify (Task 8), install-to-home-screen +
  offline confirmed on iPhone (Task 9). All M0 plan items covered.
- **Carries forward:** the Vitest harness (Task 3), the `out/` static-export build
  (Task 2), and the `AppShell` responsive frame (Task 5) are reused by every later
  milestone.
- **Responsive + tooling:** the App Shell gives every screen a desktop sidebar +
  mobile bottom nav from one component tree (Task 5), verified in both viewports
  (Task 9); pnpm is the package manager throughout (Tasks 1, 3, 8).
- **Constraint check:** no server actions, no route handlers, `output: 'export'`
  set from day one — matches CLAUDE.md.
