/**
 * Metadata filter controls (Feature 5, ARCHITECTURE.md §1).
 *
 * Keyboard-accessible form controls for continent, launch-year range, minimum
 * AZ count and geography type. Criteria are AND-combined by `filterRegions`.
 * Changing any control updates the on-map marker set.
 */
import { useId, useMemo } from 'react';
import type { Region } from '../data/types';
import type { FilterCriteria } from '../data/filters';

interface RegionFiltersProps {
  /** All Regions (used to derive the selectable option sets). */
  regions: Region[];
  filters: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
  /** Count of Regions currently matching, for the live summary. */
  matchCount: number;
}

export default function RegionFilters({
  regions,
  filters,
  onChange,
  matchCount,
}: RegionFiltersProps) {
  const ids = {
    continent: useId(),
    minYear: useId(),
    maxYear: useId(),
    minAz: useId(),
    geo: useId(),
  };

  const continents = useMemo(
    () => Array.from(new Set(regions.map((r) => r.continent))).sort(),
    [regions],
  );
  const geographyTypes = useMemo(
    () => Array.from(new Set(regions.map((r) => r.geographyType))).sort(),
    [regions],
  );
  const years = useMemo(() => regions.map((r) => r.launchYear), [regions]);
  const minYearAvail = years.length ? Math.min(...years) : 2006;
  const maxYearAvail = years.length ? Math.max(...years) : new Date().getFullYear();
  const azValues = useMemo(
    () => Array.from(new Set(regions.map((r) => r.azCount))).sort((a, b) => a - b),
    [regions],
  );

  const patch = (p: Partial<FilterCriteria>) => onChange({ ...filters, ...p });

  const numOrUndef = (v: string): number | undefined =>
    v === '' ? undefined : Number(v);

  const anyActive =
    filters.continent !== undefined ||
    filters.geographyType !== undefined ||
    filters.minLaunchYear !== undefined ||
    filters.maxLaunchYear !== undefined ||
    filters.minAzCount !== undefined;

  return (
    <section className="filters" aria-labelledby="filters-heading">
      <h2 id="filters-heading" className="filters__heading">
        Filter Regions
      </h2>

      <div className="filters__grid">
        <div className="filters__field">
          <label htmlFor={ids.continent}>Continent</label>
          <select
            id={ids.continent}
            data-testid="filter-continent"
            value={filters.continent ?? ''}
            onChange={(e) =>
              patch({ continent: e.target.value === '' ? undefined : e.target.value })
            }
          >
            <option value="">All continents</option>
            {continents.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="filters__field">
          <label htmlFor={ids.geo}>Geography type</label>
          <select
            id={ids.geo}
            data-testid="filter-geography"
            value={filters.geographyType ?? ''}
            onChange={(e) =>
              patch({
                geographyType: e.target.value === '' ? undefined : e.target.value,
              })
            }
          >
            <option value="">All types</option>
            {geographyTypes.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="filters__field">
          <label htmlFor={ids.minYear}>Launched from</label>
          <input
            id={ids.minYear}
            data-testid="filter-min-year"
            type="number"
            inputMode="numeric"
            min={minYearAvail}
            max={maxYearAvail}
            placeholder={String(minYearAvail)}
            value={filters.minLaunchYear ?? ''}
            onChange={(e) => patch({ minLaunchYear: numOrUndef(e.target.value) })}
          />
        </div>

        <div className="filters__field">
          <label htmlFor={ids.maxYear}>Launched to</label>
          <input
            id={ids.maxYear}
            data-testid="filter-max-year"
            type="number"
            inputMode="numeric"
            min={minYearAvail}
            max={maxYearAvail}
            placeholder={String(maxYearAvail)}
            value={filters.maxLaunchYear ?? ''}
            onChange={(e) => patch({ maxLaunchYear: numOrUndef(e.target.value) })}
          />
        </div>

        <div className="filters__field">
          <label htmlFor={ids.minAz}>Min. Availability Zones</label>
          <select
            id={ids.minAz}
            data-testid="filter-min-az"
            value={filters.minAzCount ?? ''}
            onChange={(e) => patch({ minAzCount: numOrUndef(e.target.value) })}
          >
            <option value="">Any</option>
            {azValues.map((az) => (
              <option key={az} value={az}>
                {az}+
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="filters__footer">
        <p className="filters__count" aria-live="polite">
          {matchCount} Region{matchCount === 1 ? '' : 's'} match
        </p>
        <button
          type="button"
          className="filters__reset"
          onClick={() => onChange({})}
          disabled={!anyActive}
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}
