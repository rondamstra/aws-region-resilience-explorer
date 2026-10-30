# Git & Release Workflow — AWS Region Resilience Explorer

**Status:** Agreed workflow. The three-stage release architecture
(`master` → `test` → `production`), branch protection, the GitHub mirrors and
production deployment are **not yet configured** — they are manual setup steps
the repository owner performs (see §7). Kiro Crew and the specialist Mates
operate only on `master` and `feat/*`; they never touch `test` or `production`,
and Kiro Crew **never** gets production AWS access.

---

## 1. Repositories and roles

| Repository | Role |
|---|---|
| **Forgejo** (`<FORGEJO_HOST>:<OWNER>/aws-region-resilience-explorer.git`) | **Authoritative** source of truth. All development, integration and promotion (via PR) happen here. |
| **GitHub** (public) | **Deploy-only mirror.** Receives **two one-way single-branch push mirrors — `test` and `production` ONLY.** Never `master`, never `feat/*`. Never developed on directly. Exists solely to feed the two Amplify Hosting pipelines. |

GitHub `test` branch → **test-account** Amplify app. GitHub `production` branch →
**production-account** Amplify app. The two mirrors are independent single-branch
mirrors; neither carries development branches.

## 2. Branches

Four branch roles form the three-stage promotion pipeline. Each stage after
`master` auto-deploys to AWS on merge.

| Branch | Purpose | Who writes | Auto-deploys to |
|---|---|---|---|
| `feat/*` | Per-Mate development (`feat/architecture`, `feat/data`, `feat/frontend`, `feat/tests`). Isolated via git worktrees. | the owning Mate | nothing (never mirrored, never deployed) |
| `master` | **Development integration.** Mate branches merge here; full test suite must pass. Validated against the existing Amplify **sandbox** (`ampx sandbox`) in the **TEST** account. | lead (merges), Mates (via PR/merge) | the existing dev **sandbox** in the TEST account (manual `ampx sandbox`, not a Hosting pipeline) |
| `test` | **Protected staging branch.** Only advanced by an approved Forgejo PR **from `master`**. Mirrored to GitHub `test`. | **no direct pushes** — PR + approval only | **AWS TEST account** via Amplify Hosting (GitHub `test` branch) |
| `production` | **Protected release branch.** Only advanced by an approved Forgejo PR **from `test`**. Mirrored to GitHub `production`. | **no direct pushes** — PR + **owner** approval only | **SEPARATE AWS PRODUCTION account** via Amplify Hosting (GitHub `production` branch) |

## 3. Release process (controlled — three stages, three PR gates)

```
feat/* ──PR(approve)──▶ master ──PR(approve: master→test)──▶ test ──PR(owner approve: test→production)──▶ production
   │                      │                                    │                                             │
 (Mate dev)         dev sandbox                          Forgejo mirror ─▶ GitHub test          Forgejo mirror ─▶ GitHub production
                 (ampx sandbox,                                 │                                             │
                   TEST acct)                        Amplify Hosting (TEST acct) ─▶ deploy   Amplify Hosting (PROD acct) ─▶ deploy
```

Four stages, each promotion through an **approved Forgejo PR**:

1. **`feat/*` → `master`** (gate 1). Open a Forgejo PR; approve and merge. The
   full suite (validator, typecheck, build, Vitest) must be green on `master`.
   Validate functionality against the existing **dev sandbox** (`ampx sandbox`)
   in the TEST account (<AWS_TEST_ACCOUNT_ID>).
2. **`master` → `test`** (gate 2). Open a Forgejo PR `master → test`. Required to
   promote: **tests green AND the dev sandbox validated**. On approval+merge,
   Forgejo mirrors `test` → GitHub `test`; the TEST-account Amplify Hosting app
   auto-deploys. Validate the deployed TEST environment.
3. **`test` → `production`** (gate 3). Open a Forgejo PR `test → production`.
   Required to promote: **the deployed TEST environment validated**. This gate
   needs the **repository owner's** approval. On approval+merge, Forgejo mirrors
   `production` → GitHub `production`; the PRODUCTION-account Amplify Hosting app
   auto-deploys.

**Hard rules:** never push directly to `test` or `production`; promotion is only
by approved PR from the correct source (`master`→`test`, `test`→`production`);
never force-push a protected branch; never merge into `production` without the
**owner's** approval; Kiro Crew never gets production AWS access.

---

## 4. Push-mirror operational risks (and the safe configuration)

Forgejo push mirroring is **one-way and overwrites the destination**. That makes
it powerful but sharp-edged. We run **two** single-branch push mirrors — one for
`test`, one for `production` — and the same risks apply to each.

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Force-push / history overwrite** | A Forgejo push mirror does a forced update of the mirrored ref. If `test` or `production` history is ever rewritten on Forgejo, the mirror force-pushes that rewrite to GitHub, discarding GitHub-side commits. | Never rewrite `test` / `production` history on Forgejo. Treat both as append-only (merge commits only, no rebase/amend). |
| **GitHub branch protection rejects the mirror push** | If GitHub `test`/`production` has branch protection that forbids force-push, the mirror push can be **rejected**, silently stalling deploys. Mirror and protection can fight each other. | Configure GitHub `test` and `production` protection to **allow the mirror principal to force-push** (or scope GitHub-side protection to PRs while treating Forgejo as the real gate). Do NOT rely on GitHub-side PR review — approval already happened on Forgejo. |
| **Mirroring more than `test`/`production`** | Mirroring `master` or `feat/*` would leak development branches (and any secrets in their history) to the public GitHub repo. | **Mirror ONLY `test` and `production`.** Use **two single-branch push mirrors**, never "mirror all refs". `master` and `feat/*` are **NEVER** mirrored. |
| **Bypassing the approval gate** | If a developer could push to `test`/`production` on Forgejo directly, the mirror would propagate unreviewed code to a deploy. | Protect **both** `test` and `production` on **Forgejo** so each advances only via an approved PR from its correct source. The approval control lives on Forgejo, the authoritative repo. |
| **Secret exposure via mirror** | Anything committed to `test`/`production` becomes public on GitHub. | The repo has no secrets (see §5); `amplify_outputs.json`, `.env`, `node_modules` are gitignored. Keep it that way; scan before each promotion (§ release checklist). |

**Recommended safe configuration:**

- Forgejo: **protect `test` and `production`** — no direct pushes; each advances
  only via an approved PR from its correct source (`master`→`test`,
  `test`→`production`); `production` additionally requires **owner** approval.
- Forgejo: **two single-branch push mirrors** — one mirrors **only `test`** to
  GitHub `test`, one mirrors **only `production`** to GitHub `production`.
  **`master` and `feat/*` are never mirrored.**
- GitHub: `test` and `production` are **public and deploy-only**. Allow the
  mirror to update each (do not impose GitHub-side force-push blocks that would
  reject the mirror). Do not develop or open PRs on GitHub.
- The **authoritative approval gate is the Forgejo PR**, not GitHub. GitHub is a
  dumb deploy source for both pipelines.

---

## 5. Branch protection & promotion

Promotion is gated on **Forgejo**, the authoritative repo. Both staging and
release branches are protected; GitHub is only a deploy source.

### Protected branches (Forgejo)

| Branch | Direct push | Advances by | Approval required | Checks |
|---|---|---|---|---|
| `test` | **Denied** | Approved Forgejo PR **from `master` only** | reviewer approval | all required checks green |
| `production` | **Denied** | Approved Forgejo PR **from `test` only** | **repository owner** approval | all required checks green |

- Neither protected branch accepts a direct push — not from a Mate, not from the
  sync script (the script hard-blocks them; see §8), not from anyone.
- A PR into `test` is only valid from `master`; a PR into `production` is only
  valid from `test`. The source-branch restriction prevents skipping a stage
  (e.g. a `master` → `production` PR is not a valid promotion).
- Required status checks must pass before a promotion PR can merge.

### Promotion requirements per gate

| Gate | From → To | Must be satisfied to promote | Approver |
|---|---|---|---|
| 2 | `master` → `test` | **Tests green** (validator + typecheck + build + Vitest) **AND dev sandbox validated** (`ampx sandbox`, TEST account) | reviewer |
| 3 | `test` → `production` | **Deployed TEST environment validated** (TEST-account Amplify app: identity/account check, style+tile 200 with TEST guest creds, 33 markers) | **repository owner** |

Each gate is a hard stop: the promotion PR is opened, the requirements above are
demonstrated, the required approval is given, and only then does the branch (and
its mirror, and its Amplify deploy) advance.

---

## 6. Development vs TEST vs PRODUCTION AWS accounts

See `docs/DEPLOYMENT.md` §1 (the "Separate environments" section) for the full
per-environment resource model. Summary of the credential boundary:

| | Dev sandbox | TEST pipeline | PRODUCTION pipeline |
|---|---|---|---|
| AWS account | **<AWS_TEST_ACCOUNT_ID>** (TEST) | **<AWS_TEST_ACCOUNT_ID>** (TEST) | **separate PROD account** (not accessible to Kiro Crew) |
| Profile | `<AWS_PROFILE>` | n/a (Amplify-managed) | not available here |
| Region | `eu-west-1` | TEST account region | owner's choice |
| Branch | `master` | `test` (via GitHub `test`) | `production` (via GitHub `production`) |
| Deploy mechanism | `npx ampx sandbox`, run by Kiro Crew with explicit authorization | Amplify Hosting, auto from GitHub `test` | Amplify Hosting, auto from GitHub `production` |
| Who deploys | Kiro Crew (TEST account only) | Amplify Hosting pipeline (TEST account) | Amplify Hosting pipeline (PROD account) |

**Credential boundary:** Kiro Crew **never** receives or uses production AWS
credentials — **ever**. It operates only in the TEST account (<AWS_TEST_ACCOUNT_ID>) and
verifies `aws sts get-caller-identity` is `<AWS_TEST_ACCOUNT_ID>` before every
deployment, refusing anything else. Both the TEST and PRODUCTION Amplify Hosting
pipelines are fully hands-off from the agent — they deploy inside their own
accounts in reaction to their own GitHub branch.

**Public Cognito config is not a secret.** The identity pool id, region and v2
style URL in each environment's `amplify_outputs.json` are public, non-secret
configuration — they authorize only anonymous guest credentials scoped to
read-only `geo-maps:GetTile`. There is no long-lived key, no client secret, no
API key, nothing to leak. `amplify_outputs.json` is gitignored and regenerated
per environment, so one environment's config never lands in another branch.

**Secret management:** there are no application secrets. No API keys in source,
no `.env` committed, no credentials in the bundle. Map auth is temporary STS
credentials minted at runtime by that environment's Cognito pool. Confirmed by
the pre-promotion secret scan (§ release checklist).

---

## 7. Obsolete Amazon Location API key

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

## 8. Ordered manual setup steps still required (owner action)

These are **not** done by Kiro Crew and require the owner. They are
**dependency-ordered** — later steps consume what earlier steps create. Kiro
Crew performs **none** of them (it has no production AWS access and creates no
branches or mirrors).

1. **Forgejo — create `test` and `production`.** Create `test` from an approved
   `master`, then `production` from an approved `test`. *(No dependency.)*
2. **Forgejo — protect `test` and `production`.** On both: no direct push;
   advance only by approved PR from the correct source (`master`→`test`,
   `test`→`production`); require required checks green; `production` additionally
   requires **owner** approval. *(Depends on step 1.)*
3. **GitHub — public repo + two deploy-only branches.** Make the GitHub repo
   public; create deploy-only `test` and `production` branches; allow the mirror
   principal to update each (no conflicting GitHub-side force-push block); do not
   develop or open PRs on GitHub. *(Depends on step 1 — mirror targets.)*
4. **Forgejo — two single-branch push mirrors.** One mirror `test` → GitHub
   `test`; one mirror `production` → GitHub `production`. Single-branch each;
   **never** mirror `master` or `feat/*`. *(Depends on steps 2 and 3 — needs
   protected Forgejo sources and the GitHub target branches.)*
5. **AWS TEST account — Amplify app on GitHub `test`.** Connect Amplify Hosting
   (account <AWS_TEST_ACCOUNT_ID>) to the GitHub repo's **`test`** branch; build as
   Amplify Gen 2 (`npx ampx pipeline-deploy` / Amplify auto-build). Confirm the
   build creates its **own** Cognito identity pool + unauth role with the
   `geo-maps:GetTile` grant. *(Depends on step 3 — GitHub `test` exists — and
   step 4 so deploys receive promoted commits.)*
6. **AWS PRODUCTION account (separate) — Amplify app on GitHub `production`.** In
   the **separate production account** (never accessed by Kiro Crew), connect
   Amplify Hosting to the GitHub repo's **`production`** branch; build as Amplify
   Gen 2. Confirm the build creates its **own** Cognito identity pool + unauth
   role with the `geo-maps:GetTile` grant from the account-agnostic backend.
   *(Depends on step 3 — GitHub `production` exists — and step 4; independent AWS
   account from step 5.)*

Until these are done, the app runs from the development sandbox (TEST account)
and the local OSM fallback.

---

## 9. Autonomous Forgejo sync (`scripts/forgejo-sync.sh`)

A host-side script syncs local development work to the authoritative Forgejo
remote with strict guardrails. It is the supported, deterministic mechanism — a
plain shell script driven by git, invoked event-driven (after integration) or by
a no-LLM Kiro Crew cron job. **No Kiro Crew internals are modified.** It handles
**development branches only** — `test` and `production` are advanced by approved
Forgejo PR, never by this script.

### What it does / refuses

| Guarantee | How |
|---|---|
| Forgejo stays authoritative | Pushes only to `origin` (Forgejo). No GitHub, no mirror. |
| Syncs `master` + `feat/*` only | Branch allow-list regex `^(master\|feat/.+)$`. |
| **Hard-blocks `test` + `production`** | An **independent deny-list** regex `^(test\|production)$` is checked **before** the allow-list and hard-stops the sync — even if the allow-list is ever loosened, these never sync here. |
| `feat/*` only with explicit `--publish-feat` | A routine `master` sync never drags a half-done feature branch to the remote; publishing a `feat/*` branch requires the opt-in `--publish-feat` flag. |
| **Never** pushes tags or other refs | `--no-tags` on fetch; explicit single refspec on push (no `--tags`, no `--mirror`). |
| **Never** force-pushes or rewrites history | Fast-forward only; `--force*` never used. |
| Fetch first; reject divergence | Fetches the branch, then requires the remote SHA to be an **ancestor** of local (fast-forwardable). Divergent remote → STOP. |
| No push with uncommitted changes | `git diff`/`status --porcelain` clean check → STOP if dirty. |
| No push on failed verification | Runs validator + typecheck + build + Vitest; any failure → STOP. |
| SSH key stays on host | Uses `ssh -F ~/.ssh/config` (host key `~/.ssh/<FORGEJO_SSH_KEY>`). The key is never read, printed, copied, or exposed to a Mate. |
| Every attempt recorded | Appends timestamped lines to `.forgejo-sync.log` (gitignored). |

### Known limitation — main checkout vs worktrees

The script runs `git` against the **main checkout** (`REPO_DIR=
/workspace/projects/aws-map-it`) and acts on **that checkout's current branch**.
Mates work in **git worktrees** (separate checkouts of the same repo). A
`feat/*` branch that is checked out in a worktree is **not** the branch the main
checkout has `HEAD` on, so the script will not see or push it from the main
checkout. To publish such a branch you must either **check it out in the main
repo** and run `scripts/forgejo-sync.sh --push --publish-feat`, or **push it
explicitly** with git. The post-merge hook (below) only ever auto-syncs
**`master`**, so this limitation never affects routine integration. `test` and
`production` are out of scope entirely — they advance by Forgejo PR only.

### Usage

```bash
# Dry-run (default): runs every guard + verification, pushes NOTHING.
scripts/forgejo-sync.sh --dry-run

# Real push of master (fast-forward only), after a clean dry-run:
scripts/forgejo-sync.sh --push

# Publish the CURRENTLY-CHECKED-OUT feat/* branch (explicit opt-in):
scripts/forgejo-sync.sh --push --publish-feat
```

The deny-list makes an attempt to sync from a `test` or `production` checkout a
hard STOP, regardless of flags.

### Event-driven vs periodic

Prefer **event-driven**: invoke `--push` right after a successful integration on
`master` (or `--push --publish-feat` when publishing a `feat/*` branch). Avoid
needless periodic pushes. If a schedule is wanted, register a **no-LLM cron**
that runs the script — it only pushes when there is a fast-forwardable change and
all guards pass, so quiet cycles are no-ops.

### How to disable

- Stop invoking the script (it does nothing on its own), or
- Remove/pause the cron job: `kirocrew cron remove <id>` (or pause in the
  Schedule UI), or
- Revoke by removing `core.sshCommand` / the host SSH key if sync must be
  fully severed.

Nothing about this script touches `test`, `production`, branch protection,
GitHub mirroring, or AWS — those remain owner-gated per §3–§8.

---

## 10. Final sync trigger — event-driven `post-merge` hook

Automatic sync is **event-driven**, not cron-polled. The trigger is a git
`post-merge` hook at `.git/hooks/post-merge`:

- Fires the instant a merge completes **on `master`** (i.e. a `feat/*`
  integration lands). On any other branch it exits 0 and does nothing.
- Calls `scripts/forgejo-sync.sh --push`, which re-runs every guard (clean tree,
  fetch-first, fast-forward-only, full verification, branch allow-list,
  test/production deny-list) and pushes **only `master`** — never test,
  production, tags, or feature branches.
- If any guard fails (tests red, remote diverged, dirty tree), it declines to
  push, logs to `.forgejo-sync.log`, and **does not affect the merge**.

**No cron job is used** — reliable post-integration triggering already exists
via the hook, so periodic polling would be redundant.

### What is automatic vs manual

| Action | Trigger |
|---|---|
| Push `master` after an integration merge | **Automatic** (post-merge hook) |
| Publish a `feat/*` branch | **Manual + explicit**: `scripts/forgejo-sync.sh --push --publish-feat` while on that branch in the main checkout |
| Advance `test` (`master`→`test`) | **Manual**: approved Forgejo PR only (never the script) |
| Advance `production` (`test`→`production`) | **Manual**: owner-approved Forgejo PR only (never the script) |
| Push tags / other refs | **Never** (by design) |

### Note: the hook is not version-controlled

Git hooks live under `.git/` and are not committed. To (re)install on a fresh
clone, copy the hook body from this section or run:

```bash
install -m 0755 /dev/stdin .git/hooks/post-merge <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
[ "${FORGEJO_SYNC_DISABLE:-0}" = "1" ] && exit 0
REPO_DIR="/workspace/projects/aws-map-it"
[ "$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)" = "master" ] || exit 0
"$REPO_DIR/scripts/forgejo-sync.sh" --push || { echo "[post-merge] sync declined (see .forgejo-sync.log)" >&2; exit 0; }
HOOK
```

### How to disable the automatic sync

- One-off: `FORGEJO_SYNC_DISABLE=1 git merge ...` (hook self-skips), or
- Permanently: `rm .git/hooks/post-merge`, or
- Sever sync entirely: remove `core.sshCommand` / the host key.

Manual `scripts/forgejo-sync.sh --push` still works regardless.
