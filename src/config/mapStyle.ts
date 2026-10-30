/**
 * Single configuration point for the MapLibre base-map style.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LOCAL DEMO vs PRODUCTION (ARCHITECTURE.md §4 / §5)
 * ──────────────────────────────────────────────────────────────────────────
 * Production renders an **Amazon Location Service** vector basemap, authorised
 * by a restricted, referrer-locked, read-only `geo:GetMap*` API key scoped to a
 * single map ARN. That requires deployed AWS resources + a generated config
 * (`amplify_outputs.json`) which we do NOT have yet (Phase D / deploy is gated).
 *
 * For the LOCAL demo we therefore render a FREE, no-auth public raster style
 * (OpenStreetMap raster tiles) so the map works with zero AWS credentials.
 *
 * SWAPPING TO PRODUCTION IS A ONE-LINE CHANGE: set `VITE_MAP_STYLE_URL` (the
 * Amazon Location Service style-descriptor URL, including its API key) at build
 * time, or replace `resolveMapStyle()`'s fallback with the Location style URL.
 * Everything downstream consumes the single value returned by `resolveMapStyle()`.
 */
import type { StyleSpecification } from 'maplibre-gl';

/**
 * A free, no-authentication OpenStreetMap raster style. OSM standard tiles are
 * fine for a local demo of global Region separation. (For heavier/public use,
 * swap to the Amazon Location Service style in production — see below.)
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
 * Resolve the MapLibre style to render.
 *
 * @returns Either a style-descriptor URL string (Amazon Location Service, when
 *   `VITE_MAP_STYLE_URL` is provided — the Phase D production path) or an inline
 *   style spec (the local no-auth OSM raster fallback).
 *
 * PHASE D SWAP — one line: provide the Amazon Location Service style URL via the
 * `VITE_MAP_STYLE_URL` env var (`https://maps.geo.<region>.amazonaws.com/maps/v0/maps/<map>/style-descriptor?key=<apiKey>`).
 * No component code changes; MapLibre accepts a URL string or a style object here.
 */
export function resolveMapStyle(): string | StyleSpecification {
  const prodStyleUrl = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;
  if (prodStyleUrl && prodStyleUrl.length > 0) {
    // PRODUCTION (Phase D): Amazon Location Service vector style via restricted key.
    return prodStyleUrl;
  }
  // LOCAL DEMO: free, no-auth OSM raster style (no AWS credentials required).
  return OSM_RASTER_STYLE;
}

/** Whether the resolved style is the production Amazon Location Service style. */
export function isProductionMapStyle(): boolean {
  const v = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;
  return !!v && v.length > 0;
}
