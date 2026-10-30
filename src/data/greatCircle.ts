/**
 * Great-circle arc interpolation for drawing DR connection lines on the map
 * (Feature 4, ARCHITECTURE.md §9).
 *
 * MapLibre draws a GeoJSON LineString as straight segments in the projection,
 * so a two-point line between distant Regions looks wrong (it cuts a chord, not
 * the true shortest surface path). We sample the great-circle path and emit the
 * densified coordinate list; MapLibre's straight segments between dense samples
 * then approximate the arc. This is a geometric curve only — NOT a routed/
 * latency path (§9 disclaimer still applies).
 */
import type { LatLon } from './geo';

const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/**
 * Spherical linear interpolation of points along the great circle between `a`
 * and `b`.
 *
 * @param a - Start point in decimal degrees.
 * @param b - End point in decimal degrees.
 * @param steps - Number of segments (>= 1). More steps = smoother arc.
 * @returns An ordered list of `[lon, lat]` pairs (GeoJSON order) from `a` to `b`
 *   inclusive, handling antimeridian crossing so the drawn line does not wrap.
 */
export function greatCircleArc(a: LatLon, b: LatLon, steps = 64): [number, number][] {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);

  // Angular distance between the two points (haversine of the central angle).
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const delta = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  const n = Math.max(1, Math.floor(steps));
  const coords: [number, number][] = [];

  // Degenerate (same point): return the single point.
  if (delta === 0) {
    return [[a.lon, a.lat]];
  }

  let prevLonDeg = a.lon;
  let unwrapOffset = 0;

  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * delta) / Math.sin(delta);
    const B = Math.sin(f * delta) / Math.sin(delta);

    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lon = toDeg(Math.atan2(y, x));

    // Unwrap longitude so consecutive samples never jump > 180° (prevents the
    // line from wrapping the wrong way across the antimeridian when rendered).
    let candidate = lon + unwrapOffset;
    while (candidate - prevLonDeg > 180) {
      unwrapOffset -= 360;
      candidate = lon + unwrapOffset;
    }
    while (candidate - prevLonDeg < -180) {
      unwrapOffset += 360;
      candidate = lon + unwrapOffset;
    }
    lon = candidate;
    prevLonDeg = lon;

    coords.push([lon, lat]);
  }

  return coords;
}
