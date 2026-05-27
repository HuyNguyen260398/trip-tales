# Triptales — AWS Amplify Hosting deployment design

> Spec for the first production deploy of Triptales. Captures the decisions
> made in the brainstorm session of 2026-05-27 and the runbook the operator
> follows. Pair this with `docs/tasks/M6-deploy-verification.md` (the
> post-deploy QA checklist) — this doc is "how the deploy gets stood up",
> that doc is "how we know it works".

## Status

- Author: Huy Nguyen (with Claude Code, Opus 4.7)
- Date: 2026-05-27 (revised same day after M6 landed on main)
- Phase: pre-deploy planning (no Amplify resources exist yet); code surface is full Phase 1
- M6 on `main`: ✓ merged as commit `773a279` ([PR #12](https://github.com/HuyNguyen260398/trip-tales/pull/12))
- `pnpm build` on main now runs `next build && node scripts/gen-precache.mjs`
- Implementation plans (execute in order; each is independently testable):
  1. [`../plans/2026-05-27-amplify-tf-bootstrap.md`](../plans/2026-05-27-amplify-tf-bootstrap.md) — Terraform bootstrap (S3 + DynamoDB state backend)
  2. [`../plans/2026-05-27-amplify-tf-stack.md`](../plans/2026-05-27-amplify-tf-stack.md) — Terraform Amplify stack (app + branch + PAT)
  3. [`../plans/2026-05-27-amplify-first-deploy.md`](../plans/2026-05-27-amplify-first-deploy.md) — first deploy watch + smoke test + M6 checklist run + ship

## Why we're writing this down

Triptales has shipped M0–M6 to `main` — the full Phase 1 feature surface is
on the default branch and ready to deploy. The master plan calls for **AWS
Amplify Hosting** as the only AWS resource in Phase 1. The deploy is small
in scope but easy to get wrong: cross-origin isolation headers (COOP/COEP)
are non-trivial, the service-worker precache expects same-origin assets, and
the M5 reel renderer fetches `ffmpeg.wasm` from a third-party CDN under
`Cross-Origin-Embedder-Policy: require-corp` — a configuration combination
that *only works if the headers and the build artefacts line up*. This
document fixes all the decisions before we touch AWS so the first deploy is
a configuration exercise, not an investigation.

## Decisions captured

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | AWS Amplify Hosting | Plan-mandated; the only AWS resource in Phase 1 |
| Region | `ap-southeast-1` (Singapore) | Closest build region to SEA users; CloudFront edge is global anyway |
| Environments | One: `main` → production | Solo dev; YAGNI for staging/preview |
| Custom domain | None for now (`*.amplifyapp.com`) | De-risk the pipeline first; attach domain when ready to share |
| Provisioning | Terraform, in-repo at `infra/terraform/` | IaC parity with rest of the operator's tooling; reproducible |
| State backend | S3 + DynamoDB from day one | Production-grade hygiene; ~5 min extra to set up |
| Build config source | Repo files (`amplify.yml`, `customHttp.yml`) — auto-detected | Single source of truth; faster iteration than embedding in Terraform |
| GitHub credential | Personal Access Token, 90-day expiry | Path of least resistance for solo dev; migrate to GitHub App later |

## Out of scope (Phase 1)

- Custom domain + ACM cert (deferred until ready to share)
- Multi-environment topology (no staging, no per-PR previews)
- GitHub App credential migration
- IaC of the GitHub PAT / GitHub-side configuration
- Phase 2 Capacitor wrap and any native-iOS deploy concerns
- CDN cost optimization beyond Amplify defaults
- Build-time CI gate ahead of Amplify (Amplify currently builds on every push to `main`; tightening this is a follow-up)

## Pre-flight gate

Every item must be true *before* the first `terraform apply` runs. Several are
recoverable post-facto but cost a broken first deploy.

1. ~~**PR #12 (M6 → main) merged.**~~ **Done** — M6 landed on `main` as commit
   `773a279` on 2026-05-27. All six M6 files (`ExportButton.tsx`,
   `settings/page.tsx`, `gen-precache.mjs`, `export.ts`, `StorageMeter.tsx`,
   `states.tsx`) are present, and `pnpm build` is wired to run
   `next build && node scripts/gen-precache.mjs`.
2. **CI green on the merge commit (`773a279`).** `.github/workflows/ci.yaml`
   runs lint + test + build on push to `main`. Verify the run for `773a279`
   is green before proceeding:
   ```bash
   gh run list --branch main --limit 3
   ```
   If CI failed post-merge, fix forward before continuing.
3. **`pnpm build` succeeds locally on the merged `main`.** Confirm `out/` and
   `out/precache-manifest.json` are produced:
   ```bash
   git checkout main && git pull
   pnpm install --frozen-lockfile
   pnpm build
   test -f out/precache-manifest.json && echo "precache OK"
   ```
   Catches anything the jsdom CI missed.
4. **AWS account ready:**
   - IAM principal with permissions (see `IAM policy` section below)
   - AWS CLI configured for `ap-southeast-1`
   - `aws sts get-caller-identity` returns your account ID
5. **GitHub Personal Access Token created:**
   - Scopes: `repo` (full) + `admin:repo_hook`
   - Expiry: 90 days; calendar reminder set
   - Stored outside the repo (password manager / `~/.config/...`); never echoed
6. **Terraform ≥ 1.6 installed locally.**

## Infra architecture

### Repo layout

```
infra/
  terraform/
    bootstrap/
      main.tf              # S3 state bucket + DynamoDB lock table
      outputs.tf           # bucket_name, lock_table_name
      versions.tf          # terraform + AWS provider pins
    amplify/
      main.tf              # aws_amplify_app + aws_amplify_branch
      variables.tf         # github_token (sensitive), github_repo_url, branch_name
      outputs.tf           # app_id, default_domain, deploy_url
      backend.tf           # backend "s3" { bucket = "<bootstrap output>" ... }
      versions.tf
      terraform.tfvars.example   # checked in; real terraform.tfvars is gitignored
    README.md              # operator runbook (apply order, PAT sourcing, rotation)
.gitignore                 # adds: infra/terraform/**/.terraform/, *.tfstate*, terraform.tfvars
```

Two stacks because of the **state-backend chicken-and-egg**: the `amplify/`
stack stores state in S3, but S3 has to exist first. `bootstrap/` creates
that bucket and the lock table using **local state**, which lives on the
operator's machine. Re-running bootstrap is idempotent, so losing local
bootstrap state is recoverable.

### `bootstrap/` resources

- **`aws_s3_bucket "tfstate"`** — `triptales-tfstate-<account-id>-apse1`
  - `aws_s3_bucket_versioning` — enabled
  - `aws_s3_bucket_server_side_encryption_configuration` — SSE-S3
  - `aws_s3_bucket_public_access_block` — block all public ACLs and policies
  - `aws_s3_bucket_lifecycle_configuration` — expire noncurrent versions after 30 days
- **`aws_dynamodb_table "tflock"`** — `triptales-tflock`
  - `LockID` (string) hash key
  - `PAY_PER_REQUEST` billing mode
- **Outputs:** `bucket_name`, `lock_table_name` — copy into `amplify/backend.tf`

### `amplify/` resources

- **`aws_amplify_app "app"`**:
  - `name = "triptales"`
  - `repository = var.github_repo_url` (`https://github.com/HuyNguyen260398/trip-tales`)
  - `access_token = var.github_token` (`sensitive`, sourced from `TF_VAR_github_token`)
  - `platform = "WEB"` — static export; *not* `WEB_COMPUTE` (which is for SSR/ISR)
  - `enable_branch_auto_deletion = false`
  - **No `build_spec` set** — Amplify auto-detects `amplify.yml` from the repo
  - **No `custom_headers` block** — `customHttp.yml` is the source of truth for COOP/COEP
  - `environment_variables = {}` — none needed; Corepack + pnpm wiring lives in `amplify.yml`
- **`aws_amplify_branch "main"`**:
  - `app_id = aws_amplify_app.app.id`
  - `branch_name = "main"`
  - `stage = "PRODUCTION"`
  - `enable_auto_build = true`
  - `framework = "Next.js - SSG"` (informational tag only; doesn't change build behavior)
- **Outputs:**
  - `app_id`
  - `default_domain` — `<app_id>.amplifyapp.com`
  - `deploy_url` — `https://main.<app_id>.amplifyapp.com`

### Backend wiring (`amplify/backend.tf`)

```hcl
terraform {
  backend "s3" {
    bucket         = "triptales-tfstate-<account-id>-apse1"
    key            = "amplify/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "triptales-tflock"
    encrypt        = true
  }
}
```

Hard-coded because backend config in Terraform cannot reference variables.
Bucket and table names come from the bootstrap stack's outputs. Not secrets
— safe to commit.

### IAM policy for the IaC principal

Two options; pick at apply time.

**Pragmatic (managed policies, ~5 min):**
- `AdministratorAccess-Amplify` (AWS-managed)
- `AmazonS3FullAccess` (AWS-managed)
- `AmazonDynamoDBFullAccess` (AWS-managed)
- `IAMReadOnlyAccess` (AWS-managed)

Broader than necessary; fine for one-person ops on a single account.

**Least-privilege (custom inline policy, ~15 min):**
- `amplify:*` on the triptales app + branch ARNs
- S3 ops scoped to `arn:aws:s3:::triptales-tfstate-<account-id>-apse1[/*]`
- DynamoDB ops scoped to the lock table ARN
- `iam:CreateServiceLinkedRole` for `amplify.amazonaws.com` (one-time)
- `iam:GetRole`, `iam:PassRole` on the Amplify service role

Switch to the least-privilege policy if you ever onboard a collaborator on the IaC.

### Git-ignored vs committed

- **Committed:** all `.tf` files, `versions.tf`, `terraform.tfvars.example`, `.terraform.lock.hcl` (pins provider versions), `infra/terraform/README.md`
- **Git-ignored:** `.terraform/`, `*.tfstate`, `*.tfstate.backup`, `terraform.tfvars`

## First-deployment flow

Five phases; sequential. Wall time ~15–25 min, most of which is the first
Amplify build.

### Phase A — Bootstrap stack (~3–5 min)

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
terraform output            # copy bucket_name + lock_table_name
```

Edit `infra/terraform/amplify/backend.tf` with the two output values and
commit (`chore(infra): wire S3 backend for amplify stack` is a fine commit
subject). Push.

### Phase B — Amplify stack (~2–3 min)

1. **Create the PAT** in GitHub → Settings → Developer Settings → Personal
   Access Tokens (classic). Scopes: `repo` + `admin:repo_hook`. Expiry: 90d.
2. **Source it as an env var** (no history, no file):
   ```bash
   read -s TF_VAR_github_token; export TF_VAR_github_token
   ```
3. **Create `infra/terraform/amplify/terraform.tfvars`** from
   `terraform.tfvars.example`. Contents:
   ```hcl
   github_repo_url = "https://github.com/HuyNguyen260398/trip-tales"
   branch_name     = "main"
   ```
   Gitignored; no secrets.
4. **Apply:**
   ```bash
   cd infra/terraform/amplify
   terraform init              # initializes S3 backend; locks via DynamoDB
   terraform plan              # review: 1 app + 1 branch to create
   terraform apply
   terraform output            # note deploy_url
   ```

The first Amplify build kicks off automatically because we just connected a
branch.

### Phase C — Watch the first build (~5–10 min, automatic)

**CLI:**
```bash
APP_ID=$(terraform -chdir=infra/terraform/amplify output -raw app_id)
watch -n 5 "aws amplify list-jobs --app-id $APP_ID --branch-name main \
  --max-results 1 \
  --query 'jobSummaries[0].{status:status,start:startTime,end:endTime,id:jobId}' \
  --output table"
```

Or the Amplify Console → Hosting → main → Builds.

Build steps: **Provision** (~30s) → **Build** (~4–7 min cold) → **Deploy**
(~30s) → **Verify** (~10s).

**Top three failure modes:**
1. Lockfile drift — `pnpm install --frozen-lockfile` errors. Fix: re-run
   `pnpm install` locally, commit the `pnpm-lock.yaml` delta.
2. `gen-precache.mjs` error — usually because `out/` is empty after `next
   build` failed silently. Read the real `next build` error in the log.
3. Corepack not enabled — `pnpm: command not found`. Confirm
   `corepack enable` is still in `amplify.yml`'s `preBuild`.

### Phase D — First smoke test (~2 min, browser)

Confirms *the infrastructure* is correct. The full M6 checklist comes in
Phase E.

1. **Page loads.** Open `https://main.<app_id>.amplifyapp.com`.
2. **Custom headers applied:**
   ```bash
   curl -sI https://main.<app_id>.amplifyapp.com/ | grep -i 'cross-origin-'
   ```
   Both `cross-origin-opener-policy: same-origin` and
   `cross-origin-embedder-policy: require-corp` should appear.
3. **Cross-origin isolation enabled.** DevTools Console: `crossOriginIsolated`
   prints `true`.
4. **Service worker registers.** DevTools → Application → Service Workers
   → `sw.js` activated.
5. **Precache populated.** DevTools → Application → Cache Storage →
   `triptales-shell-v2` has entries (HTML + `_next/static/...` + manifest).
6. **Precache manifest reachable.** `curl -s
   https://main.<…>.amplifyapp.com/precache-manifest.json | head` returns a
   JSON array.

If 2–3 fail, `customHttp.yml` wasn't picked up; recheck file at repo root
and `Redeploy this version` from the console. If 4–5 fail, that's an M6 SW
issue, not Amplify.

### Phase E — Wire the deploy URL into the M6 checklist

`docs/tasks/M6-deploy-verification.md` has a `_<add deploy URL once Amplify
is up>_` placeholder. Replace with the real URL; commit (`chore(docs): wire
deploy URL into M6 verification doc`). Push; Amplify will auto-redeploy.
Run the M6 checklist against that second deploy.

## Post-deploy verification

Two layers, both *after* a successful Phase C + D.

### Layer 1 — Amplify-specific (~10 min, desktop)

Items not covered by the M6 checklist because they're about *the deploy*:

- Headers applied (curl, as in Phase D step 2)
- `crossOriginIsolated === true`
- `precache-manifest.json` reachable + non-empty
- **Second build is faster than first** — push a trivial change (the
  deploy-URL edit in Phase E is a perfect pretext); the `pnpm install` step
  should be near-instant thanks to `cache: node_modules/**/*` in
  `amplify.yml`
- **ffmpeg threaded-core path works in production** — render a video-clip
  reel for a day with at least one video. If `crossOriginIsolated` is `true`
  and the render succeeds, the threaded core fetched successfully from
  `unpkg.com`. If it errors with a CORS-like message in console, see Risk 1.

### Layer 2 — M6 deploy-verification checklist

Run `docs/tasks/M6-deploy-verification.md` top to bottom. Tick boxes inline;
record failures with browser + date. **Tag the commit `m6-shipped` when the
checklist is green** as the document's Section E instructs.

## Operations

### PAT rotation (every 90 days)

```bash
read -s TF_VAR_github_token; export TF_VAR_github_token   # paste new token
cd infra/terraform/amplify
terraform apply -target=aws_amplify_app.app
```

Then revoke the old token in GitHub Settings. **Amplify silently stops
auto-building when the token expires** — calendar reminder is non-optional.

### Watching builds

- Console for ad-hoc debugging (clearer log streaming)
- CLI snippet from Phase C for scripts / quick status
- Logs retained ~30 days; download anything you'll need later

### Rollback

AWS Console → Hosting → main → Builds → pick a prior green build →
**Redeploy this version**. Reverts served artefacts without touching git.
Use when a bad merge breaks production and you don't want to wait on a
revert PR's CI cycle.

### Pausing auto-build for emergencies

```bash
aws amplify update-branch --app-id "$APP_ID" --branch-name main --no-enable-auto-build
```

Flip back after the incident; *also* update Terraform
(`enable_auto_build = true` stays in code) so the next `terraform apply`
doesn't undo your fix.

### Cost monitoring

Amplify Hosting bills on build minutes + bandwidth + storage. Solo Phase-1
traffic should sit **under $5/month**. Set a CloudWatch billing alarm at
$10 anyway. Singapore region uses the same pricing as US regions.

## Risks

1. **`unpkg.com` and COEP.** Under cross-origin isolation, the page can only
   fetch from origins that include `Cross-Origin-Resource-Policy:
   cross-origin`. `src/lib/reel/ffmpeg.ts` does
   `toBlobURL('https://unpkg.com/@ffmpeg/core-mt@0.12.6/...')`. Unpkg has
   historically been inconsistent about CORP. **Detection:** Layer 1 verification
   step 5 above. **Mitigation if it fails:** self-host the ffmpeg core under
   `public/ffmpeg/`, switch `base` to the local path, commit. ~30 MB to the
   repo; same-origin so COEP is satisfied trivially.

2. **Service-worker cache name drift.** `public/sw.js` has
   `const CACHE = "triptales-shell-v2"`. Activate purges only caches with
   *different* names. If a future deploy ships SW or precache changes
   without bumping the version, users get stale assets indefinitely. The M6
   doc flags this in its post-ship list. **Mitigation:** make
   "bump CACHE" a code-review checklist item when `public/sw.js` or
   `scripts/gen-precache.mjs` change; add a CI guard in a follow-up.

3. **PAT in Terraform state.** Even with `sensitive = true`, the PAT lands
   in `terraform.tfstate`. We encrypted the S3 backend from day one for
   exactly this reason. **Mitigation:** strict S3 bucket policy (no public,
   no cross-account); rotate token if IaC access expands; migrate to GitHub
   App when there's >1 operator.

4. **`cache.addAll` atomicity.** One bad URL in `precache-manifest.json`
   silently demotes the install to shell-only. **Detection:** Layer 1
   verification step 5 — Cache Storage entry count > 1.

5. **First deploy without M6 = broken offline + broken export.** Gated by
   Pre-flight gate item 1.

## Open follow-ups (not blocking the deploy)

- Custom domain + ACM cert when Phase 1 is ready to share publicly
  (one `aws_amplify_domain_association` resource)
- GitHub App credential migration once there's >1 operator
- Branch protection on `main`: require CI + 1 approving review before
  merging. **Strongly recommended** — closes the door on the kind of
  mis-targeted PR that PR #11 was. Do before next milestone work.
- Self-host ffmpeg core preemptively (before Risk 1 bites)
- Build-time CI gate before Amplify build (use `Skip build for branch` +
  GitHub Actions trigger so a red CI doesn't ship)
- Replace placeholder music with real CC0 tracks
- CI guard: fail when `public/sw.js` changes without `CACHE` bumping

## Decisions deferred to apply time

These don't need a design answer; the operator picks at the moment of
`terraform apply`:

- IAM policy style (managed-policies vs least-privilege)
- Whether to commit the bootstrap stack's `terraform.tfstate` to anywhere
  beyond the operator's local disk (recommended: no)
- Whether to also tag releases with the Amplify build ID for traceability
  (recommended: yes; `git tag -a deploy/<jobId> -m "Amplify build <jobId>"`)

## Cross-references

- Master plan: `/triptales-web-mvp-plan.md`
- Milestone task plans: `docs/tasks/M0…M6-*.md`
- Post-deploy QA checklist: `docs/tasks/M6-deploy-verification.md`
- Build config (existing): `amplify.yml`, `customHttp.yml`
- Service worker: `public/sw.js`
- Precache generator: `scripts/gen-precache.mjs`
- ffmpeg loader: `src/lib/reel/ffmpeg.ts` (the unpkg risk surface)
- PR that re-targeted M6 → main: https://github.com/HuyNguyen260398/trip-tales/pull/12 (merged as commit `773a279`)
