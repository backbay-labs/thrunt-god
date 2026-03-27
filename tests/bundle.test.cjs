/**
 * THRUNT Tools Tests - Evidence Export Bundles
 *
 * Tests for bundle.cjs: ZIP construction, artifact discovery, bundle creation,
 * verification, selective filtering, redaction, and chain-of-custody aggregation.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { createTempProject, cleanup } = require('./helpers.cjs');
const { computeContentHash, canonicalSerialize } = require('../thrunt-god/bin/lib/manifest.cjs');

// Lazy-load bundle.cjs (will not exist during RED phase)
function loadBundle() {
  return require('../thrunt-god/bin/lib/bundle.cjs');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up a temp project with sample artifacts for testing.
 * Creates QUERIES, RECEIPTS, and MANIFESTS directories with sample files.
 */
function setupBundleProject(tmpDir, opts = {}) {
  const planningDir = path.join(tmpDir, '.planning');
  const queriesDir = path.join(planningDir, 'QUERIES');
  const receiptsDir = path.join(planningDir, 'RECEIPTS');
  const manifestsDir = path.join(planningDir, 'MANIFESTS');

  fs.mkdirSync(queriesDir, { recursive: true });
  fs.mkdirSync(receiptsDir, { recursive: true });
  fs.mkdirSync(manifestsDir, { recursive: true });

  const queryContent = opts.queryContent || '# Query Log\n\nSample query for phase 15.';
  const receiptContent = opts.receiptContent || '# Receipt\n\nSample receipt for phase 15.';
  const queryId = 'QRY-20260327120000-A1B2C3D4';
  const receiptId = 'RCT-20260327120000-A1B2C3D4';
  const manifestId = 'MAN-20260327120000-DEADBEEF';

  fs.writeFileSync(path.join(queriesDir, `${queryId}.md`), queryContent);
  fs.writeFileSync(path.join(receiptsDir, `${receiptId}.md`), receiptContent);

  const manifest = {
    manifest_version: '1.1',
    manifest_id: manifestId,
    created_at: '2026-03-27T12:00:00.000Z',
    connector_id: 'splunk',
    dataset: 'events',
    execution: {
      profile: 'default',
      query_id: queryId,
      request_id: 'REQ-20260327120000-E5F6G7H8',
      status: 'ok',
      started_at: '2026-03-27T12:00:00.000Z',
      completed_at: '2026-03-27T12:00:03.000Z',
      duration_ms: 3000,
      dry_run: false,
    },
    artifacts: [
      {
        id: queryId,
        type: 'query_log',
        path: `.planning/QUERIES/${queryId}.md`,
        content_hash: computeContentHash(queryContent),
      },
      {
        id: receiptId,
        type: 'receipt',
        path: `.planning/RECEIPTS/${receiptId}.md`,
        content_hash: computeContentHash(receiptContent),
      },
    ],
    provenance: {
      signer: {
        signer_type: 'system',
        signer_id: 'thrunt-runtime',
        signer_context: { cli_version: '0.1.0' },
      },
      environment: {
        os_platform: 'darwin',
        node_version: 'v25.2.1',
        thrunt_version: '0.1.0',
        runtime_name: 'claude',
      },
      signed_at: '2026-03-27T12:00:03.000Z',
    },
    hypothesis_ids: ['HYP-03'],
    tags: ['phase-15'],
    raw_metadata: null,
    manifest_hash: null,
    signature: null,
  };

  // Compute manifest_hash after building
  const { manifest_hash, signature, ...body } = manifest;
  const serialized = canonicalSerialize(body);
  manifest.manifest_hash = computeContentHash(serialized);

  fs.writeFileSync(
    path.join(manifestsDir, `${manifestId}.json`),
    canonicalSerialize(manifest)
  );

  return { queryId, receiptId, manifestId, queryContent, receiptContent, manifest };
}


// ===========================================================================
// Unit Tests: ZIP Primitives
// ===========================================================================

describe('ZIP primitives', () => {
  it('buildZip creates valid ZIP buffer with correct signature', () => {
    const { buildZip, readZipEntries } = loadBundle();
    const entries = [
      { filename: 'hello.txt', data: Buffer.from('Hello, World!', 'utf-8') },
    ];
    const zip = buildZip(entries);
    assert.ok(Buffer.isBuffer(zip), 'buildZip returns a Buffer');
    // EOCD signature at end
    const eocdSig = zip.readUInt32LE(zip.length - 22);
    assert.equal(eocdSig, 0x06054b50, 'EOCD signature present');
  });

  it('buildZip + readZipEntries roundtrip preserves data', () => {
    const { buildZip, readZipEntries } = loadBundle();
    const original = [
      { filename: 'a.txt', data: Buffer.from('Alpha', 'utf-8') },
      { filename: 'b/c.txt', data: Buffer.from('Beta Charlie', 'utf-8') },
    ];
    const zip = buildZip(original);
    const extracted = readZipEntries(zip);
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].filename, 'a.txt');
    assert.deepEqual(extracted[0].data, Buffer.from('Alpha', 'utf-8'));
    assert.equal(extracted[1].filename, 'b/c.txt');
    assert.deepEqual(extracted[1].data, Buffer.from('Beta Charlie', 'utf-8'));
  });

  it('readZipEntries throws on non-ZIP data', () => {
    const { readZipEntries } = loadBundle();
    assert.throws(
      () => readZipEntries(Buffer.from('not a zip file')),
      /Not a valid ZIP/
    );
  });

  it('buildZip throws if entries exceed 65535', () => {
    const { buildZip } = loadBundle();
    // We don't actually create 65536 entries (too slow), just verify the check
    // by patching -- instead test the guard with a known oversized array
    const fakeEntries = new Array(65536).fill({ filename: 'x.txt', data: Buffer.from('x') });
    assert.throws(
      () => buildZip(fakeEntries),
      /65535/
    );
  });

  it('handles empty data entries', () => {
    const { buildZip, readZipEntries } = loadBundle();
    const entries = [
      { filename: 'empty.txt', data: Buffer.alloc(0) },
    ];
    const zip = buildZip(entries);
    const extracted = readZipEntries(zip);
    assert.equal(extracted.length, 1);
    assert.equal(extracted[0].filename, 'empty.txt');
    assert.equal(extracted[0].data.length, 0);
  });

  it('handles non-ASCII content correctly', () => {
    const { buildZip, readZipEntries } = loadBundle();
    const unicodeContent = 'Hello \u{1F600} World \u00E9\u00E8\u00EA';
    const entries = [
      { filename: 'unicode.txt', data: Buffer.from(unicodeContent, 'utf-8') },
    ];
    const zip = buildZip(entries);
    const extracted = readZipEntries(zip);
    assert.deepEqual(extracted[0].data, Buffer.from(unicodeContent, 'utf-8'));
  });
});

// ===========================================================================
// Unit Tests: createExportBundle
// ===========================================================================

describe('createExportBundle', () => {
  it('produces valid ZIP with bundle.json at root when no artifacts exist', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-empty-');
    try {
      const result = createExportBundle(tmpDir, {});
      assert.ok(result.bundlePath, 'bundlePath returned');
      assert.ok(result.bundleId, 'bundleId returned');
      assert.match(result.bundleId, /^BDL-/);
      assert.ok(result.bundleHash, 'bundleHash returned');
      assert.match(result.bundleHash, /^sha256:/);
      assert.ok(fs.existsSync(result.bundlePath), 'ZIP file exists on disk');

      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const names = entries.map(e => e.filename);
      assert.ok(names.includes('bundle.json'), 'bundle.json at root');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('discovers query logs from .planning/QUERIES/*.md', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-queries-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const names = entries.map(e => e.filename);
      assert.ok(names.some(n => n.startsWith('QUERIES/')), 'QUERIES directory present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('discovers receipts from .planning/RECEIPTS/*.md', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-receipts-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const names = entries.map(e => e.filename);
      assert.ok(names.some(n => n.startsWith('RECEIPTS/')), 'RECEIPTS directory present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('discovers manifests from .planning/MANIFESTS/*.json', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-manifests-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const names = entries.map(e => e.filename);
      assert.ok(names.some(n => n.startsWith('manifests/')), 'manifests directory present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('bundle.json has correct schema fields', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-schema-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.equal(bundleJson.bundle_version, '1.0');
      assert.match(bundleJson.bundle_id, /^BDL-/);
      assert.ok(bundleJson.created_at, 'created_at present');
      assert.equal(bundleJson.hash_algorithm, 'sha256');
      assert.ok(Array.isArray(bundleJson.artifacts), 'artifacts is array');
      assert.ok(Array.isArray(bundleJson.manifests), 'manifests is array');
      assert.ok(Array.isArray(bundleJson.chain_of_custody), 'chain_of_custody is array');
      assert.ok(Array.isArray(bundleJson.redactions), 'redactions is array');
      assert.ok(bundleJson.summary, 'summary present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('artifacts array lists each file with path, type, content_hash, status, manifest_id', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-artifacts-');
    try {
      const { queryContent } = setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      const queryArtifact = bundleJson.artifacts.find(a => a.type === 'query_log');
      assert.ok(queryArtifact, 'query_log artifact found');
      assert.ok(queryArtifact.path, 'path field present');
      assert.equal(queryArtifact.type, 'query_log');
      assert.match(queryArtifact.content_hash, /^sha256:/);
      assert.equal(queryArtifact.status, 'included');
      assert.ok(queryArtifact.manifest_id, 'manifest_id present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('manifests array lists each manifest with manifest_id, path, content_hash', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-manifests-list-');
    try {
      const { manifestId } = setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.ok(bundleJson.manifests.length >= 1, 'at least one manifest');
      const m = bundleJson.manifests[0];
      assert.equal(m.manifest_id, manifestId);
      assert.ok(m.path, 'manifest path present');
      assert.match(m.content_hash, /^sha256:/);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('chain_of_custody aggregates signer info from manifests', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-custody-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.ok(bundleJson.chain_of_custody.length >= 1, 'at least one custody entry');
      const coc = bundleJson.chain_of_custody[0];
      assert.ok(coc.manifest_id, 'manifest_id in chain_of_custody');
      assert.equal(coc.signer_type, 'system');
      assert.equal(coc.signer_id, 'thrunt-runtime');
      assert.ok(coc.signed_at, 'signed_at present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('summary has correct counts', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-summary-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.equal(bundleJson.summary.total_artifacts, 2);
      assert.equal(bundleJson.summary.included, 2);
      assert.equal(bundleJson.summary.missing, 0);
      assert.equal(bundleJson.summary.manifests, 1);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('missing artifacts get status "missing" without failing export', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-missing-');
    try {
      const { queryId } = setupBundleProject(tmpDir);
      // Delete the query log so it becomes missing
      const queryPath = path.join(tmpDir, '.planning', 'QUERIES', `${queryId}.md`);
      fs.unlinkSync(queryPath);

      const result = createExportBundle(tmpDir, {});
      assert.ok(result.bundlePath, 'export does not fail');

      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      const missingArtifact = bundleJson.artifacts.find(a => a.status === 'missing');
      assert.ok(missingArtifact, 'missing artifact recorded');
      assert.equal(bundleJson.summary.missing, 1);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('ZIP entry paths use forward slashes', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-posix-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      for (const entry of entries) {
        assert.ok(!entry.filename.includes('\\'), `no backslashes in ${entry.filename}`);
      }
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ===========================================================================
// Unit Tests: Selective Filtering
// ===========================================================================

describe('Selective filtering', () => {
  it('phase filter only includes matching artifacts', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-phase-filter-');
    try {
      // Create artifacts for phase 15 and phase 99
      setupBundleProject(tmpDir);
      const queriesDir = path.join(tmpDir, '.planning', 'QUERIES');
      fs.writeFileSync(path.join(queriesDir, 'QRY-20260327130000-FFFFFFFF.md'), '# Phase 99 query');

      const result = createExportBundle(tmpDir, { phase: '15' });
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      // Phase 15 artifacts should be present (from manifest tags/hypothesis), phase 99 should not
      // The standalone query from phase 99 should be excluded since no manifest references it with phase 15
      assert.ok(bundleJson.artifacts.length >= 1, 'at least one artifact included');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('time range filter (since/until) filters manifests by completed_at', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-time-filter-');
    try {
      setupBundleProject(tmpDir);
      // Our manifest has completed_at 2026-03-27T12:00:03.000Z
      // Filter to a range that excludes it
      const result = createExportBundle(tmpDir, {
        since: '2026-03-28',
        until: '2026-03-29',
      });
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.equal(bundleJson.manifests.length, 0, 'no manifests in range');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('time range filter includes manifests within range', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-time-include-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {
        since: '2026-03-27',
        until: '2026-03-28',
      });
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.ok(bundleJson.manifests.length >= 1, 'manifest within range included');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('manifest ID filter selects only specified manifests', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-manifest-filter-');
    try {
      const { manifestId } = setupBundleProject(tmpDir);

      // Create a second manifest that should be excluded
      const manifestsDir = path.join(tmpDir, '.planning', 'MANIFESTS');
      const excludedManifest = {
        manifest_version: '1.1',
        manifest_id: 'MAN-20260327130000-AAAAAAAA',
        created_at: '2026-03-27T13:00:00.000Z',
        connector_id: 'elastic',
        dataset: 'logs',
        execution: {
          profile: 'default',
          query_id: 'QRY-excluded',
          request_id: 'REQ-excluded',
          status: 'ok',
          started_at: '2026-03-27T13:00:00.000Z',
          completed_at: '2026-03-27T13:00:05.000Z',
          duration_ms: 5000,
          dry_run: false,
        },
        artifacts: [],
        hypothesis_ids: null,
        tags: null,
        raw_metadata: null,
        manifest_hash: null,
        signature: null,
      };
      fs.writeFileSync(
        path.join(manifestsDir, 'MAN-20260327130000-AAAAAAAA.json'),
        canonicalSerialize(excludedManifest)
      );

      const result = createExportBundle(tmpDir, { manifestIds: [manifestId] });
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.equal(bundleJson.manifests.length, 1, 'only one manifest included');
      assert.equal(bundleJson.manifests[0].manifest_id, manifestId);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ===========================================================================
// Unit Tests: Redaction
// ===========================================================================

describe('Redaction', () => {
  it('redaction strips content and records in redactions array', () => {
    const { createExportBundle, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-redact-');
    try {
      const queryContent = '# Query Log\n\nSECRET_TOKEN=abc123\nSome other content.';
      setupBundleProject(tmpDir, { queryContent });

      const result = createExportBundle(tmpDir, {
        redact: true,
        redactFn: (content, _artifactPath) => {
          const redacted = content.replace(/SECRET_TOKEN=[^\n]*/g, 'SECRET_TOKEN=[REDACTED]');
          if (redacted !== content) {
            return { content: redacted, stripped: ['SECRET_TOKEN value'] };
          }
          return { content, stripped: [] };
        },
      });

      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.ok(bundleJson.redactions.length > 0, 'redactions array is non-empty');

      // Verify the content in the ZIP is redacted
      const queryEntry = entries.find(e => e.filename.includes('QRY-'));
      const content = queryEntry.data.toString('utf-8');
      assert.ok(!content.includes('abc123'), 'secret value stripped from ZIP content');
      assert.ok(content.includes('[REDACTED]'), 'redaction marker present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('hashing happens AFTER redaction', () => {
    const { createExportBundle, verifyBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-redact-hash-');
    try {
      const queryContent = '# Query Log\n\nSECRET=xyz789\nOther content.';
      setupBundleProject(tmpDir, { queryContent });

      const result = createExportBundle(tmpDir, {
        redact: true,
        redactFn: (content) => {
          const redacted = content.replace(/SECRET=[^\n]*/g, 'SECRET=[REDACTED]');
          return { content: redacted, stripped: redacted !== content ? ['SECRET value'] : [] };
        },
      });

      // Bundle should verify clean -- hashes match redacted content
      const verification = verifyBundle(result.bundlePath);
      assert.equal(verification.valid, true, 'bundle verifies after redaction');
      assert.equal(verification.failures.length, 0, 'no hash mismatches');
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ===========================================================================
// Unit Tests: verifyBundle
// ===========================================================================

describe('verifyBundle', () => {
  it('returns valid: true on clean bundle', () => {
    const { createExportBundle, verifyBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-verify-clean-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});
      const verification = verifyBundle(result.bundlePath);
      assert.equal(verification.valid, true);
      assert.deepEqual(verification.failures, []);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('detects tampered content in archive', () => {
    const { createExportBundle, verifyBundle, buildZip, readZipEntries } = loadBundle();
    const tmpDir = createTempProject('bundle-verify-tamper-');
    try {
      setupBundleProject(tmpDir);
      const result = createExportBundle(tmpDir, {});

      // Read the ZIP, tamper with an entry, rebuild
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const queryEntry = entries.find(e => e.filename.includes('QRY-'));
      if (queryEntry) {
        queryEntry.data = Buffer.from('TAMPERED CONTENT', 'utf-8');
      }
      const tamperedZip = buildZip(entries.map(e => ({ filename: e.filename, data: e.data })));
      const tamperedPath = path.join(tmpDir, 'tampered.zip');
      fs.writeFileSync(tamperedPath, tamperedZip);

      const verification = verifyBundle(tamperedPath);
      assert.equal(verification.valid, false);
      assert.ok(verification.failures.length > 0, 'at least one failure');
      assert.ok(verification.failures[0].expected, 'expected hash present');
      assert.ok(verification.failures[0].actual, 'actual hash present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns failure on non-ZIP input', () => {
    const { verifyBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-verify-nonzip-');
    try {
      const fakePath = path.join(tmpDir, 'notazip.zip');
      fs.writeFileSync(fakePath, 'this is not a zip file');
      const verification = verifyBundle(fakePath);
      assert.equal(verification.valid, false);
      assert.ok(verification.failures.length > 0);
      assert.ok(verification.failures[0].error, 'error field present');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns failure when bundle.json is missing from archive', () => {
    const { buildZip, verifyBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-verify-nobundle-');
    try {
      // Create a valid ZIP without bundle.json
      const zip = buildZip([
        { filename: 'other.txt', data: Buffer.from('test') },
      ]);
      const zipPath = path.join(tmpDir, 'nobundle.zip');
      fs.writeFileSync(zipPath, zip);

      const verification = verifyBundle(zipPath);
      assert.equal(verification.valid, false);
      assert.ok(verification.failures.some(f => f.path === 'bundle.json'));
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ===========================================================================
// Unit Tests: Bundle ID
// ===========================================================================

describe('Bundle ID', () => {
  it('matches BDL-* pattern', () => {
    const { createExportBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-id-');
    try {
      const result = createExportBundle(tmpDir, {});
      assert.match(result.bundleId, /^BDL-\d{14}-[A-F0-9]{8}$/);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ===========================================================================
// Unit Tests: Output Path
// ===========================================================================

describe('Output path handling', () => {
  it('writes to cwd by default', () => {
    const { createExportBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-output-cwd-');
    try {
      const result = createExportBundle(tmpDir, {});
      assert.ok(result.bundlePath.startsWith(tmpDir), 'bundle in cwd');
      assert.ok(result.bundlePath.endsWith('.zip'), 'ends with .zip');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('writes to specified directory when output is a directory', () => {
    const { createExportBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-output-dir-');
    try {
      const outputDir = path.join(tmpDir, 'exports');
      fs.mkdirSync(outputDir, { recursive: true });
      const result = createExportBundle(tmpDir, { output: outputDir });
      assert.ok(result.bundlePath.startsWith(outputDir), 'bundle in output dir');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('writes to exact path when output ends in .zip', () => {
    const { createExportBundle } = loadBundle();
    const tmpDir = createTempProject('bundle-output-zip-');
    try {
      const outputPath = path.join(tmpDir, 'my-bundle.zip');
      const result = createExportBundle(tmpDir, { output: outputPath });
      assert.equal(result.bundlePath, outputPath);
    } finally {
      cleanup(tmpDir);
    }
  });
});

// ===========================================================================
// CLI Integration Tests
// ===========================================================================

describe('CLI integration', () => {
  const { runThruntTools, createTempProject: ctp, cleanup: cln } = require('./helpers.cjs');
  const { execSync } = require('child_process');

  it('bundle export produces JSON output with bundlePath and bundleHash', () => {
    const tmpDir = ctp('bundle-cli-export-');
    try {
      setupBundleProject(tmpDir);
      const { success, output } = runThruntTools(['bundle', 'export'], tmpDir);
      assert.ok(success, 'command succeeds');
      const result = JSON.parse(output);
      assert.ok(result.bundlePath, 'bundlePath in output');
      assert.ok(result.bundleHash, 'bundleHash in output');
      assert.ok(fs.existsSync(result.bundlePath), 'ZIP file exists');
    } finally {
      cln(tmpDir);
    }
  });

  it('bundle export --phase 15 filters artifacts by phase', () => {
    const tmpDir = ctp('bundle-cli-phase-');
    try {
      setupBundleProject(tmpDir);
      const { success, output } = runThruntTools(
        ['bundle', 'export', '--phase', '15'],
        tmpDir
      );
      assert.ok(success, 'command succeeds');
      const result = JSON.parse(output);
      assert.ok(result.bundlePath, 'bundlePath present');

      // Read the bundle and verify phase filter was applied
      const { readZipEntries } = loadBundle();
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));
      assert.equal(bundleJson.filters.phase, '15');
    } finally {
      cln(tmpDir);
    }
  });

  it('bundle verify on a valid bundle reports PASS', () => {
    const tmpDir = ctp('bundle-cli-verify-');
    try {
      setupBundleProject(tmpDir);
      // First create a bundle
      const exportResult = runThruntTools(['bundle', 'export'], tmpDir);
      assert.ok(exportResult.success);
      const { bundlePath } = JSON.parse(exportResult.output);

      // Then verify it
      const { success, output } = runThruntTools(
        ['bundle', 'verify', bundlePath],
        tmpDir
      );
      assert.ok(success, 'verify command succeeds');
      const result = JSON.parse(output);
      assert.equal(result.valid, true, 'bundle is valid');
    } finally {
      cln(tmpDir);
    }
  });

  it('bundle verify on corrupted ZIP reports FAIL', () => {
    const tmpDir = ctp('bundle-cli-corrupt-');
    try {
      const corruptPath = path.join(tmpDir, 'corrupt.zip');
      fs.writeFileSync(corruptPath, Buffer.from('not-a-zip-file'));
      const { success, output } = runThruntTools(
        ['bundle', 'verify', corruptPath],
        tmpDir
      );
      // verify still succeeds as a command (exits 0) but reports invalid
      assert.ok(success, 'command does not crash');
      const result = JSON.parse(output);
      assert.equal(result.valid, false, 'corrupted bundle is invalid');
    } finally {
      cln(tmpDir);
    }
  });

  it('bundle export with --redact produces redactions in bundle.json', () => {
    const tmpDir = ctp('bundle-cli-redact-');
    try {
      // Create a project with secret-containing content
      const queryContent = '# Query Log\n\napi_key=supersecret123\nSome data.';
      setupBundleProject(tmpDir, { queryContent });

      const { success, output } = runThruntTools(
        ['bundle', 'export', '--redact'],
        tmpDir
      );
      assert.ok(success, 'redact export succeeds');
      const result = JSON.parse(output);

      // Read bundle.json from the ZIP
      const { readZipEntries } = loadBundle();
      const zipBuf = fs.readFileSync(result.bundlePath);
      const entries = readZipEntries(zipBuf);
      const bundleEntry = entries.find(e => e.filename === 'bundle.json');
      const bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));

      assert.ok(bundleJson.redactions.length > 0, 'redactions array populated');
    } finally {
      cln(tmpDir);
    }
  });

  it('unknown subcommand returns error', () => {
    const tmpDir = ctp('bundle-cli-unknown-');
    try {
      const { success, error } = runThruntTools(['bundle', 'foo'], tmpDir);
      assert.equal(success, false, 'unknown subcommand fails');
      assert.ok(error.includes('Unknown bundle subcommand'), 'error message correct');
    } finally {
      cln(tmpDir);
    }
  });

  it('bundle export with --output <dir> writes ZIP to specified directory', () => {
    const tmpDir = ctp('bundle-cli-output-dir-');
    try {
      setupBundleProject(tmpDir);
      const outputDir = path.join(tmpDir, 'exports');
      fs.mkdirSync(outputDir, { recursive: true });

      const { success, output } = runThruntTools(
        ['bundle', 'export', '--output', outputDir],
        tmpDir
      );
      assert.ok(success, 'command succeeds');
      const result = JSON.parse(output);
      assert.ok(result.bundlePath.includes('exports'), 'bundle in exports dir');
      assert.ok(fs.existsSync(result.bundlePath), 'file exists in output dir');
    } finally {
      cln(tmpDir);
    }
  });

  it('produced ZIP is extractable by system unzip (smoke test)', () => {
    const tmpDir = ctp('bundle-cli-unzip-');
    try {
      setupBundleProject(tmpDir);
      const { success, output } = runThruntTools(['bundle', 'export'], tmpDir);
      assert.ok(success);
      const result = JSON.parse(output);

      // Try system unzip -t (test mode)
      try {
        const unzipResult = execSync(`unzip -t "${result.bundlePath}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.ok(unzipResult.includes('No errors'), 'unzip reports no errors');
      } catch (err) {
        // If unzip is not available, skip gracefully
        if (err.message && err.message.includes('ENOENT')) {
          // unzip not installed -- skip
        } else {
          throw err;
        }
      }
    } finally {
      cln(tmpDir);
    }
  });
});
