/**
 * PROPOSAL config — NOT the final root config.
 *
 * The lead should FOLD this `test` block into the frontend's root
 * `vite.config.ts` (or add a root `vitest.config.ts`) rather than shipping two
 * configs. Paths here assume this file is referenced from the repo root.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      // Highest-value coverage targets per MVP_PLAN §3.
      include: ['src/lib/haversine*', 'src/lib/regions*', 'src/lib/filters*'],
      reporter: ['text', 'html'],
    },
  },
});
