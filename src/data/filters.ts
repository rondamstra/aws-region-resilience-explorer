/**
 * Pure region filtering (Feature 5, ARCHITECTURE.md §1).
 *
 * Filters the visible Regions by verified metadata from the dataset:
 * continent, launch-year range, minimum AZ count and geography type. All
 * supplied criteria are AND-combined; an `undefined` field is a no-op; an
 * empty result set is a valid outcome (not an error).
 *
 * This is the implementation; `src/lib/filters.ts` re-exports it at the path
 * the test suite assumes (`tests/unit/filters.test.ts`).
 */
import type { Region } from './types';

/**
 * Filter criteria. Every field is optional; a missing field does not filter.
 * Criteria are combined with logical AND.
 */
export interface FilterCriteria {
  /** Keep only Regions on this continent (exact match). */
  continent?: string;
  /** Keep only Regions with `launchYear >= minLaunchYear`. */
  minLaunchYear?: number;
  /** Keep only Regions with `launchYear <= maxLaunchYear`. */
  maxLaunchYear?: number;
  /** Keep only Regions with `azCount >= minAzCount`. */
  minAzCount?: number;
  /** Keep only Regions with this geography type (exact match). */
  geographyType?: string;
}

/**
 * Return the subset of `regions` matching every supplied criterion.
 *
 * Pure: it does not mutate its inputs. Undefined criteria are ignored; an
 * empty array is a valid return value.
 *
 * @param regions - Source Region records.
 * @param criteria - AND-combined filter criteria (any subset).
 * @returns A new array of matching Regions (order preserved).
 */
export function filterRegions<T extends Pick<Region, 'continent' | 'launchYear' | 'azCount' | 'geographyType'>>(
  regions: readonly T[],
  criteria: FilterCriteria = {},
): T[] {
  const { continent, minLaunchYear, maxLaunchYear, minAzCount, geographyType } = criteria;

  return regions.filter((r) => {
    if (continent !== undefined && r.continent !== continent) return false;
    if (minLaunchYear !== undefined && r.launchYear < minLaunchYear) return false;
    if (maxLaunchYear !== undefined && r.launchYear > maxLaunchYear) return false;
    if (minAzCount !== undefined && r.azCount < minAzCount) return false;
    if (geographyType !== undefined && r.geographyType !== geographyType) return false;
    return true;
  });
}
