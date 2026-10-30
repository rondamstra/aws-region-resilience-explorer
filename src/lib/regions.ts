/**
 * Test-facing entry point for the data loader.
 *
 * `tests/unit/dataLoader.test.ts` imports `loadRegions(raw: unknown): RegionDataset`
 * from `src/lib/regions` — a SYNCHRONOUS validator that asserts
 * `schemaVersion === 1` and returns the dataset (throwing on violation).
 *
 * The app's runtime fetch-with-fallback loader is the async `loadRegions` in
 * `src/data/loadRegions.ts`; to avoid a name clash while matching the test's
 * expected signature, this module exposes the synchronous `validateDataset`
 * implementation under the name `loadRegions`. No logic is duplicated.
 */
export { validateDataset as loadRegions, SchemaMismatchError } from '../data/loadRegions';
export type { RegionDataset, Region } from '../data/types';
