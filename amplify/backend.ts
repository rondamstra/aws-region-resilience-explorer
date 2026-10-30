import { defineBackend } from '@aws-amplify/backend';
import { CfnAPIKey } from 'aws-cdk-lib/aws-location';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';

/**
 * AWS Region Resilience Explorer — Amplify Gen 2 backend.
 *
 * MIGRATION (classic → Amazon Location Service Maps v2 / geo-maps):
 * The account (DEV/TEST <AWS_TEST_ACCOUNT_ID>, eu-west-1) carries an explicit DENY on
 * the classic v0 tile path, so the classic AWS::Location::Map + geo:GetMap*
 * key, while it deployed, could not serve tiles. We migrated to Amazon Location
 * Service Maps v2 (the `geo-maps` service). v2 is a MANAGED service: the
 * Standard style is provider-managed, so there is NO per-account map resource
 * to create. The v2 endpoint
 * (https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor)
 * returns real MapLibre style JSON.
 *
 * MAP-AUTH: COGNITO UNAUTHENTICATED (GUEST) IDENTITY POOL — ADDED ALONGSIDE
 * THE API KEY (TRANSITIONAL).
 * -----------------------------------------------------------------------
 * A direct SigV4 call to `geo-maps:GetTile` as a normal admin principal is
 * rejected with an IMPLICIT deny: "not authorized to perform geo-maps:GetTile
 * ... because no identity-based policy allows the geo-maps:GetTile action".
 * That is a missing-Allow, NOT an explicit deny / SCP / permissions boundary.
 * GetStyleDescriptor / GetGlyphs / GetSprites return 200 even unauthenticated
 * for the managed Standard style; GetTile REQUIRES an explicit Allow. The fix
 * is a principal whose IAM policy explicitly ALLOWS geo-maps:GetTile on the
 * provider ARN — a Cognito UNAUTHENTICATED (guest) role is exactly that.
 *
 * We wire `defineAuth` (guest/unauthenticated enabled, no login UI — see
 * amplify/auth/resource.ts) and attach a least-privilege inline policy
 * (geo-maps:GetTile on the single provider ARN) to the unauth role below.
 *
 * TRANSITIONAL: the CfnAPIKey below is INTENTIONALLY RETAINED for this deploy so
 * nothing breaks. Two auth paths coexist on purpose and safely. The API key
 * will be REMOVED in a follow-up ONLY ONCE Cognito-signed tiles are verified
 * working. Do not delete the key until then.
 *
 * STRUCTURE ONLY: this file defines resources. Nothing here deploys. No
 * `ampx` / `amplify sandbox` has been run as part of authoring this file.
 */
const backend = defineBackend({
  // Cognito guest/unauthenticated identity pool — the principal that carries
  // the explicit geo-maps:GetTile Allow. No login UI; User Pool unused.
  auth,
});

// -- Least-privilege geo-maps grant on the Cognito UNAUTHENTICATED role -------
// The managed Standard-style provider ARN. NOTE the DOUBLE colon: geo-maps
// resources have NO account-id segment, and `default` is the provider name for
// the Standard managed style.
const mapProviderArn = 'arn:aws:geo-maps:eu-west-1::provider/default';

// Attach the explicit Allow for geo-maps:GetTile to the Cognito unauthenticated
// (guest) role. This is the grant that resolves the implicit deny — a guest
// principal signing GetTile with SigV4 is now authorized.
//
// LEAST PRIVILEGE: GetTile ONLY. We deliberately start with the single action
// the implicit-deny evidence proved is required. The managed Standard style's
// other sub-resources — GetStyleDescriptor, GetGlyphs, GetSprites — return 200
// WITHOUT any grant for the managed style, so they need NO Allow here. Add
// geo-maps:GetStaticMap ONLY if a static-map feature is later required.
backend.auth.resources.unauthenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: ['geo-maps:GetTile'],
    resources: [mapProviderArn],
  }),
);

// -- Geo stack: the restricted API key (RETAINED, transitional) ---------------
// Amplify Gen 2 has no first-class Location primitive, so we reach a backend
// CDK stack and add the resources as CDK constructs. For v2/geo-maps the
// Standard style is provider-managed — there is no CfnMap.
const geoStack = backend.createStack('geo');

// v2 MapLibre Standard style descriptor endpoint.
const mapStyleUrl =
  'https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor';

// RETAINED FOR THIS DEPLOY ONLY. Restricted, read-only, referrer-locked,
// EXPIRING API key scoped to the v2 geo-maps provider. Kept in place alongside
// the Cognito path so the current map does not break during the transition.
// REMOVE THIS CfnAPIKey IN A FOLLOW-UP once Cognito-signed GetTile is verified
// working end-to-end. Two auth paths coexist temporarily — intentional and safe.
const mapKey = new CfnAPIKey(geoStack, 'RegionExplorerMapKey', {
  keyName: 'region-explorer-map-key',
  forceUpdate: true,
  noExpiry: false,
  expireTime: '2027-01-28T00:00:00Z',
  restrictions: {
    allowActions: ['geo-maps:*'],
    allowResources: [mapProviderArn],
    allowReferers: ['https://*.amplifyapp.com'],
  },
});

// Surface v2 map config as build-time outputs so the React app reads them from
// the generated config. The Cognito identity pool id + region are emitted
// automatically by defineAuth into amplify_outputs.json (the `auth` block), so
// the frontend can use the amazon-location-utilities-auth-helper to exchange
// guest credentials. Only NON-SECRET config is exposed here (style URL, region,
// key NAME/ARN — never the raw key string, which CfnAPIKey does not expose as a
// CloudFormation attribute).
backend.addOutput({
  custom: {
    mapStyleUrl,
    mapRegion: geoStack.region,
    // Retained for the transitional API-key path; removed with the key.
    mapApiKeyName: 'region-explorer-map-key',
    mapApiKeyArn: mapKey.attrKeyArn,
  },
});

export { backend };
