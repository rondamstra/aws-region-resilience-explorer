/**
 * Contract — infra/amplify-service-role.yaml (the one-time privileged CFN that
 * creates the Amplify Gen 2 backend-deploy service role).
 *
 * Parsed with a REAL YAML parser. CloudFormation intrinsic short-form tags
 * (!Ref / !Sub / !GetAtt / !If / !Equals / !Not / !And / !Or / !Join /
 * !Select / !FindInMap / !Base64 / !GetAZs / !ImportValue / !Split /
 * !Condition) are NOT core-YAML tags, so the default parser drops them and
 * warns. We register each as an OPAQUE custom tag that preserves the node's
 * content, so the document parses cleanly AND the intrinsic's argument stays
 * inspectable (e.g. `!Ref AWS::AccountId` → { $tag:'!Ref', value:'AWS::AccountId' }).
 *
 * Contract asserted:
 *   - Template parses (valid CFN document with a version + Resources).
 *   - Exactly one AWS::IAM::Role whose assume-role trust Principal.Service is
 *     amplify.amazonaws.com.
 *   - Trust has an aws:SourceAccount condition AND an aws:SourceArn condition
 *     (the official Amplify confused-deputy guards).
 *   - Parameterized: Parameters include AmplifyAppId and RoleName.
 *   - NO hardcoded 12-digit AWS account id anywhere in the file.
 *   - Outputs expose the role ARN (via !GetAtt <role>.Arn).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, Scalar, type CollectionTag, type ScalarTag } from 'yaml';

const tmplPath = resolve(process.cwd(), 'infra/amplify-service-role.yaml');

/**
 * Opaque tagged value: preserves the intrinsic tag name and its raw argument so
 * assertions can read e.g. a `!Ref AWS::AccountId` argument without CFN
 * evaluation. For !Sub we keep the string; for collection intrinsics (!If,
 * !Equals, ...) we keep the array/object.
 */
interface Intrinsic {
  $intrinsic: string;
  value: unknown;
}

function makeScalarTag(tag: string): ScalarTag {
  return {
    tag,
    // Match the short-form intrinsic token exactly.
    identify: () => false,
    resolve(value: string): Intrinsic {
      return { $intrinsic: tag, value };
    },
  };
}

function makeCollectionTag(tag: string): CollectionTag {
  return {
    tag,
    collection: 'seq',
    resolve(seq: unknown): Intrinsic {
      // seq is a YAMLSeq; convert to a plain array via toJSON when available.
      const arr =
        seq && typeof (seq as { toJSON?: () => unknown }).toJSON === 'function'
          ? (seq as { toJSON: () => unknown }).toJSON()
          : seq;
      return { $intrinsic: tag, value: arr };
    },
  };
}

// Scalar-form intrinsics (take a single scalar argument).
const SCALAR_INTRINSICS = ['!Ref', '!Sub', '!GetAtt', '!Base64', '!GetAZs', '!ImportValue', '!Condition'];
// Sequence-form intrinsics (take a list of arguments).
const SEQ_INTRINSICS = ['!If', '!Equals', '!Not', '!And', '!Or', '!Join', '!Select', '!FindInMap', '!Split', '!Sub', '!GetAtt'];

const customTags = [
  ...SCALAR_INTRINSICS.map(makeScalarTag),
  ...SEQ_INTRINSICS.map(makeCollectionTag),
];

const raw = existsSync(tmplPath) ? readFileSync(tmplPath, 'utf8') : '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCfn(text: string): any {
  return parse(text, { customTags, strict: false });
}

function isIntrinsic(v: unknown, name?: string): v is Intrinsic {
  const ok = !!v && typeof v === 'object' && '$intrinsic' in (v as object);
  return ok && (name === undefined || (v as Intrinsic).$intrinsic === name);
}

describe('infra/amplify-service-role.yaml — CloudFormation contract (real YAML parse)', () => {
  it('exists at infra/amplify-service-role.yaml', () => {
    expect(existsSync(tmplPath)).toBe(true);
  });

  it('parses as a CloudFormation YAML document (intrinsic tags resolved opaquely)', () => {
    expect(() => parseCfn(raw)).not.toThrow();
    const doc = parseCfn(raw);
    expect(doc).toBeTypeOf('object');
    expect(doc.AWSTemplateFormatVersion).toBe('2010-09-09');
    expect(doc.Resources).toBeTypeOf('object');
  });

  const doc = raw ? parseCfn(raw) : {};

  const roleEntries = (): [string, any][] =>
    Object.entries((doc.Resources ?? {}) as Record<string, any>).filter(
      ([, r]) => r?.Type === 'AWS::IAM::Role',
    );

  it('declares exactly one AWS::IAM::Role', () => {
    expect(roleEntries().length).toBe(1);
  });

  it("the role's trust policy Principal.Service is amplify.amazonaws.com", () => {
    const [, role] = roleEntries()[0];
    const trust = role.Properties.AssumeRolePolicyDocument;
    expect(trust.Version).toBe('2012-10-17');
    const statements = trust.Statement as any[];
    const amplifyStmt = statements.find((s) => {
      const svc = s?.Principal?.Service;
      return svc === 'amplify.amazonaws.com' || (Array.isArray(svc) && svc.includes('amplify.amazonaws.com'));
    });
    expect(amplifyStmt, 'a trust statement must allow amplify.amazonaws.com to AssumeRole').toBeDefined();
    const action = amplifyStmt.Action;
    expect(
      action === 'sts:AssumeRole' || (Array.isArray(action) && action.includes('sts:AssumeRole')),
    ).toBe(true);
    expect(amplifyStmt.Effect).toBe('Allow');
  });

  it('trust policy carries an aws:SourceAccount condition (confused-deputy guard)', () => {
    const [, role] = roleEntries()[0];
    const stmt = (role.Properties.AssumeRolePolicyDocument.Statement as any[]).find(
      (s) => s?.Principal?.Service === 'amplify.amazonaws.com',
    );
    const cond = stmt.Condition ?? {};
    // Find aws:SourceAccount under any condition operator (StringEquals, etc.).
    const hasSourceAccount = Object.values(cond).some(
      (ops: any) => ops && typeof ops === 'object' && 'aws:SourceAccount' in ops,
    );
    expect(hasSourceAccount, 'trust must restrict aws:SourceAccount').toBe(true);
    // And it must be bound to the deploy-context account, not a hardcoded id.
    const srcAcct = (Object.values(cond) as any[])
      .map((ops) => ops?.['aws:SourceAccount'])
      .find((v) => v !== undefined);
    expect(isIntrinsic(srcAcct, '!Ref') && String((srcAcct as Intrinsic).value).includes('AWS::AccountId')).toBe(true);
  });

  it('trust policy carries an aws:SourceArn condition (per-app scoping)', () => {
    const [, role] = roleEntries()[0];
    const stmt = (role.Properties.AssumeRolePolicyDocument.Statement as any[]).find(
      (s) => s?.Principal?.Service === 'amplify.amazonaws.com',
    );
    const cond = stmt.Condition ?? {};
    const hasSourceArn = Object.values(cond).some(
      (ops: any) => ops && typeof ops === 'object' && 'aws:SourceArn' in ops,
    );
    expect(hasSourceArn, 'trust must restrict aws:SourceArn to this Amplify app').toBe(true);
  });

  it('is parameterized: Parameters include AmplifyAppId and RoleName', () => {
    expect(doc.Parameters).toBeTypeOf('object');
    expect(doc.Parameters.AmplifyAppId, 'AmplifyAppId parameter required').toBeDefined();
    expect(doc.Parameters.RoleName, 'RoleName parameter required').toBeDefined();
    expect(doc.Parameters.AmplifyAppId.Type).toBe('String');
    expect(doc.Parameters.RoleName.Type).toBe('String');
  });

  it('contains NO hardcoded 12-digit AWS account id anywhere in the file', () => {
    // A standalone 12-digit run is an AWS account id. Account ids must come from
    // ${AWS::AccountId} / !Ref AWS::AccountId, never a literal.
    const matches = raw.match(/(?<!\d)\d{12}(?!\d)/g) ?? [];
    expect(matches, `hardcoded account id(s) found: ${matches.join(', ')}`).toHaveLength(0);
  });

  it('Outputs expose the role ARN via !GetAtt <role>.Arn', () => {
    expect(doc.Outputs).toBeTypeOf('object');
    const roleLogicalId = roleEntries()[0][0];
    const arnOutput = Object.values(doc.Outputs as Record<string, any>).find((o) => {
      const v = o?.Value;
      return (
        isIntrinsic(v, '!GetAtt') &&
        String((v as Intrinsic).value).includes(roleLogicalId) &&
        String((v as Intrinsic).value).includes('Arn')
      );
    });
    expect(arnOutput, 'an Output must expose !GetAtt <role>.Arn').toBeDefined();
  });

  // Proof the opaque-tag registration actually works (guards against a silent
  // regression where tags stop resolving and every intrinsic becomes null).
  it('intrinsic tags are preserved as inspectable opaque values (parser self-check)', () => {
    const [, role] = roleEntries()[0];
    expect(isIntrinsic(role.Properties.RoleName, '!Ref')).toBe(true);
    expect((role.Properties.RoleName as Intrinsic).value).toBe('RoleName');
    // Silence unused-import lint for Scalar (kept for type reference).
    void Scalar;
  });
});
