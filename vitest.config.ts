/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Root Vitest config. Folds in tests/vitest.config.proposal.ts from map-tester.
// Test files live under tests/ (owned by map-tester); modules under test live
// in src/ (owned by map-frontend).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/data/geo.ts', 'src/data/loadRegions.ts', 'src/data/filters.ts'],
      reporter: ['text', 'html'],
    },
  },
});
