import { defineAuth } from '@aws-amplify/backend';

/**
 * AWS Region Resilience Explorer — Cognito auth resource (guest / unauthenticated only).
 *
 * WHY THIS EXISTS
 * ---------------
 * The map is PUBLIC and the product has NO login. We need a principal whose
 * identity-based IAM policy EXPLICITLY ALLOWS `geo-maps:GetTile` on the managed
 * Standard-style provider ARN, because a direct SigV4 call to
 * `geo-maps:GetTile` is rejected with an IMPLICIT deny:
 *
 *   "... is not authorized to perform: geo-maps:GetTile on resource
 *    arn:aws:geo-maps:eu-west-1::provider/default because no identity-based
 *    policy allows the geo-maps:GetTile action"
 *
 * That is a missing-Allow (implicit) deny, NOT an explicit deny / SCP /
 * permissions boundary. `geo-maps:GetStyleDescriptor` and `geo-maps:GetGlyphs`
 * return 200 even unauthenticated (those actions need no authz for the managed
 * Standard style); GetTile DOES require an explicit Allow. A Cognito
 * UNAUTHENTICATED (guest) role is exactly such a principal — the frontend
 * exchanges anonymous Cognito identity-pool credentials and signs tile requests
 * with SigV4 via the amazon-location-utilities-auth-helper.
 *
 * GUEST-ONLY SHAPE
 * ----------------
 * Amplify Gen 2 `defineAuth` (@aws-amplify/backend ^1.25.1) has NO first-class
 * "guest-only" option and REQUIRES a login method to satisfy its type shape.
 * There is no cleaner guest-only primitive in this version, so we use the
 * documented workaround: declare `loginWith: { email: true }` to satisfy the
 * shape while building NO login UI. The resulting User Pool is UNUSED — the app
 * never renders a sign-in flow and never calls any User Pool API.
 *
 * Unauthenticated (guest) identities are ENABLED on the identity pool: the
 * auth-construct default is `allowUnauthenticatedIdentities: true`, so defining
 * this resource creates an identity pool that mints anonymous credentials and
 * an unauthenticated role we attach the geo-maps:GetTile grant to (see
 * amplify/backend.ts). Guest is the ONLY path the product uses.
 */
export const auth = defineAuth({
  // REQUIRED by defineAuth's type shape. The email login method is declared
  // only to satisfy the shape; NO sign-in UI is built and the User Pool is
  // intentionally unused. Guest/unauthenticated access is the sole path.
  loginWith: {
    email: true,
  },
});
