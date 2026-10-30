/**
 * Unit — data loader + schemaVersion assertion + required fields.
 *
 * Covers AC-7.2 (schemaVersion===1), AC-7.3 (unique regionCode), AC-7.4
 * (ranges & enums), plus required-field presence. See tests/TEST_STRATEGY.md §3.
 *
 * MODULE UNDER TEST (owned by map-frontend): `src/lib/regions`
 *   Assumed exports:
 *     loadRegions(raw: unknown): RegionDataset   // asserts schemaVersion===1, throws on violation
 *     type RegionDataset = { schemaVersion: number; generatedDate: string; regions: RegionRecord[]; ... }
 *     type RegionRecord  = { regionCode; name; lat; lon; country; continent; launchYear; azCount; geographyType; provenance }
 *
 * DATASET (owned by map-data): data/regions.v1.json
 *
 * WIRED: loadRegions (src/lib/regions -> validateDataset) is exercised against
 * the REAL dataset; mutation tests prove it throws on schemaVersion!==1 and on
 * a broken top-level shape.
 */
import { describe, it, expect } from 'vitest';
import { loadRegions } from '../../src/lib/regions';
import datasetRaw from '../../data/regions.v1.json' with { type: 'json' };

const CONTINENTS = [
  'North America', 'South America', 'Europe', 'Africa',
  'Middle East', 'Asia Pacific', 'Oceania',
];

// A fixture mirroring DATA_CONTRACT §6 — lets the loader logic be exercised
// before the real dataset lands. Replace `datasetRaw` with the real import.
const FIXTURE = {
  schemaVersion: 1,
  generatedDate: '2026-10-30',
  datasetProvenance: {
    source: 'AWS Global Infrastructure docs + SSM public parameters; redistribution-cleared centroid source',
    retrievedDate: '2026-10-30',
    accuracyNote: 'Coordinates are approximate region-city centroids, NOT AWS datacenter locations.',
    license: 'Derived compilation — see docs/ARCHITECTURE.md §6.',
  },
  regions: [
    {
      regionCode: 'us-east-1',
      name: 'US East (N. Virginia)',
      lat: 38.95,
      lon: -77.45,
      country: 'United States',
      continent: 'North America',
      launchYear: 2006,
      azCount: 6,
      geographyType: 'commercial',
      provenance: {
        source: 'AWS Global Infrastructure docs + SSM; N. Virginia metro centroid',
        retrievedDate: '2026-10-30',
        accuracyNote: 'Approximate N. Virginia metro centroid; NOT a datacenter location.',
        license: 'Derived compilation — see datasetProvenance.',
      },
    },
  ],
};

describe('loadRegions — data loader against the REAL dataset (AC-7.2 .. AC-7.5)', () => {
  // The REAL dataset shipped by map-data.
  const raw = datasetRaw as typeof FIXTURE & {
    regions: Array<(typeof FIXTURE)['regions'][number]>;
  };

  it('AC-7.2: loadRegions(real file) asserts & returns schemaVersion === 1', () => {
    const ds = loadRegions(raw);
    expect(ds.schemaVersion).toBe(1);
  });

  it('loadRegions returns the dataset with all 33 regions', () => {
    const ds = loadRegions(raw);
    expect(ds.regions).toHaveLength(33);
  });

  it('throws on a MUTATED copy with schemaVersion !== 1 (version mismatch guard)', () => {
    const wrong = { ...raw, schemaVersion: 2 };
    expect(() => loadRegions(wrong)).toThrow();
  });

  it('throws when regions is not an array (top-level shape guard)', () => {
    const broken = { ...raw, regions: 'nope' as unknown as typeof raw.regions };
    expect(() => loadRegions(broken)).toThrow();
  });

  it('throws on a non-object input', () => {
    expect(() => loadRegions(null)).toThrow();
  });

  it('every record has all required fields non-null', () => {
    const required = [
      'regionCode', 'name', 'lat', 'lon', 'country',
      'continent', 'launchYear', 'azCount', 'geographyType', 'provenance',
    ];
    for (const r of raw.regions) {
      for (const f of required) {
        expect((r as Record<string, unknown>)[f]).not.toBeNull();
        expect((r as Record<string, unknown>)[f]).not.toBeUndefined();
      }
    }
  });

  it('AC-7.3: regionCode is a unique primary key', () => {
    const codes = raw.regions.map((r) => r.regionCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('AC-7.4: lat ∈ [−90,90], lon ∈ [−180,180]', () => {
    for (const r of raw.regions) {
      expect(r.lat).toBeGreaterThanOrEqual(-90);
      expect(r.lat).toBeLessThanOrEqual(90);
      expect(r.lon).toBeGreaterThanOrEqual(-180);
      expect(r.lon).toBeLessThanOrEqual(180);
    }
  });

  it('AC-7.4: launchYear ∈ [2006, generatedDate year]; azCount ≥ 1', () => {
    const genYear = Number(raw.generatedDate.slice(0, 4));
    for (const r of raw.regions) {
      expect(r.launchYear).toBeGreaterThanOrEqual(2006);
      expect(r.launchYear).toBeLessThanOrEqual(genYear);
      expect(r.azCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('AC-7.4: continent is in the enum; MVP geographyType is "commercial"', () => {
    for (const r of raw.regions) {
      expect(CONTINENTS).toContain(r.continent);
      expect(r.geographyType).toBe('commercial'); // OQ5: MVP dataset is commercial-only
    }
  });

  it('AC-7.5: accuracyNote states coords are approximate, NOT datacenter', () => {
    const note = (
      raw.regions[0].provenance?.accuracyNote ?? raw.datasetProvenance.accuracyNote
    ).toLowerCase();
    expect(note).toContain('approximate');
    expect(note).toContain('not');
    expect(note).toContain('datacenter');
  });
});
