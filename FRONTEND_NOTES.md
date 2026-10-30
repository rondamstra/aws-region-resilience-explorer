# Frontend notes — AWS Region Resilience Explorer

Scaffold phase for the React + TypeScript + Vite frontend, per
`docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT.md`.

## What exists after this phase

- Vite + React + TypeScript app at the worktree root (`src/`, `index.html`,
  `package.json`, `tsconfig*.json`, `vite.config.ts`).
- Amplify Gen 2 backend **skeleton** (`amplify/`): `backend.ts` wires a Location
  Service `CfnMap` + a **restricted** `CfnAPIKey` (read-only `geo:GetMap*`,
  referrer-locked, expiring, scoped to the single map ARN) as the PRIMARY map
  access path; `amplify/auth/resource.ts` is the DOCUMENTED SECURE ALTERNATIVE
  (unauth identity pool). Structure + code only.
- A typed Region data model (`src/data/types.ts`) matching DATA_CONTRACT §3–§5
  exactly, a loader that asserts `schemaVersion === 1`
  (`src/data/loadRegions.ts`), and a documented haversine great-circle distance
  function in km (`src/data/geo.ts`).
- An app shell that renders, loads + validates the dataset, shows the
  distance ≠ resilience disclaimer, and a **placeholder** map container
  (`src/components/MapContainer.tsx`). No MapLibre/Location SDK is initialised
  yet.

## Dataset handling (data/ is map-data's ownership)

The real dataset `data/regions.v1.json` is produced by map-data. This frontend
consumes it read-only. To stay buildable in parallel before it exists, the
loader fetches `${BASE_URL}regions.v1.json` at runtime and falls back to a
committed sample fixture at `src/__fixtures__/regions.sample.json` (clearly
marked FIXTURE). **No real dataset was authored here**, and `data/` was not
modified.

## Run locally (dev)

```bash
npm install        # already run in this worktree; node_modules is gitignored
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  (passes)
npm run typecheck  # tsc -b --noEmit
npm run preview    # serve the production build
```

## Deployment / credentials

**No deploy and no AWS credentials were configured.** `ampx` / `amplify
sandbox` was NOT run, no `amplify_outputs.json` was generated, and no AWS /
billable resources were created. The Amplify backend is defined as code only;
deploying it is gated on explicit human approval (ARCHITECTURE.md §7).

## Pinned dependencies

All versions are pinned (no `^`/`~` ranges). See `package.json`:

- runtime: `react` 18.3.1, `react-dom` 18.3.1, `maplibre-gl` 4.7.1
- dev: `@aws-amplify/backend` 1.8.0, `@aws-amplify/backend-cli` 1.4.2,
  `aws-cdk-lib` 2.164.1, `constructs` 10.4.2, `typescript` 5.6.3, `vite` 5.4.11,
  `@vitejs/plugin-react` 4.3.3, `@types/react` 18.3.12, `@types/react-dom` 18.3.1
