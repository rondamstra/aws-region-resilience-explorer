# Frontend notes — AWS Region Resilience Explorer

React + TypeScript + Vite single-page app implementing the six MVP features per
`docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT.md`.

## Six MVP features (all implemented)

1. **Map of all 33 commercial Regions** — `src/components/MapView.tsx` renders
   the dataset as MapLibre GL JS markers over a base map.
2. **Select a primary Region** — click a marker, use the keyboard-accessible
   Region list, or the "Primary Region" dropdown. The primary is highlighted
   distinctly (larger, accent-coloured marker).
3. **Select & compare secondaries** — `src/components/ComparisonPanel.tsx` lets
   the user pick one or more secondary candidates and shows a **ranked list by
   approximate great-circle separation** (ascending).
4. **Great-circle distance lines** — lines are drawn primary → each secondary on
   the map as densified great-circle arcs (`src/data/greatCircle.ts`), and the
   km separation (via `haversineKm`) is shown per candidate, always labeled
   "approximate great-circle separation".
5. **Metadata filters** — `src/components/RegionFilters.tsx` filters by
   continent, launch-year range, minimum AZ count and geography type, backed by
   the pure `filterRegions(regions, criteria)` in `src/data/filters.ts`.
6. **First-class disclaimer + explainer** — `src/components/Disclaimer.tsx` is
   always visible and states distance ≠ latency ≠ resilience ≠ availability ≠
   compliance; `src/components/ExplainerPanel.tsx` explains how to actually
   reason about DR Region choice.

## Map style configuration — local demo vs Phase D (production)

Amazon Location Service requires deployed AWS credentials we do **not** have yet
(deploy is gated, Phase D). So the map style is resolved behind a single config
point, `src/config/mapStyle.ts`:

- **LOCAL DEMO (default):** a free, **no-auth** OpenStreetMap raster style is
  used inline — the map works with **zero AWS credentials**.
- **PRODUCTION (Phase D):** set the env var `VITE_MAP_STYLE_URL` to the Amazon
  Location Service style-descriptor URL (including the restricted API key),
  e.g. `https://maps.geo.<region>.amazonaws.com/maps/v0/maps/<map>/style-descriptor?key=<apiKey>`.
  `resolveMapStyle()` returns that URL when present; MapLibre accepts a style URL
  or an inline style object, so **no component code changes**.

**The Phase D swap is one line** — provide `VITE_MAP_STYLE_URL` at build time
(or replace the fallback in `resolveMapStyle()` with the Location style URL).
This aligns with ARCHITECTURE §4 (Amplify + CDK `CfnMap` + restricted
`CfnAPIKey`) and §5 (referrer-locked, read-only `geo:GetMap*`, expiring key).

## Test-facing modules (map-tester seam)

`map-tester` imports from `src/lib/*`. These re-export the implementations in
`src/data/*` with **no duplication**:

- `src/lib/haversine.ts` → re-exports `haversineKm` from `src/data/geo.ts`.
- `src/lib/filters.ts` → re-exports `filterRegions` from `src/data/filters.ts`.
- `src/lib/regions.ts` → re-exports a **synchronous** validator
  `loadRegions(raw: unknown): RegionDataset` (asserts `schemaVersion === 1`,
  throws on violation) backed by `validateDataset` in `src/data/loadRegions.ts`.
  The app's runtime fetch-with-fallback loader is the async `loadRegions` in
  `src/data/loadRegions.ts`.

Component tests expect `src/components/MapView.tsx`
(`{ regions, primary, secondaries, onSelect }`) and `src/components/Disclaimer.tsx`
(default exports). Because MapLibre renders to a WebGL canvas jsdom cannot drive,
`MapView` also renders an accessible, headless-testable DOM mirror exposing the
test seams: `region-marker-<code>` buttons, `primary-selected` /
`data-primary="true"`, and one `dr-line` element per drawn line with
`data-from` / `data-to`.

## Accessibility & quality

- Responsive map + side-panel layout (single column under 900px).
- Keyboard-operable controls (markers mirrored as buttons, native selects/inputs),
  ARIA labels, visible focus rings, `prefers-color-scheme` light/dark palette
  with contrast-safe colours.
- Empty state (no Regions match filter), error state (dataset load failure with
  retry), and a fixture-fallback badge when the real dataset is absent.
- Strict TypeScript, no `any` leaks. Static SPA — the only network calls are the
  map style (local: OSM raster) and the static `regions.v1.json`.

## Run locally (dev)

```bash
npm run dev        # Vite dev server (syncs data/regions.v1.json → public/)
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build
npm run preview    # serve the production build
```

(NFS/autofs note: node_modules is symlinked to local disk; tools can also be run
directly as `node node_modules/typescript/lib/tsc.js -b --noEmit` and
`node node_modules/vite/bin/vite.js build`.)

## Deployment / credentials

**No deploy and no AWS credentials were configured.** `ampx` / `amplify sandbox`
was NOT run, no `amplify_outputs.json` was generated, and no AWS/billable
resources were created. The Amplify backend is defined as code only; deploying it
is gated on explicit human approval (ARCHITECTURE §7).
