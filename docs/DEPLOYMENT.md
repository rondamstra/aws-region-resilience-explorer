# Deployment & Operations — AWS Region Resilience Explorer

Covers the **three separate environments** (dev sandbox, TEST pipeline,
PRODUCTION pipeline), the **development sandbox** (test account) config, costs,
teardown, per-stage verification, rollback and the release checklist. The `test`
and `production` deployments are owner-driven via Amplify Hosting + the two
GitHub mirrors — see `GIT_WORKFLOW.md`. **Kiro Crew never gets production AWS
access.**

---

## 0. Separate environments (three-stage release)

The release architecture is three independent, account-aware Amplify Gen 2
environments. The backend code is **account-agnostic** and **materializes
per-environment** — each environment provisions its **own** Cognito identity
pool, its **own** unauth IAM role with the least-privilege `geo-maps:GetTile`
grant, and its **own** `amplify_outputs.json`. **No Cognito pool, IAM role or
output is shared across accounts.**

| Env | Branch | Mechanism | AWS account | Deploys |
|---|---|---|---|---|
| **(a) Dev sandbox** *(current)* | `master` | `npx ampx sandbox` (manual, no Hosting pipeline) | **<AWS_TEST_ACCOUNT_ID>** (TEST) | by Kiro Crew with explicit authorization, TEST account only |
| **(b) TEST pipeline** | `test` → GitHub `test` | **Amplify Hosting** (auto-build) | **<AWS_TEST_ACCOUNT_ID>** (TEST) | hands-off; Amplify reacts to GitHub `test` |
| **(c) PRODUCTION pipeline** | `production` → GitHub `production` | **Amplify Hosting** (auto-build) | **separate PROD account** (never accessed by Kiro Crew) | hands-off; Amplify reacts to GitHub `production` |

Per-environment resources (never shared across accounts):

- **Own Cognito identity pool** (guest / unauthenticated identities), with its
  own identity pool id.
- **Own unauthenticated IAM role** carrying a least-privilege inline policy:
  `Allow geo-maps:GetTile` on `arn:aws:geo-maps:<region>::provider/default`
  only. `GetStaticMap` is not granted.
- **Own `amplify_outputs.json`** (gitignored, regenerated per deploy) with that
  environment's identity pool id, region and `custom.mapStyleUrl`.

The exposed Cognito config (identity pool id, region, v2 style URL) is
**public, non-secret** — it authorizes only anonymous guest credentials scoped
to read-only tile access. **No API key, no client secret, no long-lived
credential** ships in any environment. The v2 Standard style is provider-managed
(no `CfnMap`), so there is no per-account map resource to create.

See `GIT_WORKFLOW.md` §2–§6 for the branch/mirror/promotion mechanics and the
TEST↔PRODUCTION credential boundary.

---

## 1. Deployed development sandbox (verified)

| Item | Value |
|---|---|
| AWS account | **<AWS_TEST_ACCOUNT_ID>** (development / test) |
| Profile | `<AWS_PROFILE>` |
| Region | `eu-west-1` |
| CloudFormation stack | `amplify-awsregionresilienceexplorer-awsmapit-sandbox-e950962517` |
| Sandbox identifier | `awsmapit` |
| Status | `UPDATE_COMPLETE` |

**Resources in the stack:**
- Cognito **identity pool** (guest / unauthenticated identities enabled).
- Cognito **User Pool** — created by `defineAuth` but **unused** (no login UI).
- **Unauthenticated IAM role** with a least-privilege inline policy:
  `Allow geo-maps:GetTile on arn:aws:geo-maps:eu-west-1::provider/default`.
- (Authenticated role exists by default; unused.)
- No `AWS::Location::Map` (v2 Standard style is provider-managed).
- No API key (removed; see `GIT_WORKFLOW.md` §6 for the orphaned legacy key).

## 2. Build the backend dependencies (NFS/autofs workaround)

This workspace is on an **autofs/NFS mount**; `npm`'s install (reify) deadlocks
when it writes `node_modules` across that boundary. Install on local disk and
symlink in:

```bash
# Amplify CLI + CDK deps installed on local disk, then used by ampx.
# (The app's own node_modules is handled the same way — see FRONTEND_NOTES.md.)
```

Pinned, tested backend versions (in `amplify/package.json`), required because
`@aws-amplify/backend` pulls `backend-function`, which needs cdk ≥ 2.257 for the
`aws-scheduler-targets` subpath:

```json
{
  "@aws-amplify/backend": "^1.25.1",
  "@aws-amplify/backend-cli": "^1.4.2",
  "aws-cdk-lib": "^2.275.0",
  "constructs": "^10.6.0"
}
```

## 3. Deploy the sandbox

```bash
# ALWAYS verify identity first — must be the test account.
aws sts get-caller-identity --profile <AWS_PROFILE>   # Account == <AWS_TEST_ACCOUNT_ID>
aws configure get region --profile <AWS_PROFILE>        # eu-west-1

# Deploy once (no watch mode), with an explicit identifier.
npx ampx sandbox --once --identifier awsmapit \
  --profile <AWS_PROFILE> --outputs-format json
```

`ampx` writes **`amplify_outputs.json`** (gitignored) with the Cognito identity
pool id, region, and `custom.mapStyleUrl`. The frontend reads it to configure
Amplify and build the SigV4 `transformRequest`.

## 4. Environment configuration (frontend)

| Variable / source | Effect |
|---|---|
| `amplify_outputs.json` (after deploy) | Cognito guest identity pool → SigV4 map auth (the production path). |
| `VITE_MAP_STYLE_URL` (optional dev override) | Explicit v2 style-descriptor URL, still served via the Cognito `transformRequest`. |
| *(nothing configured)* | Free OSM raster fallback — the app runs with **zero AWS**. |

Run locally: `npm run dev` (predev copies the dataset to `public/`). Build:
`npm run build`. There is **no API key** and no secret in any of these paths.

## 5. Real-tile authorization — verified (HTTP)

Using actual Cognito **guest** STS credentials (get-id →
get-credentials-for-identity → SigV4):

| Request | Result |
|---|---|
| vector tile `v2/tiles/vector.basemap/3/4/3` | **200, ~135 KB** |
| vector tile z6 | 200 |
| style descriptor | 200 |
| glyphs | 200 |
| `GetStaticMap` (not granted) | **403 — correctly denied** (least privilege) |

**Browser/WebGL rendering: NOT verified** in this environment (no headless
browser available). HTTP-level auth is fully verified; in-browser render is an
open item (see checklist).

### 5a. Deployment verification per stage

Each environment is verified against **its own** account and guest credentials —
never with another environment's pool. Run the same checks after every
promotion.

| Check | Dev sandbox (`master`, TEST acct) | TEST pipeline (`test`, TEST acct) | PRODUCTION pipeline (`production`, PROD acct) |
|---|---|---|---|
| **Identity / account** | `aws sts get-caller-identity` == `<AWS_TEST_ACCOUNT_ID>` before deploy | Amplify build ran in the TEST account; confirm app's account == `<AWS_TEST_ACCOUNT_ID>` | Amplify build ran in the **separate PROD account**; confirm app's account == the PROD account (Kiro Crew does **not** do this — owner verifies) |
| **Style descriptor 200** | with sandbox guest creds | with **TEST** env guest creds | with **PRODUCTION** env guest creds |
| **Vector tile 200** | `v2/tiles/.../z/x/y` with sandbox guest creds | with TEST env guest creds | with PRODUCTION env guest creds |
| **33 markers** | rendered from `regions.v1.json` | same | same |
| **Browser / WebGL render** | open item (no browser here) | open item — verify in a browser | open item — verify in a browser |

Each stage uses the guest credentials minted by **that environment's own**
Cognito pool; a 200 in TEST does not prove PRODUCTION until PRODUCTION's own
creds return 200. Kiro Crew performs the dev-sandbox and TEST-account checks it
has credentials for; **all PRODUCTION-account checks are owner-performed**.

### 5b. Rollback

Two independent rollback paths per pipeline environment:

1. **Revert the promotion PR merge commit on Forgejo.** Revert the merge commit
   on the protected branch (`test` or `production`) via a new approved Forgejo
   PR. The push mirror propagates the revert to GitHub; Amplify Hosting
   auto-redeploys the **prior** commit. Forgejo stays authoritative, history
   stays append-only (no force-push).
2. **Amplify console one-click rollback.** Amplify Hosting keeps prior builds;
   the owner can redeploy a previous build from the console for that account's
   app. Useful for an immediate rollback while the Forgejo revert PR is prepared.

Dev sandbox has no pipeline to roll back — redeploy from the desired `master`
commit with `ampx sandbox`.

## 6. Cost

Cost accrues **per environment** — the TEST and PRODUCTION pipelines each add
their own Amplify app and Cognito pool, and they live in **two separate AWS
accounts**, so they appear on **two separate bills**.

| Component | Cost at demo scale |
|---|---|
| Amplify Hosting app — **TEST** pipeline | free-tier build/host at demo scale |
| Amplify Hosting app — **PRODUCTION** pipeline (separate account) | free-tier build/host at demo scale (billed on the PROD account) |
| Cognito identity pool + guest STS creds — **per environment** (sandbox + TEST + PROD) | **$0** each (no charge for guest credentials / GetCredentialsForIdentity) |
| Amazon Location Maps v2 tile requests — per environment | free-tier covers demo traffic; request-based beyond |
| Backend compute (Lambda/API/DB) | **$0** — none provisioned (static + serverless) |
| Static JSON dataset | ~$0 (shipped in the bundle / CDN) |

Each Amplify app and each Cognito pool is its own line item; **guest
credentials are free** and **tiles stay within free tier** at demo scale. **Two
accounts = two bills.** **$0/month is a target, not a guarantee** — real cost
scales with map-tile request volume and build minutes beyond free tier, summed
across both accounts.

## 7. Teardown (test account)

```bash
# Verify test account FIRST.
aws sts get-caller-identity --profile <AWS_PROFILE>   # <AWS_TEST_ACCOUNT_ID>

# Delete the sandbox stack (Cognito pool, roles, geo stack).
npx ampx sandbox delete --identifier awsmapit --profile <AWS_PROFILE>
```

Note: the orphaned legacy API key cannot be deleted until 2027-01-28 unless
force-deleted (`aws location delete-key --force-delete`) — **owner-authorized
only** (`GIT_WORKFLOW.md` §7). `ampx sandbox delete` and `cloudformation
delete-stack` are destructive; Kiro Crew runs them only with authorization and
never bypasses a destructive-command policy block.

---

## 8. Deployment & release checklist

The checklist runs at **each promotion gate**. The automated gates and
functional validation are shared; the account/mechanics items are
stage-specific.

### 8a. Automated gates (must be green — every stage)
- [ ] `python3 data/validate.py` — 33/33 regions conform to schema v1.
- [ ] `npm run typecheck` — exit 0.
- [ ] `npm run build` — exit 0.
- [ ] `npm test` (Vitest) — all pass (unit, contract, component, auth regression).

### 8b. Map functional validation (dev sandbox, then re-verify per deployed env)
- [ ] Real **vector tiles** load (HTTP 200 with that env's Cognito guest creds).
- [ ] **Browser/WebGL** render confirmed — map paints the basemap, not blank. *(Needs a browser; open item.)*
- [ ] **33 Region markers** visible on the map.
- [ ] Primary-Region selection, secondary comparison, great-circle distance lines all work.
- [ ] Metadata filters narrow the marker set; empty result handled.
- [ ] Distance disclaimer (not latency / resilience / compliance) always visible.
- [ ] **Mobile / responsive** behavior checked. *(Open item — verify in a browser.)*

### 8c. Security / config (every stage)
- [ ] No secrets, no stale API-key config, no classic Location refs in source (grep clean).
- [ ] `amplify_outputs.json`, `.env`, `node_modules` gitignored and untracked.
- [ ] Cognito config exposed is public-only (pool id, region, style URL) — no API key, no secret.

### 8d. Promotion gate — `master` → `test` (gate 2)
- [ ] **Approved Forgejo PR** `master → test` (reviewer).
- [ ] Automated gates (8a) green **AND** dev sandbox (8b) validated — the gate-2 promotion requirement.
- [ ] After merge+mirror: deployed **TEST** app verified — identity/account == `<AWS_TEST_ACCOUNT_ID>`, style+tile **200 with TEST env guest creds**, 33 markers, env-specific `amplify_outputs.json` generated by the TEST build.
- [ ] Rollback ready: revert the `master→test` merge commit on Forgejo (mirror propagates; TEST Amplify redeploys prior) and/or Amplify console one-click rollback.

### 8e. Promotion gate — `test` → `production` (gate 3)
- [ ] **Owner-approved Forgejo PR** `test → production`.
- [ ] Deployed **TEST** environment validated (8d) — the gate-3 promotion requirement.
- [ ] After merge+mirror: deployed **PRODUCTION** app verified by the **owner** — identity/account == the **separate PROD account**, style+tile **200 with PRODUCTION env guest creds**, 33 markers, env-specific `amplify_outputs.json` generated by the PROD build. **Kiro Crew performs none of these PRODUCTION-account checks.**
- [ ] Rollback ready: revert the `test→production` merge commit on Forgejo (mirror propagates; PROD Amplify redeploys prior) and/or Amplify console one-click rollback.

### 8f. Release mechanics (shared)
- [ ] Mirrors configured to push **only `test` and `production`** to GitHub (two single-branch mirrors); **never** `master` or `feat/*`.
- [ ] Estimated cost reviewed across **both** accounts; within free-tier expectations.
- [ ] Kiro Crew confirmed to have **no production AWS access**.

---

## 9. Ordered manual setup checklist (owner actions — Kiro Crew does NONE)

Dependency-ordered; later steps consume what earlier steps create. Kiro Crew
performs **none** of these — it has no production AWS access and creates no
branches or mirrors. (Mirrors the sequence in `GIT_WORKFLOW.md` §8.)

1. **Forgejo — create + protect `test` and `production`, set PR approval rules.**
   Create `test` from approved `master`, then `production` from approved `test`.
   Protect both: no direct push; advance only by approved PR from the correct
   source (`master`→`test`, `test`→`production`); required checks green;
   `production` additionally requires **owner** approval. *(No dependency.)*
2. **GitHub — public repo + two deploy-only branches.** Make the GitHub repo
   public; create deploy-only `test` and `production` branches; allow the mirror
   principal to update each (no conflicting force-push block); never develop or
   open PRs on GitHub. *(Depends on step 1 — needs the Forgejo sources.)*
3. **Forgejo — two single-branch push mirrors.** One mirrors **only `test`** →
   GitHub `test`; one mirrors **only `production`** → GitHub `production`.
   **Never** mirror `master` or `feat/*`. *(Depends on steps 1 and 2 — protected
   Forgejo sources + GitHub target branches.)*
4. **AWS TEST account — Amplify app on GitHub `test` branch.** In account
   **<AWS_TEST_ACCOUNT_ID>**, connect Amplify Hosting to the GitHub repo's **`test`**
   branch; build as Amplify Gen 2 (`npx ampx pipeline-deploy` / auto-build).
   Confirm the build creates its **own** Cognito identity pool + unauth role with
   the `geo-maps:GetTile` grant. *(Depends on steps 2 and 3 — GitHub `test`
   exists and receives promoted commits.)*
5. **AWS PRODUCTION account (SEPARATE) — Amplify app on GitHub `production`
   branch, own Cognito/IAM from the build.** In the **separate production
   account** (never accessed by Kiro Crew), connect Amplify Hosting to the GitHub
   repo's **`production`** branch; build as Amplify Gen 2; confirm the build
   creates its **own** Cognito identity pool + unauth role with the
   `geo-maps:GetTile` grant from the account-agnostic backend. *(Depends on steps
   2 and 3 — GitHub `production` exists; independent AWS account from step 4.)*
