# Git & Release Workflow — AWS Region Resilience Explorer

**Status:** Agreed workflow. Branch protection, the `production` branch, the
GitHub mirror and production deployment are **not yet configured** — they are
manual setup steps the repository owner performs (see §7). Kiro Crew and the
specialist Mates operate only on `master` and `feat/*`.

---

## 1. Repositories and roles

| Repository | Role |
|---|---|
| **Forgejo** (`<FORGEJO_HOST>:<OWNER>/aws-region-resilience-explorer.git`) | **Authoritative** source of truth. All development and integration happen here. |
| **GitHub** (public) | **One-way push mirror of the `production` branch only.** Never developed on directly. Exists solely to feed Amplify Hosting. |

## 2. Branches

| Branch | Purpose | Who writes |
|---|---|---|
| `feat/*` | Per-Mate development (`feat/architecture`, `feat/data`, `feat/frontend`, `feat/tests`). Isolated via git worktrees. | the owning Mate |
| `master` | Development / integration. Mate branches merge here; full test suite must pass. | lead (merges), Mates (via PR/merge) |
| `production` | **Protected release branch.** Only updated by an approved PR from `master`. Mirrored to GitHub. | **no direct pushes** — PR + human approval only |

## 3. Release process (controlled)

```
feat/* ──PR──▶ master ──(tests green)──▶ PR master→production ──approve──▶ production
                                                                              │
                                                     Forgejo one-way mirror ──▶ GitHub production
                                                                              │
                                              Amplify Hosting (prod AWS acct) ──▶ deploy
```

1. Integrate and test changes on `master` (validator, typecheck, build, Vitest all green).
2. Validate functionality against the **development** Amplify sandbox (test account).
3. Open a Forgejo pull request **`master` → `production`**.
4. **Stop for human review.** The repository owner reviews and approves.
5. Owner merges the PR in Forgejo (the only way `production` advances).
6. Forgejo's push mirror copies `production` to GitHub.
7. Amplify Hosting in the **separate production AWS account** auto-deploys from the GitHub `production` branch.

**Hard rules:** never push directly to `production` or to GitHub; never force-push a
protected branch; never merge `master`→`production` without the owner's approval.

---

## 4. Push-mirror operational risks (and the safe configuration)

Forgejo push mirroring is **one-way and overwrites the destination**. That makes
it powerful but sharp-edged. The risks:

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Force-push / history overwrite** | A Forgejo push mirror does a forced update of the mirrored ref. If `production` history is ever rewritten on Forgejo, the mirror force-pushes that rewrite to GitHub, discarding GitHub-side commits. | Never rewrite `production` history on Forgejo. Treat `production` as append-only (merge commits only, no rebase/amend). |
| **GitHub branch protection rejects the mirror push** | If GitHub `production` has branch protection that forbids force-push, the mirror push can be **rejected**, silently stalling deploys. Mirror and protection can fight each other. | Configure GitHub `production` protection to **allow the mirror principal to force-push** (or scope protection to PRs on GitHub while treating Forgejo as the real gate). Do NOT rely on GitHub-side PR review — approval already happened on Forgejo. |
| **Mirroring more than `production`** | Mirroring all branches would leak `feat/*` and `master` (and any secrets in history) to the public GitHub repo. | **Mirror ONLY the `production` branch.** Use a single-branch push mirror, not "mirror all refs". |
| **Bypassing the approval gate** | If a developer could push to `production` on Forgejo directly, the mirror would propagate unreviewed code to production deploy. | Protect `production` on **Forgejo** so it only advances via approved PR. The approval control lives on Forgejo, the authoritative repo. |
| **Secret exposure via mirror** | Anything committed to `production` becomes public on GitHub. | The repo has no secrets (see §5); `amplify_outputs.json`, `.env`, `node_modules` are gitignored. Keep it that way; scan before each release (§ release checklist). |

**Recommended safe configuration:**

- Forgejo: **protect `production`** — no direct pushes, require an approved PR from `master`.
- Forgejo: a **single-branch push mirror** that mirrors **only `production`** to GitHub (not `master`, not `feat/*`).
- GitHub: `production` is **public and deploy-only**. Allow the mirror to update it (do not impose GitHub-side force-push blocks that would reject the mirror). Do not develop or open PRs on GitHub.
- The **authoritative approval gate is the Forgejo PR**, not GitHub. GitHub is a dumb deploy source.

---

## 5. Development vs production AWS accounts

| | Development / test | Production |
|---|---|---|
| AWS account | **<AWS_TEST_ACCOUNT_ID>** | **separate account** (not accessible to Kiro Crew) |
| Profile | `<AWS_PROFILE>` | not available here |
| Region | `eu-west-1` | owner's choice |
| Deploy mechanism | `npx ampx sandbox` (per-developer sandbox), run by Kiro Crew with explicit authorization | Amplify Hosting, auto from GitHub `production` |
| Who deploys | Kiro Crew (test account only) | Amplify Hosting pipeline (production account) |

**Credential boundary:** Kiro Crew **never** receives or uses production AWS
credentials. It verifies `aws sts get-caller-identity` is account `<AWS_TEST_ACCOUNT_ID>`
before every deployment and refuses anything else. Production deployment is
fully hands-off from the agent — it happens inside the production account via
Amplify Hosting reacting to the GitHub `production` branch.

**Public Cognito config is not a secret.** The identity pool id, region and v2
style URL in `amplify_outputs.json` are public, non-secret configuration — they
authorize only anonymous guest credentials scoped to read-only
`geo-maps:GetTile`. There is no long-lived key, no client secret, nothing to
leak. `amplify_outputs.json` is gitignored regardless (it is environment-specific
and regenerated per deploy), so dev config never lands in `production`.

**Secret management:** there are no application secrets. No API keys in source,
no `.env` committed, no credentials in the bundle. The map auth is temporary STS
credentials minted at runtime by Cognito. Confirmed by the pre-release secret
scan (§ release checklist, step: "no secrets / stale keys").

---

## 6. Obsolete Amazon Location API key

The migration to Cognito left one orphaned resource in the **test account**:

- **Resource:** Amazon Location API key `region-explorer-map-key` (eu-west-1).
- **Status:** removed from the CDK/Amplify backend and from the app; no longer
  stack-managed and not referenced by any code or `amplify_outputs.json`.
- **Why it still exists:** AWS refuses to delete a Location API key until it has
  been **inactive for 90 days** (`DeleteStack` reported `DELETE_FAILED` on it).
- **Expiry:** `2027-01-28T00:00:00Z` (the key self-expires regardless).
- **Risk:** negligible — it is referrer-locked (`https://*.amplifyapp.com`),
  read-only (`geo-maps` Get* only), provider-scoped, unused, and expiring.

**Cleanup options:**
1. **Do nothing** — it expires 2027-01-28 and is harmless. (Recommended.)
2. **Force-delete** — `aws location delete-key --key-name region-explorer-map-key
   --force-delete --profile <AWS_PROFILE> --region eu-west-1`. AWS `DeleteKey`
   supports `ForceDelete` to bypass the 90-day wait. **Do not run this without
   the owner's explicit authorization** — it is a destructive AWS operation.

---

## 7. Manual setup steps still required (owner action)

These are **not** done by Kiro Crew and require the owner:

1. On Forgejo: create the `production` branch from an approved `master`.
2. On Forgejo: enable **branch protection** on `production` (no direct push; require approved PR from `master`).
3. On Forgejo: create a **single-branch push mirror** of `production` → the public GitHub repo (mirror only `production`).
4. On GitHub: make the repo public, `production` deploy-only; allow the mirror to update `production` (no conflicting force-push block).
5. In the **production AWS account**: connect Amplify Hosting to the GitHub repo's `production` branch; set the build to Amplify Gen 2 (`npx ampx pipeline-deploy` / Amplify auto-build).
6. In the production account: confirm the Amplify build creates its **own** Cognito identity pool + unauth role with the `geo-maps:GetTile` grant (the backend is account-agnostic; each environment gets its own resources).

Until these are done, the app runs from the development sandbox (test account)
and the local OSM fallback.
