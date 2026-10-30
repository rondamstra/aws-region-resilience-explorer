/**
 * Contract — validate data/regions.v1.json against data/regions.schema.json.
 *
 * THE FROZEN-SEAM GUARD. Covers AC-7.1 .. AC-7.5 (see tests/TEST_STRATEGY.md §3).
 * This test MUST fail CI on any violation (DATA_CONTRACT §7, R6 mitigation).
 *
 * ARTIFACTS (owned by map-data):
 *   - data/regions.v1.json      (the dataset)
 *   - data/regions.schema.json  (JSON Schema describing DATA_CONTRACT §3/§4/§5)
 *
 * Validator: Ajv (JSON Schema draft 2020-12) + ajv-formats for "date".
 *
 * WIRED to the real artifacts: validates data/regions.v1.json against
 * data/regions.schema.json with Ajv, and includes negative controls proving
 * the validator FAILS on an out-of-range value and on a stray property.
 */
import { describe, it, expect } from 'vitest';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../data/regions.schema.json' with { type: 'json' };
import dataset from '../../data/regions.v1.json' with { type: 'json' };

const CONTINENTS = [
  'North America', 'South America', 'Europe', 'Africa',
  'Middle East', 'Asia Pacific', 'Oceania',
];

type Rec = {
  regionCode: string;
  lat: number;
  lon: number;
  launchYear: number;
  azCount: number;
  continent: string;
  geographyType: string;
  provenance?: { accuracyNote?: string };
};
type Doc = {
  schemaVersion: number;
  generatedDate: string;
  datasetProvenance: { accuracyNote: string };
  regions: Rec[];
};

describe('data contract — regions.v1.json ⊨ regions.schema.json (AC-7.1 .. AC-7.5)', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate: ValidateFunction = ajv.compile(schema);
  const doc = dataset as Doc;

  it('AC-7.1: dataset validates against the schema with zero errors (FAILS CI on violation)', () => {
    const ok = validate(dataset);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it('AC-7.1: Ajv validation FAILS on an injected violation (negative control)', () => {
    // Deep clone, then violate the lat range on the first record.
    const bad = JSON.parse(JSON.stringify(dataset)) as Doc;
    bad.regions[0].lat = 999;
    expect(validate(bad)).toBe(false);
  });

  it('AC-7.1: Ajv validation FAILS on a stray additional property', () => {
    const bad = JSON.parse(JSON.stringify(dataset)) as Doc & { regions: Array<Rec & Record<string, unknown>> };
    bad.regions[0].surpriseField = true;
    expect(validate(bad)).toBe(false);
  });

  it('AC-7.2: schemaVersion === 1', () => {
    expect(doc.schemaVersion).toBe(1);
  });

  it('AC-7.3: regionCode values are unique', () => {
    const codes = doc.regions.map((r) => r.regionCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('AC-7.4: every record satisfies ranges & enums', () => {
    const genYear = Number(doc.generatedDate.slice(0, 4));
    for (const r of doc.regions) {
      expect(r.lat).toBeGreaterThanOrEqual(-90);
      expect(r.lat).toBeLessThanOrEqual(90);
      expect(r.lon).toBeGreaterThanOrEqual(-180);
      expect(r.lon).toBeLessThanOrEqual(180);
      expect(r.launchYear).toBeGreaterThanOrEqual(2006);
      expect(r.launchYear).toBeLessThanOrEqual(genYear);
      expect(r.azCount).toBeGreaterThanOrEqual(1);
      expect(CONTINENTS).toContain(r.continent);
      expect(r.geographyType).toBe('commercial'); // OQ5: MVP commercial-only
    }
  });

  it('AC-7.5: every record (or dataset default) carries the "approximate, NOT datacenter" accuracyNote', () => {
    for (const r of doc.regions) {
      const note = (r.provenance?.accuracyNote ?? doc.datasetProvenance.accuracyNote).toLowerCase();
      expect(note).toContain('approximate');
      expect(note).toContain('not');
      expect(note).toContain('datacenter');
    }
  });

  it('the schema itself is additionalProperties-strict on records (catches stray fields)', () => {
    const recordSchema = (schema as { $defs: { region: { additionalProperties: boolean } } }).$defs.region;
    expect(recordSchema.additionalProperties).toBe(false);
  });
});
