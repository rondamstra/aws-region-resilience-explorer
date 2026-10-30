# MVP Plan — AWS Region Resilience Explorer

**Owner:** map-architect
**Deadline:** 2026-11-02 (hard)
**Status:** DRAFT — Phase 0 gate must pass before any implementation.

This plan sequences the work, defines the testing strategy, and sets the
**explicit approval gate**: architecture + data contract must be approved by the
lead before any implementation begins.

---

## 1. Phases

> **GATE (Phase 0 → Phase 1):** No implementation — no app code, no deps, no AWS
> resources — until the lead approves `ARCHITECTURE.md` **and** `DATA_CONTRACT.md`.

| Phase | Goal | Owner(s) | Output | Exit criteria |
|---|---|---|---|---|
| **0. Design & gate** | Architecture + data contract agreed. | map-architect | `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md`, this plan | **DONE — lead approved all three docs; OQ4 and OQ5 RESOLVED.** |
| **1. Scaffold & contract freeze** | Amplify Gen 2 + React/TS/Vite app skeleton; data contract frozen; `data/regions.v1.json` stub validating against schema. | map-frontend, map-data | App builds locally; stub dataset passes schema check | `npm run build` green; schema validation green on stub |
| **2. Backend + map** | `amplify/backend.ts` with `CfnMap` + restricted `CfnAPIKey` CDK constructs (read-only `geo:GetMap*` on the single map ARN, referrer-locked to the Amplify domain, with expiry). Map renders a basemap in the app. | map-frontend | Basemap visible via the restricted API key | Map tiles load with the scoped API key in a sandbox |
| **3. Data population** | Full `regions.v1.json` for commercial Regions, complete provenance + accuracy notes. | map-data | Real dataset | All records pass schema + provenance checks |
| **4. Core features** | Show Regions; pick primary; compare secondaries; haversine distances + drawn lines; filter by metadata. | map-frontend | Interactive MVP | All six MVP features work against real data |
| **5. Insight & disclaimers** | Ranked DR-candidate list; "approximate great-circle separation" labels; distance≠latency≠resilience disclaimer; explainer panel. | map-frontend, map-architect | Insight layer | Disclaimer + ranked list present and clear |
| **6. Test & harden** | Unit tests (haversine, data loader), data-contract validation in CI, lint/format, empty/error states. | map-tester | Green CI | Tests pass; CI validates dataset |
| **7. Deploy (gated)** | Amplify Hosting via GitHub CI/CD; least-privilege deploy. | lead | Live URL | **Human-approved** deploy only |

---

## 2. Timeline (fits before 2026-11-02)

```
Oct 30  ──  Phase 0 design + gate (docs today)
Oct 31  ──  Phase 1 scaffold + contract freeze  | Phase 3 data population (parallel)
Nov 01  ──  Phase 2 backend/map + Phase 4 core features
Nov 02  ──  Phase 5 insight/disclaimers, Phase 6 test/harden, Phase 7 deploy (gated)  ──  SUBMIT
```

Parallelism is enabled by the frozen data contract: once Phase 0 passes,
map-data (Phase 3) and map-frontend (Phases 1–2) proceed concurrently on their
own branches/worktrees.

---

## 3. Testing strategy

| Layer | What | Who | Tooling (TBD by map-tester) |
|---|---|---|---|
| Unit | Haversine math (known city-pair distances within tolerance); edge cases (same point = 0, antipodal). | map-tester | Vitest |
| Unit | Data loader + `schemaVersion` assertion; filter predicates. | map-tester | Vitest |
| Contract | `regions.vN.json` validated against the §3/§4/§5 schema; fails CI on violation. | map-tester | JSON-schema validator in CI |
| Component | Region selection → line drawn; filter → marker set changes; disclaimer always present. | map-tester | React Testing Library |
| Build/CI | `npm run build`, lint, format, type-check on every PR; Amplify PR preview build. | map-frontend / lead | Amplify CI + repo CI |
| Smoke | Map tiles load with the scoped, referrer-locked API key; no auth/permission errors. | map-frontend | Manual in sandbox |

Correctness priorities: the **haversine math** and the **data-contract
validation** are the highest-value tests — the first is the product's core
computation, the second guards the parallel seam.

---

## 4. Definition of done (MVP)

- All six MVP features functional end-to-end against the real dataset.
- Real Amazon Location Service basemap via a restricted, referrer-locked API key.
- Distance labeled "approximate great-circle separation" with the
  distance≠latency≠resilience disclaimer always visible.
- Ranked DR-candidate list by separation.
- Dataset validates against `DATA_CONTRACT.md`; provenance + accuracy notes present.
- CI green (build, lint, type-check, unit, contract tests).
- Deploy performed only after explicit human approval.

---

## 5. Gate checklist (Phase 0 → 1)

- [x] Lead approved `ARCHITECTURE.md`.
- [x] Lead approved `DATA_CONTRACT.md`.
- [x] Lead approved this `MVP_PLAN.md`.
- [x] **OQ4 (data source + license) RESOLVED** — metadata from AWS Global
  Infrastructure docs + SSM public parameters (`/aws/service/global-infrastructure/...`);
  coordinates from a documented, redistribution-cleared centroid source (see
  ARCHITECTURE.md §6).
- [x] **OQ5 (Region scope) RESOLVED** — commercial `aws`-partition Regions only;
  GovCloud, China, non-operational Regions, Local Zones, Wavelength Zones and
  Outposts out of scope.
- [ ] Judging-rubric assumption (4 equal criteria) confirmed or corrected (OQ1).

**The lead approved all three docs (`ARCHITECTURE.md`, `DATA_CONTRACT.md`,
`MVP_PLAN.md`).** Remaining open item before implementation is OQ1 (rubric
confirmation), which does not block scaffolding.

---

*End of MVP_PLAN.md. See `ARCHITECTURE.md` (§11 Open Questions, §12 Risks) and
`DATA_CONTRACT.md` (schema).*
