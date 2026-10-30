import {
  EXPECTED_SCHEMA_VERSION,
  type Region,
  type RegionDataset,
} from './types';

/**
 * Region dataset loader.
 *
 * The real dataset (`data/regions.v1.json`) is OWNED and PRODUCED by map-data.
 * This frontend consumes it READ-ONLY and asserts `schemaVersion === 1` at load
 * (DATA_CONTRACT §7). To keep the frontend buildable/typecheckable in parallel
 * before the real dataset exists, we fall back to a committed sample fixture.
 *
 * Resolution order:
 *   1. The real dataset served at `${BASE_URL}regions.v1.json` (fetched at
 *      runtime; map-data copies/ships it to `public/`).
 *   2. If absent/unreachable, the bundled sample fixture
 *      (`src/__fixtures__/regions.sample.json`) — clearly a placeholder.
 *
 * Either way the document is validated against the schema contract before use.
 */

// Build-time import of the sample fixture guarantees the app builds with no
// real dataset present. `resolveJsonModule` + `import ... with { type: 'json' }`.
import sampleFixture from '../__fixtures__/regions.sample.json' with { type: 'json' };

/** Thrown when a loaded dataset does not satisfy the frozen contract. */
export class SchemaMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaMismatchError';
  }
}

/** Result of a load, flagging whether real data or the fallback was used. */
export interface LoadResult {
  dataset: RegionDataset;
  /** True when the committed sample fixture was used (no real dataset found). */
  usedFixture: boolean;
}

/**
 * Validate and narrow an unknown value to a {@link RegionDataset}.
 *
 * Asserts `schemaVersion === EXPECTED_SCHEMA_VERSION` and that `regions` is an
 * array. Field-level validation is the producer's + CI's responsibility
 * (DATA_CONTRACT §7); this guards the version seam the consumer depends on.
 *
 * @throws {SchemaMismatchError} If the version or top-level shape is wrong.
 */
export function assertDataset(value: unknown): asserts value is RegionDataset {
  if (typeof value !== 'object' || value === null) {
    throw new SchemaMismatchError('dataset is not an object');
  }
  const doc = value as Record<string, unknown>;
  if (doc.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new SchemaMismatchError(
      `schemaVersion mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${String(doc.schemaVersion)}`,
    );
  }
  if (!Array.isArray(doc.regions)) {
    throw new SchemaMismatchError('dataset.regions is not an array');
  }
}

/**
 * Synchronous validator form: assert that `raw` satisfies the frozen contract
 * (`schemaVersion === 1`, `regions` is an array) and return it narrowed to a
 * {@link RegionDataset}.
 *
 * This mirrors the `loadRegions(raw: unknown): RegionDataset` shape the test
 * suite assumes (`tests/unit/dataLoader.test.ts`) and is re-exported from
 * `src/lib/regions.ts`. The async {@link loadRegions} below is the runtime
 * fetch-with-fallback used by the app.
 *
 * @param raw - An untrusted parsed JSON value.
 * @returns The same value, narrowed to {@link RegionDataset}.
 * @throws {SchemaMismatchError} If the version or top-level shape is wrong.
 */
export function validateDataset(raw: unknown): RegionDataset {
  assertDataset(raw);
  return raw;
}

/** Return the bundled sample fixture, validated. */
export function loadFixtureDataset(): RegionDataset {
  const value: unknown = sampleFixture;
  assertDataset(value);
  return value;
}

/**
 * Load the Region dataset, preferring the real file and falling back to the
 * bundled fixture if it is not reachable.
 *
 * @param baseUrl - Base URL for static assets (defaults to Vite's `BASE_URL`).
 * @returns The validated dataset and whether the fixture fallback was used.
 */
export async function loadRegions(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<LoadResult> {
  const url = `${baseUrl}regions.v1.json`;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) {
      const value: unknown = await res.json();
      assertDataset(value);
      return { dataset: value, usedFixture: false };
    }
  } catch {
    // Network/parse error — fall through to the fixture.
  }
  return { dataset: loadFixtureDataset(), usedFixture: true };
}

/** Convenience: extract the region list from a dataset. */
export function regionsOf(dataset: RegionDataset): Region[] {
  return dataset.regions;
}
