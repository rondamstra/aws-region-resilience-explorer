/**
 * Unit — haversine great-circle distance.
 *
 * Covers acceptance criteria AC-4.1 .. AC-4.4 (see tests/TEST_STRATEGY.md §3).
 *
 * MODULE UNDER TEST (owned by map-frontend): `src/lib/haversine`
 *   Assumed export: haversineKm(a, b) where a,b = { lat:number, lon:number }, returns km.
 *   If map-frontend ships positional args haversineKm(lat1,lon1,lat2,lon2),
 *   adapt the `d(...)` helper below — the expectations do not change.
 *
 * Earth radius assumption: R = 6371 km (mean). Tolerance ±0.5% absorbs the
 * mean-vs-WGS84 radius choice and centroid rounding.
 *
 * Wired to the real implementation (src/lib/haversine -> src/data/geo).
 * Real signature: haversineKm(a: {lat;lon}, b: {lat;lon}) => number (km).
 */
import { describe, it, expect } from 'vitest';
import { haversineKm } from '../../src/lib/haversine';
import regionsRaw from '../../data/regions.v1.json' with { type: 'json' };

type Pt = { lat: number; lon: number };

// Real API: point-object form. Matches the skeleton's assumption exactly.
const d = (a: Pt, b: Pt): number => haversineKm(a, b);

// ±0.5% tolerance helper.
const withinPct = (actual: number, expected: number, pct = 0.005) =>
  Math.abs(actual - expected) <= expected * pct;

// Approximate region-city centroids (match DATA_CONTRACT example style).
const US_EAST_1: Pt = { lat: 38.95, lon: -77.45 };   // US East (N. Virginia)
const EU_WEST_1: Pt = { lat: 53.35, lon: -6.26 };    // Europe (Ireland) — Dublin
const AP_SOUTHEAST_2: Pt = { lat: -33.87, lon: 151.21 }; // Asia Pacific (Sydney)
const SA_EAST_1: Pt = { lat: -23.55, lon: -46.63 };  // South America (São Paulo)

describe('haversineKm — great-circle distance (AC-4.1..AC-4.4)', () => {
  it('AC-4.1: us-east-1 (N. Virginia) ↔ eu-west-1 (Ireland) ≈ 5466 km (±0.5%)', () => {
    // Great-circle N. Virginia metro centroid → Dublin centroid, R=6371: 5465.6 km.
    const km = d(US_EAST_1, EU_WEST_1);
    expect(withinPct(km, 5465.6)).toBe(true);
  });

  it('AC-4.1: us-east-1 ↔ ap-southeast-2 (Sydney) ≈ 15676 km (±0.5%)', () => {
    const km = d(US_EAST_1, AP_SOUTHEAST_2);
    expect(withinPct(km, 15675.6)).toBe(true);
  });

  it('AC-4.1: us-east-1 ↔ sa-east-1 (São Paulo) ≈ 7654 km (±0.5%)', () => {
    const km = d(US_EAST_1, SA_EAST_1);
    expect(withinPct(km, 7654.0)).toBe(true);
  });

  it('AC-4.2: identical coordinates → exactly 0 km', () => {
    expect(d(US_EAST_1, { ...US_EAST_1 })).toBe(0);
  });

  it('AC-4.3: antipodal points ≈ half Earth circumference (~20015 km, ±0.5%)', () => {
    const p: Pt = { lat: 10, lon: 20 };
    const anti: Pt = { lat: -10, lon: 20 - 180 }; // antipode: negate lat, flip lon by 180
    const km = d(p, anti);
    // π * 6371 ≈ 20015 km.
    expect(withinPct(km, Math.PI * 6371)).toBe(true);
  });

  it('AC-4.4: symmetry — d(A,B) === d(B,A)', () => {
    expect(d(US_EAST_1, EU_WEST_1)).toBeCloseTo(d(EU_WEST_1, US_EAST_1), 6);
  });

  it('AC-4.1: equator quarter-arc sanity — (0,0) ↔ (0,90) ≈ 10008 km (±0.5%)', () => {
    // Quarter of the equatorial great circle = π/2 * 6371 ≈ 10007.5 km.
    const km = d({ lat: 0, lon: 0 }, { lat: 0, lon: 90 });
    expect(withinPct(km, (Math.PI / 2) * 6371)).toBe(true);
  });

  it('rejects out-of-range coordinates (input-range handling)', () => {
    expect(() => d({ lat: 91, lon: 0 }, US_EAST_1)).toThrow(RangeError);
    expect(() => d(US_EAST_1, { lat: 0, lon: 181 })).toThrow(RangeError);
  });
});

/**
 * AC-4.1 against the REAL dataset coordinates (data/regions.v1.json), not
 * hand-picked constants. Proves the shipped centroids yield the documented
 * separations within ±0.5%.
 */
describe('haversineKm — against real dataset coordinates (AC-4.1)', () => {
  const byCode = new Map(
    (regionsRaw as { regions: Array<{ regionCode: string; lat: number; lon: number }> }).regions.map(
      (r) => [r.regionCode, { lat: r.lat, lon: r.lon }],
    ),
  );
  const at = (code: string): Pt => {
    const p = byCode.get(code);
    if (!p) throw new Error(`region ${code} missing from dataset`);
    return p;
  };

  it('us-east-1 ↔ eu-west-1 real centroids ≈ 5466 km (±0.5%)', () => {
    expect(withinPct(d(at('us-east-1'), at('eu-west-1')), 5465.6)).toBe(true);
  });

  it('us-east-1 ↔ ap-southeast-2 real centroids ≈ 15676 km (±0.5%)', () => {
    expect(withinPct(d(at('us-east-1'), at('ap-southeast-2')), 15675.6)).toBe(true);
  });

  it('us-east-1 ↔ sa-east-1 real centroids ≈ 7654 km (±0.5%)', () => {
    expect(withinPct(d(at('us-east-1'), at('sa-east-1')), 7654.0)).toBe(true);
  });

  it('a region is exactly 0 km from itself (AC-4.2 on real data)', () => {
    expect(d(at('eu-central-1'), at('eu-central-1'))).toBe(0);
  });
});
