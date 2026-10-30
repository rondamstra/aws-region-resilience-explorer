/**
 * Regression — Amazon Location API-key AllowActions format.
 *
 * Guards a real deploy failure: for CLASSIC Amazon Location maps, the API-key
 * `AllowActions` value MUST be the wildcard `geo:GetMap*`. The enumerated IAM
 * actions (geo:GetMapTile / geo:GetMapStyleDescriptor / geo:GetMapSprites /
 * geo:GetMapGlyphs) are valid IAM policy actions but are NOT accepted as
 * API-key AllowActions values — CreateKey fails with a misleading
 * "AccessDenied: no resource-based policy allows the action".
 *
 * This test reads amplify/backend.ts as source text (no AWS calls, no CDK
 * synth needed) and asserts the correct, least-privilege, read-only config so
 * the mistake cannot silently return.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs from the project root; resolve the backend source from there.
const backendSrc = readFileSync(
  resolve(process.cwd(), 'amplify/backend.ts'),
  'utf8',
);

describe('Amazon Location API-key restrictions (regression)', () => {
  it('uses the wildcard geo:GetMap* as the AllowActions value', () => {
    expect(backendSrc).toMatch(/allowActions:\s*\[\s*'geo:GetMap\*'\s*\]/);
  });

  it('does NOT use the enumerated geo:GetMap* sub-actions (invalid for API keys)', () => {
    for (const bad of [
      "'geo:GetMapTile'",
      "'geo:GetMapStyleDescriptor'",
      "'geo:GetMapSprites'",
      "'geo:GetMapGlyphs'",
    ]) {
      expect(backendSrc).not.toContain(bad);
    }
  });

  it('stays read-only — no write/delete or Places/Routes actions as key values', () => {
    // Match only quoted action VALUES (e.g. 'geo:PutGeofence'), not prose in
    // the explanatory comment that legitimately names the excluded actions.
    expect(backendSrc).not.toMatch(/'geo:Put[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:Delete[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:Update[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:SearchPlaceIndex[A-Za-z]*'|'geo:CalculateRoute[A-Za-z]*'/);
  });

  it('keeps the map-scoped AllowResources restriction (single map ARN)', () => {
    expect(backendSrc).toMatch(/allowResources:\s*\[map\.attrArn\]/);
  });

  it('keeps the HTTP referer restriction', () => {
    expect(backendSrc).toMatch(/allowReferers:\s*\[['"]https:\/\/\*\.amplifyapp\.com['"]\]/);
  });

  it('keeps the key expiring (noExpiry: false with an expireTime)', () => {
    expect(backendSrc).toMatch(/noExpiry:\s*false/);
    expect(backendSrc).toMatch(/expireTime:\s*'20\d\d-\d\d-\d\dT/);
  });

  it('does NOT wire a Cognito identity pool (API-key-only architecture)', () => {
    expect(backendSrc).not.toMatch(/defineAuth|auth\/resource/);
  });
});
