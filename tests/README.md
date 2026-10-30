# tests/ — map-tester

Test strategy, acceptance criteria, and Vitest skeletons for the AWS Region
Resilience Explorer. Owned by **map-tester** (branch `feat/tests`).

**Start here:** [`TEST_STRATEGY.md`](./TEST_STRATEGY.md) — layers, 26 acceptance
criteria (Given/When/Then), Definition of Done, CI wiring, and the exact
devDependencies + npm scripts the lead should merge into the ROOT `package.json`.

## Layout

```
tests/
├─ TEST_STRATEGY.md              # strategy + acceptance criteria + CI + deps (source of truth)
├─ README.md                     # this file
├─ package.proposal.json         # PROPOSAL deps/scripts — merge into ROOT package.json, do NOT install standalone
├─ vitest.config.proposal.ts     # PROPOSAL config — fold into root vite.config.ts
├─ setup.ts                      # jest-dom matchers for RTL
├─ unit/
│  ├─ haversine.test.ts          # AC-4.1..4.4  (real known city-pair distances, R=6371, ±0.5%)
│  ├─ dataLoader.test.ts         # AC-7.2..7.5  (schemaVersion===1, required fields, ranges, enums)
│  └─ filters.test.ts            # AC-5.1..5.5  (continent/year/az/geographyType, AND-combine, empty ok)
├─ contract/
│  └─ dataContract.test.ts       # AC-7.1..7.5  (Ajv: regions.v1.json ⊨ regions.schema.json — FAILS CI on violation)
└─ component/
   └─ mapInteraction.test.tsx    # AC-1.1,2.x,3.x,4.5/4.6,5.6,6.x (RTL: selection→line, filter→markers, disclaimer)
```

## Phase 4 — automated quality gates (OFFLINE vs LIVE)

The deploy/infra quality gates (buildspec, CFN service role, preflight scripts,
no-OSM-in-prod resolver, Cognito least-privilege, secret scan) live in:

- `contract/amplifyBuildSpec.test.ts` — gates 1 & 2 (buildspec + root CLI deps)
- `contract/amplifyServiceRole.test.ts` — gate 3 (CFN IAM role, real YAML parse)
- `contract/secretScan.test.ts` — gates 4 & 7 (scripts + repo-wide secret scan)
- `unit/mapStyleProdContract.test.ts` + `unit/mapStyleResolution.test.ts` — gate 5
- `contract/mapAuth.test.ts` — gate 6 (Cognito unauth least-privilege)

These are **config-correctness only**. Which gate is OFFLINE (proven here) vs
LIVE-REQUIRED (needs real AWS + a browser — `ampx pipeline-deploy` success,
Cognito pool creation, a real `geo-maps:GetTile` 200 / `GetStaticMap` 403, and
WebGL tile render) is spelled out in the gate matrix in
[`../docs/DEPLOY_TEST_LIMITS.md`](../docs/DEPLOY_TEST_LIMITS.md). **No unit test
here proves a successful AWS deployment.** Also run `scripts/preflight.sh`
(offline tier) — it must exit 0.

## Status: skeletons

All suites are `describe.skip` and import from **intended** module paths owned by
other mates (`src/lib/haversine`, `src/lib/regions`, `src/lib/filters`,
`src/components/*`) and artifacts owned by map-data (`data/regions.v1.json`,
`data/regions.schema.json`). They are intentionally non-hard-failing until that
code lands. At integration: remove `.skip`, enable the TODO imports, and swap the
local fixtures/stubs for the real modules. The expected module shapes map-frontend
must honor are listed in `TEST_STRATEGY.md` §5.
