/**
 * Unit — map style / Cognito-config resolution.
 *
 * The deployed-OSM-fallback bug was: no Cognito config at build time →
 * resolveV2StyleUrl() undefined → OSM fallback. These tests pin the resolution
 * contract so a regression in the fallback/condition logic is caught.
 *
 * NOTE on coverage boundary: amplify_outputs.json is inlined by Vite's eager
 * glob at BUILD time, so the "outputs present" branch cannot be toggled at
 * runtime in a unit test without a deploy. We therefore assert:
 *   - the NO-config path resolves to the OSM fallback (the current, file-absent
 *     state — exactly the deployed-bug condition), and
 *   - isCognitoMapStyle()/isProductionMapStyle() agree with that state.
 * The "outputs present → v2 Cognito style" branch is guarded by the Amplify
 * build spec (tests/contract/amplifyBuildSpec.test.ts) + live deploy validation.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveMapStyle,
  isProductionMapStyle,
  isCognitoMapStyle,
} from '../../src/config/mapStyle';
import { resolveCognitoMapConfig, isCognitoMapAuthConfigured } from '../../src/config/mapAuth';

describe('map style resolution (no AWS config → OSM fallback)', () => {
  // In the test/build environment there is no amplify_outputs.json and no
  // VITE_MAP_STYLE_URL, so this is the file-absent / deployed-bug condition.
  const noEnvUrl = !import.meta.env.VITE_MAP_STYLE_URL;

  it('resolveMapStyle returns the inline OSM raster style when no v2/Cognito config', () => {
    if (!noEnvUrl) return; // skip if a dev set VITE_MAP_STYLE_URL
    const style = resolveMapStyle();
    expect(typeof style).toBe('object'); // inline StyleSpecification, not a URL string
    const spec = style as { sources: Record<string, { tiles?: string[] }> };
    expect(spec.sources['osm-raster']).toBeDefined();
    expect(spec.sources['osm-raster'].tiles?.[0]).toContain('tile.openstreetmap.org');
  });

  it('isProductionMapStyle is false without a v2 URL / Cognito pool', () => {
    if (!noEnvUrl) return;
    expect(isProductionMapStyle()).toBe(false);
  });

  it('isCognitoMapStyle is false without a configured identity pool', () => {
    if (!noEnvUrl) return;
    expect(isCognitoMapStyle()).toBe(false);
  });

  it('resolveCognitoMapConfig is undefined without amplify_outputs auth block', () => {
    expect(resolveCognitoMapConfig()).toBeUndefined();
    expect(isCognitoMapAuthConfigured()).toBe(false);
  });
});
