import { defineBackend } from '@aws-amplify/backend';
import { CfnAPIKey } from 'aws-cdk-lib/aws-location';

/**
 * AWS Region Resilience Explorer — Amplify Gen 2 backend.
 *
 * MIGRATION (classic → Amazon Location Service Maps v2 / geo-maps):
 * The account (DEV/TEST <AWS_TEST_ACCOUNT_ID>, eu-west-1) carries an explicit DENY on
 * the classic v0 tile path, so the classic AWS::Location::Map + geo:GetMap*
 * key, while it deployed, could not serve tiles. We migrated to Amazon Location
 * Service Maps v2 (the `geo-maps` service). v2 is a MANAGED service: the
 * Standard style is provider-managed, so there is NO per-account map resource
 * to create — only an API key scoped to the geo-maps provider. The v2 endpoint
 * (https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor)
 * returns real MapLibre style JSON.
 *
 * Per ARCHITECTURE.md §4/§5, a RESTRICTED Amazon Location Service API key is
 * the SOLE public-access mechanism (read-only, referrer-locked, expiring,
 * scoped to the single v2 provider ARN). The product has NO login, so NO
 * Cognito identity pool is wired — the frontend reads the v2 style URL with the
 * API key and never exchanges Cognito credentials.
 *
 * STRUCTURE ONLY: this file defines resources. Nothing here deploys. No
 * `ampx` / `amplify sandbox` has been run as part of authoring this file.
 */
const backend = defineBackend({});

// Amplify Gen 2 has no first-class Location primitive, so we reach a backend
// CDK stack and add the resources as CDK constructs (§4). For v2/geo-maps the
// Standard style is provider-managed — there is no CfnMap. This stack carries
// only the restricted API key.
const geoStack = backend.createStack('geo');

// v2 geo-maps provider ARN for the managed Standard style. NOTE the DOUBLE
// colon: geo-maps resources have NO account-id segment, and the provider name
// for the Standard managed style is `default`. Confirmed from the CreateKey
// ARN regex.
const mapProviderArn = 'arn:aws:geo-maps:eu-west-1::provider/default';

// v2 MapLibre Standard style descriptor endpoint (client appends ?key=<value>).
const mapStyleUrl =
  'https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor';

// Restricted, read-only, referrer-locked, EXPIRING API key scoped to the v2
// geo-maps provider ONLY. This is the SOLE public-access mechanism (§5).
const mapKey = new CfnAPIKey(geoStack, 'RegionExplorerMapKey', {
  keyName: 'region-explorer-map-key',
  // Confirm restriction changes on an already-used key (classic → v2 migration).
  // Location refuses to silently alter a key used in the last 7 days without
  // this flag, since changing restrictions can revoke access for live callers.
  // In this sandbox the key was only exercised by our own validation fetches.
  forceUpdate: true,
  noExpiry: false,
  // Rotate-by-expiry. Rotate by redeploying with a new expireTime (see
  // ARCHITECTURE.md §5 rotation procedure).
  expireTime: '2027-01-28T00:00:00Z',
  restrictions: {
    // v2 geo-maps catch-all. A full MapLibre vector Standard style fetches
    // FOUR distinct sub-resources — the style descriptor, vector tiles,
    // sprites and glyphs — and the individual v2 get-actions do NOT cleanly
    // cover every sub-resource the style pulls. `geo-maps:*` is the supported
    // way to authorize a complete managed-style render, and it is STILL
    // read-only: geo-maps exposes only Get* actions (GetTile, GetStaticMap,
    // GetGlyphs, GetSprites, GetStyleDescriptor, ...) — there are NO
    // write/delete actions in the service. Least-privilege justification: the
    // alternative (enumerating get-actions) breaks the render for the managed
    // Standard style, so `geo-maps:*` is the minimum that serves the whole
    // style while remaining read-only and scoped to the single provider ARN.
    // See ARCHITECTURE.md §5.
    allowActions: ['geo-maps:*'],
    // Scoped to the single v2 provider ARN only — least privilege on resource.
    allowResources: [mapProviderArn],
    // Referrer-locked to the Amplify Hosting domain(s); narrow to the real
    // domain post-deploy.
    allowReferers: ['https://*.amplifyapp.com'],
  },
});

// Surface v2 map config as build-time outputs so the React app reads them from
// the generated config rather than hard-coding. No classic map name/arn — v2
// has no per-account map resource.
backend.addOutput({
  custom: {
    // v2 MapLibre Standard style descriptor; client appends ?key=<value>
    // (key string resolved client-side from generated config — see §5).
    mapStyleUrl,
    mapRegion: geoStack.region,
    mapApiKeyName: 'region-explorer-map-key',
    mapApiKeyArn: mapKey.attrKeyArn,
  },
});

export { backend };
