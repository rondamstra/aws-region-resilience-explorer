/**
 * Contract — the app is a STATIC SPA on Amplify platform WEB (not WEB_COMPUTE).
 *
 * This React/Vite app has NO server-side rendering. Per AWS Amplify docs,
 * `WEB` is for static apps and `WEB_COMPUTE` is only for SSR. The Gen 2 backend
 * (Cognito pool + map auth role) is deployed by `ampx pipeline-deploy` in the
 * build's backend phase — that does NOT require WEB_COMPUTE.
 *
 * These gates ensure no script/doc/test tells an operator to use WEB_COMPUTE,
 * and that the bootstrap script can NEVER silently change an app's platform.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const bootstrap = resolve(root, 'scripts/account-bootstrap.sh');

describe('Amplify platform contract — static SPA stays WEB', () => {
  it('no tracked file INSTRUCTS switching to WEB_COMPUTE (explanatory mentions ok)', () => {
    // We allow mentions that explicitly tell operators NOT to use WEB_COMPUTE,
    // or that guard against it. We forbid instructions TO set/use WEB_COMPUTE.
    let hits = '';
    try {
      hits = execSync(
        "git grep -nI 'WEB_COMPUTE' -- . ':(exclude)tests/contract/platformWeb.test.ts'",
        { cwd: root, encoding: 'utf8' },
      );
    } catch (e: unknown) {
      hits = (e as { stdout?: string }).stdout ?? '';
    }
    const offending = hits
      .split('\n')
      .filter((l) => l.trim())
      // Keep only lines that READ as an instruction to adopt WEB_COMPUTE.
      .filter((l) =>
        /(set|switch|use|platform).{0,20}WEB_COMPUTE/i.test(l) &&
        !/do ?not|don't|NOT (switch|use|change|require)|expected|not WEB_COMPUTE|!=|==/i.test(l),
      );
    expect(offending, `WEB_COMPUTE instruction found:\n${offending.join('\n')}`).toEqual([]);
  });

  it('account-bootstrap.sh exists', () => {
    expect(existsSync(bootstrap)).toBe(true);
  });

  const script = existsSync(bootstrap) ? readFileSync(bootstrap, 'utf8') : '';

  it('bootstrap update-app sets ONLY the service role — never --platform', () => {
    // Every `aws amplify update-app` invocation in the script must NOT carry a
    // --platform flag, so it can never mutate an existing app's platform.
    const updateAppLines = script
      .split('\n')
      .filter((l) => l.includes('amplify update-app'));
    expect(updateAppLines.length).toBeGreaterThan(0);
    for (const line of updateAppLines) {
      expect(line, `update-app must not pass --platform: ${line}`).not.toMatch(/--platform/);
      expect(line).toMatch(/--iam-service-role-arn/);
    }
  });

  it('bootstrap reads the current platform (non-mutating) and notes WEB is expected', () => {
    expect(script).toMatch(/get-app .*--query app\.platform/);
    expect(script).toMatch(/will NOT change it|NOT change/i);
  });

  it('bootstrap documents running from a separate admin machine (no admin creds on KC VM)', () => {
    // Normalize whitespace (the guidance spans multiple comment lines).
    const flat = script.replace(/\s+/g, ' ').toLowerCase();
    expect(flat).toMatch(/separate,? trusted admin machine/);
    expect(flat).toMatch(/administrator credentials must never be stored/);
    expect(flat).toMatch(/kiro crew vm/);
  });
});
