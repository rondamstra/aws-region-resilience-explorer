import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config.
 *
 * AWS SDK credential providers — browser build (Cognito guest SigV4 path).
 * ------------------------------------------------------------------------
 * The Cognito guest map-auth path (`src/config/mapAuth.ts` →
 * `@aws/amazon-location-utilities-auth-helper` → `fromCognitoIdentityPool`)
 * pulls in `@aws-sdk/credential-providers`, whose provider CHAIN transitively
 * references Node-only credential sources — `@aws-sdk/credential-provider-login`,
 * `-process`, `-sso`, `-ini`, `-node` and `@smithy/credential-provider-imds`.
 * Those modules `import { promises as fs } from "node:fs"` (and `node:os`,
 * `node:child_process`, …) with NAMED imports that Vite's empty browser stub
 * for `node:*` cannot satisfy, so the bundle fails to resolve them.
 *
 * The browser GUEST path only ever calls `fromCognitoIdentityPool`, which uses
 * the Cognito Identity HTTP API — it NEVER touches the filesystem/SSO/process
 * credential sources. So we alias those Node-only providers (and the bare
 * `node:*` builtins they import) to an empty stub module: dead code on the
 * guest path, never executed in the browser. Amazon Location tiles are signed
 * with SigV4 using the temporary Cognito guest credentials; no Node runtime is
 * involved. On the OSM / API-key paths none of this is even imported (the
 * auth-helper import is dynamic — see `src/config/mapAuth.ts`).
 */
// Path to the empty stub module, relative to the project root (where Vite runs).
// Kept as a plain relative string so this config needs no `@types/node` (the
// project does not install it, matching the original zero-Node vite.config).
const emptyStub = '/src/lib/emptyModule.ts';

// Node-only AWS SDK credential sources never reached on the Cognito guest path.
const unusedCredentialProviders = [
  '@aws-sdk/credential-provider-login',
  '@aws-sdk/credential-provider-process',
  '@aws-sdk/credential-provider-sso',
  '@aws-sdk/credential-provider-ini',
  '@aws-sdk/credential-provider-node',
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...unusedCredentialProviders.map((find) => ({
        // Match the bare package id and any deep import of it.
        find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
        replacement: emptyStub,
      })),
    ],
  },
});
