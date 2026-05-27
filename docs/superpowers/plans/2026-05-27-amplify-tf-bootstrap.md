# Amplify Deploy — Terraform Bootstrap Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision an encrypted, versioned S3 bucket and a DynamoDB lock table in `ap-southeast-1` that will serve as the remote state backend for the Triptales Amplify Terraform stack (plan 2).

**Architecture:** One isolated Terraform stack at `infra/terraform/bootstrap/` using **local state** (so we don't have a chicken-and-egg with the backend it's creating). Idempotent re-runs — safe to lose the local `terraform.tfstate` and re-apply.

**Tech Stack:** Terraform ≥ 1.6, AWS provider `hashicorp/aws ~> 5.60`, S3 + DynamoDB. No application code.

**Pair with:** [`../specs/2026-05-27-amplify-deployment-design.md`](../specs/2026-05-27-amplify-deployment-design.md) — read its **Infra architecture → bootstrap/ resources** section first.

---

## Prerequisites (must be true before Task 1)

- `terraform -version` reports ≥ 1.6
- `aws sts get-caller-identity` returns your AWS account ID (and the principal has either the **Pragmatic** managed-policy bundle or the **Least-privilege** custom inline policy from the spec's *IAM policy* section)
- AWS CLI default region is `ap-southeast-1`, or you'll pass `--region ap-southeast-1` on every `aws` call below
- You are on a clean working tree on branch `main` (or a feature branch off main)
- AWS account ID is captured into an env var for use in resource naming. Run:
  ```bash
  export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  echo "$ACCOUNT_ID"
  ```
  Expected: a 12-digit number printed.

## File structure (what this plan creates)

```
infra/
  terraform/
    bootstrap/
      versions.tf      # provider + Terraform version pins
      main.tf          # aws_s3_bucket + supporting bucket configs + aws_dynamodb_table
      outputs.tf       # bucket_name, lock_table_name
    README.md          # operator runbook (this plan + plan 2 update it together)
.gitignore             # adds Terraform-related ignores
```

No `terraform.tfvars` for this stack — all knobs are literal.

---

### Task 1: Branch off main and stage Terraform ignores

**Files:**
- Modify: `.gitignore`
- Create (empty so far): `infra/terraform/bootstrap/`

- [ ] **Step 1: Create the feature branch off the freshest main**

```bash
git checkout main
git pull origin main
git checkout -b feat/amplify-tf-bootstrap
```

- [ ] **Step 2: Append Terraform entries to `.gitignore`**

Open `.gitignore` and add (idempotent — only add lines that aren't already present):

```gitignore

# Terraform
infra/terraform/**/.terraform/
infra/terraform/**/terraform.tfstate
infra/terraform/**/terraform.tfstate.backup
infra/terraform/**/*.tfvars
!infra/terraform/**/terraform.tfvars.example
```

Note: `.terraform.lock.hcl` is **not** ignored — provider version pins must be committed.

- [ ] **Step 3: Create the bootstrap directory**

```bash
mkdir -p infra/terraform/bootstrap
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(infra): gitignore terraform state and tfvars"
```

---

### Task 2: Pin Terraform + AWS provider versions

**Files:**
- Create: `infra/terraform/bootstrap/versions.tf`

- [ ] **Step 1: Write `versions.tf`**

Create `infra/terraform/bootstrap/versions.tf`:

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
      Stack     = "bootstrap"
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/bootstrap/versions.tf
git commit -m "feat(infra): pin terraform + aws provider for bootstrap stack"
```

---

### Task 3: Define the S3 state bucket

**Files:**
- Create: `infra/terraform/bootstrap/main.tf`

- [ ] **Step 1: Write `main.tf` (S3 portion)**

Create `infra/terraform/bootstrap/main.tf`:

```hcl
data "aws_caller_identity" "current" {}

locals {
  bucket_name     = "triptales-tfstate-${data.aws_caller_identity.current.account_id}-apse1"
  lock_table_name = "triptales-tflock"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/bootstrap/main.tf
git commit -m "feat(infra): define s3 state bucket (versioned, encrypted, private)"
```

---

### Task 4: Add the DynamoDB lock table

**Files:**
- Modify: `infra/terraform/bootstrap/main.tf` (append to end)

- [ ] **Step 1: Append the DynamoDB resource**

Append this block to the end of `infra/terraform/bootstrap/main.tf`:

```hcl

resource "aws_dynamodb_table" "tflock" {
  name         = local.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/bootstrap/main.tf
git commit -m "feat(infra): define dynamodb lock table for terraform state"
```

---

### Task 5: Wire outputs

**Files:**
- Create: `infra/terraform/bootstrap/outputs.tf`

- [ ] **Step 1: Write `outputs.tf`**

Create `infra/terraform/bootstrap/outputs.tf`:

```hcl
output "bucket_name" {
  description = "S3 bucket holding terraform state for the amplify stack."
  value       = aws_s3_bucket.tfstate.id
}

output "lock_table_name" {
  description = "DynamoDB table used for terraform state locking."
  value       = aws_dynamodb_table.tflock.name
}

output "region" {
  description = "AWS region the state lives in (must match backend config)."
  value       = "ap-southeast-1"
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/bootstrap/outputs.tf
git commit -m "feat(infra): expose bootstrap outputs for the amplify stack backend"
```

---

### Task 6: Operator runbook skeleton

**Files:**
- Create: `infra/terraform/README.md`

- [ ] **Step 1: Write the README**

Create `infra/terraform/README.md`:

````markdown
# Triptales — Terraform stacks

Two stacks. Apply them in order on a fresh AWS account.

## Stacks

- **`bootstrap/`** — S3 state bucket + DynamoDB lock table. **Local state.**
  Run once per AWS account. Idempotent.
- **`amplify/`** — Amplify Hosting app + main branch wiring. **Remote state**
  (uses the bucket + table created by `bootstrap/`). Run once on initial
  provisioning, then again only when app shape changes (e.g., PAT rotation).

## Region

All resources live in `ap-southeast-1` (Singapore).

## Stack 1 — bootstrap

Prerequisites: Terraform ≥ 1.6, AWS CLI configured, principal with the
permissions noted in `docs/superpowers/specs/2026-05-27-amplify-deployment-design.md`.

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
terraform output           # copy bucket_name + lock_table_name into amplify/backend.tf
```

## Stack 2 — amplify

Documented in the amplify-stack plan
(`docs/superpowers/plans/2026-05-27-amplify-tf-stack.md`). Updated here once
that plan lands.
````

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/README.md
git commit -m "docs(infra): operator runbook for terraform stacks"
```

---

### Task 7: `terraform init` the bootstrap stack

- [ ] **Step 1: Initialize**

```bash
cd infra/terraform/bootstrap
terraform init
```

Expected (last few lines):
```
Terraform has been successfully initialized!
```

A `.terraform/` directory and `.terraform.lock.hcl` appear. The lock file should be committed.

- [ ] **Step 2: Commit the lockfile**

```bash
git add .terraform.lock.hcl
git commit -m "chore(infra): pin aws provider versions for bootstrap"
cd ../../..    # back to repo root
```

---

### Task 8: `terraform plan` and verify expected resources

- [ ] **Step 1: Run plan**

```bash
cd infra/terraform/bootstrap
terraform plan
```

Expected: `Plan: 6 to add, 0 to change, 0 to destroy.`

The six resources should be:
1. `aws_s3_bucket.tfstate`
2. `aws_s3_bucket_versioning.tfstate`
3. `aws_s3_bucket_server_side_encryption_configuration.tfstate`
4. `aws_s3_bucket_public_access_block.tfstate`
5. `aws_s3_bucket_lifecycle_configuration.tfstate`
6. `aws_dynamodb_table.tflock`

If the count differs, stop and reconcile against the `main.tf` above before applying.

- [ ] **Step 2: Eyeball the bucket name in the plan output**

Look for `bucket = "triptales-tfstate-<your-12-digit-account-id>-apse1"`. If it shows a literal `<…>` template, the data source resolution failed — re-run `terraform init`.

---

### Task 9: `terraform apply`

- [ ] **Step 1: Apply**

```bash
terraform apply
```

Type `yes` at the prompt. Expected (last line): `Apply complete! Resources: 6 added, 0 changed, 0 destroyed.`

If the apply fails partway through, re-run it — every resource here is idempotent.

- [ ] **Step 2: Capture outputs into the shell for later use**

```bash
TF_BUCKET=$(terraform output -raw bucket_name)
TF_LOCK=$(terraform output -raw lock_table_name)
echo "$TF_BUCKET"
echo "$TF_LOCK"
```

Expected:
```
triptales-tfstate-<account-id>-apse1
triptales-tflock
```

These values are needed verbatim in plan 2 (`infra/terraform/amplify/backend.tf`).

---

### Task 10: Verify the S3 bucket out-of-band

- [ ] **Step 1: Confirm versioning is on**

```bash
aws s3api get-bucket-versioning --bucket "$TF_BUCKET"
```

Expected:
```json
{
    "Status": "Enabled"
}
```

- [ ] **Step 2: Confirm SSE-S3 encryption**

```bash
aws s3api get-bucket-encryption --bucket "$TF_BUCKET" \
  --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
  --output text
```

Expected: `AES256`

- [ ] **Step 3: Confirm public access is blocked**

```bash
aws s3api get-public-access-block --bucket "$TF_BUCKET" \
  --query 'PublicAccessBlockConfiguration' --output json
```

Expected: all four flags `true`.

---

### Task 11: Verify the DynamoDB lock table out-of-band

- [ ] **Step 1: Describe the table**

```bash
aws dynamodb describe-table --table-name "$TF_LOCK" \
  --query 'Table.{Name:TableName,Status:TableStatus,KeySchema:KeySchema,Billing:BillingModeSummary.BillingMode}' \
  --output json
```

Expected:
```json
{
    "Name": "triptales-tflock",
    "Status": "ACTIVE",
    "KeySchema": [
        {
            "AttributeName": "LockID",
            "KeyType": "HASH"
        }
    ],
    "Billing": "PAY_PER_REQUEST"
}
```

If `Status` is `CREATING`, wait ~30s and re-run.

---

### Task 12: Push and open a PR

- [ ] **Step 1: Push the branch**

```bash
cd ../../..   # repo root
git push -u origin feat/amplify-tf-bootstrap
```

- [ ] **Step 2: Open a PR**

```bash
gh pr create --base main --head feat/amplify-tf-bootstrap \
  --title "feat(infra): terraform bootstrap — S3 + DynamoDB state backend" \
  --body "$(cat <<'EOF'
Provisions the remote-state backend for the Amplify Terraform stack
(`infra/terraform/amplify/`, plan 2).

- `aws_s3_bucket` `triptales-tfstate-<account-id>-apse1` — versioned, SSE-S3, public access blocked, noncurrent versions expire after 30 days
- `aws_dynamodb_table` `triptales-tflock` — PAY_PER_REQUEST, `LockID` (S) hash key

Region: `ap-southeast-1`. Local state for this stack only (chicken-and-egg avoidance).

**Already applied** against the AWS account before opening this PR — outputs captured
for plan 2's backend.tf wiring.

Spec: `docs/superpowers/specs/2026-05-27-amplify-deployment-design.md`
Plan: `docs/superpowers/plans/2026-05-27-amplify-tf-bootstrap.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

CI runs lint + test + build on the PR — these only touch app code, so they should all pass (no Terraform-specific CI yet). Merge after review.

---

## Done when

- All 12 tasks ticked
- `aws s3api get-bucket-versioning` confirms `Enabled` on the new bucket
- `aws dynamodb describe-table` confirms `ACTIVE` on `triptales-tflock`
- PR merged to main
- You can read `$TF_BUCKET` and `$TF_LOCK` aloud from memory or notes — plan 2 wires them into `backend.tf` by hand

## Failure modes

- **`AccessDenied` on `aws_s3_bucket` creation** → IAM principal missing `s3:CreateBucket`. Fix the policy (spec → IAM section), retry.
- **`InvalidParameterValueException` on DynamoDB** → table name conflict. Either the table already exists (run `aws dynamodb describe-table --table-name triptales-tflock` to confirm) or someone else owns the name. If you own it, `terraform import aws_dynamodb_table.tflock triptales-tflock` and re-plan; expect 0 changes.
- **Provider plugin download fails on `terraform init`** → corporate proxy / no internet. Set `HTTPS_PROXY` and retry.
