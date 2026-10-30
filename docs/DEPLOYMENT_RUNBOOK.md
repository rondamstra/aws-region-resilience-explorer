# Deployment Runbook — AWS Region Resilience Explorer (Amplify Gen 2)

How to stand up this app in a **fresh AWS account** on the first attempt, after a
documented one-time bootstrap. Covers the privileged account setup (owner) and
the routine app deploy (automated by Amplify Hosting).

> **Golden rule:** the privileged bootstrap (IAM role + CDK bootstrap) is a
> ONE-TIME owner action per account. Everything after it is automated. Kiro
> Crew's restricted principal cannot do the privileged steps and must not try.

---

## 0. Two kinds of work

| | Privileged (owner, once per account) | Routine (automated, every push) |
|--|--------------------------------------|----------------------------------|
| CDK bootstrap | `npx cdk bootstrap aws://<ACCOUNT>/<REGION>` | — |
| Amplify backend deploy role | `infra/amplify-service-role.yaml` via `scripts/account-bootstrap.sh` | — |
| Backend (Cognito pool + geo-maps:GetTile role) | — | Amplify Hosting runs `ampx pipeline-deploy` |
| Frontend (Vite build) | — | Amplify Hosting runs `npm run build` |

The app backend (`amplify/`) is **account-agnostic**: it hardcodes no account or
region (`defineBackend({})` + `geoStack.region`). Each account materializes its
**own** Cognito identity pool, unauth IAM role, and `amplify_outputs.json`.

---

## 1. One-time account bootstrap (owner, IAM-admin)

Run from a machine/credential with IAM-admin in the target account. Parameterized,
idempotent, safe to rerun:

```bash
# TEST account, existing app, broad managed policy for bring-up:
scripts/account-bootstrap.sh \
  --profile <AWS_PROFILE> --region <REGION> \
  --app-id <AMPLIFY_APP_ID> --managed-admin true

# FRESH account, no app yet (wildcard trust), scoped least-privilege policy:
scripts/account-bootstrap.sh \
  --profile <AWS_PROFILE> --region <REGION> \
  --app-id "" --managed-admin false
```

It (1) ensures CDK bootstrap ≥ v6, (2) deploys `infra/amplify-service-role.yaml`
(the Amplify backend deploy role), (3) associates the role with the app if an
app id was given. `--dry-run` prints the actions without executing.

**The service role** (`infra/amplify-service-role.yaml`):
- Trust: `amplify.amazonaws.com`, restricted by `aws:SourceAccount` (this account)
  and `aws:SourceArn` (this app's ARN, or `apps/*` during first-time setup).
- Permissions: `AdministratorAccess-Amplify` (managed, broad — TEST/bring-up) or
  a scoped inline policy (CDK bootstrap SSM read, assume `cdk-*` roles,
  CloudFormation, Cognito identity pool, Location `geo-maps`, Amplify read).
- **Broad-policy trade-off:** `AdministratorAccess-Amplify` grants Amplify wide
  control over the services Gen 2 touches. Fine to get a TEST pipeline green;
  for PRODUCTION prefer `--managed-admin false` (scoped inline policy) and widen
  only if a deploy needs it.

---

## 2. Connect the repo + branch to Amplify Hosting (owner, console or CLI)

- Create the Amplify app (or reuse), connect the **public GitHub repo**
  (`github.com/<owner>/aws-region-resilience-explorer`).
- Connect the branch: **`test`** for the test account, **`production`** for the
  production account. (GitHub receives only these two branches via the Forgejo
  one-way mirror; `master`/`feat/*` are never mirrored.)
- Set the app **platform to `WEB_COMPUTE`** (Amplify Gen 2 full-stack needs the
  compute platform so the backend phase runs).
- Ensure the **service role from step 1 is attached** (App settings → IAM roles).

---

## 3. First deploy (automated by Amplify Hosting)

On the next push to the connected branch, Amplify runs `amplify.yml`:
1. `backend` phase: `npm install` → `ampx pipeline-deploy` → writes
   `amplify_outputs.json` (Cognito identity pool id + region + v2 style URL).
2. `frontend` phase: guard `test -f amplify_outputs.json`, then `npm run build`
   (Vite inlines the outputs at build time), publish `dist/`.

If the backend phase can't find CDK bootstrap or assume the `cdk-*` roles, the
service role or bootstrap from step 1 is missing/mis-scoped — re-run step 1.

---

## 4. Validate the deployment (live)

Offline first: `scripts/preflight.sh`. Then live:
```bash
scripts/preflight.sh --live --profile <PROFILE> --region <REGION> --app-id <APP_ID>
```
Then confirm the running app:
- Badge is NOT "Local demo basemap"; attribution is Amazon Location, not OSM.
- 33 Region markers render.
- A real `geo-maps:GetTile` request with the deployed pool's **guest credentials**
  returns **200**; `geo-maps:GetStaticMap` returns **403** (least privilege).
- Browser/WebGL render + mobile layout (needs a real browser — see
  `docs/DEPLOY_TEST_LIMITS.md`).

---

## 5. Rollback & cleanup

- **Rollback:** revert the promotion PR merge on Forgejo (mirror propagates;
  Amplify redeploys the prior commit), or use Amplify Console → one-click
  rollback to the previous build.
- **Cleanup (per account):** `npx ampx sandbox delete` (sandbox only); for a
  branch pipeline, delete the Amplify app / branch in the console; the backend
  CloudFormation stacks and the Cognito pool are removed with it. The bootstrap
  role stack (`aws-map-it-amplify-service-role`) and CDK bootstrap are account
  infrastructure — delete only if decommissioning the account's use of this app.

---

## 6. Cost & security

- **Cost:** Cognito guest identity pool + STS credentials are free; Amazon
  Location Maps v2 tiles are free-tier at demo scale (request-based beyond);
  Amplify Hosting build/host free-tier at demo scale. Two accounts = two bills.
  $0/month is a target, not a guarantee.
- **Security:** no API key, no secret ships to the browser — map auth is
  temporary Cognito guest SigV4, least-privilege `geo-maps:GetTile` only. The
  deploy service role is the one broad grant; scope it down for production.
  Kiro Crew never holds production credentials.

---

## 7. Owner checklist

**TEST account (<AWS_TEST_ACCOUNT_ID>) — current app `<TEST_AMPLIFY_APP_ID>`:**
- [ ] `scripts/account-bootstrap.sh --profile <test> --region eu-west-1 --app-id <TEST_AMPLIFY_APP_ID> --managed-admin true`
- [ ] Set app platform to `WEB_COMPUTE` if not already.
- [ ] Re-trigger the `test` branch build; watch the backend phase succeed.
- [ ] `scripts/preflight.sh --live --profile <test> --region eu-west-1 --app-id <TEST_AMPLIFY_APP_ID>` → PASS.
- [ ] Confirm real v2 tiles (not OSM) in the browser.

**Fresh PRODUCTION account (separate; owner-executed, never Kiro Crew):**
- [ ] `npx cdk bootstrap aws://<PROD_ACCOUNT>/<REGION>` (or let the script do it).
- [ ] `scripts/account-bootstrap.sh --profile <prod> --region <REGION> --app-id <prod_app_id> --managed-admin false`
- [ ] Create the Amplify app, connect GitHub `production` branch, platform `WEB_COMPUTE`, attach the role.
- [ ] Push to `production` (via the approved Forgejo PR → mirror); watch the first build.
- [ ] `scripts/preflight.sh --live ...` + browser check.
