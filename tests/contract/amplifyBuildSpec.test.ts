/**
 * Regression — Amplify Hosting build spec (amplify.yml), validated with a REAL
 * YAML parser (not string matching).
 *
 * Guards TWO failures seen in the deployed test branch:
 *
 * 1. OSM fallback — the frontend inlines amplify_outputs.json at BUILD TIME
 *    (Vite eager glob). If the Gen 2 backend is not deployed BEFORE the
 *    frontend build, the file is absent and the app silently serves the no-auth
 *    OSM basemap. So the backend phase must run `ampx pipeline-deploy` before
 *    the frontend build, and the frontend build must guard on the file.
 *
 * 2. Malformed buildspec — an unquoted command containing a colon-space (e.g.
 *    "echo ERROR: ...") is parsed by YAML as a MAPPING, not a string, which
 *    Amplify rejects ("commands are malformed"). Every command must parse as a
 *    STRING scalar. A string-only regex test missed this; we now PARSE the YAML
 *    and assert each command's runtime type is string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const specPath = resolve(process.cwd(), 'amplify.yml');

interface Phase {
  commands?: unknown[];
}
interface PhaseGroup {
  phases?: Record<string, Phase>;
}
interface BuildSpec {
  version?: number;
  backend?: PhaseGroup;
  frontend?: PhaseGroup & { artifacts?: { baseDirectory?: string } };
}

const raw = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';

describe('Amplify build spec — real YAML validation (regression)', () => {
  it('amplify.yml exists at the repo root', () => {
    expect(existsSync(specPath)).toBe(true);
  });

  it('parses as valid YAML (no malformed/mapping coercion)', () => {
    expect(() => parse(raw)).not.toThrow();
    const doc = parse(raw) as BuildSpec;
    expect(doc).toBeTypeOf('object');
    expect(doc.backend).toBeDefined();
    expect(doc.frontend).toBeDefined();
  });

  const doc = raw ? (parse(raw) as BuildSpec) : ({} as BuildSpec);

  const allCommands = (): { path: string; value: unknown }[] => {
    const out: { path: string; value: unknown }[] = [];
    for (const group of ['backend', 'frontend'] as const) {
      const phases = doc[group]?.phases ?? {};
      for (const [phase, body] of Object.entries(phases)) {
        (body.commands ?? []).forEach((c, i) =>
          out.push({ path: `${group}.${phase}[${i}]`, value: c }),
        );
      }
    }
    return out;
  };

  it('EVERY build command parses as a string (not a mapping — the colon-space bug)', () => {
    const cmds = allCommands();
    expect(cmds.length).toBeGreaterThan(0);
    for (const { path, value } of cmds) {
      expect(typeof value, `${path} must be a string, got ${typeof value}: ${JSON.stringify(value)}`).toBe('string');
    }
  });

  it('runs the backend phase (ampx pipeline-deploy) BEFORE the frontend phase', () => {
    const keys = Object.keys(doc);
    expect(keys.indexOf('backend')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('frontend')).toBeGreaterThan(keys.indexOf('backend'));
    const backendCmds = (doc.backend?.phases?.build?.commands ?? []) as string[];
    expect(backendCmds.some((c) => c.includes('ampx pipeline-deploy'))).toBe(true);
  });

  it('installs npm deps before invoking ampx (npm ci precedes pipeline-deploy)', () => {
    const backendCmds = (doc.backend?.phases?.build?.commands ?? []) as string[];
    const ciIdx = backendCmds.findIndex((c) => c.startsWith('npm ci'));
    const ampxIdx = backendCmds.findIndex((c) => c.includes('ampx pipeline-deploy'));
    expect(ciIdx).toBeGreaterThanOrEqual(0);
    expect(ampxIdx).toBeGreaterThan(ciIdx);
  });

  it('frontend build guards on amplify_outputs.json existence', () => {
    const feCmds = (doc.frontend?.phases?.build?.commands ?? []) as string[];
    expect(feCmds.some((c) => /test\s+-f\s+amplify_outputs\.json/.test(c))).toBe(true);
    expect(feCmds.some((c) => c.includes('npm run build'))).toBe(true);
  });

  it('publishes the vite dist/ directory', () => {
    expect(doc.frontend?.artifacts?.baseDirectory).toBe('dist');
  });
});
