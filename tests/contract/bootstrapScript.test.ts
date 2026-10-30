/**
 * Contract/regression — scripts/account-bootstrap.sh behavior.
 *
 * Guards two fixed defects and the safety invariants:
 *   - DEFECT 1: dry-run with --app-id wrongly reported "skipped (no --app-id)".
 *     Fixed: step-3 gating keys off --app-id, not the not-yet-created ROLE_ARN.
 *   - DEFECT 2: dry-run printed "Bootstrap complete" (implying success). Fixed:
 *     a dry-run-aware banner that says NO changes were made.
 *
 * These are STATIC checks of the script source (the script's control flow and
 * messages), plus structure. They run offline. The scenarios that need real AWS
 * (actual execution, insufficient IAM, association failure, idempotent rerun
 * against a live stack) are asserted at the LOGIC level here and flagged as
 * LIVE-required for true end-to-end proof (see tests/README.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.cwd(), 'scripts/account-bootstrap.sh');
const src = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('account-bootstrap.sh — dry-run defects + safety (regression)', () => {
  it('script exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  // DEFECT 1 — step 3 gates on APP_ID, not ROLE_ARN.
  it('step 3 associates based on --app-id (not ROLE_ARN), so dry-run+app-id is not skipped', () => {
    // The association block must be guarded by APP_ID presence alone.
    expect(src).toMatch(/if \[ -n "\$APP_ID" \]; then\s*\n\s*echo "== 3\. Associate role/);
    // And it must NOT re-use the old `[ -n "$APP_ID" ] && [ -n "$ROLE_ARN" ]` gate.
    expect(src).not.toMatch(/if \[ -n "\$APP_ID" \] && \[ -n "\$ROLE_ARN" \]; then/);
  });

  it('dry-run predicts the ServiceRoleArn instead of querying a non-existent stack', () => {
    expect(src).toMatch(/DRY_RUN" -eq 1 \][\s\S]*?predicted|dry-run; not yet created/);
  });

  // DEFECT 2 — dry-run banner must not claim completion.
  it('dry-run completion banner states NO changes were made (not "Bootstrap complete")', () => {
    expect(src).toMatch(/DRY-RUN complete: NO changes were made/);
    // The success banner is gated to the non-dry-run branch.
    expect(src).toMatch(/if \[ "\$DRY_RUN" -eq 1 \]; then\s*\n\s*echo "== DRY-RUN complete/);
  });

  // Safety: fails safely; never mutates platform.
  it('uses strict bash mode (set -euo pipefail) so a failed AWS call aborts', () => {
    expect(src).toMatch(/set -euo pipefail/);
  });

  it('update-app never passes --platform (never mutates hosting platform)', () => {
    const updateLines = src.split('\n').filter((l) => l.includes('amplify update-app'));
    expect(updateLines.length).toBeGreaterThan(0);
    for (const l of updateLines) expect(l).not.toMatch(/--platform/);
  });

  it('real (non-dry-run) association verifies the saved ARN and exits 1 on mismatch', () => {
    expect(src).toMatch(/SAVED" = "\$ROLE_ARN" \][\s\S]*?VERIFIED[\s\S]*?exit 1/);
  });

  it('requires --profile and --region (fails safely on missing args)', () => {
    expect(src).toMatch(/-n "\$PROFILE" \] && \[ -n "\$REGION" \] \|\|[\s\S]*?exit 2/);
  });

  it('CDK bootstrap gate requires version >= 6', () => {
    expect(src).toMatch(/-lt 6/);
  });
});
