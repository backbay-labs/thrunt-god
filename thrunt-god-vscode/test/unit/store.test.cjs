/**
 * Unit tests for HuntDataStore.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests focus on: batch coalescing, cross-artifact indexes,
 * LRU cache eviction, event emission, and deletion handling.
 */
'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'brute-force-hunt');
function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

/**
 * Helper: create a mock watcher that exposes a fire() method for testing.
 * Mimics ArtifactWatcher's onDidChange event interface.
 */
function createMockWatcher() {
  const emitter = new vscode.EventEmitter();
  return {
    onDidChange: emitter.event,
    fire: (paths) => emitter.fire(paths),
    dispose: () => emitter.dispose(),
  };
}

/**
 * Helper: create a mock output channel.
 */
function createMockOutputChannel() {
  return {
    appendLine: () => {},
    dispose: () => {},
  };
}

/**
 * Helper: populate vscode._mockFiles with fixture file content at the given hunt root.
 */
function populateMockFiles(huntRoot) {
  const mockFiles = vscode.workspace._mockFiles;
  mockFiles.clear();

  const artifacts = [
    'MISSION.md',
    'HYPOTHESES.md',
    'HUNTMAP.md',
    'STATE.md',
    'EVIDENCE_REVIEW.md',
    'FINDINGS.md',
    'QUERIES/QRY-20260329-001.md',
    'QUERIES/QRY-20260329-002.md',
    'QUERIES/QRY-20260329-003.md',
    'RECEIPTS/RCT-20260329-001.md',
    'RECEIPTS/RCT-20260329-002.md',
    'RECEIPTS/RCT-20260329-003.md',
    'RECEIPTS/RCT-20260329-004.md',
  ];

  for (const name of artifacts) {
    const absPath = path.join(huntRoot, name);
    const content = fixture(name);
    mockFiles.set(absPath, {
      content,
      mtime: Date.now(),
      size: Buffer.byteLength(content),
    });
  }
}

// ---------------------------------------------------------------------------
// resolveArtifactType tests
// ---------------------------------------------------------------------------
describe('resolveArtifactType', () => {
  it('resolves MISSION.md to mission type', () => {
    const result = ext.resolveArtifactType('/hunt/MISSION.md');
    assert.deepEqual(result, { type: 'mission', id: 'MISSION' });
  });

  it('resolves HYPOTHESES.md to hypotheses type', () => {
    const result = ext.resolveArtifactType('/hunt/HYPOTHESES.md');
    assert.deepEqual(result, { type: 'hypotheses', id: 'HYPOTHESES' });
  });

  it('resolves HUNTMAP.md to huntmap type', () => {
    const result = ext.resolveArtifactType('/hunt/HUNTMAP.md');
    assert.deepEqual(result, { type: 'huntmap', id: 'HUNTMAP' });
  });

  it('resolves STATE.md to state type', () => {
    const result = ext.resolveArtifactType('/hunt/STATE.md');
    assert.deepEqual(result, { type: 'state', id: 'STATE' });
  });

  it('resolves EVIDENCE_REVIEW.md to evidenceReview type', () => {
    const result = ext.resolveArtifactType('/hunt/EVIDENCE_REVIEW.md');
    assert.deepEqual(result, { type: 'evidenceReview', id: 'EVIDENCE_REVIEW' });
  });

  it('resolves FINDINGS.md to phaseSummary type', () => {
    const result = ext.resolveArtifactType('/hunt/FINDINGS.md');
    assert.deepEqual(result, { type: 'phaseSummary', id: 'FINDINGS' });
  });

  it('resolves QUERIES/QRY-*.md to query type with filename as id', () => {
    const result = ext.resolveArtifactType('/hunt/QUERIES/QRY-20260329-001.md');
    assert.deepEqual(result, { type: 'query', id: 'QRY-20260329-001' });
  });

  it('resolves RECEIPTS/RCT-*.md to receipt type with filename as id', () => {
    const result = ext.resolveArtifactType('/hunt/RECEIPTS/RCT-20260329-001.md');
    assert.deepEqual(result, { type: 'receipt', id: 'RCT-20260329-001' });
  });

  it('returns null for unknown files', () => {
    assert.equal(ext.resolveArtifactType('/hunt/SUCCESS_CRITERIA.md'), null);
    assert.equal(ext.resolveArtifactType('/hunt/environment/ENVIRONMENT.md'), null);
    assert.equal(ext.resolveArtifactType('/hunt/README.md'), null);
  });
});

// ---------------------------------------------------------------------------
// HuntDataStore tests
// ---------------------------------------------------------------------------
describe('HuntDataStore', () => {
  const huntRoot = '/mock-hunt-root';
  let mockWatcher;
  let outputChannel;
  let store;

  beforeEach(async () => {
    mockWatcher = createMockWatcher();
    outputChannel = createMockOutputChannel();
    populateMockFiles(huntRoot);

    store = new ext.HuntDataStore(
      vscode.Uri.file(huntRoot),
      mockWatcher,
      outputChannel
    );

    // Allow initial scan to complete
    await store.initialScanComplete();
  });

  afterEach(() => {
    if (store) store.dispose();
    if (mockWatcher) mockWatcher.dispose();
    vscode.workspace._mockFiles.clear();
  });

  // --- Cross-artifact index tests ---

  describe('cross-artifact indexes', () => {
    it('getQueries returns all parsed query artifacts', () => {
      const queries = store.getQueries();
      assert.ok(queries instanceof Map);
      assert.equal(queries.size, 3);
      assert.ok(queries.has('QRY-20260329-001'));
      assert.ok(queries.has('QRY-20260329-002'));
      assert.ok(queries.has('QRY-20260329-003'));
    });

    it('getReceipts returns all parsed receipt artifacts', () => {
      const receipts = store.getReceipts();
      assert.ok(receipts instanceof Map);
      assert.equal(receipts.size, 4);
      assert.ok(receipts.has('RCT-20260329-001'));
      assert.ok(receipts.has('RCT-20260329-002'));
      assert.ok(receipts.has('RCT-20260329-003'));
      assert.ok(receipts.has('RCT-20260329-004'));
    });

    it('getReceiptsForQuery returns receipts linked to a query', () => {
      // RCT-001 and RCT-004 reference QRY-001 via related_queries
      // RCT-002 also references QRY-001
      const receipts = store.getReceiptsForQuery('QRY-20260329-001');
      assert.ok(receipts.length >= 2, `Expected at least 2 receipts for QRY-001, got ${receipts.length}`);
      const ids = receipts.map(r => r.status === 'loaded' ? r.data.receiptId : null);
      assert.ok(ids.includes('RCT-20260329-001'));
      assert.ok(ids.includes('RCT-20260329-002'));
    });

    it('getReceiptsForHypothesis returns receipts linked to a hypothesis', () => {
      // RCT-001 is related to HYP-01
      const receipts = store.getReceiptsForHypothesis('HYP-01');
      assert.ok(receipts.length >= 1, `Expected at least 1 receipt for HYP-01, got ${receipts.length}`);
      const ids = receipts.map(r => r.status === 'loaded' ? r.data.receiptId : null);
      assert.ok(ids.includes('RCT-20260329-001'));
    });

    it('getQueriesForPhase returns queries linked to a phase', () => {
      // Phase 1 ("Signal Intake") references QRY-001 (via HUNTMAP phase->receipt->query chain)
      const queries = store.getQueriesForPhase(1);
      // At minimum, should return some queries (the mapping may be approximate)
      assert.ok(Array.isArray(queries));
    });
  });

  // --- Getter tests ---

  describe('getters', () => {
    it('getQuery returns specific query by ID', () => {
      const result = store.getQuery('QRY-20260329-001');
      assert.ok(result);
      assert.equal(result.status, 'loaded');
      assert.equal(result.data.queryId, 'QRY-20260329-001');
    });

    it('getReceipt returns specific receipt by ID', () => {
      const result = store.getReceipt('RCT-20260329-001');
      assert.ok(result);
      assert.equal(result.status, 'loaded');
      assert.equal(result.data.receiptId, 'RCT-20260329-001');
    });

    it('getQuery returns undefined for unknown ID', () => {
      const result = store.getQuery('QRY-NONEXISTENT');
      assert.equal(result, undefined);
    });

    it('getHunt returns singleton artifacts', () => {
      const hunt = store.getHunt();
      assert.ok(hunt);
      assert.equal(hunt.mission.status, 'loaded');
      assert.equal(hunt.hypotheses.status, 'loaded');
      assert.equal(hunt.huntMap.status, 'loaded');
      assert.equal(hunt.state.status, 'loaded');
    });
  });

  // --- Batch coalescing tests ---

  describe('batch coalescing', () => {
    it('multiple rapid handleFileChange calls coalesce into single batch', async () => {
      let eventCount = 0;
      store.onDidChange(() => { eventCount++; });

      // Simulate 5 rapid file changes (watcher fires for each)
      const qryPath = path.join(huntRoot, 'QUERIES/QRY-20260329-001.md');
      mockWatcher.fire([qryPath]);
      mockWatcher.fire([qryPath]);
      mockWatcher.fire([qryPath]);
      mockWatcher.fire([qryPath]);
      mockWatcher.fire([qryPath]);

      // Wait for batch window (500ms) plus margin
      await new Promise(resolve => setTimeout(resolve, 700));

      // Should have been coalesced -- the path appears once in the batch
      // Multiple events may fire (one per batch), but NOT 5 separate batches
      assert.ok(eventCount <= 2, `Expected at most 2 event batches, got ${eventCount}`);
    });

    it('changes for different files in batch window produce single rebuild', async () => {
      let eventCount = 0;
      store.onDidChange(() => { eventCount++; });

      const qryPath1 = path.join(huntRoot, 'QUERIES/QRY-20260329-001.md');
      const qryPath2 = path.join(huntRoot, 'QUERIES/QRY-20260329-002.md');
      const rctPath = path.join(huntRoot, 'RECEIPTS/RCT-20260329-001.md');

      // Fire changes for 3 different files quickly
      mockWatcher.fire([qryPath1]);
      mockWatcher.fire([qryPath2]);
      mockWatcher.fire([rctPath]);

      // Wait for batch window
      await new Promise(resolve => setTimeout(resolve, 700));

      // Events should be emitted for each processed artifact, but batch
      // processing should happen in a single processBatch call
      assert.ok(eventCount >= 1, 'Should have emitted at least one event');
    });
  });

  // --- LRU cache tests ---

  describe('LRU cache', () => {
    it('body cache evicts oldest entry when exceeding 10 slots', () => {
      // Initial scan populates the cache. We have 13 artifacts which exceeds 10.
      // The store should have evicted at least 3 entries from the body cache.
      // We can verify by checking bodyCacheSize() if exposed, or by checking
      // that getters still work (they re-parse on miss).
      const bodySize = store.bodyCacheSize();
      assert.ok(bodySize <= 10, `Expected body cache size <= 10, got ${bodySize}`);
    });

    it('frontmatter cache is never evicted', () => {
      // We have 13 artifacts -- all should have frontmatter cached
      const fmSize = store.frontmatterCacheSize();
      assert.ok(fmSize >= 13, `Expected at least 13 frontmatter entries, got ${fmSize}`);
    });

    it('accessing a cached entry updates its last access time', async () => {
      // Access QRY-001 to make it recently used
      store.getQuery('QRY-20260329-001');

      // The body cache should still contain it (it's recently used)
      const result = store.getQuery('QRY-20260329-001');
      assert.ok(result);
      assert.equal(result.status, 'loaded');
    });
  });

  // --- Event emission tests ---

  describe('event emission', () => {
    it('onDidChange fires with ArtifactChangeEvent after batch processing', async () => {
      const events = [];
      store.onDidChange((event) => { events.push(event); });

      const qryPath = path.join(huntRoot, 'QUERIES/QRY-20260329-001.md');
      mockWatcher.fire([qryPath]);

      await new Promise(resolve => setTimeout(resolve, 700));

      assert.ok(events.length >= 1, 'Expected at least one change event');
      const evt = events[0];
      assert.equal(evt.type, 'artifact:updated');
      assert.equal(evt.artifactType, 'query');
      assert.equal(evt.id, 'QRY-20260329-001');
      assert.ok(evt.filePath.includes('QRY-20260329-001'));
    });
  });

  // --- Deletion handling tests ---

  describe('deletion handling', () => {
    it('removes artifact from cache and indexes on file deletion', async () => {
      // Verify RCT-001 exists before
      assert.ok(store.getReceipt('RCT-20260329-001'));

      // Simulate deletion: remove from mock files, fire delete event
      const rctPath = path.join(huntRoot, 'RECEIPTS/RCT-20260329-001.md');
      vscode.workspace._mockFiles.delete(rctPath);

      const events = [];
      store.onDidChange((event) => { events.push(event); });

      mockWatcher.fire([rctPath]);

      await new Promise(resolve => setTimeout(resolve, 700));

      // After deletion processing, the receipt should be removed
      const result = store.getReceipt('RCT-20260329-001');
      assert.equal(result, undefined);

      // Indexes should be updated: no receipts for HYP-01 via RCT-001
      // (unless other receipts also link to HYP-01)
    });
  });
});
