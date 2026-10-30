# Data Contract — AWS Region dataset

**Owner:** map-architect (contract) / map-data (producer) / map-frontend (consumer)
**Status:** DRAFT — this is the frozen seam. Changes after approval require a
schema-version bump and lead sign-off.

This document defines the **shared, versioned JSON dataset** of AWS Region
locations and metadata. It is the integration seam that lets `map-data` (produces
the JSON) and `map-frontend` (consumes it) work in parallel. Once approved, the
schema is frozen for the MVP; additive changes bump `schemaVersion`.

---

## 1. File & versioning

- **File:** `data/regions.v1.json` (version N → `regions.vN.json`).
- **`schemaVersion`** is embedded in the file AND encoded in the filename so the
  consumer can assert the version it was built against.
- Versioning rule: **additive, backward-compatible** field additions bump the
  minor understanding but keep `schemaVersion` as an integer the consumer checks
  for equality. Any field rename/removal/semantic change = **new major version**
  and a coordinated frontend update.
- The dataset is **static**, shipped as a build-time asset (imported by the app
  or copied to `public/`). No runtime fetch from a backend.

---

## 2. Top-level document shape

```jsonc
{
  "schemaVersion": 1,
  "generatedDate": "2026-10-30",      // ISO 8601 date the file was produced
  "datasetProvenance": {              // dataset-wide provenance (per-record can override)
    "source": "string",
    "retrievedDate": "YYYY-MM-DD",
    "accuracyNote": "string",
    "license": "string"
  },
  "regions": [ /* array of Region records, see §3 */ ]
}
```

- `schemaVersion` (**integer, required**) — consumer asserts equality with the
  version it expects.
- `generatedDate` (**string, required**) — ISO 8601 date the file was generated.
- `datasetProvenance` (**object, required**) — default provenance for all records;
  a record MAY include its own `provenance` block to override (e.g. a coordinate
  from a different source).
- `regions` (**array, required**) — one record per AWS Region.

---

## 3. Region record schema

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `regionCode` | string | yes | Canonical AWS Region code (unique key). | `"us-east-1"` |
| `name` | string | yes | Human-readable Region name. | `"US East (N. Virginia)"` |
| `lat` | number | yes | Approximate centroid latitude, decimal degrees, −90..90. | `38.95` |
| `lon` | number | yes | Approximate centroid longitude, decimal degrees, −180..180. | `-77.45` |
| `country` | string | yes | Country of the Region's named location. | `"United States"` |
| `continent` | string | yes | Continent (enum, see §4). | `"North America"` |
| `launchYear` | integer | yes | Year the Region became generally available. | `2006` |
| `azCount` | integer | yes | Number of Availability Zones (≥1). | `6` |
| `geographyType` | string | yes | Geography classification (enum, see §4). | `"commercial"` |
| `provenance` | object | yes | Provenance for this record (shape in §5). May mirror `datasetProvenance`. | see §6 |

**Constraints**

- `regionCode` is the **unique primary key**; no duplicates.
- `lat` ∈ [−90, 90]; `lon` ∈ [−180, 180].
- `launchYear` ≥ 2006 (first AWS Region GA year) and ≤ `generatedDate` year.
- `azCount` ≥ 1.
- All required fields non-null.

---

## 4. Enumerations

- **`continent`** — one of:
  `"North America"`, `"South America"`, `"Europe"`, `"Africa"`,
  `"Middle East"`, `"Asia Pacific"`, `"Oceania"`.
  (Grouping chosen to match how AWS markets Regions; `"Middle East"` and
  `"Oceania"` split out from Asia for cleaner filtering.)
- **`geographyType`** — one of:
  `"commercial"`, `"govcloud"`, `"china"`.
  **MVP scope (OQ5, RESOLVED):** the dataset contains **only** commercial
  Regions in the standard `aws` partition. The enum keeps `govcloud` and `china`
  for forward compatibility, but those values are **explicitly OUT of scope** for
  the MVP dataset — no GovCloud or China records are produced. Also out of scope:
  announced-but-not-yet-operational Regions, Local Zones, Wavelength Zones and
  Outposts. Every MVP record therefore has `geographyType: "commercial"`.

---

## 5. Provenance block (`provenance` and `datasetProvenance`)

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | string | yes | Upstream source of the data. For metadata: **AWS Global Infrastructure documentation** + **AWS Systems Manager public parameters** (`/aws/service/global-infrastructure/...`). For coordinates: the **documented, redistribution-cleared centroid source**. |
| `retrievedDate` | string | yes | ISO 8601 date the source was consulted. |
| `accuracyNote` | string | yes | **Must state coords are approximate regional/city centroids, NOT datacenter locations.** |
| `license` | string | yes | License / terms under which this compiled value is published in-repo. Must reflect the **verified redistribution rights** of the centroid source. |

**Provenance guidance (OQ4, RESOLVED — see ARCHITECTURE.md §6):**

- **Metadata** (region code, name, launch year, AZ count, geography type) comes
  from the **AWS Global Infrastructure documentation** and the **SSM public
  parameters** under `/aws/service/global-infrastructure/...`.
- **Coordinates** are approximate city/metro centroids drawn from a **clearly
  documented source whose license has been verified to permit redistribution**.
  **Do not copy a third-party dataset without checking its license.**
- Every record **documents its coordinate provenance** and **must not** claim to
  represent actual AWS datacenter locations.

The `accuracyNote` is mandatory precisely because AWS does not publish exact
datacenter coordinates (see ARCHITECTURE.md §6). Every coordinate is an
approximate city/metro centroid for the Region's named location.

---

## 6. Example record

```json
{
  "schemaVersion": 1,
  "generatedDate": "2026-10-30",
  "datasetProvenance": {
    "source": "Region metadata from AWS Global Infrastructure documentation and AWS SSM public parameters (/aws/service/global-infrastructure/...); region-city centroids from a documented, redistribution-cleared centroid source",
    "retrievedDate": "2026-10-30",
    "accuracyNote": "Coordinates are approximate region-city centroids for the Region's named location, NOT AWS datacenter locations. AWS does not publish datacenter coordinates.",
    "license": "Derived compilation; metadata from AWS Global Infrastructure docs + SSM public parameters, centroids from a redistribution-cleared source (license verified). See docs/ARCHITECTURE.md §6."
  },
  "regions": [
    {
      "regionCode": "us-east-1",
      "name": "US East (N. Virginia)",
      "lat": 38.95,
      "lon": -77.45,
      "country": "United States",
      "continent": "North America",
      "launchYear": 2006,
      "azCount": 6,
      "geographyType": "commercial",
      "provenance": {
        "source": "AWS Global Infrastructure docs + SSM public parameter /aws/service/global-infrastructure/regions/us-east-1/...; N. Virginia metro centroid from redistribution-cleared source",
        "retrievedDate": "2026-10-30",
        "accuracyNote": "Approximate N. Virginia metro centroid; NOT a datacenter location.",
        "license": "Derived compilation — see datasetProvenance."
      }
    }
  ]
}
```

---

## 7. Consumer / producer contract rules

- **Producer (map-data):** emits a file that validates against this schema; sets
  `schemaVersion`, `generatedDate`, and a complete provenance block on the
  dataset (and per-record where a value's source differs). Every coordinate's
  `accuracyNote` must carry the "approximate, not datacenter" caveat.
- **Consumer (map-frontend):** asserts `schemaVersion === 1` at load; treats the
  data as read-only; renders `lat`/`lon` as markers, filters on `continent`,
  `launchYear`, `azCount`, `geographyType`; surfaces the `accuracyNote` in the UI.
- **Validation in CI (map-tester):** a JSON-schema (or equivalent) check fails
  the build if any record violates §3/§4/§5. This keeps the parallel mates honest
  against the frozen seam.

---

*End of DATA_CONTRACT.md.*
