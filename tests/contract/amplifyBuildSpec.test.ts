/**
 * Regression — Amplify Hosting build spec (amplify.yml).
 *
 * Guards the ROOT CAUSE of the OSM-fallback bug on the deployed test branch:
 * the frontend inlines amplify_outputs.json at BUILD TIME (Vite eager glob), so
 * if Amplify Hosting does not deploy the Gen 2 backend BEFORE the frontend
 * build, the outputs file is absent, the Cognito config is empty, and the app
 * silently falls back to the no-auth OSM basemap.
 *
 * These assertions fail if the build spec regresses to an ordering/guard that
 * would reintroduce the fallback.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const specPath = resolve(process.cwd(), 'amplify.yml');

describe('Amplify Hosting build spec (regression)', () => {
  it('amplify.yml exists at the repo root', () => {
    expect(existsSync(specPath)).toBe(true);
  });

  const spec = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';

  it('has a backend phase that runs ampx pipeline-deploy (generates amplify_outputs.json)', () => {
    expect(spec).toMatch(/^backend:/m);
    expect(spec).toMatch(/ampx\s+pipeline-deploy/);
  });

  it('runs the backend phase BEFORE the frontend phase (so outputs exist at build)', () => {
    const backendIdx = spec.indexOf('backend:');
    const frontendIdx = spec.indexOf('frontend:');
    expect(backendIdx).toBeGreaterThanOrEqual(0);
    expect(frontendIdx).toBeGreaterThan(backendIdx);
  });

  it('guards the frontend build on amplify_outputs.json being present', () => {
    // A hard check that fails the build instead of silently shipping OSM.
    expect(spec).toMatch(/test\s+-f\s+amplify_outputs\.json/);
  });

  it('frontend build runs the vite build and publishes dist/', () => {
    expect(spec).toMatch(/npm run build/);
    expect(spec).toMatch(/baseDirectory:\s*dist/);
  });
});
