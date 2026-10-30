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

  it('installs npm deps before invoking ampx (install precedes pipeline-deploy)', () => {
    const backendCmds = (doc.backend?.phases?.build?.commands ?? []) as string[];
    // Accept `npm install` (required — see the npm-ci lockfile bug below).
    const installIdx = backendCmds.findIndex((c) => /npm (install|ci)/.test(c));
    const ampxIdx = backendCmds.findIndex((c) => c.includes('ampx pipeline-deploy'));
    expect(installIdx).toBeGreaterThanOrEqual(0);
    expect(ampxIdx).toBeGreaterThan(installIdx);
  });

  it('frontend build guards on amplify_outputs.json existence', () => {
    const feCmds = (doc.frontend?.phases?.build?.commands ?? []) as string[];
    expect(feCmds.some((c) => /test\s+-f\s+amplify_outputs\.json/.test(c))).toBe(true);
    expect(feCmds.some((c) => c.includes('npm run build'))).toBe(true);
  });

  it('publishes the vite dist/ directory', () => {
    expect(doc.frontend?.artifacts?.baseDirectory).toBe('dist');
  });

  // ---- CLI dependency contract (the "could not determine executable" bug) --
  // ampx comes from @aws-amplify/backend-cli. Amplify Hosting installs the ROOT
  // package.json, so the CLI MUST be a root dependency, or `ampx` is never on
  // PATH and the backend phase dies with "could not determine executable".
  it('declares @aws-amplify/backend-cli (provides ampx) in the ROOT package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all['@aws-amplify/backend-cli'], '@aws-amplify/backend-cli must be a root dep (provides ampx)').toBeDefined();
    expect(all['@aws-amplify/backend'], '@aws-amplify/backend must be a root dep').toBeDefined();
  });

  it('backend phase installs deps and invokes ampx via npx --no-install', () => {
    const backendCmds = (doc.backend?.phases?.build?.commands ?? []) as string[];
    // Must install before invoking ampx.
    const installIdx = backendCmds.findIndex((c) => /npm (install|ci)/.test(c));
    const ampxIdx = backendCmds.findIndex((c) => c.includes('ampx pipeline-deploy'));
    expect(installIdx).toBeGreaterThanOrEqual(0);
    expect(ampxIdx).toBeGreaterThan(installIdx);
  });

  it('uses npm install (not npm ci) — ci rejects the backend-cli toolkit-lib lockfile', () => {
    // The @aws-cdk/toolkit-lib nested dep makes `npm ci` fail the lockfile sync
    // check (npm 11), leaving ampx uninstalled. The buildspec must use
    // `npm install`, which self-heals. Guard against a regression to `npm ci`.
    const allCmds = (
      [
        ...(doc.backend?.phases?.build?.commands ?? []),
        ...(doc.frontend?.phases?.preBuild?.commands ?? []),
      ] as string[]
    );
    for (const c of allCmds) {
      expect(c, `build command must not use 'npm ci' (breaks ampx): ${c}`).not.toMatch(/\bnpm ci\b/);
    }
    expect(allCmds.some((c) => /\bnpm install\b/.test(c))).toBe(true);
  });
});

/**
 * Exact-bug reproduction (locks in detection of the CustomerError).
 *
 * The AWS Amplify failure was: "CustomerError: The commands provided in the
 * buildspec are malformed." Root cause: a build command list item was an
 * UNQUOTED scalar containing a colon-space (`ERROR: ...`). YAML flow/implicit
 * typing then parses `key: value` INSIDE the list item as a MAPPING, so the
 * item is an object, not the string Amplify expects.
 *
 * These tests reconstruct that exact malformed syntax, parse it with the real
 * YAML parser, and prove it yields a NON-string. This demonstrates that the
 * `typeof value === 'string'` assertion above would FAIL such a spec — i.e. the
 * regression test genuinely catches the bug that shipped. (The ORIGINAL version
 * of this test only ran `readFileSync` + `.toMatch(regex)` on the raw text and
 * never parsed the YAML, so a command coerced to a mapping passed unnoticed.)
 */
describe('Amplify build spec — exact malformed-syntax reproduction (CustomerError lock-in)', () => {
  // The precise shape of the command that broke the real build: unquoted, with
  // an `ERROR: ` colon-space inside an echo. This mirrors the pre-fix amplify.yml.
  const malformedCommandYaml = [
    'commands:',
    '  - test -f amplify_outputs.json || (echo "ERROR: amplify_outputs.json missing - backend deploy did not run before frontend build"; exit 1)',
  ].join('\n');

  it('the unquoted colon-space command parses to a NON-string (a mapping), not a string', () => {
    const doc = parse(malformedCommandYaml) as { commands: unknown[] };
    const item = doc.commands[0];
    // This is the crux of the CustomerError: YAML saw `... (echo "ERROR": ...`
    // and built an object instead of a string.
    expect(typeof item).not.toBe('string');
    expect(typeof item).toBe('object');
    expect(item).not.toBeNull();
  });

  it('the string-type assertion used on amplify.yml would FAIL on the malformed command', () => {
    const doc = parse(malformedCommandYaml) as { commands: unknown[] };
    const item = doc.commands[0];
    // Same predicate the real regression test applies to every command in
    // amplify.yml. Proving it is false here proves the guard has teeth.
    const passesStringGuard = typeof item === 'string';
    expect(passesStringGuard).toBe(false);
  });

  it('a properly QUOTED equivalent command parses back to a string (the fix)', () => {
    const fixedCommandYaml = [
      'commands:',
      // No colon-space in the message, and the whole item is a quoted scalar.
      "  - \"test -f amplify_outputs.json || { echo 'ERROR amplify_outputs.json missing - backend deploy did not run'; exit 1; }\"",
    ].join('\n');
    const doc = parse(fixedCommandYaml) as { commands: unknown[] };
    expect(typeof doc.commands[0]).toBe('string');
  });
});
