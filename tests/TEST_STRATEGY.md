# Test Strategy & Acceptance Criteria — AWS Region Resilience Explorer

**Owner:** map-tester
**Branch:** `feat/tests`
**Status:** DRAFT — strategy + acceptance criteria + Vitest skeletons. Frontend
app (`src/`) and dataset (`data/`) are being built in parallel; test files
reference their *intended* module paths and are marked `skip`/TODO so the suite
does not hard-fail before those modules exist.

Grounding docs: `docs/ARCHITECTURE.md` (§9 distance semantics, §10 judging, §12
risks), `docs/DATA_CONTRACT.md` (schema + constraints), `docs/MVP_PLAN.md` (§3
testing strategy, §4 definition of done).

---

## 1. Scope & goals

This project's correctness rests on two highest-value guarantees (MVP_PLAN §3):

1. **Haversine math is correct** — it is the product's core computation.
2. **The data contract holds** — the `regions.vN.json` ↔ `DATA_CONTRACT.md`
   seam is what lets map-data and map-frontend work in parallel. A contract
   violation MUST fail CI.

Everything else (component behaviour, build/lint/type-check, smoke) protects the
six MVP features and the honesty framing that §9/§12 make a first-class feature.

---

## 2. Test layers

| Layer | What it proves | Tooling | Hard-fails CI? |
|---|---|---|---|
| **Unit — haversine** | Known city-pair distances within tolerance; same-point = 0; antipodal ≈ half Earth circumference; symmetry; input-range handling. | Vitest | Yes |
| **Unit — data loader** | `schemaVersion === 1` assertion; required fields present; `regionCode` unique; enums valid; numeric ranges. | Vitest | Yes |
| **Unit — filter predicates** | Filtering by `continent`, `launchYear`, `azCount`, `geographyType` returns the correct subset; empty result is valid, not an error. | Vitest | Yes |
| **Contract** | `data/regions.v1.json` validates against `data/regions.schema.json` (produced by map-data). ANY record violating §3/§4/§5 fails the build. | Vitest + Ajv (JSON Schema) | **Yes — non-negotiable** |
| **Component** | Region selection draws a line; filter changes the marker set; disclaimer is always present. | Vitest + React Testing Library | Yes |
| **Build / CI** | `npm run build`, `tsc --noEmit`, lint, format on every PR. | Vite / tsc / ESLint / Prettier | Yes |
| **Smoke** | Map tiles load with the scoped, referrer-locked API key; no auth/permission errors. | Manual in Amplify sandbox (owned by map-frontend) | Manual gate |

Tolerance convention: great-circle assertions use **±0.5%** of the expected km
(generous enough to absorb the choice of Earth radius — mean 6371 km vs WGS-84
variants — and centroid rounding, tight enough to catch a wrong formula).

---

## 3. Acceptance criteria (Given / When / Then)

Each MVP feature (ARCHITECTURE §1, MVP_PLAN §4) maps to one or more criteria.
IDs are referenced from the skeleton test files.

### Feature 1 — Show AWS Regions on the map

- **AC-1.1** *(show regions)* — **Given** `regions.v1.json` loaded, **When** the
  map renders, **Then** one marker is drawn per record at its `lat`/`lon`, and the
  marker count equals the record count.
- **AC-1.2** *(approximate caveat)* — **Given** the map rendered, **When** a user
  inspects a marker, **Then** the UI surfaces the record's `accuracyNote`
  ("approximate centroid, NOT datacenter") — R1 mitigation (§12).

### Feature 2 — Pick a primary Region

- **AC-2.1** *(pick primary)* — **Given** regions shown, **When** the user selects
  a Region as primary, **Then** exactly one primary is marked active and it is
  visually distinguished from the rest.
- **AC-2.2** *(re-pick)* — **Given** a primary is already selected, **When** the
  user selects a different Region, **Then** the previous primary is cleared and
  the new one becomes primary (no two primaries at once).

### Feature 3 — Compare candidate secondary Regions

- **AC-3.1** *(compare secondaries)* — **Given** a primary is selected, **When**
  the user adds one or more secondaries, **Then** each selected secondary is
  marked and distinguishable from the primary and from unselected Regions.
- **AC-3.2** *(ranked DR list)* — **Given** a primary and ≥1 candidate, **When**
  distances are computed, **Then** a DR-candidate list is shown **ranked by
  great-circle separation** (ARCHITECTURE §9, MVP_PLAN §4).

### Feature 4 — Haversine distances + drawn lines

- **AC-4.1** *(distance correctness)* — **Given** two Region centroids, **When**
  the haversine distance is computed, **Then** it matches the known great-circle
  distance within ±0.5%.
- **AC-4.2** *(same point = 0)* — **Given** identical coordinates, **When**
  distance is computed, **Then** the result is exactly 0.
- **AC-4.3** *(antipodal)* — **Given** two antipodal points, **When** distance is
  computed, **Then** the result ≈ π·R (half Earth circumference, ~20015 km) within
  tolerance.
- **AC-4.4** *(symmetry)* — **Given** points A and B, **Then** d(A,B) === d(B,A).
- **AC-4.5** *(line drawn)* — **Given** a primary and a selected secondary,
  **When** selection completes, **Then** a line (GeoJSON layer) is drawn between
  the two centroids.
- **AC-4.6** *(honest label)* — **Given** a distance shown, **Then** it is labeled
  **"approximate great-circle separation"** (ARCHITECTURE §9) — never "latency" or
  "resilience".

### Feature 5 — Filter by verified metadata

- **AC-5.1** *(filter continent)* — **Given** regions loaded, **When** the user
  filters by `continent`, **Then** only regions whose `continent` matches remain
  in the marker set.
- **AC-5.2** *(filter launchYear)* — **Given** regions loaded, **When** the user
  filters by a `launchYear` bound, **Then** only regions satisfying the bound
  remain.
- **AC-5.3** *(filter azCount)* — **Given** regions loaded, **When** the user
  filters by minimum `azCount`, **Then** only regions with `azCount` ≥ the
  threshold remain.
- **AC-5.4** *(filter geographyType)* — **Given** regions loaded, **When** the
  user filters by `geographyType`, **Then** only matching regions remain (MVP data
  is all `"commercial"`, per DATA_CONTRACT §4 / OQ5).
- **AC-5.5** *(combined + empty)* — **Given** multiple filters, **When** combined,
  **Then** the predicate is the conjunction (AND), and an empty result set renders
  a valid empty state rather than an error.
- **AC-5.6** *(marker set updates)* — **Given** a filter change, **When** applied,
  **Then** the on-map marker set updates to exactly the filtered subset.

### Feature 6 — Distance ≠ resilience disclaimer

- **AC-6.1** *(always present)* — **Given** any app state, **Then** a persistent
  disclaimer stating distance ≠ latency ≠ resilience ≠ compliance ≠ service
  availability is visible (ARCHITECTURE §9, R2 mitigation §12). It is not behind a
  click, tooltip, or scroll-only region.
- **AC-6.2** *(survives interaction)* — **Given** the user picks a primary,
  secondaries, or applies filters, **Then** the disclaimer remains visible
  throughout.

### Data-contract criteria (the frozen seam)

- **AC-7.1** *(schema validity)* — **Given** `data/regions.v1.json`, **When**
  validated against `data/regions.schema.json`, **Then** it passes with zero
  errors; any violation **fails CI**.
- **AC-7.2** *(schemaVersion)* — **Given** the dataset, **Then**
  `schemaVersion === 1`.
- **AC-7.3** *(unique key)* — **Given** the dataset, **Then** every `regionCode`
  is unique.
- **AC-7.4** *(ranges & enums)* — **Given** each record, **Then** `lat ∈ [−90,90]`,
  `lon ∈ [−180,180]`, `launchYear ∈ [2006, generatedDate-year]`, `azCount ≥ 1`,
  `continent ∈` the §4 enum, `geographyType === "commercial"` for MVP data.
- **AC-7.5** *(provenance honesty)* — **Given** each record's `provenance` (or the
  dataset default), **Then** `accuracyNote` states coordinates are approximate
  centroids, NOT datacenter locations (DATA_CONTRACT §5, R1 mitigation).

**Count: 26 acceptance criteria** across the six MVP features plus the
data-contract seam.

Feature → criteria map:

| MVP feature | Acceptance criteria |
|---|---|
| 1. Show Regions | AC-1.1, AC-1.2 |
| 2. Pick primary | AC-2.1, AC-2.2 |
| 3. Compare secondaries | AC-3.1, AC-3.2 |
| 4. Haversine distances + lines | AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5, AC-4.6 |
| 5. Filter by metadata | AC-5.1, AC-5.2, AC-5.3, AC-5.4, AC-5.5, AC-5.6 |
| 6. Distance ≠ resilience disclaimer | AC-6.1, AC-6.2 |
| (seam) Data contract | AC-7.1, AC-7.2, AC-7.3, AC-7.4, AC-7.5 |

---

## 4. Definition of Done (from MVP_PLAN §4) — checklist

- [ ] All six MVP features functional end-to-end against the real dataset.
- [ ] Real Amazon Location Service basemap via a restricted, referrer-locked API key.
- [ ] Distance labeled "approximate great-circle separation" with the
      distance ≠ latency ≠ resilience disclaimer always visible.
- [ ] Ranked DR-candidate list by separation.
- [ ] Dataset validates against `DATA_CONTRACT.md`; provenance + accuracy notes present.
- [ ] CI green (build, lint, type-check, unit, contract tests).
- [ ] Deploy performed only after explicit human approval.

---

## 5. Expected frontend module paths (map-frontend must honor)

These skeletons import from the paths below. If map-frontend chooses different
names, update either the app or these imports at integration. Keeping these
honored means the suite activates with no edits once the code lands.

| Import path | Expected export | Shape (assumption) |
|---|---|---|
| `src/lib/haversine` | `haversineKm(a, b)` | `(a: {lat:number;lon:number}, b: {lat:number;lon:number}) => number` (km). Also acceptable: `haversineKm(lat1, lon1, lat2, lon2)`. Skeleton assumes the point-object form; adjust if map-frontend prefers positional args. |
| `src/lib/regions` | `loadRegions(json)` and type `RegionDataset`, `RegionRecord` | `loadRegions(raw: unknown) => RegionDataset` — asserts `schemaVersion === 1`, returns typed dataset or throws on violation. |
| `src/lib/filters` | `filterRegions(regions, criteria)` | `(regions: RegionRecord[], criteria: FilterCriteria) => RegionRecord[]` — pure predicate, AND-combined. `FilterCriteria = { continent?; minLaunchYear?; maxLaunchYear?; minAzCount?; geographyType? }`. |
| `src/components/MapView` | default React component | renders markers + lines; accepts `regions`, `primary`, `secondaries` props. |
| `src/components/Disclaimer` | default React component | renders the persistent distance ≠ resilience text. |
| `data/regions.v1.json` | — | dataset asset (map-data). |
| `data/regions.schema.json` | — | JSON Schema for the dataset (map-data). |

**Constants assumed:** Earth radius **R = 6371 km** (mean radius) for haversine.
If map-frontend uses a different R, AC-4.3 (antipodal) expectation shifts
proportionally; the ±0.5% tolerance already absorbs the mean-vs-WGS84 choice.

---

## 6. CI wiring (describe only — no deploy actions)

The contract test and the build gates run on **every PR** to `master`. No GitHub
Actions that deploy are created here; Amplify owns deployment and the lead gates
production (ARCHITECTURE §7, MVP_PLAN Phase 7).

Recommended PR pipeline (repo CI, e.g. a non-deploying `ci.yml`), each step
blocking the merge:

1. `npm ci` — reproducible install.
2. `npm run typecheck` → `tsc --noEmit` — type safety across app + tests.
3. `npm run lint` → ESLint (and `prettier --check` for format).
4. `npm run test:contract` → **the JSON-schema validation of `data/regions.v1.json`.
   This step MUST fail the job on any violation** — it is the frozen-seam guard
   (DATA_CONTRACT §7, R6 mitigation).
5. `npm run test` → full Vitest suite (unit + contract + component).
6. `npm run build` → `vite build` — proves the app compiles and bundles.

Ordering puts the cheap, high-signal gates first (typecheck, lint, contract) so a
broken seam or type error fails fast before the full build. Amplify's own PR
preview build runs independently as the deploy-side check; the repo CI above is
the correctness gate and does **not** deploy.

Why contract-as-CI matters: map-data and map-frontend progress in parallel
against a frozen schema. The contract test is the automated referee — if map-data
emits a record that breaks §3/§4/§5, the PR goes red before it can break the
consumer.

---

## 7. Test dependencies & scripts to merge into the ROOT package.json

**Do not** create a competing root `package.json`. The lead should merge the
following into the frontend's root `package.json` (versions are current-stable
suggestions; pin to the lockfile at install):

`devDependencies`:

```jsonc
{
  "vitest": "^2.1.0",
  "@vitest/coverage-v8": "^2.1.0",
  "jsdom": "^25.0.0",
  "@testing-library/react": "^16.0.0",
  "@testing-library/jest-dom": "^6.5.0",
  "@testing-library/user-event": "^14.5.0",
  "ajv": "^8.17.0",
  "ajv-formats": "^3.0.1"
}
```

`scripts`:

```jsonc
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:contract": "vitest run tests/contract",
  "test:coverage": "vitest run --coverage",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "format:check": "prettier --check ."
}
```

Vitest config (either `vitest.config.ts` at root or a `test` block in
`vite.config.ts`) should set `environment: 'jsdom'`, `globals: true`, a setup
file importing `@testing-library/jest-dom`, and `include: ['tests/**/*.test.ts',
'tests/**/*.test.tsx']`. A proposal config lives at
`tests/vitest.config.proposal.ts` — the lead folds it into the root Vite config
rather than shipping two configs.

---

*End of TEST_STRATEGY.md.*
