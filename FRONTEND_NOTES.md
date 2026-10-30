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

## Map style configuration — local demo vs production (Amazon Location Maps v2)

The backend migrated from classic Location maps to **Amazon Location Service
Maps v2** (the `geo-maps` service). v2 is a MANAGED service: the "Standard"
MapLibre style is provider-managed (no per-account map resource), served from a
v2 style-descriptor endpoint and authorised by a restricted API key passed as
the `?key=` query param:

```
https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor?key=<apiKey>
```

MapLibre accepts that full style-descriptor URL (with `?key=`) directly as its
`style`. The style is resolved behind a single config point,
`src/config/mapStyle.ts`.

### Resolution precedence (first match wins)

`resolveMapStyle()` / `isProductionMapStyle()` pick the style in this order:

1. **`VITE_MAP_STYLE_URL`** — a FULL v2 style-descriptor URL that already
   includes `?key=<apiKey>`. Used verbatim.
2. **`VITE_MAP_STYLE_DESCRIPTOR` + `VITE_MAP_API_KEY`** — the base descriptor URL
   and the raw key, composed here into `${descriptor}?key=${apiKey}`.
3. **`amplify_outputs.json`** `custom.mapStyleUrl` (base descriptor URL, emitted
   by `amplify/backend.ts`) + a raw key from `VITE_MAP_API_KEY` (or
   `custom.mapApiKey` if a deploy wires the raw value in — `CfnAPIKey` exposes
   only name/ARN, so the raw key value is resolved at runtime; see ARCHITECTURE
   §5). Composed into `${mapStyleUrl}?key=${key}`.
4. **FALLBACK** — a free, **no-auth** OpenStreetMap raster style, inline, so the
   app runs with **zero AWS configuration**.

`amplify_outputs.json` is **gitignored** and only present after a deploy; it is
imported optionally (via a Vite glob) so a missing file never breaks the build.

### Running locally with a real v2 key (live tiles)

To see the live Amazon Location Maps v2 Standard tiles locally, provide a real
restricted key via a `.env.local` (gitignored) in the frontend worktree, then
run the dev server / build. Either form works:

```bash
# Form A — full URL (simplest):
VITE_MAP_STYLE_URL="https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor?key=REAL_KEY"

# Form B — descriptor + key composed by the app:
VITE_MAP_STYLE_DESCRIPTOR="https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor"
VITE_MAP_API_KEY="REAL_KEY"
```

Get `REAL_KEY` from a deployed stack: it is the value of the
`region-explorer-map-key` Amazon Location API key (`custom.mapApiKeyName` in
`amplify_outputs.json`), fetched at runtime. With no key/URL set, the app falls
back to OSM raster — no AWS needed.

### The key ships to the browser — by design (ARCHITECTURE §5)

The restricted Amazon Location Service API key is the **sole** public map-access
mechanism, and embedding it in the browser-fetched style URL is the intended
Amazon Location API-key model — **not a leaked secret**. The key is
**referrer-locked** (bound to the Amplify Hosting domain), **read-only**
(geo-maps exposes only `Get*` actions — no write/delete), **provider-scoped** to
the single v2 provider ARN, and **expiring**. This aligns with ARCHITECTURE §4
(Amplify + CDK `CfnAPIKey`, no `CfnMap` in v2) and §5.

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
  map style (production: Amazon Location Maps v2 Standard descriptor + tiles;
  local fallback: OSM raster) and the static `regions.v1.json`.

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
