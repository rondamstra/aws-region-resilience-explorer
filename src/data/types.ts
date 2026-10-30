/**
 * TypeScript types for the versioned AWS Region dataset.
 *
 * These mirror docs/DATA_CONTRACT.md §3–§5 EXACTLY. The dataset is the frozen
 * integration seam between map-data (producer) and map-frontend (consumer);
 * any field rename/removal/semantic change requires a `schemaVersion` bump.
 */

/** The schema version this frontend is built against (DATA_CONTRACT §1). */
export const EXPECTED_SCHEMA_VERSION = 1 as const;

/** Allowed `continent` values (DATA_CONTRACT §4). */
export type Continent =
  | 'North America'
  | 'South America'
  | 'Europe'
  | 'Africa'
  | 'Middle East'
  | 'Asia Pacific'
  | 'Oceania';

/** Allowed `geographyType` values (DATA_CONTRACT §4). MVP ships only 'commercial'. */
export type GeographyType = 'commercial' | 'govcloud' | 'china';

/** Provenance block (DATA_CONTRACT §5). */
export interface Provenance {
  /** Upstream source of the data. */
  source: string;
  /** ISO 8601 date the source was consulted. */
  retrievedDate: string;
  /** Must state coords are approximate centroids, NOT datacenter locations. */
  accuracyNote: string;
  /** License / terms under which this compiled value is published in-repo. */
  license: string;
}

/** A single AWS Region record (DATA_CONTRACT §3). */
export interface Region {
  /** Canonical AWS Region code (unique key), e.g. "us-east-1". */
  regionCode: string;
  /** Human-readable Region name, e.g. "US East (N. Virginia)". */
  name: string;
  /** Approximate centroid latitude, decimal degrees, −90..90. */
  lat: number;
  /** Approximate centroid longitude, decimal degrees, −180..180. */
  lon: number;
  /** Country of the Region's named location. */
  country: string;
  /** Continent (enum, §4). */
  continent: Continent;
  /** Year the Region became generally available (≥ 2006). */
  launchYear: number;
  /** Number of Availability Zones (≥ 1). */
  azCount: number;
  /** Geography classification (enum, §4). */
  geographyType: GeographyType;
  /** Provenance for this record (§5). May mirror datasetProvenance. */
  provenance: Provenance;
}

/** Top-level dataset document shape (DATA_CONTRACT §2). */
export interface RegionDataset {
  /** Integer schema version; consumer asserts equality. */
  schemaVersion: number;
  /** ISO 8601 date the file was produced. */
  generatedDate: string;
  /** Dataset-wide default provenance (per-record may override). */
  datasetProvenance: Provenance;
  /** One record per AWS Region. */
  regions: Region[];
}
