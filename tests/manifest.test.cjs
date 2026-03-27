/**
 * THRUNT Tools Tests - Evidence Manifest
 *
 * Tests for manifest.cjs: schema creation, canonical serialization,
 * validation, content hashing, and bidirectional artifact links.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MANIFEST_VERSION,
  createEvidenceManifest,
  validateManifest,
  canonicalSerialize,
  sortKeysDeep,
  computeContentHash,
  normalizeTimestamp,
} = require('../thrunt-god/bin/lib/manifest.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalInput() {
  return {
    connector_id: 'splunk',
    dataset: 'events',
    execution: {
      profile: 'default',
      query_id: 'QRY-20260327120000-A1B2C3D4',
      request_id: 'REQ-20260327120000-E5F6G7H8',
      status: 'ok',
      started_at: '2026-03-27T12:00:00.000Z',
      completed_at: '2026-03-27T12:00:03.000Z',
      duration_ms: 3000,
      dry_run: false,
    },
    artifacts: [
      {
        id: 'QRY-20260327120000-A1B2C3D4',
        type: 'query_log',
        path: '.planning/QUERIES/QRY-20260327120000-A1B2C3D4.md',
        content: '# Query Log\n\nSome content here.',
        receipt_ids: ['RCT-20260327120000-A1B2C3D4'],
      },
      {
        id: 'RCT-20260327120000-A1B2C3D4',
        type: 'receipt',
        path: '.planning/RECEIPTS/RCT-20260327120000-A1B2C3D4.md',
        content: '# Receipt\n\nSome receipt content.',
        query_ids: ['QRY-20260327120000-A1B2C3D4'],
      },
    ],
    hypothesis_ids: ['HYP-01'],
    tags: ['identity-pivot'],
    raw_metadata: { custom_field: 'value' },
  };
}

// ---------------------------------------------------------------------------
// MANIFEST_VERSION
// ---------------------------------------------------------------------------

describe('MANIFEST_VERSION', () => {
  it('is "1.0"', () => {
    assert.strictEqual(MANIFEST_VERSION, '1.0');
  });
});

// ---------------------------------------------------------------------------
// createEvidenceManifest
// ---------------------------------------------------------------------------

describe('createEvidenceManifest', () => {
  it('returns object with manifest_version "1.0", manifest_id starting with "MAN-", and created_at in UTC ISO-8601', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    assert.strictEqual(manifest.manifest_version, '1.0');
    assert.ok(manifest.manifest_id.startsWith('MAN-'), `manifest_id should start with MAN-, got: ${manifest.manifest_id}`);
    assert.ok(manifest.created_at.endsWith('Z'), `created_at should end with Z, got: ${manifest.created_at}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(manifest.created_at), `created_at should be ISO-8601`);
  });

  it('returns all required fields', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    assert.ok(manifest.manifest_version);
    assert.ok(manifest.manifest_id);
    assert.ok(manifest.created_at);
    assert.ok(manifest.connector_id);
    assert.ok(manifest.dataset);
    assert.ok(manifest.execution);
    assert.ok(Array.isArray(manifest.artifacts));
    assert.ok(manifest.artifacts.length > 0);
  });

  it('fills missing optional fields with explicit null', () => {
    const input = makeMinimalInput();
    delete input.hypothesis_ids;
    delete input.tags;
    delete input.raw_metadata;

    const manifest = createEvidenceManifest(input);
    assert.strictEqual(manifest.hypothesis_ids, null);
    assert.strictEqual(manifest.tags, null);
    assert.strictEqual(manifest.raw_metadata, null);
  });

  it('artifact entries contain id, type, path, and content_hash fields', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    for (const artifact of manifest.artifacts) {
      assert.ok(artifact.id, 'artifact should have id');
      assert.ok(artifact.type, 'artifact should have type');
      assert.ok(artifact.path, 'artifact should have path');
      assert.ok(artifact.content_hash, 'artifact should have content_hash');
      assert.ok(artifact.content_hash.startsWith('sha256:'), `content_hash should start with sha256:, got: ${artifact.content_hash}`);
    }
  });

  it('artifact entries do NOT contain the raw content string', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    for (const artifact of manifest.artifacts) {
      assert.strictEqual(artifact.content, undefined, 'content should not be in the manifest artifact entry');
    }
  });

  it('with finding artifacts sets type to "finding"', () => {
    const input = makeMinimalInput();
    input.artifacts.push({
      id: 'FND-20260327120000-DEADBEEF',
      type: 'finding',
      path: '.planning/FINDINGS/FND-20260327120000-DEADBEEF.md',
      content: '# Finding\n\nSome finding content.',
    });
    const manifest = createEvidenceManifest(input);
    const findingArtifact = manifest.artifacts.find(a => a.type === 'finding');
    assert.ok(findingArtifact, 'should have a finding artifact');
    assert.strictEqual(findingArtifact.type, 'finding');
  });

  it('bidirectional links: query_log artifact includes receipt_ids, receipt artifact includes query_ids', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const queryArtifact = manifest.artifacts.find(a => a.type === 'query_log');
    const receiptArtifact = manifest.artifacts.find(a => a.type === 'receipt');

    assert.ok(queryArtifact, 'should have a query_log artifact');
    assert.ok(receiptArtifact, 'should have a receipt artifact');

    assert.ok(Array.isArray(queryArtifact.receipt_ids), 'query_log should have receipt_ids array');
    assert.ok(queryArtifact.receipt_ids.length > 0, 'query_log receipt_ids should not be empty');
    assert.ok(queryArtifact.receipt_ids.includes('RCT-20260327120000-A1B2C3D4'));

    assert.ok(Array.isArray(receiptArtifact.query_ids), 'receipt should have query_ids array');
    assert.ok(receiptArtifact.query_ids.length > 0, 'receipt query_ids should not be empty');
    assert.ok(receiptArtifact.query_ids.includes('QRY-20260327120000-A1B2C3D4'));
  });
});

// ---------------------------------------------------------------------------
// sortKeysDeep
// ---------------------------------------------------------------------------

describe('sortKeysDeep', () => {
  it('produces lexicographically sorted keys at all nesting levels including arrays of objects', () => {
    const input = {
      z_key: 'last',
      a_key: 'first',
      m_nested: {
        z_inner: 1,
        a_inner: 2,
      },
      array_field: [
        { z_arr: true, a_arr: false },
        { m_arr: 'mid', b_arr: 'begin' },
      ],
    };

    const sorted = sortKeysDeep(input);
    const keys = Object.keys(sorted);
    assert.deepStrictEqual(keys, ['a_key', 'array_field', 'm_nested', 'z_key']);

    const nestedKeys = Object.keys(sorted.m_nested);
    assert.deepStrictEqual(nestedKeys, ['a_inner', 'z_inner']);

    const arrObjKeys0 = Object.keys(sorted.array_field[0]);
    assert.deepStrictEqual(arrObjKeys0, ['a_arr', 'z_arr']);

    const arrObjKeys1 = Object.keys(sorted.array_field[1]);
    assert.deepStrictEqual(arrObjKeys1, ['b_arr', 'm_arr']);
  });

  it('passes through primitives and null unchanged', () => {
    assert.strictEqual(sortKeysDeep(null), null);
    assert.strictEqual(sortKeysDeep(42), 42);
    assert.strictEqual(sortKeysDeep('hello'), 'hello');
    assert.strictEqual(sortKeysDeep(true), true);
  });

  it('preserves array order', () => {
    const input = [3, 1, 2];
    assert.deepStrictEqual(sortKeysDeep(input), [3, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// canonicalSerialize
// ---------------------------------------------------------------------------

describe('canonicalSerialize', () => {
  it('produces identical output for objects constructed in different key insertion orders', () => {
    const objA = { z: 1, a: 2, m: 3 };
    const objB = { a: 2, m: 3, z: 1 };
    const objC = { m: 3, z: 1, a: 2 };

    const serA = canonicalSerialize(objA);
    const serB = canonicalSerialize(objB);
    const serC = canonicalSerialize(objC);

    assert.strictEqual(serA, serB);
    assert.strictEqual(serB, serC);
  });

  it('output is valid JSON', () => {
    const obj = { nested: { key: 'value' }, arr: [1, 2] };
    const json = canonicalSerialize(obj);
    const parsed = JSON.parse(json);
    assert.deepStrictEqual(parsed.nested, { key: 'value' });
    assert.deepStrictEqual(parsed.arr, [1, 2]);
  });
});

// ---------------------------------------------------------------------------
// computeContentHash
// ---------------------------------------------------------------------------

describe('computeContentHash', () => {
  it('returns "sha256:" prefixed hex digest', () => {
    const hash = computeContentHash('hello world');
    assert.ok(hash.startsWith('sha256:'), `should start with sha256:, got: ${hash}`);
    // SHA-256 hex digest is 64 chars
    const hexPart = hash.slice('sha256:'.length);
    assert.strictEqual(hexPart.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hexPart), 'hex part should be lowercase hex');
  });

  it('same content always produces same hash', () => {
    const content = 'deterministic content test';
    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    assert.strictEqual(hash1, hash2);
  });

  it('different content produces different hash', () => {
    const hash1 = computeContentHash('content A');
    const hash2 = computeContentHash('content B');
    assert.notStrictEqual(hash1, hash2);
  });
});

// ---------------------------------------------------------------------------
// normalizeTimestamp
// ---------------------------------------------------------------------------

describe('normalizeTimestamp', () => {
  it('converts offset timestamps to UTC ISO-8601 with trailing Z', () => {
    const result = normalizeTimestamp('2026-03-27T12:00:00+05:30');
    assert.ok(result.endsWith('Z'), `should end with Z, got: ${result}`);
    // 12:00:00+05:30 = 06:30:00Z
    assert.strictEqual(result, '2026-03-27T06:30:00.000Z');
  });

  it('passes through already-UTC timestamps unchanged', () => {
    const utc = '2026-03-27T12:00:00.000Z';
    assert.strictEqual(normalizeTimestamp(utc), utc);
  });

  it('returns null for falsy input', () => {
    assert.strictEqual(normalizeTimestamp(null), null);
    assert.strictEqual(normalizeTimestamp(undefined), null);
    assert.strictEqual(normalizeTimestamp(''), null);
  });
});

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  it('returns { valid: true } for a well-formed manifest', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('returns { valid: false, errors: [...] } when manifest_version is missing', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    delete manifest.manifest_version;
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some(e => /manifest_version/i.test(e)));
  });

  it('returns { valid: false, errors: [...] } when manifest_id is missing', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    delete manifest.manifest_id;
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /manifest_id/i.test(e)));
  });

  it('returns { valid: false, errors: [...] } when created_at is missing', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    delete manifest.created_at;
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /created_at/i.test(e)));
  });

  it('returns { valid: false, errors: [...] } when artifacts array is missing', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    delete manifest.artifacts;
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /artifacts/i.test(e)));
  });

  it('returns { valid: false, errors: [...] } when artifacts array is empty', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    manifest.artifacts = [];
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /artifacts/i.test(e)));
  });

  it('returns { valid: false, errors: [...] } when artifact is missing required fields', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    manifest.artifacts[0] = { id: 'test' }; // missing type, path, content_hash
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});
