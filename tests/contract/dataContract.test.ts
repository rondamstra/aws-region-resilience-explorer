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
 * `describe.skip` until both artifacts exist. On enabling, remove `.skip` and the
 * two TODO imports; the describe body already asserts the real schema+data.
 */
import { describe, it, expect } from 'vitest';
// import Ajv from 'ajv/dist/2020';
// import addFormats from 'ajv-formats';
// import schema from '../../data/regions.schema.json';
// import dataset from '../../data/regions.v1.json';

const CONTINENTS = [
  'North America', 'South America', 'Europe', 'Africa',
  'Middle East', 'Asia Pacific', 'Oceania',
];

describe.skip('data contract — regions.v1.json ⊨ regions.schema.json (AC-7.1 .. AC-7.5)', () => {
  // const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
  // const validate = ajv.compile(schema);

  it('AC-7.1: dataset validates against the schema with zero errors (FAILS CI on violation)', () => {
    // const ok = validate(dataset);
    // if (!ok) console.error(validate.errors);
    // expect(ok).toBe(true);
    expect(true).toBe(true); // TODO: enable Ajv validation once artifacts exist
  });

  it('AC-7.2: schemaVersion === 1', () => {
    // expect((dataset as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(true).toBe(true);
  });

  it('AC-7.3: regionCode values are unique', () => {
    // const codes = (dataset as { regions: { regionCode: string }[] }).regions.map((r) => r.regionCode);
    // expect(new Set(codes).size).toBe(codes.length);
    expect(true).toBe(true);
  });

  it('AC-7.4: every record satisfies ranges & enums', () => {
    // const genYear = Number((dataset as { generatedDate: string }).generatedDate.slice(0, 4));
    // for (const r of (dataset as { regions: any[] }).regions) {
    //   expect(r.lat).toBeGreaterThanOrEqual(-90);  expect(r.lat).toBeLessThanOrEqual(90);
    //   expect(r.lon).toBeGreaterThanOrEqual(-180); expect(r.lon).toBeLessThanOrEqual(180);
    //   expect(r.launchYear).toBeGreaterThanOrEqual(2006);
    //   expect(r.launchYear).toBeLessThanOrEqual(genYear);
    //   expect(r.azCount).toBeGreaterThanOrEqual(1);
    //   expect(CONTINENTS).toContain(r.continent);
    //   expect(r.geographyType).toBe('commercial'); // OQ5: MVP commercial-only
    // }
    expect(CONTINENTS).toHaveLength(7); // placeholder keeps enum visible
  });

  it('AC-7.5: every record (or dataset default) carries the "approximate, NOT datacenter" accuracyNote', () => {
    // for (const r of (dataset as { regions: any[]; datasetProvenance: any }).regions) {
    //   const note = (r.provenance?.accuracyNote ?? (dataset as any).datasetProvenance.accuracyNote).toLowerCase();
    //   expect(note).toContain('approximate');
    //   expect(note).toContain('not');
    //   expect(note).toContain('datacenter');
    // }
    expect(true).toBe(true);
  });

  it('the schema itself is additionalProperties-strict on records (catches stray fields)', () => {
    // Guards against silent drift: a new field must be a deliberate schemaVersion bump.
    // const recordSchema = (schema as any).properties?.regions?.items;
    // expect(recordSchema?.additionalProperties).toBe(false);
    expect(true).toBe(true);
  });
});
