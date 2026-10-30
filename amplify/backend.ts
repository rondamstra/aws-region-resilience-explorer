import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';

/**
 * AWS Region Resilience Explorer — Amplify Gen 2 backend.
 *
 * MIGRATION (classic → Amazon Location Service Maps v2 / geo-maps):
 * The DEV/TEST account (eu-west-1) carries an explicit DENY on
 * the classic v0 tile path, so the classic AWS::Location::Map + geo:GetMap*
 * key, while it deployed, could not serve tiles. We migrated to Amazon Location
 * Service Maps v2 (the `geo-maps` service). v2 is a MANAGED service: the
 * Standard style is provider-managed, so there is NO per-account map resource
 * to create. The v2 endpoint
 * (https://maps.geo.eu-west-1.amazonaws.com/v2/styles/Standard/descriptor)
 * returns real MapLibre style JSON.
 *
 * MAP-AUTH: COGNITO UNAUTHENTICATED (GUEST) IDENTITY POOL — SOLE MECHANISM.
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
 * (geo-maps:GetTile on the single provider ARN) to the unauth role below. The
 * frontend exchanges anonymous Cognito guest credentials and SigV4-signs every
 * map request via the amazon-location-utilities-auth-helper transformRequest.
 *
 * API KEY REMOVED. The earlier transitional CfnAPIKey has been deleted from
 * this backend now that Cognito-signed GetTile is VERIFIED serving v2 tiles
 * (guest-cred GetTile → 200; GetStaticMap → 403, least privilege). Cognito is
 * the SOLE map-auth mechanism: no API key, no key string shipped to the
 * browser. (A legacy key may linger in the test account until it can be deleted
 * — see docs/GIT_WORKFLOW.md §6.)
 *
 * STRUCTURE ONLY: this file defines resources. Nothing here deploys.
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

// API KEY REMOVED. The transitional CfnAPIKey (region-explorer-map-key) has been
// deleted now that Cognito guest-credential SigV4 auth is VERIFIED serving v2
// tiles (GetTile 200 with guest creds; GetStaticMap correctly 403 — least
// privilege). Cognito is the SOLE map-auth mechanism: no API key, no key string
// shipped to the browser. The geo stack is retained only to hold the provider
// ARN reference used by the unauth-role grant above.

// Surface v2 map config as build-time outputs so the React app reads them from
// the generated config. The Cognito identity pool id + region are emitted
// automatically by defineAuth into amplify_outputs.json (the `auth` block), so
// the frontend uses the amazon-location-utilities-auth-helper to exchange guest
// credentials and SigV4-sign map requests. Only NON-SECRET config is exposed.
backend.addOutput({
  custom: {
    mapStyleUrl,
    mapRegion: geoStack.region,
  },
});

export { backend };
