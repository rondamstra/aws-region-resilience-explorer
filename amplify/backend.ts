import { defineBackend } from '@aws-amplify/backend';
import { CfnMap, CfnAPIKey } from 'aws-cdk-lib/aws-location';
import { auth } from './auth/resource';

/**
 * AWS Region Resilience Explorer — Amplify Gen 2 backend.
 *
 * Per ARCHITECTURE.md §4/§5, map access uses a RESTRICTED Amazon Location
 * Service API key as the PRIMARY mechanism (read-only, referrer-locked,
 * expiring, scoped to the single map ARN). The unauthenticated Cognito
 * identity pool (`./auth/resource`) is wired as the DOCUMENTED SECURE
 * ALTERNATIVE only; it is not required for the API-key path.
 *
 * STRUCTURE ONLY: this file defines resources. Nothing here deploys. No
 * `ampx` / `amplify sandbox` has been run, and no AWS credentials are
 * configured in this scaffold.
 */
const backend = defineBackend({
  // Alternative path: unauth identity pool (see ARCHITECTURE.md §5).
  auth,
});

// Amplify Gen 2 has no first-class Location map primitive, so we reach the
// underlying CDK stack and add the resource as a CDK construct (§4).
const geoStack = backend.createStack('geo');

// Amazon Location Service vector basemap. Style is provisional (OQ3).
const map = new CfnMap(geoStack, 'RegionExplorerMap', {
  mapName: 'region-explorer-map',
  configuration: {
    // Basemap style TBD (OQ3): navigation gives clear global land/ocean contrast.
    style: 'VectorEsriNavigation',
  },
  description: 'Basemap for AWS Region Resilience Explorer (vector).',
});

// Restricted, read-only, referrer-locked, EXPIRING API key scoped to THIS map
// only. This is the primary public-access mechanism (ARCHITECTURE.md §5).
const mapKey = new CfnAPIKey(geoStack, 'RegionExplorerMapKey', {
  keyName: 'region-explorer-map-key',
  noExpiry: false,
  // Rotate-by-expiry; set/rotate per deploy. Placeholder far-future value.
  expireTime: '2026-12-31T00:00:00Z',
  restrictions: {
    // Read-only map tile/style access; NO geo:Put*/Delete*, no Places/Routes.
    allowActions: [
      'geo:GetMapTile',
      'geo:GetMapStyleDescriptor',
      'geo:GetMapSprites',
      'geo:GetMapGlyphs',
    ],
    // Scoped to THIS map ARN only — least privilege.
    allowResources: [map.attrArn],
    // Referrer-locked to the Amplify Hosting domain(s).
    allowReferers: ['https://*.amplifyapp.com'],
  },
});

// Surface map config as build-time outputs so the React app reads them from
// the generated config rather than hard-coding.
backend.addOutput({
  geo: {
    aws_region: geoStack.region,
    maps: {
      items: {
        [map.mapName]: {
          style: 'VectorEsriNavigation',
        },
      },
      default: map.mapName,
    },
  },
  custom: {
    mapName: map.mapName,
    mapRegion: geoStack.region,
    // CfnAPIKey does not return the raw key STRING as a CloudFormation
    // attribute. The client resolves the key value at runtime from the key
    // NAME via the Location API / generated config (see §5 trade-off: the key
    // string ships to the client). We surface the key name + ARN here.
    mapApiKeyName: 'region-explorer-map-key',
    mapApiKeyArn: mapKey.attrKeyArn,
  },
});

export { backend };
