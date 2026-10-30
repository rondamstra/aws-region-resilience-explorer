/**
 * Great-circle (haversine) distance utilities.
 *
 * Per ARCHITECTURE.md §9, the product shows APPROXIMATE great-circle (haversine)
 * separation between two Region centroids. This is a geometric proxy only — it
 * is NOT network latency, NOT fault isolation, NOT true resilience. Callers must
 * surface that caveat in the UI (§9 disclaimer is a first-class feature).
 */

/** Mean Earth radius in kilometres (spherical approximation). */
export const EARTH_RADIUS_KM = 6371;

/** A latitude/longitude pair in decimal degrees. */
export interface LatLon {
  /** Latitude, decimal degrees, −90..90. */
  lat: number;
  /** Longitude, decimal degrees, −180..180. */
  lon: number;
}

/** Convert decimal degrees to radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Compute the approximate great-circle distance between two points on Earth
 * using the haversine formula.
 *
 * The result is a straight-line surface distance on a spherical Earth model.
 * It is an APPROXIMATION (uses a mean Earth radius and approximate centroid
 * coordinates) and is a geometric proxy only — not latency, not resilience
 * (ARCHITECTURE.md §9).
 *
 * @param a - First point `{ lat, lon }` in decimal degrees.
 * @param b - Second point `{ lat, lon }` in decimal degrees.
 * @returns Approximate great-circle distance in kilometres (≥ 0).
 * @throws {RangeError} If any latitude is outside [−90, 90] or longitude
 *   outside [−180, 180].
 *
 * @example
 * // Distance between us-east-1 and eu-west-1 centroids (~5500 km)
 * haversineKm({ lat: 38.95, lon: -77.45 }, { lat: 53.35, lon: -6.26 });
 */
export function haversineKm(a: LatLon, b: LatLon): number {
  assertLatLon(a);
  assertLatLon(b);

  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

/**
 * Validate that a point has an in-range latitude and longitude.
 *
 * @param p - The point to validate.
 * @throws {RangeError} If latitude ∉ [−90, 90] or longitude ∉ [−180, 180].
 */
export function assertLatLon(p: LatLon): void {
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) {
    throw new RangeError(`latitude out of range [-90, 90]: ${p.lat}`);
  }
  if (!Number.isFinite(p.lon) || p.lon < -180 || p.lon > 180) {
    throw new RangeError(`longitude out of range [-180, 180]: ${p.lon}`);
  }
}
