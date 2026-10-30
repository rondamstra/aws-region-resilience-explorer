/**
 * Single configuration point for the MapLibre base-map style.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LOCAL DEMO vs PRODUCTION — Amazon Location Service Maps v2 (ARCHITECTURE §4/§5)
 * ──────────────────────────────────────────────────────────────────────────
 * Production renders the **Amazon Location Service Maps v2** (geo-maps) MANAGED
 * MapLibre "Standard" style. There is NO per-account map resource in v2: the
 * Standard style is provider-managed and fetched directly from the v2 style
 * descriptor endpoint:
 *
 *   https://maps.geo.<region>.amazonaws.com/v2/styles/Standard/descriptor
 *
 * AUTH IS COGNITO GUEST + SigV4 — NOT an API key. The map's style, tiles,
 * sprites and glyphs are authorised by temporary Amazon Cognito UNAUTHENTICATED
 * (guest) credentials, SigV4-signed per request via the MapLibre
 * `transformRequest` built in `src/config/mapAuth.ts`. The guest IAM role grants
 * least-privilege `geo-maps:GetTile` on the single provider ARN. NO API key, NO
 * secret, and NOTHING of the sort is embedded in the style URL. (The earlier
 * referrer-locked API-key path was removed once the Cognito path was verified
 * serving real tiles — see ARCHITECTURE §5.)
 *
 * ── Resolution precedence (first match wins) ───────────────────────────────
 *   1. `VITE_MAP_STYLE_URL` — an explicit v2 style-descriptor URL (local-dev
 *      override). Used verbatim with the Cognito `transformRequest`.
 *   2. COGNITO SigV4 — `amplify_outputs.json` carries a Cognito guest identity
 *      pool (`auth.identity_pool_id`). Use the v2 style-descriptor URL
 *      (`custom.mapStyleUrl`, else the eu-west-1 default). Auth is SigV4 via the
 *      MapLibre `transformRequest` (guest credentials). See `mapAuth.ts`.
 *   3. FALLBACK — a free, no-auth OpenStreetMap raster style, so the app runs
 *      with ZERO AWS configuration.
 *
 * Everything downstream consumes the single value returned by `resolveMapStyle()`.
 * When `isCognitoMapStyle()` is true, the map MUST be wired with the auth-helper
 * `transformRequest` from `src/config/mapAuth.ts`.
 */
import type { StyleSpecification } from 'maplibre-gl';
import { resolveCognitoMapConfig } from './mapAuth';

/** v2 MapLibre Standard style-descriptor endpoint (SigV4 via transformRequest). */
const V2_STANDARD_DESCRIPTOR_DEFAULT =
  'https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor';

/**
 * A free, no-authentication OpenStreetMap raster style. OSM standard tiles are
 * fine for a local demo of global Region separation. (For public use, the v2
 * Amazon Location Service Standard style is used in production — see above.)
 */
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster',
      source: 'osm-raster',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

/**
 * Shape of the bits of `amplify_outputs.json` we read. Only `custom.mapStyleUrl`
 * and `custom.mapRegion` are emitted by the backend (`amplify/backend.ts`); the
 * Cognito identity pool lives in the `auth` block (read by `mapAuth.ts`).
 */
interface AmplifyOutputs {
  custom?: {
    mapStyleUrl?: string;
    mapRegion?: string;
  };
}

/**
 * Optionally load `amplify_outputs.json`. It is GITIGNORED and only present
 * after a deploy, so this import must not break the build when the file is
 * absent. We resolve it lazily via a Vite glob so a missing file yields `{}`
 * rather than a hard module-resolution error.
 */
function loadAmplifyOutputs(): AmplifyOutputs | undefined {
  try {
    // eager glob: compiled away to {} when the file does not exist at build time.
    const modules = import.meta.glob<{ default: AmplifyOutputs }>(
      '/amplify_outputs.json',
      { eager: true },
    );
    const entry = Object.values(modules)[0];
    return entry?.default;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the v2 style-descriptor URL when a map should render over the Cognito
 * SigV4 path, or `undefined` when no AWS/v2 config is present.
 *
 * Precedence: an explicit `VITE_MAP_STYLE_URL` (dev override) wins; otherwise a
 * configured Cognito guest identity pool selects the deploy-emitted
 * `custom.mapStyleUrl` base descriptor, else the eu-west-1 default. In every
 * case auth is SigV4 via `transformRequest` — NO api key is appended.
 */
function resolveV2StyleUrl(): string | undefined {
  const envUrl = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }
  if (!resolveCognitoMapConfig()) {
    return undefined;
  }
  const outputs = loadAmplifyOutputs();
  const base = outputs?.custom?.mapStyleUrl;
  return base && base.length > 0 ? base : V2_STANDARD_DESCRIPTOR_DEFAULT;
}

/**
 * Resolve the MapLibre style to render.
 *
 * @returns Either the v2 Amazon Location Service style-descriptor URL string
 *   (Cognito SigV4 path — wire the `transformRequest` from `mapAuth.ts`) or an
 *   inline style spec (the local no-auth OSM raster fallback).
 */
export function resolveMapStyle(): string | StyleSpecification {
  const v2Url = resolveV2StyleUrl();
  if (v2Url) {
    // PRODUCTION: Amazon Location Service Maps v2 managed Standard style.
    return v2Url;
  }
  // LOCAL DEMO: free, no-auth OSM raster style (no AWS credentials required).
  return OSM_RASTER_STYLE;
}

/**
 * Whether the resolved style is the production Amazon Location Service v2 style.
 * False means the OSM raster fallback is in use.
 */
export function isProductionMapStyle(): boolean {
  return resolveV2StyleUrl() !== undefined;
}

/**
 * Whether the active style is served over the Cognito SigV4 path (guest
 * credentials + MapLibre `transformRequest`). When true, the map must be wired
 * with the auth-helper `transformRequest` from `src/config/mapAuth.ts`. This is
 * true whenever a v2 style URL resolves and a Cognito guest identity pool is
 * configured (the only AWS auth path in this build).
 */
export function isCognitoMapStyle(): boolean {
  return resolveV2StyleUrl() !== undefined && resolveCognitoMapConfig() !== undefined;
}
