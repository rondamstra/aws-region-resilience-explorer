/**
 * Contract — deployment scripts + repo-wide secret / private-identifier scan.
 *
 * GATE 4 — scripts/preflight.sh and scripts/account-bootstrap.sh:
 *   - are tracked and present,
 *   - have the git executable bit set (index mode 100755),
 *   - contain no real account id / profile / private host.
 *
 * GATE 7 — no TRACKED source file (excluding .forgejo-sync.log, which is a
 *   generated sync log, and this test + the preflight scanner, which both
 *   legitimately contain the forbidden literals in order to search for them)
 *   contains a real AWS account id, the real AWS profile name, a forgejo owner
 *   url, or a 192.168.* private host.
 *
 * File enumeration uses `git ls-files` so ONLY tracked files are scanned
 * (untracked scratch / amplify_outputs.json / node_modules are out of scope by
 * construction), and the git index mode is read for the executable-bit check so
 * the result does not depend on a particular checkout's umask.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

/** Tracked files, as reported by git. */
function trackedFiles(): string[] {
  return git(['ls-files'])
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Git index entries: `<mode> <sha> <stage>\t<path>`. */
function indexMode(path: string): string | undefined {
  const line = git(['ls-files', '-s', '--', path]).trim();
  if (!line) return undefined;
  return line.split(/\s+/)[0]; // e.g. "100755"
}

// ── Forbidden private identifiers (real values that must never be committed) ──
// Patterns are assembled from fragments so this test file does not itself
// contain a literal match (and so is not excluded from its own scan on a
// substring basis — it is excluded explicitly by path below instead).
const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: 'real AWS account id 6834…', re: new RegExp(['6', '83444362393'].join('')) },
  { label: 'real AWS account id 5650…', re: new RegExp(['5', '65036926641'].join('')) },
  { label: 'real AWS profile name', re: new RegExp(['morbv', 'customer'].join('-')) },
  { label: 'forgejo owner url', re: /forgejo:[a-z0-9_-]+/i },
  { label: 'private 192.168.* host', re: /192\.168\.\d{1,3}\.\d{1,3}/ },
];

// Files that legitimately contain the forbidden literals because they EXIST to
// search for them. Excluding them by path (not by content) keeps the scan
// honest for every other file.
const SCAN_EXCLUDE = new Set<string>([
  '.forgejo-sync.log',
  'scripts/preflight.sh',
  'tests/contract/secretScan.test.ts',
]);

describe('Gate 4 — deployment scripts exist, are executable, and are clean', () => {
  const scripts = ['scripts/preflight.sh', 'scripts/account-bootstrap.sh'];

  it('both scripts are tracked by git', () => {
    const tracked = new Set(trackedFiles());
    for (const s of scripts) {
      expect(tracked.has(s), `${s} must be tracked`).toBe(true);
    }
  });

  it('both scripts have the git executable bit set (index mode 100755)', () => {
    for (const s of scripts) {
      expect(indexMode(s), `${s} must be mode 100755 in the git index`).toBe('100755');
    }
  });

  it('account-bootstrap.sh hardcodes no real account id / profile / private host', () => {
    // preflight.sh is the SCANNER: it legitimately contains the forbidden
    // literals as its git-grep pattern, so it is checked by Gate 7's path-based
    // exclusion, not by a literal-content scan here. account-bootstrap.sh has no
    // such excuse and must be fully clean.
    const text = readFileSync(resolve(root, 'scripts/account-bootstrap.sh'), 'utf8');
    for (const { label, re } of FORBIDDEN) {
      expect(re.test(text), `account-bootstrap.sh must not contain ${label}`).toBe(false);
    }
  });
});

describe('Gate 7 — repo-wide secret / private-identifier scan (tracked files)', () => {
  it('no tracked source file contains a real account id / profile / forgejo url / 192.168.* host', () => {
    const files = trackedFiles().filter((f) => !SCAN_EXCLUDE.has(f));
    const offenders: string[] = [];
    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(resolve(root, f), 'utf8');
      } catch {
        continue; // binary / unreadable — skip
      }
      for (const { label, re } of FORBIDDEN) {
        const m = text.match(re);
        if (m) {
          // Report file + the 1-based line of the first match.
          const idx = text.indexOf(m[0]);
          const line = text.slice(0, idx).split('\n').length;
          offenders.push(`${f}:${line} — ${label}`);
        }
      }
    }
    expect(offenders, `private identifiers found in tracked files:\n${offenders.join('\n')}`).toHaveLength(0);
  });

  it('actually scanned a non-trivial set of tracked files (guard against an empty scan)', () => {
    const files = trackedFiles().filter((f) => !SCAN_EXCLUDE.has(f));
    expect(files.length).toBeGreaterThan(10);
  });

  it('the scan has teeth — the FORBIDDEN patterns match their target strings', () => {
    // Prove each pattern would catch its real value if it ever appeared.
    expect(FORBIDDEN[0].re.test(['6', '83444362393'].join(''))).toBe(true);
    expect(FORBIDDEN[1].re.test(['5', '65036926641'].join(''))).toBe(true);
    expect(FORBIDDEN[2].re.test(['morbv', 'customer'].join('-'))).toBe(true);
    expect(FORBIDDEN[3].re.test('forgejo:someowner')).toBe(true);
    expect(FORBIDDEN[4].re.test('192.168.1.42')).toBe(true);
  });
});
