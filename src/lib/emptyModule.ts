/**
 * Empty stub module for the browser build.
 *
 * Aliased in `vite.config.ts` in place of the Node-only AWS SDK credential
 * providers (`@aws-sdk/credential-provider-login` / `-process` / `-sso` /
 * `-ini` / `-node`) that the `@aws-sdk/credential-providers` chain references
 * transitively. The Cognito GUEST map-auth path only ever calls
 * `fromCognitoIdentityPool` (Cognito Identity HTTP API — no filesystem / SSO /
 * process credentials), so those providers are dead code in the browser and are
 * replaced by this empty module to keep their Node-only `node:fs` / `node:os`
 * named imports out of the bundle graph.
 *
 * A Proxy default export answers any named/default access with a throwing
 * function, so that in the impossible event one of these providers is actually
 * invoked at runtime it fails loudly rather than silently mis-signing.
 */
function notImplemented(): never {
  throw new Error(
    '[mapAuth] A Node-only AWS SDK credential provider was invoked in the ' +
      'browser. The Cognito guest map-auth path must only use ' +
      'fromCognitoIdentityPool; this provider is stubbed out at build time.',
  );
}

const stub: unknown = new Proxy(notImplemented, {
  get: () => stub,
  apply: () => notImplemented(),
  construct: () => notImplemented() as object,
});

export default stub;
