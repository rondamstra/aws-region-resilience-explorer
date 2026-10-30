import { defineBackend } from '@aws-amplify/backend';
import { CfnMap, CfnAPIKey } from 'aws-cdk-lib/aws-location';

/**
 * AWS Region Resilience Explorer — Amplify Gen 2 backend.
 *
 * Per ARCHITECTURE.md §4/§5, map access uses a RESTRICTED Amazon Location
 * Service API key as the SOLE public-access mechanism (read-only, referrer-
 * locked, expiring, scoped to the single map ARN). The product has NO login,
 * so NO Cognito identity pool is wired — the frontend reads VITE_MAP_STYLE_URL
 * with the API key and never exchanges Cognito credentials.
 *
 * STRUCTURE ONLY: this file defines resources. Nothing here deploys. No
 * `ampx` / `amplify sandbox` has been run as part of authoring this file.
 */
const backend = defineBackend({});

// Amplify Gen 2 has no first-class Location map primitive, so we reach a
// backend CDK stack and add the resources as CDK constructs (§4). This stack
// is the only resource the backend carries.
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
// only. This is the SOLE public-access mechanism (ARCHITECTURE.md §5).
const mapKey = new CfnAPIKey(geoStack, 'RegionExplorerMapKey', {
  keyName: 'region-explorer-map-key',
  noExpiry: false,
  // Rotate-by-expiry; ~90 days out from 2026-10-30. Rotate by redeploying with
  // a new expireTime (see ARCHITECTURE.md §5 rotation procedure).
  expireTime: '2027-01-28T00:00:00Z',
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
    // Referrer-locked to the Amplify Hosting domain(s); narrow to the real
    // domain post-deploy.
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
    // NAME via the generated config (see §5 trade-off: the key string ships to
    // the client). We surface the key name + ARN here.
    mapApiKeyName: 'region-explorer-map-key',
    mapApiKeyArn: mapKey.attrKeyArn,
  },
});

export { backend };
