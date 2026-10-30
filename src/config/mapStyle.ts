/**
 * Single configuration point for the MapLibre base-map style.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LOCAL DEMO vs PRODUCTION — Amazon Location Service Maps v2 (ARCHITECTURE §4/§5)
 * ──────────────────────────────────────────────────────────────────────────
 * Production renders the **Amazon Location Service Maps v2** (geo-maps) MANAGED
 * MapLibre "Standard" style. There is NO per-account map resource in v2: the
 * Standard style is provider-managed and fetched directly from the v2 style
 * descriptor endpoint, authorised by a restricted Amazon Location Service API
 * key passed as the `?key=` query param:
 *
 *   https://maps.geo.<region>.amazonaws.com/v2/styles/Standard/descriptor?key=<apiKey>
 *
 * MapLibre accepts this full style-descriptor URL (with `?key=`) directly as its
 * `style`; it then resolves the descriptor, vector tiles, sprites and glyphs,
 * all authorised by the same key. No credential exchange, no identity pool.
 *
 * ── The API key is EXPECTED to ship to the browser — BY DESIGN (ARCHITECTURE §5)
 * The restricted Amazon Location Service API key is the SOLE public map-access
 * mechanism. It is **referrer-locked** (bound to the Amplify Hosting domain),
 * **read-only** (geo-maps exposes only Get* actions — no write/delete), and
 * **provider-scoped + expiring**. Embedding it in the style URL that the browser
 * fetches is the intended Amazon Location API-key model, not a leaked secret.
 *
 * ── Resolution precedence (first match wins) ───────────────────────────────
 *   1. `VITE_MAP_STYLE_URL` — a FULL v2 style-descriptor URL already including
 *      `?key=<apiKey>`. Used verbatim. (Simplest local-dev override.)
 *   2. `VITE_MAP_STYLE_DESCRIPTOR` + `VITE_MAP_API_KEY` — base descriptor URL
 *      and raw key, composed here into `${descriptor}?key=${apiKey}`.
 *   3. COGNITO SigV4 — `amplify_outputs.json` carries a Cognito guest identity
 *      pool (`auth.identity_pool_id`). Use the v2 style-descriptor URL
 *      (`custom.mapStyleUrl`, else the eu-west-1 default) **WITHOUT `?key=`**:
 *      auth is now SigV4 via the MapLibre `transformRequest` (guest credentials),
 *      NOT an API key in the URL. See `src/config/mapAuth.ts`.
 *   4. `amplify_outputs.json` `custom.mapStyleUrl` (base descriptor URL) + a raw
 *      key from `VITE_MAP_API_KEY` (or `custom.mapApiKey` if a deploy wires the
 *      raw value in; `CfnAPIKey` exposes only name/ARN, so the raw key is
 *      resolved at runtime — see §5). Composed into `${mapStyleUrl}?key=${key}`.
 *      TRANSITIONAL API-key path, retained alongside the Cognito path.
 *   5. FALLBACK — a free, no-auth OpenStreetMap raster style, so the app runs
 *      with ZERO AWS configuration.
 *
 * Everything downstream consumes the single value returned by `resolveMapStyle()`.
 */
import type { StyleSpecification } from 'maplibre-gl';
import { resolveCognitoMapConfig } from './mapAuth';

/** v2 MapLibre Standard style-descriptor endpoint (no key — SigV4 via transformRequest). */
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
 * is guaranteed by the backend (`amplify/backend.ts`). `custom.mapApiKey` is NOT
 * emitted by `CfnAPIKey` (it exposes only name/ARN) — it is modelled here only
 * in case a deploy step injects the resolved raw key value (§5).
 */
interface AmplifyOutputs {
  custom?: {
    mapStyleUrl?: string;
    mapApiKey?: string;
    mapApiKeyName?: string;
    mapRegion?: string;
  };
}

/**
 * Resolve the v2 style-descriptor URL for the Cognito SigV4 path (NO `?key=`),
 * or `undefined` when no Cognito guest identity pool is configured. Prefers the
 * deploy-emitted `custom.mapStyleUrl` base descriptor, else the eu-west-1
 * default. Auth is SigV4 via `transformRequest` (see `src/config/mapAuth.ts`),
 * so NO api key is appended.
 */
function resolveCognitoStyleUrl(): string | undefined {
  if (!resolveCognitoMapConfig()) {
    return undefined;
  }
  const outputs = loadAmplifyOutputs();
  const base = outputs?.custom?.mapStyleUrl;
  return base && base.length > 0 ? base : V2_STANDARD_DESCRIPTOR_DEFAULT;
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

/** Join a base descriptor URL and a raw key into a `?key=` style URL. */
function withKey(baseUrl: string, apiKey: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}key=${encodeURIComponent(apiKey)}`;
}

/**
 * Resolve the production v2 style-descriptor URL (with `?key=`), or `undefined`
 * if no v2 key/URL is configured. Follows the precedence documented above.
 */
function resolveProductionStyleUrl(): string | undefined {
  const env = import.meta.env;

  // 1. Full URL (already includes ?key=).
  const fullUrl = env.VITE_MAP_STYLE_URL as string | undefined;
  if (fullUrl && fullUrl.length > 0) {
    return fullUrl;
  }

  // 2. Separate descriptor + key from env.
  const descriptor = env.VITE_MAP_STYLE_DESCRIPTOR as string | undefined;
  const envKey = env.VITE_MAP_API_KEY as string | undefined;
  if (descriptor && descriptor.length > 0 && envKey && envKey.length > 0) {
    return withKey(descriptor, envKey);
  }

  // 3. COGNITO SigV4: v2 descriptor URL WITHOUT ?key= (auth via transformRequest).
  const cognitoUrl = resolveCognitoStyleUrl();
  if (cognitoUrl) {
    return cognitoUrl;
  }

  // 4. amplify_outputs.json base URL + a raw key (env, or an injected raw value).
  //    TRANSITIONAL API-key path, retained alongside the Cognito path.
  const outputs = loadAmplifyOutputs();
  const outUrl = outputs?.custom?.mapStyleUrl;
  const outKey = envKey ?? outputs?.custom?.mapApiKey;
  if (outUrl && outUrl.length > 0 && outKey && outKey.length > 0) {
    return withKey(outUrl, outKey);
  }

  // 5. No v2 key/URL/Cognito configured.
  return undefined;
}

/**
 * Resolve the MapLibre style to render.
 *
 * @returns Either the v2 Amazon Location Service style-descriptor URL string
 *   (with `?key=`, when a v2 key/URL is configured — the production path) or an
 *   inline style spec (the local no-auth OSM raster fallback).
 */
export function resolveMapStyle(): string | StyleSpecification {
  const prodUrl = resolveProductionStyleUrl();
  if (prodUrl) {
    // PRODUCTION: Amazon Location Service Maps v2 managed Standard style.
    return prodUrl;
  }
  // LOCAL DEMO: free, no-auth OSM raster style (no AWS credentials required).
  return OSM_RASTER_STYLE;
}

/**
 * Whether the resolved style is the production Amazon Location Service v2 style
 * (i.e. a v2 descriptor URL + key is active, OR the Cognito SigV4 path). False
 * means the OSM raster fallback is in use.
 */
export function isProductionMapStyle(): boolean {
  return resolveProductionStyleUrl() !== undefined;
}

/**
 * Whether the active style is served over the Cognito SigV4 path (guest
 * credentials + MapLibre `transformRequest`, no `?key=` in the URL). When true,
 * the map must be wired with the auth-helper `transformRequest` from
 * `src/config/mapAuth.ts`. The env-provided URL/key tiers (1, 2, 4) take
 * precedence over Cognito, so this is true only when Cognito is the resolved
 * production path.
 */
export function isCognitoMapStyle(): boolean {
  const env = import.meta.env;
  const envUrl = env.VITE_MAP_STYLE_URL as string | undefined;
  const descriptor = env.VITE_MAP_STYLE_DESCRIPTOR as string | undefined;
  const envKey = env.VITE_MAP_API_KEY as string | undefined;
  const envUrlActive = !!(envUrl && envUrl.length > 0);
  const envPairActive = !!(
    descriptor &&
    descriptor.length > 0 &&
    envKey &&
    envKey.length > 0
  );
  // Cognito is only the resolved path when the higher-precedence env tiers are
  // not active and a Cognito identity pool is configured.
  return !envUrlActive && !envPairActive && resolveCognitoStyleUrl() !== undefined;
}
