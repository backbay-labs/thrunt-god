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
  computeManifestHash,
  buildProvenance,
  detectRuntimeName,
  applySignatureHooks,
  verifyManifestIntegrity,
} = require('../thrunt-god/bin/lib/manifest.cjs');

const fs = require('fs');
const os = require('os');
const path = require('path');

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
  it('is "1.1"', () => {
    assert.strictEqual(MANIFEST_VERSION, '1.1');
  });
});

// ---------------------------------------------------------------------------
// createEvidenceManifest
// ---------------------------------------------------------------------------

describe('createEvidenceManifest', () => {
  it('returns object with manifest_version "1.1", manifest_id starting with "MAN-", and created_at in UTC ISO-8601', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    assert.strictEqual(manifest.manifest_version, '1.1');
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

// ---------------------------------------------------------------------------
// computeManifestHash (Phase 14)
// ---------------------------------------------------------------------------

describe('computeManifestHash', () => {
  it('returns a sha256-prefixed hash string', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const hash = computeManifestHash(manifest);
    assert.ok(hash.startsWith('sha256:'), `should start with sha256:, got: ${hash}`);
    const hexPart = hash.slice('sha256:'.length);
    assert.strictEqual(hexPart.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hexPart), 'hex part should be lowercase hex');
  });

  it('excludes manifest_hash and signature fields from hash computation', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const hash1 = computeManifestHash(manifest);

    // Add manifest_hash and signature -- hash should be the same
    manifest.manifest_hash = 'sha256:aaaa';
    manifest.signature = { algo: 'test' };
    const hash2 = computeManifestHash(manifest);

    assert.strictEqual(hash1, hash2, 'manifest_hash and signature should be excluded from computation');
  });

  it('same manifest body always produces same hash regardless of key insertion order (idempotent)', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const hash1 = computeManifestHash(manifest);

    // Create same manifest with keys in different order
    const reordered = {};
    const keys = Object.keys(manifest).reverse();
    for (const k of keys) {
      reordered[k] = manifest[k];
    }
    const hash2 = computeManifestHash(reordered);

    assert.strictEqual(hash1, hash2, 'hash should be deterministic regardless of key order');
  });

  it('manifest with provenance produces a different hash than one without', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const hashWithout = computeManifestHash(manifest);

    manifest.provenance = {
      signer: { signer_type: 'system', signer_id: 'thrunt-runtime', signer_context: {} },
      environment: { os_platform: 'test', node_version: 'v20.0.0', thrunt_version: '0.1.0', runtime_name: 'unknown' },
      signed_at: '2026-03-27T12:00:00.000Z',
    };
    const hashWith = computeManifestHash(manifest);

    assert.notStrictEqual(hashWithout, hashWith, 'provenance should affect the hash');
  });
});

// ---------------------------------------------------------------------------
// buildProvenance (Phase 14)
// ---------------------------------------------------------------------------

describe('buildProvenance', () => {
  it('returns object with signer, environment, and signed_at fields', () => {
    const prov = buildProvenance();
    assert.ok(prov.signer, 'should have signer');
    assert.ok(prov.environment, 'should have environment');
    assert.ok(prov.signed_at, 'should have signed_at');
  });

  it('signer defaults to type "system", id "thrunt-runtime", context with cli_version', () => {
    const prov = buildProvenance();
    assert.strictEqual(prov.signer.signer_type, 'system');
    assert.strictEqual(prov.signer.signer_id, 'thrunt-runtime');
    assert.ok(prov.signer.signer_context.cli_version, 'signer_context should have cli_version');
  });

  it('environment includes os_platform, node_version, thrunt_version, runtime_name', () => {
    const prov = buildProvenance();
    assert.strictEqual(typeof prov.environment.os_platform, 'string');
    assert.strictEqual(typeof prov.environment.node_version, 'string');
    assert.strictEqual(typeof prov.environment.thrunt_version, 'string');
    assert.strictEqual(typeof prov.environment.runtime_name, 'string');
  });

  it('signed_at is a valid ISO-8601 UTC timestamp', () => {
    const prov = buildProvenance();
    assert.ok(prov.signed_at.endsWith('Z'), 'signed_at should end with Z');
    assert.ok(!isNaN(Date.parse(prov.signed_at)), 'signed_at should be parseable');
  });

  it('accepts options to override signer_type, signer_id, signer_context', () => {
    const prov = buildProvenance({
      signer_type: 'human',
      signer_id: 'alice@example.com',
      signer_context: { session_id: 'sess-123' },
    });
    assert.strictEqual(prov.signer.signer_type, 'human');
    assert.strictEqual(prov.signer.signer_id, 'alice@example.com');
    assert.deepStrictEqual(prov.signer.signer_context, { session_id: 'sess-123' });
  });
});

// ---------------------------------------------------------------------------
// detectRuntimeName (Phase 14)
// ---------------------------------------------------------------------------

describe('detectRuntimeName', () => {
  // Save and restore env vars to avoid side effects
  const envKeys = ['CLAUDECODE', 'GEMINI_CLI', 'CODEX_HOME', 'CURSOR_AGENT'];
  let savedEnv;

  function clearAgentEnv() {
    for (const key of envKeys) {
      delete process.env[key];
    }
  }

  // Save before all tests
  it('returns "claude" when CLAUDECODE is set', () => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    clearAgentEnv();
    try {
      process.env.CLAUDECODE = '1';
      assert.strictEqual(detectRuntimeName(), 'claude');
    } finally {
      clearAgentEnv();
      for (const key of envKeys) {
        if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns "gemini" when GEMINI_CLI is set', () => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    clearAgentEnv();
    try {
      process.env.GEMINI_CLI = '1';
      assert.strictEqual(detectRuntimeName(), 'gemini');
    } finally {
      clearAgentEnv();
      for (const key of envKeys) {
        if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns "codex" when CODEX_HOME is set', () => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    clearAgentEnv();
    try {
      process.env.CODEX_HOME = '/some/path';
      assert.strictEqual(detectRuntimeName(), 'codex');
    } finally {
      clearAgentEnv();
      for (const key of envKeys) {
        if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns "cursor" when CURSOR_AGENT is set', () => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    clearAgentEnv();
    try {
      process.env.CURSOR_AGENT = '1';
      assert.strictEqual(detectRuntimeName(), 'cursor');
    } finally {
      clearAgentEnv();
      for (const key of envKeys) {
        if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns "unknown" when no agent env vars are set', () => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
    clearAgentEnv();
    try {
      assert.strictEqual(detectRuntimeName(), 'unknown');
    } finally {
      for (const key of envKeys) {
        if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      }
    }
  });
});

// ---------------------------------------------------------------------------
// applySignatureHooks (Phase 14)
// ---------------------------------------------------------------------------

describe('applySignatureHooks', () => {
  it('returns manifest unchanged when no hooks provided', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const result = applySignatureHooks(manifest);
    assert.deepStrictEqual(result, manifest);
  });

  it('returns manifest unchanged when hooks is empty object', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const result = applySignatureHooks(manifest, {});
    assert.deepStrictEqual(result, manifest);
  });

  it('calls beforeSign then afterSign in order', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    const callOrder = [];

    const hooks = {
      beforeSign: (m) => { callOrder.push('before'); return m; },
      afterSign: (m) => { callOrder.push('after'); },
    };

    applySignatureHooks(manifest, hooks);
    assert.deepStrictEqual(callOrder, ['before', 'after']);
  });

  it('if beforeSign returns a value, that becomes the manifest for afterSign', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    let afterSignReceived = null;

    const modified = { ...manifest, signature: 'signed-by-test' };
    const hooks = {
      beforeSign: () => modified,
      afterSign: (m) => { afterSignReceived = m; },
    };

    const result = applySignatureHooks(manifest, hooks);
    assert.strictEqual(afterSignReceived.signature, 'signed-by-test');
    assert.strictEqual(result.signature, 'signed-by-test');
  });

  it('signature defaults to null when no hooks supplied', () => {
    const manifest = createEvidenceManifest(makeMinimalInput());
    manifest.signature = null;
    const result = applySignatureHooks(manifest);
    assert.strictEqual(result.signature, null);
  });
});

// ---------------------------------------------------------------------------
// verifyManifestIntegrity (Phase 14)
// ---------------------------------------------------------------------------

describe('verifyManifestIntegrity', () => {
  function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-test-'));
  }

  function cleanupDir(dirPath) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  }

  it('returns { valid: true, failures: [] } for an unmodified manifest with matching artifacts on disk', () => {
    const tmpDir = makeTempDir();
    try {
      // Write artifact files
      const artifactDir = path.join(tmpDir, '.planning', 'QUERIES');
      fs.mkdirSync(artifactDir, { recursive: true });
      const content = '# Query Log\n\nSome content here.';
      fs.writeFileSync(path.join(artifactDir, 'QRY-test.md'), content, 'utf-8');

      const manifest = {
        manifest_version: '1.1',
        manifest_id: 'MAN-TEST-001',
        created_at: '2026-03-27T12:00:00.000Z',
        connector_id: 'test',
        dataset: 'events',
        execution: { profile: 'default', query_id: 'QRY-test', request_id: 'REQ-test', status: 'ok', started_at: null, completed_at: null, duration_ms: 100, dry_run: false },
        artifacts: [
          {
            id: 'QRY-test',
            type: 'query_log',
            path: '.planning/QUERIES/QRY-test.md',
            content_hash: computeContentHash(content),
          },
        ],
        hypothesis_ids: null,
        tags: null,
        raw_metadata: null,
      };

      // Add manifest_hash
      manifest.manifest_hash = computeManifestHash(manifest);

      const result = verifyManifestIntegrity(manifest, tmpDir);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.failures, []);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('returns failure with type "manifest_hash" when manifest_hash does not match', () => {
    const tmpDir = makeTempDir();
    try {
      const artifactDir = path.join(tmpDir, '.planning', 'QUERIES');
      fs.mkdirSync(artifactDir, { recursive: true });
      const content = '# Test content';
      fs.writeFileSync(path.join(artifactDir, 'QRY-test.md'), content, 'utf-8');

      const manifest = {
        manifest_version: '1.1',
        manifest_id: 'MAN-TEST-002',
        created_at: '2026-03-27T12:00:00.000Z',
        connector_id: 'test',
        dataset: 'events',
        execution: { profile: 'default', query_id: 'QRY-test', request_id: 'REQ-test', status: 'ok', started_at: null, completed_at: null, duration_ms: 100, dry_run: false },
        artifacts: [
          {
            id: 'QRY-test',
            type: 'query_log',
            path: '.planning/QUERIES/QRY-test.md',
            content_hash: computeContentHash(content),
          },
        ],
        hypothesis_ids: null,
        tags: null,
        raw_metadata: null,
        manifest_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      };

      const result = verifyManifestIntegrity(manifest, tmpDir);
      assert.strictEqual(result.valid, false);
      assert.ok(result.failures.length > 0);
      const hashFailure = result.failures.find(f => f.type === 'manifest_hash');
      assert.ok(hashFailure, 'should have a manifest_hash failure');
      assert.strictEqual(hashFailure.expected, manifest.manifest_hash);
      assert.ok(hashFailure.actual.startsWith('sha256:'));
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('returns failure with type "artifact_hash" when artifact content on disk differs', () => {
    const tmpDir = makeTempDir();
    try {
      const artifactDir = path.join(tmpDir, '.planning', 'QUERIES');
      fs.mkdirSync(artifactDir, { recursive: true });
      const originalContent = '# Original content';
      const tamperedContent = '# Tampered content';
      fs.writeFileSync(path.join(artifactDir, 'QRY-test.md'), tamperedContent, 'utf-8');

      const manifest = {
        manifest_version: '1.1',
        manifest_id: 'MAN-TEST-003',
        created_at: '2026-03-27T12:00:00.000Z',
        connector_id: 'test',
        dataset: 'events',
        execution: { profile: 'default', query_id: 'QRY-test', request_id: 'REQ-test', status: 'ok', started_at: null, completed_at: null, duration_ms: 100, dry_run: false },
        artifacts: [
          {
            id: 'QRY-test',
            type: 'query_log',
            path: '.planning/QUERIES/QRY-test.md',
            content_hash: computeContentHash(originalContent), // hash of original, not tampered
          },
        ],
        hypothesis_ids: null,
        tags: null,
        raw_metadata: null,
      };

      const result = verifyManifestIntegrity(manifest, tmpDir);
      assert.strictEqual(result.valid, false);
      const artFailure = result.failures.find(f => f.type === 'artifact_hash');
      assert.ok(artFailure, 'should have an artifact_hash failure');
      assert.strictEqual(artFailure.artifact_id, 'QRY-test');
      assert.strictEqual(artFailure.expected, computeContentHash(originalContent));
      assert.strictEqual(artFailure.actual, computeContentHash(tamperedContent));
      assert.ok(artFailure.last_modified, 'should include last_modified');
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('returns failure with type "artifact_missing" when artifact file does not exist', () => {
    const tmpDir = makeTempDir();
    try {
      const manifest = {
        manifest_version: '1.1',
        manifest_id: 'MAN-TEST-004',
        created_at: '2026-03-27T12:00:00.000Z',
        connector_id: 'test',
        dataset: 'events',
        execution: { profile: 'default', query_id: 'QRY-test', request_id: 'REQ-test', status: 'ok', started_at: null, completed_at: null, duration_ms: 100, dry_run: false },
        artifacts: [
          {
            id: 'QRY-test',
            type: 'query_log',
            path: '.planning/QUERIES/QRY-nonexistent.md',
            content_hash: 'sha256:abc',
          },
        ],
        hypothesis_ids: null,
        tags: null,
        raw_metadata: null,
      };

      const result = verifyManifestIntegrity(manifest, tmpDir);
      assert.strictEqual(result.valid, false);
      const missingFailure = result.failures.find(f => f.type === 'artifact_missing');
      assert.ok(missingFailure, 'should have an artifact_missing failure');
      assert.strictEqual(missingFailure.artifact_id, 'QRY-test');
      assert.strictEqual(missingFailure.actual, null);
      assert.strictEqual(missingFailure.last_modified, null);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it('skips manifest hash check gracefully if manifest_hash field is absent (pre-Phase-14 manifests)', () => {
    const tmpDir = makeTempDir();
    try {
      const artifactDir = path.join(tmpDir, '.planning', 'QUERIES');
      fs.mkdirSync(artifactDir, { recursive: true });
      const content = '# Legacy content';
      fs.writeFileSync(path.join(artifactDir, 'QRY-test.md'), content, 'utf-8');

      const manifest = {
        manifest_version: '1.0',
        manifest_id: 'MAN-LEGACY-001',
        created_at: '2026-03-27T12:00:00.000Z',
        connector_id: 'test',
        dataset: 'events',
        execution: { profile: 'default', query_id: 'QRY-test', request_id: 'REQ-test', status: 'ok', started_at: null, completed_at: null, duration_ms: 100, dry_run: false },
        artifacts: [
          {
            id: 'QRY-test',
            type: 'query_log',
            path: '.planning/QUERIES/QRY-test.md',
            content_hash: computeContentHash(content),
          },
        ],
        hypothesis_ids: null,
        tags: null,
        raw_metadata: null,
        // No manifest_hash field -- legacy
      };

      const result = verifyManifestIntegrity(manifest, tmpDir);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.failures, []);
    } finally {
      cleanupDir(tmpDir);
    }
  });
});
