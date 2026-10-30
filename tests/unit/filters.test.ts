/**
 * Unit — filter predicates.
 *
 * Covers AC-5.1 .. AC-5.5 (see tests/TEST_STRATEGY.md §3). Feature 5:
 * filter by continent, launchYear, azCount, geographyType; AND-combination;
 * empty result is valid, not an error.
 *
 * MODULE UNDER TEST (owned by map-frontend): `src/lib/filters`
 *   Assumed export:
 *     filterRegions(regions: RegionRecord[], criteria: FilterCriteria): RegionRecord[]
 *     type FilterCriteria = {
 *       continent?: string;
 *       minLaunchYear?: number;
 *       maxLaunchYear?: number;
 *       minAzCount?: number;
 *       geographyType?: string;
 *     }
 *   A pure function; filters are AND-combined; unknown/undefined criteria are no-ops.
 *
 * WIRED to the real filterRegions plus a block asserting against the real
 * 33-region dataset (e.g. continent='Europe' returns the actual EU regions).
 */
import { describe, it, expect } from 'vitest';
import { filterRegions } from '../../src/lib/filters';
import type { Continent, GeographyType } from '../../src/data/types';
import regionsRaw from '../../data/regions.v1.json' with { type: 'json' };

// The real filterRegions is generic over `T extends Pick<Region, ...>`, so the
// test record must use the real `Continent` / `GeographyType` unions (not bare
// `string`) for T to be inferred with its `regionCode` intact.
type RegionRecord = {
  regionCode: string;
  continent: Continent;
  launchYear: number;
  azCount: number;
  geographyType: GeographyType;
};

const REGIONS: RegionRecord[] = [
  { regionCode: 'us-east-1', continent: 'North America', launchYear: 2006, azCount: 6, geographyType: 'commercial' },
  { regionCode: 'eu-west-1', continent: 'Europe', launchYear: 2007, azCount: 3, geographyType: 'commercial' },
  { regionCode: 'ap-southeast-2', continent: 'Oceania', launchYear: 2012, azCount: 3, geographyType: 'commercial' },
  { regionCode: 'sa-east-1', continent: 'South America', launchYear: 2011, azCount: 3, geographyType: 'commercial' },
  { regionCode: 'eu-central-1', continent: 'Europe', launchYear: 2014, azCount: 3, geographyType: 'commercial' },
];

describe('filterRegions — metadata filters (AC-5.1 .. AC-5.5)', () => {
  it('AC-5.1: filter by continent returns only matching regions', () => {
    const out = filterRegions(REGIONS, { continent: 'Europe' });
    expect(out.map((r) => r.regionCode).sort()).toEqual(['eu-central-1', 'eu-west-1']);
  });

  it('AC-5.2: filter by launchYear bound returns only regions in range', () => {
    const out = filterRegions(REGIONS, { minLaunchYear: 2011, maxLaunchYear: 2012 });
    expect(out.map((r) => r.regionCode).sort()).toEqual(['ap-southeast-2', 'sa-east-1']);
  });

  it('AC-5.3: filter by minimum azCount returns only regions at/above threshold', () => {
    const out = filterRegions(REGIONS, { minAzCount: 6 });
    expect(out.map((r) => r.regionCode)).toEqual(['us-east-1']);
  });

  it('AC-5.4: filter by geographyType returns only matching regions', () => {
    const out = filterRegions(REGIONS, { geographyType: 'commercial' });
    expect(out).toHaveLength(REGIONS.length); // MVP data is all commercial
  });

  it('AC-5.5: combined filters are AND-conjunction', () => {
    const out = filterRegions(REGIONS, { continent: 'Europe', minAzCount: 3, maxLaunchYear: 2010 });
    expect(out.map((r) => r.regionCode)).toEqual(['eu-west-1']);
  });

  it('AC-5.5: an empty result set is valid (not an error)', () => {
    const out = filterRegions(REGIONS, { continent: 'Africa' });
    expect(out).toEqual([]); // valid empty state, no throw
  });

  it('empty/undefined criteria is a no-op returning all regions', () => {
    expect(filterRegions(REGIONS, {})).toHaveLength(REGIONS.length);
  });
});

/**
 * filterRegions against the REAL 33-region dataset (data/regions.v1.json).
 * Proves the predicate returns the ACTUAL EU regions, etc. — not a fixture.
 */
describe('filterRegions — against the real 33-region dataset (AC-5.1 .. AC-5.6)', () => {
  const ALL = (regionsRaw as unknown as { regions: RegionRecord[] }).regions;

  it('dataset has 33 commercial regions (sanity)', () => {
    expect(ALL).toHaveLength(33);
  });

  it('AC-5.1: continent=Europe returns exactly the real EU regions', () => {
    const out = filterRegions(ALL, { continent: 'Europe' }).map((r) => r.regionCode).sort();
    expect(out).toEqual([
      'eu-central-1',
      'eu-central-2',
      'eu-north-1',
      'eu-south-1',
      'eu-south-2',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
    ]);
  });

  it('AC-5.4: every region is commercial (MVP scope)', () => {
    expect(filterRegions(ALL, { geographyType: 'commercial' })).toHaveLength(ALL.length);
  });

  it('AC-5.3: minAzCount=6 isolates the real high-AZ region(s)', () => {
    const out = filterRegions(ALL, { minAzCount: 6 }).map((r) => r.regionCode);
    expect(out).toEqual(['us-east-1']);
  });

  it('AC-5.2: launchYear bound filters the real data', () => {
    const out = filterRegions(ALL, { maxLaunchYear: 2006 }).map((r) => r.regionCode);
    expect(out).toEqual(['us-east-1']); // us-east-1 is the only 2006 region
  });

  it('AC-5.5: combined AND filters on real data', () => {
    const out = filterRegions(ALL, { continent: 'Europe', maxLaunchYear: 2008 }).map((r) => r.regionCode);
    expect(out).toEqual(['eu-west-1']); // eu-west-1 launched 2007
  });

  it('AC-5.5: empty result is a valid empty array, not an error', () => {
    expect(filterRegions(ALL, { continent: 'Europe', minAzCount: 99 })).toEqual([]);
  });

  it('AC-5.6: filtering returns a subset (marker set shrinks)', () => {
    const subset = filterRegions(ALL, { continent: 'Oceania' });
    expect(subset.length).toBeGreaterThan(0);
    expect(subset.length).toBeLessThan(ALL.length);
  });
});
