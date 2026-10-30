import { defineAuth } from '@aws-amplify/backend';

/**
 * Unauthenticated Cognito identity pool — DOCUMENTED SECURE ALTERNATIVE only.
 *
 * ARCHITECTURE.md §5 selects a restricted Location Service API key as the
 * PRIMARY map-access mechanism. This identity pool is wired as the alternative
 * path described in the design: it mints short-lived, IAM-enforced anonymous
 * credentials and would be the right choice if the product ever added login.
 *
 * The product has NO authenticated users, so guest/unauthenticated access is
 * enabled and no login providers are configured. If the app is switched to the
 * identity-pool path, the unauth role is granted read-only `geo:GetMap*` on the
 * single map ARN (that grant lives with the map construct in backend.ts and is
 * intentionally NOT applied here while the API key is primary).
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  // Guest (unauthenticated) access is the only path this product would use.
  // Login providers above exist to satisfy defineAuth's required shape; no
  // user sign-up/sign-in flow is built in the MVP.
});
