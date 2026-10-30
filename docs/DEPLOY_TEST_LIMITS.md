# Deployment failures that CANNOT be caught by local tests

This project's local gate (`python3 data/validate.py`, `tsc -b --noEmit`,
`vite build`, and the full `vitest` suite — including
`tests/contract/amplifyBuildSpec.test.ts`) catches a specific, well-defined
class of regressions: dataset contract breaks, type errors, build breaks, and
**structural** problems in `amplify.yml` (YAML well-formedness, every build
command being a string, backend-before-frontend ordering, the
`amplify_outputs.json` guard, and the `dist` artifact).

It does **not** — and structurally cannot — reproduce the AWS Amplify Hosting
runtime. The classes below only surface on a real staging deploy (the `test`
branch → Amplify). Treat a green local run as *necessary but not sufficient*
for a hosted change.

## 1. Amplify's own buildspec validation quirks

`amplify.yml` is re-validated by AWS Amplify's control plane with rules that are
**not published as a schema** and are stricter/different from a generic YAML
parser. The original `CustomerError: The commands provided in the buildspec are
malformed.` is the canonical example: a command that is *valid YAML* but parses
to a mapping (the unquoted `ERROR:` colon-space bug) is rejected only by
Amplify, at deploy time.

- **Local coverage:** we now parse the YAML and assert every command is a
  `string`, which catches *that* specific coercion. See
  `tests/contract/amplifyBuildSpec.test.ts`.
- **Still only caught on staging:** other Amplify-specific buildspec
  constraints (reserved keys, phase names, unsupported `version`, size/length
  limits, newly-introduced control-plane rules) — because we do not have
  Amplify's validator locally.

## 2. IAM / service-role permission failures (`ampx pipeline-deploy` rights)

The backend phase runs `npx ampx pipeline-deploy`, which assumes the Amplify
service role and performs CloudFormation + Cognito + related API calls. Any of
the following fail **only** in the real account:

- Service role missing a required `Allow` (e.g. `cognito-idp:*`,
  `cloudformation:*`, `iam:PassRole`, S3/CloudFront for hosting).
- SCP / permission-boundary denials in the target AWS org.
- Role trust-policy misconfiguration so Amplify cannot assume it.

None of this is visible to `tsc`, `vite`, or `vitest` — there are no AWS
credentials or role in the local test environment.

## 3. Backend CloudFormation errors

`ampx pipeline-deploy` synthesizes and applies CloudFormation stacks. Failures
that appear only during the real `UPDATE`/`CREATE`:

- Resource limits / quotas (e.g. too many Cognito pools, stack resource count).
- Drift or an existing resource in a `*_FAILED` / `UPDATE_ROLLBACK_FAILED`
  state blocking the deploy.
- Cross-stack reference or naming collisions on the branch's stack.
- Region-specific resource availability.

CDK/CFN synthesis is not exercised locally; `vite build` builds the frontend
only.

## 4. Environment variables that exist ONLY in Amplify

The buildspec references `$AWS_BRANCH` and `$AWS_APP_ID`, which Amplify Hosting
injects into the build container. They are **absent locally**, so:

- `npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID` cannot be
  run or validated end-to-end on a dev machine.
- Any future reliance on other Amplify-provided vars
  (`$AWS_REGION`, `$AWS_APP_ID`, custom env vars configured in the Amplify
  console) is unverifiable locally. A missing/empty var typically yields a
  confusing deploy-time failure, not a local one.

## 5. Runtime map-tile auth needing real Cognito credentials

The whole reason the backend must deploy before the frontend build is that the
app reads the deployed Cognito **guest identity pool** from
`amplify_outputs.json` (Vite inlines it at build time). The actual auth path —
guest credentials vending, SigV4-signed requests to the Amazon Location /
map-tile endpoint, and the IAM policy on the guest role — can only be exercised
against **real, deployed Cognito + Location resources**:

- Whether the unauth (guest) role is actually allowed to fetch tiles.
- Whether the identity pool is wired to the right map resource / region.
- Whether tiles render vs. silently falling back to the no-auth OSM basemap.

Local tests assert the *build-time wiring* (guard on the outputs file, correct
ordering) but **cannot** make a live authenticated tile request.

## Practical rule

A change touching `amplify.yml`, `amplify/` backend definitions, IAM/Cognito,
or the auth/tile path is **not verified** by a green local run. It must be
promoted to the `test` branch and observed on a real Amplify deploy:

1. buildspec accepted (no `CustomerError`),
2. backend phase succeeds (`ampx pipeline-deploy` green, stack `UPDATE_COMPLETE`),
3. `amplify_outputs.json` present at frontend build (guard passes, build does
   not `exit 1`),
4. the hosted app renders authenticated map tiles — **not** the OSM fallback.
