# Amplify Deploy — First Deploy & Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Many steps are **manual operator actions** (browser, real iPhone) — those can't be automated, but every "did it work?" check has an exact expected output.

**Goal:** Watch the first Amplify build to success, confirm the deploy is correctly configured (headers, cross-origin isolation, service worker, precache), validate the ffmpeg threaded-core path, wire the live URL into the M6 verification checklist, run that checklist top-to-bottom on desktop browsers and a real iPhone, and tag the ship.

**Architecture:** No infrastructure code changes. One docs commit (the deploy URL into the M6 checklist). Everything else is a runbook of CLI + browser + device checks against the live deploy. The plan exists so the verification is recorded, repeatable, and gated.

**Tech Stack:** AWS CLI, `curl`, browser DevTools (any modern desktop browser; macOS Safari + Edge specifically required by the M6 checklist), a real iPhone for the PWA install verification.

**Pair with:**
- [`../specs/2026-05-27-amplify-deployment-design.md`](../specs/2026-05-27-amplify-deployment-design.md) — verification + ops sections
- [`../../tasks/M6-deploy-verification.md`](../../tasks/M6-deploy-verification.md) — the actual M6 QA checklist this plan executes

---

## Prerequisites (must be true before Task 1)

- Plan 2 (amplify stack) has been applied. PR is open but **not yet merged**.
- You have these env vars sourced (from plan 2's outputs):
  ```bash
  cd infra/terraform/amplify
  APP_ID=$(terraform output -raw app_id)
  DEPLOY_URL=$(terraform output -raw deploy_url)
  cd ../../..
  echo "APP_ID=$APP_ID"
  echo "DEPLOY_URL=$DEPLOY_URL"
  ```
- A real iPhone is available for sections B + D of this plan (Sections B–E of the M6 checklist need it).
- `dig +short main.${APP_ID}.amplifyapp.com` returns a CloudFront IP (DNS allocated).

## What this plan does *not* do

- Doesn't merge plan 2's PR (you do that **after** this plan's verification is green — Task 14).
- Doesn't attach a custom domain (out of scope per spec).
- Doesn't fix the M5 ffmpeg-on-unpkg risk preemptively — only detects it in Task 8 and points at the mitigation if it fires.

---

### Task 1: Watch the first build to SUCCEED

- [ ] **Step 1: Tail the build status**

```bash
watch -n 5 "aws amplify list-jobs --app-id $APP_ID --branch-name main --max-results 1 \
  --query 'jobSummaries[0].{status:status,start:startTime,end:endTime,id:jobId}' \
  --output table"
```

Expected progression (each transition ~30s–5min):
```
PENDING  →  PROVISIONING  →  RUNNING  →  DEPLOYING  →  VERIFYING  →  SUCCEED
```

Terminal status `SUCCEED` ends the loop. If you see `FAILED` or `CANCELLED`, skip to "Failure modes" at the bottom and **do not** continue with Task 2.

- [ ] **Step 2: Note the job ID**

```bash
JOB_ID=$(aws amplify list-jobs --app-id $APP_ID --branch-name main --max-results 1 \
  --query 'jobSummaries[0].jobId' --output text)
echo "$JOB_ID"
```

- [ ] **Step 3: Confirm the build artefacts include precache-manifest.json**

```bash
aws amplify get-job --app-id $APP_ID --branch-name main --job-id $JOB_ID \
  --query 'job.summary.commitMessage' --output text
```

This isn't strictly verifying `precache-manifest.json` — but it confirms you're inspecting the right commit. If the commit message isn't `Merge pull request #12 …` (or a later commit on main), the wrong build ran.

---

### Task 2: Smoke test — page loads (~30s)

- [ ] **Step 1: Curl the root**

```bash
curl -sI -o /dev/null -w "%{http_code}\n" $DEPLOY_URL/
```

Expected: `200`

If you see `503` or anything else, the build was reported SUCCEED but the CloudFront cache is still warming. Wait 60s and re-try.

- [ ] **Step 2: Open the deploy URL in a browser**

Open `$DEPLOY_URL` in macOS Safari. The Trips list page should render (or its empty state if no trips were ever created from this device/browser — they live in IndexedDB).

---

### Task 3: Smoke test — cross-origin headers (~1 min)

- [ ] **Step 1: Curl for the cross-origin headers**

```bash
curl -sI $DEPLOY_URL/ | grep -iE 'cross-origin-(opener|embedder)-policy'
```

Expected (case-insensitive on header name, exact on value):
```
cross-origin-opener-policy: same-origin
cross-origin-embedder-policy: require-corp
```

- [ ] **Step 2: If either header is missing**

`customHttp.yml` wasn't picked up. Two possible causes:
1. File isn't at the **repo root** — confirm `git ls-tree HEAD --name-only | grep -i customhttp` from a fresh clone of main.
2. The first build ran *before* the file existed on main — re-trigger by force in the Amplify console: Hosting → main → Builds → ⋮ on the latest build → **Redeploy this version**. Then loop back to Task 1.

---

### Task 4: Smoke test — cross-origin isolation true in browser

- [ ] **Step 1: Open DevTools console on the deploy URL**

In macOS Safari (or Chrome) on `$DEPLOY_URL`, open the JavaScript console.

- [ ] **Step 2: Print the global**

```javascript
crossOriginIsolated
```

Expected: `true`

If `false`, the headers are present at the edge (Task 3 passed) but the page can't claim isolation — usually a third-party `<script>` tag without `crossorigin` attribute. Search `out/index.html` from a local build for `<script` tags without `crossorigin=` and report.

---

### Task 5: Smoke test — service worker activated

- [ ] **Step 1: Hard-reload to install a clean SW**

In the deploy URL tab: `Cmd+Shift+R` (Safari) / `Cmd+Shift+R` (Chrome).

- [ ] **Step 2: Check Application → Service Workers**

DevTools → Application tab → Service Workers (left sidebar).

Expected:
- **Source:** `sw.js`
- **Status:** `activated and is running`

If `redundant` or `installing`, wait 5s and re-load. If after 30s it's still not activated, console errors will show the cause (most likely a 404 on `precache-manifest.json` — see Task 7).

---

### Task 6: Smoke test — precache populated

- [ ] **Step 1: Open Application → Cache Storage**

DevTools → Application → Cache Storage → look for `triptales-shell-v2`.

- [ ] **Step 2: Confirm content**

Click `triptales-shell-v2`. It should have **at least 5 entries** (the count varies with the size of the precache manifest; typical: 30–80 entries including `/`, `/_next/static/...js`, `/_next/static/...css`, `/manifest.webmanifest`, `/icons/icon-192.png`, etc.).

If the cache has only `/` (1 entry) → `cache.addAll(precache-manifest)` silently failed and the SW fell back to shell-only. Open the SW install log in the browser console and find the failing URL. **Capture this in MEMORY.md** as a follow-up — it's one of the documented M6 risks.

---

### Task 7: Smoke test — precache-manifest.json reachable

- [ ] **Step 1: Curl the manifest**

```bash
curl -s $DEPLOY_URL/precache-manifest.json | head -c 500
```

Expected: a JSON array literal beginning with `[` and listing absolute paths like `["/_next/static/...js", "/manifest.webmanifest", ...]`.

If the response is HTML (likely the SPA index falling through) or a 404, the file isn't in `out/` — confirm `scripts/gen-precache.mjs` ran during the build by reading the Amplify build log:

```bash
aws amplify get-job --app-id $APP_ID --branch-name main --job-id $JOB_ID \
  --query 'job.steps[?stepName==`BUILD`].logUrl' --output text
```

Open the URL in a browser; look for `precache: <N> assets` in the log near the end of the BUILD step.

---

### Task 8: ffmpeg threaded-core production test (Risk #1)

This is the highest-risk verification — the M5 reel renderer fetches the ffmpeg core from `unpkg.com`. Under `Cross-Origin-Embedder-Policy: require-corp`, that fetch requires `unpkg` to serve `Cross-Origin-Resource-Policy: cross-origin`.

- [ ] **Step 1: Create a trip and import a video**

In the deploy URL tab (still desktop browser):
1. **Trips** → **+ New trip** → fill name + dates → Save
2. Open the trip → **Import media** → pick a folder that contains **at least one .mp4 or .mov file with EXIF date**
3. Day timeline groups by day
4. Open the day with the video → **Make reel**

- [ ] **Step 2: Enable "Include video clips" in ReelBuilder**

In the reel builder UI, toggle **Include video clips** on. Set resolution to 720p (default).

- [ ] **Step 3: Click Render and watch the console**

Open DevTools Console **before** clicking Render. Click Render.

Expected: console logs from ffmpeg.wasm (preload, exec lines), no `CORS-like`, no `NetworkError`, no `Failed to fetch`. Render completes (~30s–2min depending on clip count).

- [ ] **Step 4: If the fetch fails (the risk fires)**

Symptom: Console shows `Failed to fetch ... unpkg.com/...ffmpeg-core-mt...` or a CORS-like error.

This means `unpkg` is not serving `Cross-Origin-Resource-Policy` on the ffmpeg-core-mt asset. **Open a follow-up PR to self-host the ffmpeg core:**

1. Download the core files locally:
   ```bash
   mkdir -p public/ffmpeg
   cd public/ffmpeg
   curl -O https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js
   curl -O https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.wasm
   curl -O https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js
   curl -O https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js -o ffmpeg-core-st.js
   curl -O https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm -o ffmpeg-core-st.wasm
   cd ../..
   ```
2. Edit `src/lib/reel/ffmpeg.ts` — change `base` from `https://unpkg.com/@ffmpeg/...` to `/ffmpeg`. Update non-mt path similarly.
3. New branch `fix/self-host-ffmpeg-core`, commit, PR.
4. Once merged, Amplify auto-deploys. Re-run Task 8.

Don't continue Task 9+ until ffmpeg renders successfully.

---

### Task 9: Wire the deploy URL into the M6 verification checklist

**Files:**
- Modify: `docs/tasks/M6-deploy-verification.md`

- [ ] **Step 1: Create a tiny docs branch**

```bash
git checkout main
git pull origin main
git checkout -b docs/wire-deploy-url
```

- [ ] **Step 2: Replace the placeholder**

In `docs/tasks/M6-deploy-verification.md`, find:

```markdown
**Deploy:** _<add deploy URL once Amplify is up>_
**Tester:** _<your name>_
**Tested on:** _<date>_
```

Replace with (substituting `$DEPLOY_URL` literally):

```markdown
**Deploy:** https://main.<your-app-id>.amplifyapp.com  (Amplify, ap-southeast-1)
**Tester:** Huy Nguyen
**Tested on:** 2026-05-27
```

- [ ] **Step 3: Commit, push, open PR, merge**

```bash
git add docs/tasks/M6-deploy-verification.md
git commit -m "docs(M6): wire amplify deploy URL into verification checklist"
git push -u origin docs/wire-deploy-url
gh pr create --base main --head docs/wire-deploy-url \
  --title "docs(M6): wire amplify deploy URL into verification checklist" \
  --body "Records the live Amplify URL (\`$DEPLOY_URL\`) so the M6 deploy-verification checklist is testing the right thing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge after CI is green. This will trigger a **second** Amplify build — useful as a side-effect test of the auto-build webhook.

- [ ] **Step 4: Confirm the second build also SUCCEEDs and is faster than the first**

```bash
watch -n 5 "aws amplify list-jobs --app-id $APP_ID --branch-name main --max-results 2 \
  --query 'jobSummaries[*].{id:jobId,status:status,start:startTime,end:endTime}' \
  --output table"
```

The new job should be `RUNNING` then `SUCCEED`. Total wall-time should be **noticeably shorter** than Task 1's build (typically 30–50% faster) thanks to `cache: node_modules/**/*` in `amplify.yml`. If it isn't, capture as a follow-up — cache key may be wrong.

---

### Task 10: Run M6 checklist — Section A (desktop browsers)

**Reference:** `docs/tasks/M6-deploy-verification.md` Section A.

- [ ] **Step 1: A1 — macOS Safari**

Open the deploy URL in Safari, hard-reload (Cmd+Shift+R). Tick boxes in the M6 doc as you go through A1's 7 items.

- [ ] **Step 2: A2 — macOS Edge (regression check for commit `84636a7`)**

This is the browser where the desktop-export `NotAllowedError` was found. Specifically verify **Export trip downloads the `.zip` directly** (no permission error). Tick A2's 3 items.

- [ ] **Step 3: A3 — macOS Chrome (smoke)**

Tick A3's 2 items.

- [ ] **Step 4: A4 — macOS Firefox (smoke)**

Tick A4's 2 items.

- [ ] **Step 5: A5 — empty/error states**

Pick any one desktop browser. Tick A5's 3 items.

- [ ] **Step 6: Record failures inline**

Any unticked box: write the date + browser + observed behavior next to it in the M6 doc, then capture as a follow-up branch (don't try to fix mid-checklist).

---

### Task 11: Run M6 checklist — Section B (iPhone PWA install)

**Reference:** `docs/tasks/M6-deploy-verification.md` Section B. Real device required.

- [ ] **Step 1: Install to home screen**

On iPhone Safari, open `$DEPLOY_URL`. Share sheet → **Add to Home Screen**. Confirm the home-screen icon is the Triptales icon (not the generic globe favicon).

- [ ] **Step 2: B1 — offline shell**

Tick the 5 items in B1. (Open once online → enable Airplane Mode → relaunch → app shell loads from cache.)

- [ ] **Step 3: B2 — full DoD flow**

Tick the 6 items in B2. (Online, end-to-end create trip → import HEIC + JPEG → reel with audio → share.)

- [ ] **Step 4: B3 — export**

Tick the 4 items in B3. The iOS share sheet should offer the `.zip`; saving to Files should produce a zip with `manifest.json`, `reels/...`, `media/...`.

- [ ] **Step 5: B4 — settings**

Tick the 4 items in B4. (Storage usage shows real numbers; durable-storage request flow works.)

- [ ] **Step 6: B5 — empty/error states**

Tick the 3 items in B5.

- [ ] **Step 7: B6 — persistence**

Tick the 2 items in B6. (Force-close + reopen → all data present; re-export reproducible.)

- [ ] **Step 8: B7 — PWA install hygiene**

Tick the 3 items in B7. (Icon correct; standalone launch; safe-area-inset respected.)

---

### Task 12: Run M6 checklist — Section C (service worker hardening)

**Reference:** `docs/tasks/M6-deploy-verification.md` Section C.

- [ ] **Step 1: SW activated as `triptales-shell-v2`**

Already verified in Task 5; tick the box.

- [ ] **Step 2: Cache `triptales-shell-v2` contains precache entries**

Already verified in Task 6; tick.

- [ ] **Step 3: Second deploy upgrades SW + purges old cache**

This requires a **third** deploy after a SW change — defer to a follow-up; mark this box `[ ] deferred — see follow-ups`.

- [ ] **Step 4: Cross-origin requests NOT in SW cache**

In DevTools → Application → Cache Storage → `triptales-shell-v2`, confirm no entries for `tile.openstreetmap.org`, `nominatim.openstreetmap.org`, or `unpkg.com`. Tick.

---

### Task 13: Commit the now-green checklist + tag the ship

- [ ] **Step 1: Commit the ticked checklist as evidence**

```bash
git checkout main && git pull
git checkout -b chore/m6-shipped
git add docs/tasks/M6-deploy-verification.md
git commit -m "chore(M6): mark deploy-verification checklist green for first deploy"
git push -u origin chore/m6-shipped
gh pr create --base main --head chore/m6-shipped \
  --title "chore(M6): mark deploy-verification checklist green" \
  --body "All A + B + C items in \`M6-deploy-verification.md\` are ticked or marked deferred against the first Amplify deploy (\`$DEPLOY_URL\`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge after CI passes.

- [ ] **Step 2: Tag the merge commit**

After the chore PR merges:

```bash
git checkout main && git pull
SHIPPED_SHA=$(git rev-parse HEAD)
git tag -a m6-shipped -m "M6 shipped to AWS Amplify ($DEPLOY_URL) on 2026-05-27"
git push origin m6-shipped
echo "Tagged $SHIPPED_SHA as m6-shipped"
```

This gives the M6 post-ship follow-ups a known baseline (per `M6-deploy-verification.md` Section E).

---

### Task 14: Merge plan 2's PR (now safe)

If plan 2's PR (`feat(infra): terraform amplify stack`) is still open:

- [ ] **Step 1: Merge**

```bash
gh pr list --head feat/amplify-tf-stack --json number --jq '.[0].number'
# use that number with: gh pr merge <num> --merge
```

The infra is **already live** in AWS; the merge just commits the Terraform source to main so the next operator can re-apply / drift-check.

---

### Task 15: Capture follow-ups in MEMORY.md

Per `M6-deploy-verification.md` Section E, "Update `MEMORY.md` if anything surprising surfaced".

- [ ] **Step 1: Decide if there's anything to record**

Run through Tasks 1–12 mentally. Anything surprising — bad browser behavior, an iOS quirk, a timing oddity, an unpkg failure that needed self-hosting?

- [ ] **Step 2: If yes, write a memory**

Use the `feedback` or `project` memory type per the user's memory protocol (see top-level CLAUDE.md / project memory instructions). Add a one-line pointer in `MEMORY.md`.

- [ ] **Step 3: If no surprises, skip this task** — that's fine.

---

### Task 16: Set the CloudWatch billing alarm

Belt-and-braces against runaway Amplify bills.

- [ ] **Step 1: Confirm a billing alarm doesn't already exist**

```bash
aws cloudwatch describe-alarms --region us-east-1 \
  --alarm-name-prefix triptales-billing \
  --query 'MetricAlarms[*].AlarmName' --output text
```

(Billing metrics live in `us-east-1` regardless of where your resources are.)

If empty, continue. If it returns an alarm name, skip the next step.

- [ ] **Step 2: Create a $10/month alarm**

You'll need an SNS topic to publish to. If you don't already have one for billing alerts:

```bash
aws sns create-topic --name triptales-billing-alarm --region us-east-1
aws sns subscribe \
  --topic-arn $(aws sns list-topics --region us-east-1 --query "Topics[?contains(TopicArn,\`triptales-billing-alarm\`)].TopicArn" --output text) \
  --protocol email \
  --notification-endpoint huynguyen260398@gmail.com \
  --region us-east-1
```

(Confirm the email subscription via the link AWS emails you.)

Then create the alarm:

```bash
TOPIC_ARN=$(aws sns list-topics --region us-east-1 \
  --query "Topics[?contains(TopicArn,\`triptales-billing-alarm\`)].TopicArn" --output text)

aws cloudwatch put-metric-alarm \
  --region us-east-1 \
  --alarm-name triptales-billing-10usd \
  --alarm-description "Alert when monthly AWS bill exceeds USD 10 (triptales is solo Phase-1 traffic, should be <\$5/mo)" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=Currency,Value=USD \
  --alarm-actions "$TOPIC_ARN"
```

Confirm:
```bash
aws cloudwatch describe-alarms --region us-east-1 --alarm-names triptales-billing-10usd \
  --query 'MetricAlarms[0].StateValue' --output text
```

Expected: `OK` or `INSUFFICIENT_DATA` (the latter is normal for a brand-new alarm).

---

## Done when

- All 16 tasks ticked
- `m6-shipped` tag pushed to origin
- `docs/tasks/M6-deploy-verification.md` shows the live URL + all A + B + C boxes ticked or marked deferred with reasons
- Plan 2's PR merged
- CloudWatch billing alarm in place
- (Optionally) one or more memories captured in `MEMORY.md`

This satisfies the spec's "**Phase 1 of Triptales is done when this checklist is green.**"

## Failure modes

- **Task 1 build fails: `pnpm install --frozen-lockfile`** → lockfile drift. From a fresh clone of main, `pnpm install`, commit any `pnpm-lock.yaml` delta, push. Amplify auto-rebuilds.
- **Task 1 build fails: `next build` error** → read the BUILD step log via `aws amplify get-job ... --query 'job.steps[?stepName==\`BUILD\`].logUrl'`. Fix locally, push.
- **Task 1 build fails: `gen-precache.mjs` error** → almost always because `out/` is empty (next build failed silently earlier in the chain). Same log-reading drill.
- **Task 1 build fails: Corepack `pnpm: command not found`** → `amplify.yml`'s `preBuild` `corepack enable` line was dropped or Amplify build image is too old. Open Amplify console → App settings → Build settings — confirm the image is `Amazon Linux:2023` or newer.
- **Task 3 headers missing** → see Task 3 inline guidance.
- **Task 5 SW stuck `installing`** → almost always a 404 on `/precache-manifest.json` (Task 7). Fix per Task 7.
- **Task 6 cache has only 1 entry** → `cache.addAll` silently failed on a bad URL in the manifest. Read SW install log in console; identify the bad URL; capture as a follow-up bug (cache.addAll atomicity is a documented risk).
- **Task 8 ffmpeg fetch fails** → self-host per inline guidance. **This is the highest-probability infra risk in this plan.**
- **Task 11 (iPhone) PWA install icon is the generic globe** → `public/manifest.webmanifest` icon paths are wrong, or icons didn't ship. Confirm `curl $DEPLOY_URL/manifest.webmanifest` returns valid JSON and `curl $DEPLOY_URL/icons/icon-192.png` returns a PNG.
