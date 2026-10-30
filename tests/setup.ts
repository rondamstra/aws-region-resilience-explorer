/**
 * Vitest setup — referenced by vitest.config.proposal.ts.
 *
 * Extends `expect` with @testing-library/jest-dom matchers (toBeVisible,
 * toBeInTheDocument, toHaveAttribute, ...). Imported once per test run.
 */
import '@testing-library/jest-dom/vitest';
