/**
 * Regression — Map auth: Cognito UNAUTHENTICATED (guest) geo-maps:GetTile grant
 * + the RETAINED transitional API key.
 *
 * The backend migrated from CLASSIC Amazon Location maps (AWS::Location::Map +
 * geo:GetMap* key) to Amazon Location Service Maps v2 (the `geo-maps` service),
 * and map auth migrated from an API key to a Cognito UNAUTHENTICATED (guest)
 * identity pool. v2 is a MANAGED service: the Standard style is provider-managed,
 * so there is NO per-account CfnMap resource.
 *
 * CURRENT CORRECT SHAPE (what this test pins):
 *   - defineBackend({ auth }) wires a Cognito guest identity pool.
 *   - backend.auth.resources.unauthenticatedUserIamRole.addToPrincipalPolicy(
 *       new PolicyStatement({ actions: ['geo-maps:GetTile'],
 *                             resources: ['arn:aws:geo-maps:eu-west-1::provider/default'] }))
 *     — LEAST PRIVILEGE: GetTile only, NOT geo-maps:* on the Cognito role.
 *   - amplify/auth/resource.ts: defineAuth({ loginWith: { email: true } }) as the
 *     documented guest-only workaround — NO login UI, no other providers.
 *   - The CfnAPIKey is RETAINED transitionally (geo-maps:* on the KEY is
 *     acceptable; referrer-locked + expiring), to be removed after Cognito is
 *     verified.
 *
 * Reads amplify/backend.ts and amplify/auth/resource.ts as source text (no AWS
 * calls, no CDK synth). FAILS on regressions: a revert to classic shape, a
 * removal of the Cognito GetTile grant, an over-grant to geo-maps:* on the
 * Cognito role, or a login provider sneaking in.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs from the project root; resolve sources from there.
const backendSrc = readFileSync(
  resolve(process.cwd(), 'amplify/backend.ts'),
  'utf8',
);
const authSrc = readFileSync(
  resolve(process.cwd(), 'amplify/auth/resource.ts'),
  'utf8',
);

describe('Map auth — Cognito unauth geo-maps:GetTile grant (regression)', () => {
  // ---- 1. Cognito GetTile grant on the UNAUTH role -------------------------
  it('attaches geo-maps:GetTile to the unauthenticatedUserIamRole via addToPrincipalPolicy', () => {
    // The grant goes on the Cognito UNAUTHENTICATED (guest) role, not the
    // authenticated role and not a bare resources.role.
    expect(backendSrc).toMatch(
      /backend\.auth\.resources\.unauthenticatedUserIamRole\s*\.?\s*\n?\s*\.addToPrincipalPolicy\s*\(/,
    );
    // A PolicyStatement whose actions array is exactly ['geo-maps:GetTile'].
    expect(backendSrc).toMatch(/new\s+PolicyStatement\s*\(/);
    expect(backendSrc).toMatch(/actions:\s*\[\s*'geo-maps:GetTile'\s*\]/);
    // PolicyStatement is imported from aws-cdk-lib/aws-iam.
    expect(backendSrc).toMatch(
      /import\s*\{[^}]*\bPolicyStatement\b[^}]*\}\s*from\s*'aws-cdk-lib\/aws-iam'/,
    );
  });

  it('scopes the Cognito GetTile grant to the v2 provider ARN', () => {
    // mapProviderArn is the double-colon, no-account provider ARN...
    expect(backendSrc).toMatch(
      /const\s+mapProviderArn\s*=\s*'arn:aws:geo-maps:eu-west-1::provider\/default'/,
    );
    // ...and it is the resource wired into the PolicyStatement.
    expect(backendSrc).toMatch(/resources:\s*\[\s*mapProviderArn\s*\]/);
  });

  // ---- 2. No over-grant / no write-delete on the Cognito role --------------
  it('does NOT over-grant the Cognito role to geo-maps:* (least privilege)', () => {
    // The ONLY actions array attached to the unauth role must be GetTile.
    // geo-maps:* is acceptable ONLY on the transitional API key (allowActions),
    // never as a PolicyStatement `actions` value.
    expect(backendSrc).not.toMatch(/actions:\s*\[\s*'geo-maps:\*'\s*\]/);
    // Guard the general PolicyStatement actions value too.
    expect(backendSrc).not.toMatch(/actions:\s*\[[^\]]*'geo-maps:\*'[^\]]*\]/);
  });

  it('does NOT grant any geo-maps write/delete/update/create action', () => {
    expect(backendSrc).not.toMatch(/'geo-maps:Put[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo-maps:Delete[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo-maps:Update[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo-maps:Create[A-Za-z]*'/);
    // No classic write/delete/update spellings either.
    expect(backendSrc).not.toMatch(/'geo:Put[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:Delete[A-Za-z]*'/);
    expect(backendSrc).not.toMatch(/'geo:Update[A-Za-z]*'/);
  });

  // ---- 3. defineBackend includes auth; auth resource exists ----------------
  it('wires the auth resource into defineBackend', () => {
    expect(backendSrc).toMatch(/defineBackend\s*\(\s*\{[\s\S]*?\bauth\b[\s\S]*?\}\s*\)/);
    expect(backendSrc).toMatch(/import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*'\.\/auth\/resource'/);
  });

  it('amplify/auth/resource.ts defines guest/unauth via defineAuth with email login', () => {
    expect(authSrc).toMatch(/import\s*\{[^}]*\bdefineAuth\b[^}]*\}\s*from\s*'@aws-amplify\/backend'/);
    expect(authSrc).toMatch(/export\s+const\s+auth\s*=\s*defineAuth\s*\(/);
    expect(authSrc).toMatch(/loginWith:\s*\{[\s\S]*?email:\s*true[\s\S]*?\}/);
  });

  // ---- 5. No login UI / no other providers ---------------------------------
  it('does NOT declare any non-email login provider (guest-only workaround)', () => {
    // email is the sole documented workaround; no social / external providers.
    for (const provider of [
      'google',
      'facebook',
      'amazon',
      'apple',
      'externalProviders',
      'phone',
    ]) {
      expect(authSrc.toLowerCase()).not.toMatch(
        new RegExp(`\\b${provider}\\s*:`, 'i'),
      );
    }
  });

  it('does NOT build a login UI or claim authenticated user flows', () => {
    // No authenticated-flow / sign-in-UI constructs in the auth resource.
    expect(authSrc).not.toMatch(/authenticatedUserIamRole/);
    expect(authSrc).not.toMatch(/withSSR|Authenticator\b|signIn\s*\(|signUp\s*\(/);
    // The file defines ONLY the auth resource (no React / UI imports).
    expect(authSrc).not.toMatch(/from\s*'react'/);
    expect(authSrc).not.toMatch(/from\s*'@aws-amplify\/ui-react'/);
  });

  // ---- 4. v2 provider ARN / style URL / no classic map ---------------------
  it('uses the v2 provider ARN (double colon, no account id)', () => {
    expect(backendSrc).toContain('arn:aws:geo-maps:eu-west-1::provider/default');
    // No classic per-account map ARN.
    expect(backendSrc).not.toMatch(/arn:aws:geo:[^']*:map\//);
    expect(backendSrc).not.toMatch(/resource\/map\//);
  });

  it('exposes the v2 MapLibre Standard style descriptor URL', () => {
    expect(backendSrc).toContain('/v2/styles/Standard/descriptor');
  });

  it('does NOT carry any classic CfnMap import or construction', () => {
    expect(backendSrc).not.toMatch(/import\s*\{[^}]*\bCfnMap\b[^}]*\}/);
    expect(backendSrc).not.toMatch(/new\s+CfnMap\b/);
  });

  it('does NOT use classic geo:GetMap* actions anywhere', () => {
    expect(backendSrc).not.toContain("'geo:GetMap*'");
    for (const bad of [
      "'geo:GetMapTile'",
      "'geo:GetMapStyleDescriptor'",
      "'geo:GetMapSprites'",
      "'geo:GetMapGlyphs'",
    ]) {
      expect(backendSrc).not.toContain(bad);
    }
  });

  // ---- 4 (cont). Retained transitional key: referer + expiry ---------------
  it('RETAINS the transitional API key with geo-maps:* scoped to the provider ARN', () => {
    // geo-maps:* on the KEY (allowActions) is acceptable transitionally.
    expect(backendSrc).toMatch(/new\s+CfnAPIKey\s*\(/);
    expect(backendSrc).toMatch(/allowActions:\s*\[\s*'geo-maps:\*'\s*\]/);
    expect(backendSrc).toMatch(/allowResources:\s*\[\s*mapProviderArn\s*\]/);
  });

  it('keeps the retained key referrer-locked', () => {
    expect(backendSrc).toMatch(
      /allowReferers:\s*\[['"]https:\/\/\*\.amplifyapp\.com['"]\]/,
    );
  });

  it('keeps the retained key expiring (noExpiry: false with an expireTime)', () => {
    expect(backendSrc).toMatch(/noExpiry:\s*false/);
    expect(backendSrc).toMatch(/expireTime:\s*'20\d\d-\d\d-\d\dT/);
  });
});
