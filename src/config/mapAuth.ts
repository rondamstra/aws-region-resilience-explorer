/**
 * Cognito guest-credential SigV4 auth for Amazon Location Service Maps v2.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — Cognito UNAUTHENTICATED (guest) identity pool (ARCHITECTURE)
 * ──────────────────────────────────────────────────────────────────────────
 * The map is PUBLIC and there is NO login. `geo-maps:GetTile` on the managed
 * Standard-style provider ARN requires an identity-based policy that EXPLICITLY
 * allows the action (a direct admin SigV4 call hits an implicit deny). The
 * backend (`amplify/backend.ts` + `amplify/auth/resource.ts`) wires a Cognito
 * UNAUTHENTICATED (guest) identity pool whose unauth role carries that explicit
 * `geo-maps:GetTile` Allow. The browser exchanges anonymous Cognito identity-pool
 * credentials and signs tile/style/glyph/sprite requests with **SigV4** — there
 * is NO `?key=` API key in the URL on this path.
 *
 * HOW CONFIG DRIVES IT
 * --------------------
 * After a deploy, `amplify_outputs.json` (GITIGNORED, present only post-deploy)
 * gains an `auth` block with `identity_pool_id` + `aws_region`, plus the existing
 * `custom.mapStyleUrl` / `custom.mapRegion`. We:
 *   1. Import the outputs OPTIONALLY (via a Vite glob) so a missing file never
 *      breaks the build — local dev with zero AWS still compiles and runs.
 *   2. `Amplify.configure(outputs)` when present.
 *   3. Build a MapLibre `transformRequest` from the installed auth-helper
 *      (`withIdentityPoolId(identityPoolId)` → `getMapAuthenticationOptions()`),
 *      which SigV4-signs requests to `*.amazonaws.com` with the guest creds.
 *
 * When NO `auth.identity_pool_id` is present, `getMapAuthTransformRequest()`
 * resolves to `undefined` and the app uses the no-auth OSM fallback style
 * (see `src/config/mapStyle.ts`), so local dev needs zero AWS configuration.
 *
 * NON-SECRET CONFIG ONLY: identity pool id, region, style URL. No secrets — the
 * guest identity pool mints temporary credentials client-side; nothing static
 * or secret ships to the browser.
 *
 * LAZY IMPORTS: both `@aws/amazon-location-utilities-auth-helper` and
 * `aws-amplify` are imported DYNAMICALLY (inside `getMapAuthTransformRequest`),
 * never at module top level. The auth-helper drags in the full AWS SDK v3
 * Cognito credential-provider tree; a static import would force that (and its
 * Node-only credential providers) into the main browser bundle even for the
 * zero-AWS local/OSM path. Dynamic import keeps it in a separate async chunk
 * loaded ONLY when a Cognito identity pool is actually configured.
 */

/** A MapLibre `transformRequest` callback shape (subset we rely on). */
export type MapTransformRequest = (
  url: string,
  resourceType?: string,
) => { url: string } | undefined;

/**
 * Minimal shape of the `amplify_outputs.json` fields this module reads. Only
 * the Cognito `auth` block is needed here (the map style URL is resolved in
 * `src/config/mapStyle.ts`). `identity_pool_id` is optional because a guest
 * identity pool is only present after a deploy.
 */
interface AmplifyAuthOutputs {
  auth?: {
    aws_region?: string;
    identity_pool_id?: string;
  };
}

/**
 * Optionally load `amplify_outputs.json`. It is GITIGNORED and only present
 * after a deploy, so this must not break the build when the file is absent. A
 * Vite eager glob compiles away to `{}` when the file does not exist at build
 * time, so a missing file yields `undefined` rather than a module-resolution
 * error.
 */
function loadAmplifyOutputs(): AmplifyAuthOutputs | undefined {
  try {
    const modules = import.meta.glob<{ default: AmplifyAuthOutputs }>(
      '/amplify_outputs.json',
      { eager: true },
    );
    const entry = Object.values(modules)[0];
    return entry?.default;
  } catch {
    return undefined;
  }
}

/** The resolved Cognito guest config, if present in `amplify_outputs.json`. */
export interface CognitoMapConfig {
  identityPoolId: string;
  region: string;
}

/**
 * Resolve the Cognito guest identity-pool config from `amplify_outputs.json`,
 * or `undefined` when no `auth.identity_pool_id` is present (local dev / no
 * deploy). The region falls back from the `auth` block to the identity pool id
 * prefix (`<region>:<guid>`), which the auth-helper also derives internally.
 */
export function resolveCognitoMapConfig(): CognitoMapConfig | undefined {
  const outputs = loadAmplifyOutputs();
  const identityPoolId = outputs?.auth?.identity_pool_id;
  if (!identityPoolId || identityPoolId.length === 0) {
    return undefined;
  }
  const region = outputs?.auth?.aws_region ?? identityPoolId.split(':')[0] ?? '';
  return { identityPoolId, region };
}

/** Whether a Cognito guest identity pool is configured (SigV4 tile path active). */
export function isCognitoMapAuthConfigured(): boolean {
  return resolveCognitoMapConfig() !== undefined;
}

/**
 * Configure Amplify from `amplify_outputs.json` when present. Imported lazily so
 * `aws-amplify` is only pulled in (and `Amplify.configure` only called) when a
 * deploy actually wired a Cognito identity pool. No-op with no outputs.
 */
async function configureAmplifyIfPresent(): Promise<void> {
  const outputs = loadAmplifyOutputs();
  if (!outputs || !outputs.auth?.identity_pool_id) {
    return;
  }
  const { Amplify } = await import('aws-amplify');
  // `amplify_outputs.json` is the Amplify Gen 2 outputs shape; cast narrowly
  // because we only typed the `auth` subset we read above.
  Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);
}

/**
 * Build a MapLibre `transformRequest` that SigV4-signs Amazon Location Service
 * requests with temporary Cognito GUEST credentials, or resolve `undefined`
 * when no Cognito identity pool is configured (local dev → OSM fallback).
 *
 * Uses the installed `@aws/amazon-location-utilities-auth-helper@1.3.3` API:
 *   `withIdentityPoolId(identityPoolId, options?)`
 *     → `Promise<MapAuthHelper & SDKAuthHelper>`
 *   `helper.getMapAuthenticationOptions()`
 *     → `{ transformRequest: (url, resourceType?) => { url } }`
 *
 * `withIdentityPoolId` derives the signing region from the identity pool id
 * prefix (`<region>:<guid>`) internally and sets up automatic credential
 * refresh, so passing the id alone is sufficient.
 */
export async function getMapAuthTransformRequest(): Promise<
  MapTransformRequest | undefined
> {
  const config = resolveCognitoMapConfig();
  if (!config) {
    return undefined;
  }
  await configureAmplifyIfPresent();
  const { withIdentityPoolId } = await import(
    '@aws/amazon-location-utilities-auth-helper'
  );
  const authHelper = await withIdentityPoolId(config.identityPoolId);
  const { transformRequest } = authHelper.getMapAuthenticationOptions();
  return transformRequest;
}
