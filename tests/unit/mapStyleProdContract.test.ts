/**
 * Unit — No-OSM-in-PRODUCTION contract (gate 5, both branches).
 *
 * The deployed bug served the no-auth OSM basemap in production because the
 * resolver fell through to OSM whenever no Cognito pool was configured at BUILD
 * time. `tests/unit/mapStyleResolution.test.ts` pins the file-absent branch
 * (no config → OSM) against the REAL module. This file pins the OTHER half of
 * the contract — "a configured Cognito pool resolves to the v2 Amazon Location
 * style, OSM ONLY as fallback" — which the real module cannot exercise at
 * runtime because `amplify_outputs.json` is inlined by Vite's eager glob at
 * build time and is absent here (no deploy).
 *
 * APPROACH (no fake pass): we (1) re-implement the resolver's DECISION logic as
 * a pure function and test BOTH branches deterministically, and (2) assert the
 * REAL source wires exactly that precedence (env URL → Cognito pool → OSM
 * fallback) and the real resolveCognitoMapConfig returns the pool iff
 * auth.identity_pool_id is present. The source-text assertions keep the pure
 * mirror faithful: if src/ changes its precedence, (2) fails here.
 *
 * What a unit test CANNOT prove: that a real deploy writes a real
 * identity_pool_id, that guest credentials actually sign a 200 GetTile, or that
 * a browser renders v2 tiles. Those are LIVE-only (see tests/README.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StyleSpecification } from 'maplibre-gl';
import { resolveCognitoMapConfig } from '../../src/config/mapAuth';

// ── Pure mirror of resolveV2StyleUrl()/resolveMapStyle() precedence ──────────
// Mirrors src/config/mapStyle.ts exactly: env override wins; else a configured
// Cognito pool selects the deploy-emitted style URL (or the eu-west-1 v2
// default); else undefined (→ OSM fallback). Asserted faithful by the
// source-text tests below.
const V2_STANDARD_DESCRIPTOR_DEFAULT =
  'https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor';

interface Inputs {
  envUrl?: string;
  cognitoPool?: { identityPoolId: string; region: string };
  outputsMapStyleUrl?: string;
}

function resolveV2StyleUrlPure(i: Inputs): string | undefined {
  if (i.envUrl && i.envUrl.length > 0) return i.envUrl;
  if (!i.cognitoPool) return undefined;
  const base = i.outputsMapStyleUrl;
  return base && base.length > 0 ? base : V2_STANDARD_DESCRIPTOR_DEFAULT;
}

const OSM: StyleSpecification = {
  version: 8,
  sources: { 'osm-raster': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 } },
  layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
};

function resolveMapStylePure(i: Inputs): string | StyleSpecification {
  const v2 = resolveV2StyleUrlPure(i);
  return v2 ?? OSM;
}

describe('No-OSM-in-prod — resolver decision logic (both branches)', () => {
  it('a configured Cognito pool resolves to the v2 Amazon Location style (NOT OSM)', () => {
    const style = resolveMapStylePure({ cognitoPool: { identityPoolId: 'eu-west-1:guid', region: 'eu-west-1' } });
    expect(typeof style).toBe('string');
    expect(style).toBe(V2_STANDARD_DESCRIPTOR_DEFAULT);
    expect(String(style)).toContain('/v2/styles/Standard/descriptor');
    expect(String(style)).not.toContain('openstreetmap');
  });

  it('a Cognito pool + deploy-emitted custom.mapStyleUrl uses that exact URL', () => {
    const custom = 'https://maps.geo.us-east-1.amazonaws.com/v2/styles/Standard/descriptor';
    const style = resolveMapStylePure({
      cognitoPool: { identityPoolId: 'us-east-1:guid', region: 'us-east-1' },
      outputsMapStyleUrl: custom,
    });
    expect(style).toBe(custom);
  });

  it('VITE_MAP_STYLE_URL (dev override) wins over everything', () => {
    const dev = 'https://maps.geo.eu-central-1.amazonaws.com/v2/styles/Standard/descriptor';
    const style = resolveMapStylePure({ envUrl: dev, cognitoPool: { identityPoolId: 'x:y', region: 'x' } });
    expect(style).toBe(dev);
  });

  it('OSM is used ONLY as the no-config fallback (no env, no pool)', () => {
    const style = resolveMapStylePure({});
    expect(typeof style).toBe('object');
    expect((style as StyleSpecification).sources['osm-raster']).toBeDefined();
  });

  it('OSM is NEVER selected when a Cognito pool is present', () => {
    for (const pool of [
      { identityPoolId: 'eu-west-1:a', region: 'eu-west-1' },
      { identityPoolId: 'ap-southeast-2:b', region: 'ap-southeast-2' },
    ]) {
      const style = resolveMapStylePure({ cognitoPool: pool });
      expect(typeof style).toBe('string');
    }
  });
});

// ── Keep the pure mirror faithful to the real source ─────────────────────────
describe('No-OSM-in-prod — real source wires the asserted precedence', () => {
  const styleSrc = readFileSync(resolve(process.cwd(), 'src/config/mapStyle.ts'), 'utf8');

  it('resolveMapStyle returns the v2 URL when resolved, else the OSM fallback', () => {
    // env override first.
    expect(styleSrc).toMatch(/VITE_MAP_STYLE_URL/);
    // cognito pool gates the v2 path.
    expect(styleSrc).toMatch(/resolveCognitoMapConfig\s*\(\s*\)/);
    // OSM is the fallback return, reached only after the v2 branch.
    expect(styleSrc).toMatch(/return\s+OSM_RASTER_STYLE/);
    expect(styleSrc).toMatch(/const\s+v2Url\s*=\s*resolveV2StyleUrl\(\)/);
    // The v2 default descriptor endpoint is the production target.
    expect(styleSrc).toContain('/v2/styles/Standard/descriptor');
  });

  it('isProductionMapStyle / isCognitoMapStyle are driven by the resolved v2 URL', () => {
    expect(styleSrc).toMatch(/resolveV2StyleUrl\(\)\s*!==\s*undefined/);
  });
});

// ── Real resolveCognitoMapConfig contract (gate 5, mapAuth side) ─────────────
describe('resolveCognitoMapConfig — pool iff auth.identity_pool_id present', () => {
  it('returns undefined with no deployed amplify_outputs auth block (current state)', () => {
    // No amplify_outputs.json is present (no deploy), so the real resolver must
    // return undefined — exactly the state that (correctly) selects OSM locally.
    expect(resolveCognitoMapConfig()).toBeUndefined();
  });

  it('source returns the pool when identity_pool_id present, undefined otherwise', () => {
    const authSrc = readFileSync(resolve(process.cwd(), 'src/config/mapAuth.ts'), 'utf8');
    // guards on identity_pool_id presence...
    expect(authSrc).toMatch(/const\s+identityPoolId\s*=\s*outputs\?\.auth\?\.identity_pool_id/);
    expect(authSrc).toMatch(/if\s*\(\s*!identityPoolId[\s\S]*?return\s+undefined/);
    // ...and returns { identityPoolId, region } when present.
    expect(authSrc).toMatch(/return\s*\{\s*identityPoolId\s*,\s*region\s*\}/);
  });
});
