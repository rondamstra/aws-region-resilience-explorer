/**
 * Test-facing entry point for the great-circle distance function.
 *
 * `tests/unit/haversine.test.ts` imports `haversineKm` from `src/lib/haversine`.
 * The implementation lives in `src/data/geo.ts`; this module only re-exports it
 * so there is a single source of truth and no duplication.
 */
export { haversineKm, assertLatLon, EARTH_RADIUS_KM } from '../data/geo';
export type { LatLon } from '../data/geo';
