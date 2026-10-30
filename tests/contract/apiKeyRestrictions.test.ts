/**
 * Regression — Amazon Location Service Maps v2 (geo-maps) API-key restrictions.
 *
 * The backend migrated from CLASSIC Amazon Location maps (AWS::Location::Map +
 * geo:GetMap* key) to Amazon Location Service Maps v2 (the `geo-maps` service).
 * v2 is a MANAGED service: the Standard style is provider-managed, so there is
 * NO per-account CfnMap resource — only a restricted API key scoped to the
 * single geo-maps provider ARN.
 *
 * This test reads amplify/backend.ts as source text (no AWS calls, no CDK
 * synth needed) and asserts the correct v2 least-privilege, read-only config.
 * It is written to FAIL if someone reverts the backend to the classic shape
 * (geo:GetMap* actions, map/ resource ARN, or a CfnMap).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs from the project root; resolve the backend source from there.
const backendSrc = readFileSync(
  resolve(process.cwd(), 'amplify/backend.ts'),
  'utf8',
);

describe('Amazon Location Maps v2 (geo-maps) API-key restrictions (regression)', () => {
  it('uses the geo-maps:* catch-all as the AllowActions value', () => {
    expect(backendSrc).toMatch(/allowActions:\s*\[\s*'geo-maps:\*'\s*\]/);
  });

  it('does NOT use the classic geo:GetMap* wildcard (reverted to classic)', () => {
    expect(backendSrc).not.toMatch(/allowActions:\s*\[\s*'geo:GetMap\*'\s*\]/);
    expect(backendSrc).not.toContain("'geo:GetMap*'");
  });

  it('does NOT use the enumerated classic geo:GetMap* sub-actions', () => {
    for (const bad of [
      "'geo:GetMapTile'",
      "'geo:GetMapStyleDescriptor'",
      "'geo:GetMapSprites'",
      "'geo:GetMapGlyphs'",
    ]) {
      expect(backendSrc).not.toContain(bad);
    }
  });

  it('scopes AllowResources to the v2 provider ARN (double colon, no account id)', () => {
    // The literal v2 provider ARN must be present in source.
    expect(backendSrc).toContain(
      'arn:aws:geo-maps:eu-west-1::provider/default',
    );
    // ...and it must be the value wired into allowResources (via the
    // mapProviderArn constant).
    expect(backendSrc).toMatch(/allowResources:\s*\[\s*mapProviderArn\s*\]/);
  });

  it('does NOT carry any classic map/ resource ARN or CfnMap usage', () => {
    // No classic per-account map ARN (arn:aws:geo:...:map/...).
    expect(backendSrc).not.toMatch(/arn:aws:geo:[^']*:map\//);
    expect(backendSrc).not.toMatch(/resource\/map\//);
    // No classic map-scoped allowResources shape.
    expect(backendSrc).not.toMatch(/allowResources:\s*\[\s*map\.attrArn\s*\]/);
    // No CfnMap IMPORT or CONSTRUCTION — v2 has no per-account map resource.
    // (The explanatory comment legitimately names CfnMap in prose, so match
    // only real code shapes: an import binding or a `new CfnMap(...)`.)
    expect(backendSrc).not.toMatch(/import\s*\{[^}]*\bCfnMap\b[^}]*\}/);
    expect(backendSrc).not.toMatch(/new\s+CfnMap\b/);
  });

  it('stays read-only — geo-maps exposes only Get* actions; no write/delete', () => {
    // No geo-maps write/delete/update action values (there are none in the
    // service, but guard against a bad hand-edit).
    expect(backendSrc).not.toMatch(/'geo-maps:Put[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo-maps:Delete[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo-maps:Update[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo-maps:Create[A-Za-z]*'/);
    // No classic write/delete/update action values either.
    expect(backendSrc).not.toMatch(/'geo:Put[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:Delete[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:Update[A-Za-z]*'/);
    // No Places / Routes actions as key values (classic or v2 spellings).
    expect(backendSrc).not.toMatch(/'geo(-places|-routes|):SearchPlaceIndex[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo(-places|-routes|):CalculateRoute[A-Za-z]*'/);
  });

  it('keeps the HTTP referer restriction (referrer-locked)', () => {
    expect(backendSrc).toMatch(/allowReferers:\s*\[['"]https:\/\/\*\.amplifyapp\.com['"]\]/);
  });

  it('keeps the key expiring (noExpiry: false with an expireTime)', () => {
    expect(backendSrc).toMatch(/noExpiry:\s*false/);
    expect(backendSrc).toMatch(/expireTime:\s*'20\d\d-\d\d-\d\dT/);
  });

  it('does NOT wire a Cognito identity pool (API-key-only architecture)', () => {
    expect(backendSrc).not.toMatch(/defineAuth|auth\/resource/);
  });

  it('exposes the v2 MapLibre Standard style descriptor URL', () => {
    expect(backendSrc).toContain('/v2/styles/Standard/descriptor');
  });
});
