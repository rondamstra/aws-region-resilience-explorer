# Deployment & Operations — AWS Region Resilience Explorer

Covers the **development sandbox** (test account only), environment config,
costs, teardown, and the release checklist. Production deployment is owner-driven
via Amplify Hosting + the GitHub mirror — see `GIT_WORKFLOW.md`.

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

## 6. Cost

| Component | Cost at demo scale |
|---|---|
| Cognito identity pool + guest STS credentials | **$0** (no charge for guest credentials / GetCredentialsForIdentity) |
| Amazon Location Maps v2 tile requests | free-tier covers demo traffic; request-based beyond |
| Amplify Hosting (production) | free-tier build/host at demo scale |
| Backend compute (Lambda/API/DB) | **$0** — none provisioned (static + serverless) |
| Static JSON dataset | ~$0 (shipped in the bundle / CDN) |

**$0/month is a target, not a guarantee** — real cost scales with map-tile
request volume and build minutes beyond free tier.

## 7. Teardown (test account)

```bash
# Verify test account FIRST.
aws sts get-caller-identity --profile <AWS_PROFILE>   # <AWS_TEST_ACCOUNT_ID>

# Delete the sandbox stack (Cognito pool, roles, geo stack).
npx ampx sandbox delete --identifier awsmapit --profile <AWS_PROFILE>
```

Note: the orphaned legacy API key cannot be deleted until 2027-01-28 unless
force-deleted (`aws location delete-key --force-delete`) — **owner-authorized
only** (`GIT_WORKFLOW.md` §6). `ampx sandbox delete` and `cloudformation
delete-stack` are destructive; Kiro Crew runs them only with authorization and
never bypasses a destructive-command policy block.

---

## 8. Deployment & release checklist

Run before promoting `master` → `production`:

**Automated gates (must be green):**
- [ ] `python3 data/validate.py` — 33/33 regions conform to schema v1.
- [ ] `npm run typecheck` — exit 0.
- [ ] `npm run build` — exit 0.
- [ ] `npm test` (Vitest) — all pass (unit, contract, component, auth regression).

**Map functional validation (dev sandbox):**
- [ ] Real **vector tiles** load (HTTP 200 with Cognito guest creds).
- [ ] **Browser/WebGL** render confirmed — map paints the basemap, not blank. *(Needs a browser; open item.)*
- [ ] **33 Region markers** visible on the map.
- [ ] Primary-Region selection, secondary comparison, great-circle distance lines all work.
- [ ] Metadata filters narrow the marker set; empty result handled.
- [ ] Distance disclaimer (not latency / resilience / compliance) always visible.
- [ ] **Mobile / responsive** behavior checked (layout, touch, readable at small widths). *(Open item — verify in a browser.)*

**Security / config:**
- [ ] No secrets, no stale API-key config, no classic Location refs in source (grep clean).
- [ ] `amplify_outputs.json`, `.env`, `node_modules` gitignored and untracked.
- [ ] Cognito config exposed is public-only (pool id, region, style URL).

**AWS / account:**
- [ ] Identity verified: production deploy targets the **production** account (never from Kiro Crew); dev verified `<AWS_TEST_ACCOUNT_ID>`.
- [ ] Estimated cost reviewed; within free-tier expectations.

**Release mechanics:**
- [ ] Mirror configured to push **only `production`** to GitHub.
- [ ] Rollback plan: revert the `master`→`production` merge commit and re-run the approved PR flow; Amplify redeploys the prior `production` commit. (Amplify Hosting also keeps prior builds for one-click rollback in the console.)
