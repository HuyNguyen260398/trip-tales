# Local Development & Testing Reference

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18.18 + (26 used locally) | [nodejs.org](https://nodejs.org) |
| pnpm | 11.x | `npm i -g pnpm` or via corepack |

## First-time setup

```bash
pnpm install
```

---

## Development

```bash
pnpm dev          # start the dev server at http://localhost:3000
```

Hot-reload is on by default. The **service worker is disabled** in dev mode
(`RegisterSW` skips registration when `NODE_ENV !== "production"`), so the app
behaves like a plain web app — no cached responses.

---

## Build & preview

### Static export (production)

```bash
pnpm build        # compiles + exports to out/
```

The `out/` directory is the artifact that Amplify Hosting publishes. It is
gitignored and rebuilt on every `pnpm build`.

### Preview the static export locally

`next start` does **not** work with `output: "export"` (it needs a server).
Use a static file server instead:

```bash
pnpm dlx serve out            # serves out/ at http://localhost:3000
# or
npx serve out
# or
python3 -m http.server 3000 --directory out
```

> **PWA / offline testing:** the service worker only registers over HTTPS *or*
> `localhost`. Any of the above servers on `localhost` will activate the SW,
> letting you test offline behaviour and "Add to Home Screen" in desktop Chrome
> DevTools → Application → Service Workers.

---

## Testing

```bash
pnpm test                                      # run all tests once (CI mode)
pnpm test:watch                                # re-run on file save (dev mode)

# Run a single test file
pnpm exec vitest run src/app/page.test.tsx
```

Test files follow the glob `**/*.{test,spec}.?(c|m)[jt]s?(x)`.

The harness (`src/test/setup.ts`) provides:
- `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.)
- `fake-indexeddb/auto` — in-memory IndexedDB that Dexie will use in tests
- `cleanup()` after each test

---

## Linting

```bash
pnpm lint         # ESLint across the whole project
```

Config: `eslint.config.mjs` (Next.js flat config, TypeScript rules).

---

## Dependency management

```bash
pnpm add <pkg>               # add a runtime dependency
pnpm add -D <pkg>            # add a dev dependency
pnpm remove <pkg>            # remove a dependency

pnpm install --frozen-lockfile   # reproducible install (what Amplify CI runs)
```

Always commit `pnpm-lock.yaml` after adding or removing packages.

---

## Tips

**Disable Next.js telemetry (one-time, global)**

```bash
pnpm exec next telemetry disable
```

**Type-check without building**

```bash
pnpm exec tsc --noEmit
```

**Check what will be published to Amplify**

```bash
ls -lh out/          # root of the static export
ls -lh out/_next/    # hashed JS/CSS chunks
```
