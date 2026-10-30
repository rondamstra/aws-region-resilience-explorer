/**
 * Test-facing entry point for region filtering.
 *
 * `tests/unit/filters.test.ts` imports `filterRegions` from `src/lib/filters`.
 * The implementation lives in `src/data/filters.ts`; this module only
 * re-exports it (single source of truth, no duplication).
 */
export { filterRegions } from '../data/filters';
export type { FilterCriteria } from '../data/filters';
