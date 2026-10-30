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

## Status: skeletons

All suites are `describe.skip` and import from **intended** module paths owned by
other mates (`src/lib/haversine`, `src/lib/regions`, `src/lib/filters`,
`src/components/*`) and artifacts owned by map-data (`data/regions.v1.json`,
`data/regions.schema.json`). They are intentionally non-hard-failing until that
code lands. At integration: remove `.skip`, enable the TODO imports, and swap the
local fixtures/stubs for the real modules. The expected module shapes map-frontend
must honor are listed in `TEST_STRATEGY.md` §5.
