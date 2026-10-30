# AWS Region dataset (`data/`)

This directory is the **source-of-truth seam** for the AWS Region Resilience
Explorer. It contains the versioned static JSON dataset consumed by the
frontend, the JSON Schema that freezes its shape, and a dependency-free
validator. The shape is defined by `docs/DATA_CONTRACT.md` (schemaVersion 1) and
the data-source policy by `docs/ARCHITECTURE.md` §6.

## Files

| File | Purpose |
|---|---|
| `regions.v1.json` | The dataset: all operational commercial `aws`-partition Regions. |
| `regions.schema.json` | JSON Schema (draft 2020-12) encoding DATA_CONTRACT §3/§4/§5, for CI/map-tester. |
| `validate.py` | Zero-dependency validator: schema + cross-field contract rules. |

## Scope (OQ5, resolved by lead)

The dataset contains **only operational commercial AWS Regions in the standard
`aws` partition**. Every record has `geographyType: "commercial"`.

**Explicitly excluded:** AWS GovCloud (US), the China partition (Beijing /
Ningxia), Regions that are announced but not yet operational, and
Local Zones / Wavelength Zones / Outposts.

As of the retrieval date (2026-10-30) this is **33 Regions**.

## Sources & retrieval

- **Region identifiers and metadata** — `regionCode`, `name`, `launchYear`,
  `azCount`, `geographyType` — are compiled from the **official AWS Global
  Infrastructure documentation** and the **AWS Systems Manager (SSM) public
  parameter namespace** `/aws/service/global-infrastructure/...`
  (e.g. `/aws/service/global-infrastructure/regions/<code>/...`).
- **Coordinates** (`lat`/`lon`) are **approximate centroids of each Region's
  publicly named metro/city location** (e.g. `us-east-1` → Northern Virginia /
  Washington-DC metro, `eu-west-1` → Dublin). They are standard public
  geographic facts — the well-known latitude/longitude of the named city or
  metro area — rounded to ~2 decimal places.
- **`country` / `continent`** are derived from each Region's named location.
  Continents use the DATA_CONTRACT §4 enum, which splits out `Middle East` and
  `Oceania` from Asia; Australian Regions (`ap-southeast-2` Sydney,
  `ap-southeast-4` Melbourne) are therefore `Oceania`.
- **Retrieval date:** 2026-10-30, recorded in `generatedDate`, the
  dataset-level `datasetProvenance.retrievedDate`, and every per-record
  `provenance.retrievedDate`.

> **Note on API access.** This dataset was compiled **without calling any AWS
> API** (no AWS credentials were used). Metadata reflects the AWS Global
> Infrastructure documentation and the published SSM public-parameter namespace
> as the authoritative sources; it was transcribed from knowledge of those
> sources, not pulled live. See *Low-confidence fields* below for items to
> re-verify against a live SSM query before release.

## The approximate-centroid caveat (first-class)

**Coordinates are NOT AWS datacenter locations.** AWS deliberately does not
publish datacenter coordinates (ARCHITECTURE §6). Every `lat`/`lon` here is an
**approximate city/metro centroid** for the Region's named location, intended
only as a geographic reference point for map markers and great-circle
(haversine) distance estimation. Every record's `provenance.accuracyNote`
states this explicitly, and the UI surfaces the caveat (ARCHITECTURE §9, R1).

## License / redistribution rationale

The dataset is a **derived compilation** and is redistribution-safe:

1. **Region metadata** (codes, names, launch years, AZ counts) is **factual AWS
   infrastructure data** published by AWS in its Global Infrastructure docs and
   SSM public-parameter namespace. These are public facts, not a proprietary
   licensed dataset.
2. **Coordinates** are **public geographic facts** — the standard lat/lon of
   well-known cities/metros. Individual factual coordinates are not
   copyrightable, and **no third-party coordinate dataset was copied**: the
   values are the named metro's public location, not an extract of any
   licensed/curated database (per OQ4 and ARCHITECTURE §6, "do not copy a
   third-party dataset without checking its license").

Because the compilation draws only on AWS-published facts and non-copyrightable
public city coordinates, it carries no third-party redistribution restriction
and is published in-repo for use within this project.

## How the file was produced

1. Enumerated the operational commercial `aws`-partition Regions from the AWS
   Global Infrastructure documentation + SSM public-parameter namespace, applying
   the OQ5 scope filter (no GovCloud/China/announced/Local Zones/Wavelength/Outposts).
2. For each Region, recorded metadata (name, launch year, AZ count) and attached
   the public centroid of its named metro, with `continent` mapped to the §4 enum.
3. Wrote the dataset-level `datasetProvenance` and a per-record `provenance`
   block (source, retrievedDate, accuracyNote, license) on every record.
4. Validated with `python3 data/validate.py` (see below). Re-run after any edit.

## Validating

```sh
python3 data/validate.py
# PASS: 33 region record(s) validate against regions.schema.json and all
# DATA_CONTRACT.md constraints (unique regionCode, launchYear<=generatedDate
# year, geographyType=commercial).
```

`validate.py` has **no external dependencies** (Python 3 standard library only).
It checks the schema (`regions.schema.json`) plus the cross-field rules a plain
schema cannot express: unique `regionCode`, `launchYear <= generatedDate` year,
and `geographyType == "commercial"` for the MVP. CI / map-tester can run this
script directly, or feed `regions.schema.json` to any draft 2020-12 validator.

## Low-confidence fields (flagged)

These were transcribed without a live AWS API call and should be re-verified
against a live SSM `get-parameters-by-path` query and current AWS docs before
release:

- **AZ counts (`azCount`).** AWS adds AZs over time. The larger, older Regions
  are confidently 3+ (`us-east-1` = 6, `us-west-2` = 4, `ap-northeast-1` /
  `ap-northeast-2` = 4). **Newer Regions are listed with the AWS-standard launch
  default of 3 AZs; treat those exact counts as low-confidence** and confirm per
  Region: `ca-west-1`, `eu-central-2`, `eu-south-2`, `me-central-1`,
  `il-central-1`, `ap-south-2`, `ap-southeast-3/4/5/7`, `ap-east-1`, `ap-east-2`,
  `mx-central-1`.
- **Launch years for the most recent Regions.** Confirm the GA year for
  `ap-southeast-5` (Malaysia, ~2024), `ap-southeast-7` (Thailand, ~2025),
  `ap-east-2` (Taipei, ~2025) and `mx-central-1` (Mexico, ~2025). These are near
  the current date and their exact GA year should be verified.
- **Region inventory completeness.** The set of operational Regions is
  time-sensitive; re-run the SSM enumeration at release time to catch any Region
  that reached GA between this retrieval date and release, and to drop any still
  only announced.
```
