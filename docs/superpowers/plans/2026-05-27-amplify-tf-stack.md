# Amplify Deploy — Terraform Amplify Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision an AWS Amplify Hosting app pointed at the Triptales GitHub repo's `main` branch with auto-build on push, using a GitHub Personal Access Token, with Terraform state stored in the S3 + DynamoDB backend created by the bootstrap plan.

**Architecture:** A second Terraform stack at `infra/terraform/amplify/` using an `s3` backend wired to the bootstrap-created bucket. `amplify.yml` (build steps) and `customHttp.yml` (COOP/COEP headers) stay as files in the repo root — Amplify auto-detects them, Terraform does not duplicate that config. PAT is sourced from `TF_VAR_github_token` env var at apply time.

**Tech Stack:** Terraform ≥ 1.6, AWS provider `hashicorp/aws ~> 5.60`, `aws_amplify_app` + `aws_amplify_branch` resources, GitHub PAT.

**Pair with:** [`../specs/2026-05-27-amplify-deployment-design.md`](../specs/2026-05-27-amplify-deployment-design.md) — read its **Infra architecture → amplify/ resources** section first.

---

## Prerequisites (must be true before Task 1)

- Plan 1 (bootstrap) is complete and **merged to main**. The S3 state bucket and DynamoDB lock table exist.
- You have the two bootstrap output values to hand:
  - `bucket_name` (e.g. `triptales-tfstate-123456789012-apse1`)
  - `lock_table_name` (e.g. `triptales-tflock`)
  - If you don't have them, run from a fresh clone:
    ```bash
    cd infra/terraform/bootstrap
    terraform init && terraform output
    ```
- M6 is on main as commit `773a279` (pre-flight gate item 1 — already done).
- `gh run list --branch main --limit 3` shows a green CI run for `773a279` (pre-flight gate item 2).
- `pnpm install --frozen-lockfile && pnpm build && test -f out/precache-manifest.json && echo OK` succeeds locally on a fresh clone of main (pre-flight gate item 3).
- `terraform -version` reports ≥ 1.6; `aws sts get-caller-identity` works; AWS region defaults to `ap-southeast-1`.

## File structure (what this plan creates)

```
infra/terraform/amplify/
  versions.tf                # provider + Terraform version pins (matches bootstrap)
  backend.tf                 # backend "s3" — hard-coded bucket + table from bootstrap
  variables.tf               # github_token (sensitive), github_repo_url, branch_name
  main.tf                    # aws_amplify_app + aws_amplify_branch
  outputs.tf                 # app_id, default_domain, deploy_url
  terraform.tfvars.example   # template; real terraform.tfvars is gitignored
infra/terraform/README.md    # appended with stack-2 operator runbook
```

---

### Task 1: Branch off the post-bootstrap main

**Files:** (none yet)

- [ ] **Step 1: Confirm bootstrap landed**

```bash
git checkout main && git pull origin main
test -d infra/terraform/bootstrap && echo "bootstrap merged ✓"
```

Expected: `bootstrap merged ✓`. If the directory is missing, plan 1's PR isn't merged yet — stop.

- [ ] **Step 2: Create the feature branch**

```bash
git checkout -b feat/amplify-tf-stack
mkdir -p infra/terraform/amplify
```

---

### Task 2: Pin Terraform + AWS provider (same as bootstrap)

**Files:**
- Create: `infra/terraform/amplify/versions.tf`

- [ ] **Step 1: Write `versions.tf`**

```hcl
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = "ap-southeast-1"

  default_tags {
    tags = {
      Project   = "triptales"
      ManagedBy = "terraform"
      Stack     = "amplify"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/versions.tf
git commit -m "feat(infra): pin terraform + aws provider for amplify stack"
```

---

### Task 3: Wire the S3 + DynamoDB backend (hard-coded bootstrap outputs)

**Files:**
- Create: `infra/terraform/amplify/backend.tf`

- [ ] **Step 1: Write `backend.tf`**

Replace `<ACCOUNT_ID>` with your 12-digit AWS account ID — Terraform backend config **cannot** reference variables, so the value is literal.

```hcl
terraform {
  backend "s3" {
    bucket         = "triptales-tfstate-<ACCOUNT_ID>-apse1"
    key            = "amplify/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "triptales-tflock"
    encrypt        = true
  }
}
```

If your bootstrap bucket name differs (e.g. you customized the local in plan 1), use that exact string. Bucket and table names are not secrets — safe to commit.

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/backend.tf
git commit -m "feat(infra): wire s3 backend for amplify stack (from bootstrap)"
```

---

### Task 4: Declare variables

**Files:**
- Create: `infra/terraform/amplify/variables.tf`

- [ ] **Step 1: Write `variables.tf`**

```hcl
variable "github_token" {
  description = "GitHub Personal Access Token. Scopes: repo + admin:repo_hook. Source from TF_VAR_github_token env var; never commit to terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "github_repo_url" {
  description = "Full HTTPS URL of the GitHub repository Amplify should build."
  type        = string
}

variable "branch_name" {
  description = "Git branch Amplify watches for auto-builds."
  type        = string
  default     = "main"
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/variables.tf
git commit -m "feat(infra): amplify stack variables (github token + repo + branch)"
```

---

### Task 5: Define `aws_amplify_app`

**Files:**
- Create: `infra/terraform/amplify/main.tf`

- [ ] **Step 1: Write the app resource**

```hcl
resource "aws_amplify_app" "app" {
  name         = "triptales"
  repository   = var.github_repo_url
  access_token = var.github_token

  # Static-export Next.js; not the SSR/ISR "WEB_COMPUTE" platform.
  platform = "WEB"

  # Don't auto-delete branches when their git ref disappears — we only manage `main`.
  enable_branch_auto_deletion = false

  # No build_spec block: Amplify auto-detects amplify.yml at the repo root.
  # No custom_headers block: customHttp.yml at the repo root is the source of truth
  # for the COOP/COEP cross-origin-isolation headers ffmpeg.wasm needs.
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/main.tf
git commit -m "feat(infra): aws_amplify_app pointing at the triptales github repo"
```

---

### Task 6: Define `aws_amplify_branch` for `main`

**Files:**
- Modify: `infra/terraform/amplify/main.tf` (append)

- [ ] **Step 1: Append the branch resource**

Add this block to the end of `infra/terraform/amplify/main.tf`:

```hcl

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.app.id
  branch_name = var.branch_name

  stage             = "PRODUCTION"
  enable_auto_build = true

  # Informational only — Amplify infers framework from amplify.yml at build time.
  framework = "Next.js - SSG"
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/main.tf
git commit -m "feat(infra): aws_amplify_branch main (auto-build, production stage)"
```

---

### Task 7: Define outputs

**Files:**
- Create: `infra/terraform/amplify/outputs.tf`

- [ ] **Step 1: Write `outputs.tf`**

```hcl
output "app_id" {
  description = "Amplify App ID. Use with `aws amplify` CLI commands."
  value       = aws_amplify_app.app.id
}

output "default_domain" {
  description = "Amplify-provisioned domain root (e.g. d12345abcdef.amplifyapp.com)."
  value       = aws_amplify_app.app.default_domain
}

output "deploy_url" {
  description = "Full https URL the main branch serves on."
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.app.default_domain}"
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/outputs.tf
git commit -m "feat(infra): expose amplify app_id + deploy_url outputs"
```

---

### Task 8: Add the `tfvars` template

**Files:**
- Create: `infra/terraform/amplify/terraform.tfvars.example`

- [ ] **Step 1: Write the template**

```hcl
# Copy this file to `terraform.tfvars` and fill in the values.
# `terraform.tfvars` is gitignored. DO NOT put the GitHub PAT here —
# source it via the TF_VAR_github_token env var at apply time.

github_repo_url = "https://github.com/HuyNguyen260398/trip-tales"
branch_name     = "main"
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/amplify/terraform.tfvars.example
git commit -m "feat(infra): tfvars template for amplify stack"
```

---

### Task 9: Append stack-2 runbook to `infra/terraform/README.md`

**Files:**
- Modify: `infra/terraform/README.md` (append)

- [ ] **Step 1: Replace the placeholder stack-2 section**

Replace this paragraph in `infra/terraform/README.md`:

```markdown
## Stack 2 — amplify

Documented in the amplify-stack plan
(`docs/superpowers/plans/2026-05-27-amplify-tf-stack.md`). Updated here once
that plan lands.
```

…with:

````markdown
## Stack 2 — amplify

Prerequisites: stack 1 (bootstrap) applied, GitHub PAT with `repo` +
`admin:repo_hook` scopes, 90-day expiry.

1. **Source the PAT** (never put it in a file):
   ```bash
   read -s TF_VAR_github_token; export TF_VAR_github_token
   ```
2. **Create your tfvars** (gitignored):
   ```bash
   cp infra/terraform/amplify/terraform.tfvars.example \
      infra/terraform/amplify/terraform.tfvars
   # edit if the repo URL is wrong
   ```
3. **Apply**:
   ```bash
   cd infra/terraform/amplify
   terraform init
   terraform plan
   terraform apply
   terraform output
   ```
4. The first Amplify build kicks off automatically — see plan 3 for the
   verification runbook.

### PAT rotation (every 90 days)

```bash
read -s TF_VAR_github_token; export TF_VAR_github_token  # new token
cd infra/terraform/amplify
terraform apply -target=aws_amplify_app.app
```

Then revoke the old token in GitHub Settings → Developer Settings.
````

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/README.md
git commit -m "docs(infra): operator runbook for amplify stack + PAT rotation"
```

---

### Task 10: Create the GitHub PAT

**(Manual step — no files.)**

- [ ] **Step 1: Generate the token in GitHub**

In a browser:
1. GitHub → top-right avatar → **Settings**
2. **Developer Settings** (left sidebar, very bottom)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. Name: `triptales-amplify-2026-05-27`. Expiry: **90 days** (calendar reminder!).
6. Scopes: ✓ `repo` (entire group) + ✓ `admin:repo_hook` (entire group)
7. **Generate token**, copy the `ghp_…` value somewhere safe (password manager).

- [ ] **Step 2: Sanity-check the token works**

In a fresh terminal (or the same terminal — but the PAT will be in shell history if you echo it):

```bash
read -s GH_PAT_TEST
# paste token, hit enter
curl -sH "Authorization: token $GH_PAT_TEST" https://api.github.com/repos/HuyNguyen260398/trip-tales \
  | head -3
unset GH_PAT_TEST
```

Expected: a JSON object with `"name": "trip-tales"`. If you see `"message": "Bad credentials"`, regenerate.

---

### Task 11: Configure the shell + tfvars for apply

- [ ] **Step 1: Source the PAT into a Terraform variable env var**

```bash
read -s TF_VAR_github_token; export TF_VAR_github_token
# paste the same token from Task 10
```

(The `read -s` is silent — the token never echoes.)

- [ ] **Step 2: Create the real `terraform.tfvars`**

```bash
cp infra/terraform/amplify/terraform.tfvars.example \
   infra/terraform/amplify/terraform.tfvars
```

Inspect it; the repo URL should be `https://github.com/HuyNguyen260398/trip-tales`. **Do not put the PAT in this file** — it must come from the env var so it stays out of git and out of the rough shell history.

- [ ] **Step 3: Verify the file is gitignored**

```bash
git check-ignore -v infra/terraform/amplify/terraform.tfvars
```

Expected: a line like `.gitignore:6:infra/terraform/**/*.tfvars  infra/terraform/amplify/terraform.tfvars`. If `git check-ignore` is silent or returns nothing, `.gitignore` is misconfigured — go fix plan 1's ignore section before continuing.

---

### Task 12: `terraform init` (initialize the S3 backend)

- [ ] **Step 1: Init**

```bash
cd infra/terraform/amplify
terraform init
```

Expected (last lines):
```
Successfully configured the backend "s3"! Terraform will automatically
use this backend unless the backend configuration changes.

Terraform has been successfully initialized!
```

A `.terraform/` directory and `.terraform.lock.hcl` appear.

- [ ] **Step 2: Commit the lockfile**

```bash
git add .terraform.lock.hcl
git commit -m "chore(infra): pin aws provider versions for amplify stack"
```

---

### Task 13: `terraform plan` and eyeball the diff

- [ ] **Step 1: Run plan**

```bash
terraform plan
```

Expected: `Plan: 2 to add, 0 to change, 0 to destroy.`

The two resources are `aws_amplify_app.app` and `aws_amplify_branch.main`.

- [ ] **Step 2: Spot-check sensitive values**

`access_token` should appear as `(sensitive value)` in the plan output — **not** the raw PAT. If you can see the raw token, your terminal output is logging too aggressively; close any session-recording tools before applying.

- [ ] **Step 3: Spot-check the resource shape**

In the plan output, confirm:
- `repository = "https://github.com/HuyNguyen260398/trip-tales"`
- `platform = "WEB"` (not `WEB_COMPUTE`)
- `stage = "PRODUCTION"`
- `enable_auto_build = true`
- `branch_name = "main"`

---

### Task 14: `terraform apply`

- [ ] **Step 1: Apply**

```bash
terraform apply
```

Type `yes` at the prompt. Expected last line:
```
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

Followed by the `Outputs:` block.

- [ ] **Step 2: Capture the outputs**

```bash
APP_ID=$(terraform output -raw app_id)
DEPLOY_URL=$(terraform output -raw deploy_url)
echo "$APP_ID"
echo "$DEPLOY_URL"
```

Expected:
```
d<10-12 alphanumerics>
https://main.d<10-12 alphanumerics>.amplifyapp.com
```

Note these — plan 3 uses them every step.

---

### Task 15: Verify the Amplify app + branch + GitHub webhook

- [ ] **Step 1: Confirm the app exists**

```bash
aws amplify get-app --app-id "$APP_ID" \
  --query 'app.{Name:name,Platform:platform,Repo:repository,Default:defaultDomain}' \
  --output json
```

Expected:
```json
{
    "Name": "triptales",
    "Platform": "WEB",
    "Repo": "https://github.com/HuyNguyen260398/trip-tales",
    "Default": "d<…>.amplifyapp.com"
}
```

- [ ] **Step 2: Confirm the branch exists**

```bash
aws amplify get-branch --app-id "$APP_ID" --branch-name main \
  --query 'branch.{Name:branchName,Stage:stage,Auto:enableAutoBuild}' \
  --output json
```

Expected:
```json
{
    "Name": "main",
    "Stage": "PRODUCTION",
    "Auto": true
}
```

- [ ] **Step 3: Confirm the GitHub webhook was created**

In a browser:
1. github.com/HuyNguyen260398/trip-tales/settings/hooks
2. There should be **exactly one** webhook with a URL like
   `https://webhooks.amplify.<region>.amazonaws.com/...`
3. Recent Deliveries shows a successful POST from the `terraform apply` push event.

If the webhook is missing, the PAT didn't have `admin:repo_hook` scope — fix the token, re-export `TF_VAR_github_token`, run `terraform apply -target=aws_amplify_app.app`.

---

### Task 16: Push, open the PR, hand off to plan 3

- [ ] **Step 1: Push the branch**

```bash
cd ../../..   # repo root
git push -u origin feat/amplify-tf-stack
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head feat/amplify-tf-stack \
  --title "feat(infra): terraform amplify stack — app + main branch wiring" \
  --body "$(cat <<'EOF'
Adds the second Terraform stack that provisions the Amplify Hosting app and
its main branch.

- `aws_amplify_app` `triptales` — `WEB` platform (static export), GitHub repo
  connected via PAT, auto-detects `amplify.yml` + `customHttp.yml`
- `aws_amplify_branch` `main` — `PRODUCTION` stage, `enable_auto_build = true`
- Backend: `s3` against `triptales-tfstate-<account-id>-apse1` with DynamoDB
  lock on `triptales-tflock` (from bootstrap stack)

**Already applied** against the AWS account before opening this PR. Outputs:
- `app_id`: see `terraform output` locally
- `deploy_url`: `https://main.<app_id>.amplifyapp.com`

The first Amplify build kicked off automatically on apply; verification is in
plan 3 (`docs/superpowers/plans/2026-05-27-amplify-first-deploy.md`).

Spec: `docs/superpowers/specs/2026-05-27-amplify-deployment-design.md`
Plan: `docs/superpowers/plans/2026-05-27-amplify-tf-stack.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

CI runs lint + test + build on the PR — should pass cleanly (no app-code changes).

- [ ] **Step 3: Don't merge yet**

Wait until plan 3 (first-deploy verification) is green before merging this PR. That keeps the option to roll back via `terraform destroy` cleanly if something is structurally wrong with the app. After plan 3 says "go", merge.

---

## Done when

- All 16 tasks ticked
- `aws amplify get-app` returns the expected shape
- The GitHub webhook is visible in the repo's webhooks page with a successful delivery
- `$DEPLOY_URL` resolves DNS (`dig +short main.<app_id>.amplifyapp.com` returns a CloudFront IP) — the build may still be running but the URL is allocated
- PR opened but not yet merged

## Failure modes

- **`Plan: 0 to add, 0 to change, 0 to destroy.`** → state already has the resources. Run `terraform state list` to see them; you've already applied. Skip Task 14.
- **`InvalidParameterValueException: Access token is not valid`** → PAT scopes wrong or expired. Re-generate, re-export `TF_VAR_github_token`, `terraform apply -target=aws_amplify_app.app`.
- **`Error: GitHub repository not accessible`** → PAT missing `repo` scope or wrong repo URL in `terraform.tfvars`.
- **Webhook in GitHub is missing after apply** → PAT missing `admin:repo_hook` scope. Same fix as above.
- **First build doesn't start** → check Amplify console → main branch → Builds. If empty after 60 seconds, hit "Run job" manually once.
