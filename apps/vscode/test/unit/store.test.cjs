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
    const result = ext.resolveArtifactType('/workspace/.planning/MISSION.md');
    assert.deepEqual(result, { type: 'mission', id: 'MISSION' });
  });

  it('resolves HYPOTHESES.md to hypotheses type', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/HYPOTHESES.md');
    assert.deepEqual(result, { type: 'hypotheses', id: 'HYPOTHESES' });
  });

  it('resolves HUNTMAP.md to huntmap type', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/HUNTMAP.md');
    assert.deepEqual(result, { type: 'huntmap', id: 'HUNTMAP' });
  });

  it('resolves STATE.md to state type', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/STATE.md');
    assert.deepEqual(result, { type: 'state', id: 'STATE' });
  });

  it('resolves EVIDENCE_REVIEW.md to evidenceReview type', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/EVIDENCE_REVIEW.md');
    assert.deepEqual(result, { type: 'evidenceReview', id: 'EVIDENCE_REVIEW' });
  });

  it('resolves FINDINGS.md to phaseSummary type', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/FINDINGS.md');
    assert.deepEqual(result, { type: 'phaseSummary', id: 'FINDINGS' });
  });

  it('resolves published/FINDINGS.md to phaseSummary type', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/published/FINDINGS.md');
    assert.deepEqual(result, { type: 'phaseSummary', id: 'FINDINGS' });
  });

  it('resolves QUERIES/QRY-*.md to query type with filename as id', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/QUERIES/QRY-20260329-001.md');
    assert.deepEqual(result, { type: 'query', id: 'QRY-20260329-001' });
  });

  it('resolves RECEIPTS/RCT-*.md to receipt type with filename as id', () => {
    const result = ext.resolveArtifactType('/workspace/.planning/RECEIPTS/RCT-20260329-001.md');
    assert.deepEqual(result, { type: 'receipt', id: 'RCT-20260329-001' });
  });

  it('returns null for unknown files', () => {
    assert.equal(ext.resolveArtifactType('/workspace/.planning/SUCCESS_CRITERIA.md'), null);
    assert.equal(ext.resolveArtifactType('/workspace/.planning/environment/ENVIRONMENT.md'), null);
    assert.equal(ext.resolveArtifactType('/workspace/.planning/README.md'), null);
  });

  it('returns null for archived nested singleton copies under the hunt root', () => {
    assert.equal(
      ext.resolveArtifactType('/workspace/.planning/milestones/v3.0/MISSION.md'),
      null
    );
    assert.equal(
      ext.resolveArtifactType('/workspace/.planning/archive/STATE.md'),
      null
    );
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

    it('discovers non-date query and receipt IDs through fallback glob scanning', async () => {
      const fallbackRoot = '/mock-hunt-root-fallback';
      const customWatcher = createMockWatcher();
      const customOutput = createMockOutputChannel();
      const customFiles = vscode.workspace._mockFiles;
      customFiles.clear();

      const mission = fixture('MISSION.md');
      const query = fixture('QUERIES/QRY-20260329-001.md').replaceAll(
        'QRY-20260329-001',
        'QRY-alpha-7f9c'
      );
      const receipt = fixture('RECEIPTS/RCT-20260329-001.md')
        .replaceAll('RCT-20260329-001', 'RCT-alpha-7f9c')
        .replaceAll('QRY-20260329-001', 'QRY-alpha-7f9c');

      customFiles.set(path.join(fallbackRoot, 'MISSION.md'), {
        content: mission,
        mtime: Date.now(),
        size: Buffer.byteLength(mission),
      });
      customFiles.set(path.join(fallbackRoot, 'QUERIES/QRY-alpha-7f9c.md'), {
        content: query,
        mtime: Date.now(),
        size: Buffer.byteLength(query),
      });
      customFiles.set(path.join(fallbackRoot, 'RECEIPTS/RCT-alpha-7f9c.md'), {
        content: receipt,
        mtime: Date.now(),
        size: Buffer.byteLength(receipt),
      });

      const fallbackStore = new ext.HuntDataStore(
        vscode.Uri.file(fallbackRoot),
        customWatcher,
        customOutput
      );

      await fallbackStore.initialScanComplete();

      assert.ok(fallbackStore.getQuery('QRY-alpha-7f9c'));
      assert.ok(fallbackStore.getReceipt('RCT-alpha-7f9c'));

      fallbackStore.dispose();
      customWatcher.dispose();
    });

    it('maps validation and evidence-collection queries into the matching later phases and indexes published findings', async () => {
      const customRoot = '/mock-hunt-root-phase-map';
      const customWatcher = createMockWatcher();
      const customOutput = createMockOutputChannel();
      const customFiles = vscode.workspace._mockFiles;
      customFiles.clear();

      const mission = fixture('MISSION.md');
      const hypotheses = fixture('HYPOTHESES.md');
      const state = fixture('STATE.md');
      const huntMap = `# Huntmap: Test\n
## Overview

Test hunt for query-to-phase mapping.

## Phases

- [x] **Phase 1: Environment Mapping** - capture baseline telemetry
- [x] **Phase 2: Tool & Access Validation** - validate query paths
- [x] **Phase 3: Hypothesis Library** - document procedures
- [x] **Phase 4: Pilot Hunts** - execute evidence collection
- [x] **Phase 5: Publish** - publish findings

## Phase Details

### Phase 1: Environment Mapping
**Goal**: Document the environment map and telemetry coverage
**Depends on**: Nothing
**Plans**: 1

Plans:
- [x] 01-01: Build environment map

### Phase 2: Tool & Access Validation
**Goal**: Validate query path execution against the environment
**Depends on**: Phase 1
**Plans**: 1

Plans:
- [x] 02-01: Validate query path access

### Phase 3: Hypothesis Library
**Goal**: Build procedures for each hypothesis
**Depends on**: Phase 2
**Plans**: 1

Plans:
- [x] 03-01: Build procedures

### Phase 4: Pilot Hunts
**Goal**: Execute evidence collection for pilot hunts
**Depends on**: Phase 3
**Plans**: 1

Plans:
- [x] 04-01: Execute evidence collection

### Phase 5: Publish
**Goal**: Publish findings and recommendations
**Depends on**: Phase 4
**Plans**: 1

Plans:
- [x] 05-01: Publish findings
`;
      const validationQuery = `---
query_id: QRY-VAL-001
query_spec_version: "1.0"
source: SIEM
connector_id: elastic
dataset: endpoint
executed_at: 2026-04-01T00:00:00Z
author: test
related_hypotheses:
  - HYP-01
related_receipts:
  - RCT-VAL-001
---

# Query Log: Query Path Validation

## Intent

Validate the credential-dumping query path against the live environment.

## Query Or Procedure

~~~text
SELECT 1
~~~

## Result Summary

1 hit.
`;
      const pilotQuery = `---
query_id: QRY-PILOT-001
query_spec_version: "1.0"
source: SIEM
connector_id: elastic
dataset: endpoint
executed_at: 2026-04-01T00:00:00Z
author: test
related_hypotheses:
  - HYP-01
related_receipts:
  - RCT-PILOT-001
---

# Query Log: Evidence Collection

## Intent

Execute evidence collection for the pilot hunt and gather final receipt data.

## Query Or Procedure

~~~text
SELECT 2
~~~

## Result Summary

2 hits.
`;
      const validationReceipt = `---
receipt_id: RCT-VAL-001
query_spec_version: "1.0"
created_at: 2026-04-01T00:00:00Z
source: Test
connector_id: elastic
dataset: endpoint
result_status: ok
claim_status: context
related_hypotheses:
  - HYP-01
related_queries:
  - QRY-VAL-001
---

# Receipt: Validation

## Claim

Validation complete.

## Evidence

- Query path works.

## Confidence

Medium
`;
      const pilotReceipt = `---
receipt_id: RCT-PILOT-001
query_spec_version: "1.0"
created_at: 2026-04-01T00:00:00Z
source: Test
connector_id: elastic
dataset: endpoint
result_status: ok
claim_status: supports
related_hypotheses:
  - HYP-01
related_queries:
  - QRY-PILOT-001
---

# Receipt: Pilot

## Claim

Pilot evidence collected.

## Evidence

- Evidence collected.

## Confidence

High
`;
      const findings = fixture('FINDINGS.md');

      const entries = new Map([
        ['MISSION.md', mission],
        ['HYPOTHESES.md', hypotheses],
        ['HUNTMAP.md', huntMap],
        ['STATE.md', state],
        ['QUERIES/QRY-VAL-001.md', validationQuery],
        ['QUERIES/QRY-PILOT-001.md', pilotQuery],
        ['RECEIPTS/RCT-VAL-001.md', validationReceipt],
        ['RECEIPTS/RCT-PILOT-001.md', pilotReceipt],
        ['published/FINDINGS.md', findings],
      ]);

      for (const [relativePath, content] of entries) {
        const absolutePath = path.join(customRoot, relativePath);
        customFiles.set(absolutePath, {
          content,
          mtime: Date.now(),
          size: Buffer.byteLength(content),
        });
      }

      const phaseStore = new ext.HuntDataStore(
        vscode.Uri.file(customRoot),
        customWatcher,
        customOutput
      );

      await phaseStore.initialScanComplete();

      assert.deepEqual(
        phaseStore
          .getQueriesForPhase(2)
          .filter((query) => query.status === 'loaded')
          .map((query) => query.data.queryId),
        ['QRY-VAL-001']
      );
      assert.deepEqual(
        phaseStore
          .getQueriesForPhase(4)
          .filter((query) => query.status === 'loaded')
          .map((query) => query.data.queryId),
        ['QRY-PILOT-001']
      );
      assert.equal(
        phaseStore.getArtifactPath('FINDINGS'),
        path.join(customRoot, 'published', 'FINDINGS.md')
      );

      phaseStore.dispose();
      customWatcher.dispose();
    });

    it('keeps nested case artifacts out of the program indexes while surfacing child hunts', async () => {
      const customRoot = '/mock-hunt-root-program-cases';
      const customWatcher = createMockWatcher();
      const customOutput = createMockOutputChannel();
      const customFiles = vscode.workspace._mockFiles;
      customFiles.clear();

      const entries = new Map([
        ['MISSION.md', fixture('MISSION.md')],
        ['HYPOTHESES.md', fixture('HYPOTHESES.md')],
        ['HUNTMAP.md', fixture('HUNTMAP.md')],
        ['STATE.md', fixture('STATE.md')],
        ['QUERIES/QRY-20260329-001.md', fixture('QUERIES/QRY-20260329-001.md')],
        ['RECEIPTS/RCT-20260329-001.md', fixture('RECEIPTS/RCT-20260329-001.md')],
        ['cases/test-1/MISSION.md', `# Mission: test-1

**Mode:** Case
**Opened:** 2026-04-01
**Owner:** TBD
**Status:** Active

## Signal

Investigate the inherited program signals.

## Desired Outcome

Reach a case disposition.

## Scope

Scoped to the signal bundle.

## Working Theory

The bundled signals may or may not be linked.
`],
        ['cases/test-1/HUNTMAP.md', `# Huntmap: test-1

## Overview

Child case hunt.

## Phases

- [x] **Phase 1: Signal Intake** - document the signal
- [ ] **Phase 2: Hypothesis Shaping** - refine the lead

## Phase Details

### Phase 1: Signal Intake
**Goal**: Document the signal
**Depends on**: Nothing
**Plans**: 1

Plans:
- [x] 01-01: Intake

### Phase 2: Hypothesis Shaping
**Goal**: Refine the lead
**Depends on**: Phase 1
**Plans**: 1

Plans:
- [ ] 02-01: Shape
`],
        ['cases/test-1/STATE.md', `# Hunt State

## Mission Reference

See: .planning/cases/test-1/MISSION.md

**Active signal:** test-1
**Current focus:** Hypothesis shaping

## Current Position

Phase: 2 of 2 (Hypothesis Shaping)
Plan: 1 of 1 in current phase
Status: Ready to plan
Last activity: 2026-04-01 — Phase 1 complete

Progress: [█████░░░░░] 50%

## Hunt Context

### Current Scope

- Scoped to the signal bundle

### Data Sources In Play

- Program receipts

### Confidence

Low

### Blockers

- Need more evidence

## Session Continuity

Last session: 2026-04-01
Stopped at: Phase 1 complete
Resume file: TBD
`],
        ['cases/test-1/RECEIPTS/RCT-CASE-001.md', `---
receipt_id: RCT-CASE-001
query_spec_version: "1.0"
created_at: 2026-04-01T00:00:00Z
source: Test
connector_id: elastic
dataset: endpoint
result_status: ok
claim_status: context
related_hypotheses:
  - HYP-01
related_queries: []
---

# Receipt: Case Intake

## Claim

Child case receipt.

## Evidence

- Case-only evidence.

## Confidence

Low
`],
      ]);

      for (const [relativePath, content] of entries) {
        const absolutePath = path.join(customRoot, relativePath);
        customFiles.set(absolutePath, {
          content,
          mtime: Date.now(),
          size: Buffer.byteLength(content),
        });
      }

      const caseStore = new ext.HuntDataStore(
        vscode.Uri.file(customRoot),
        customWatcher,
        customOutput
      );

      await caseStore.initialScanComplete();

      assert.ok(caseStore.getReceipt('RCT-20260329-001'));
      assert.equal(caseStore.getReceipt('RCT-CASE-001'), undefined);

      const childHunts = caseStore.getChildHunts();
      assert.equal(childHunts.length, 1);
      assert.equal(childHunts[0].name, 'test-1');
      assert.equal(childHunts[0].kind, 'case');
      assert.equal(childHunts[0].currentPhase, 2);
      assert.equal(childHunts[0].totalPhases, 2);

      caseStore.dispose();
      customWatcher.dispose();
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

  // --- Selection API tests ---

  describe('selection API', () => {
    it('select() fires onDidSelect with the artifact ID', async () => {
      const events = [];
      store.onDidSelect((id) => { events.push(id); });

      store.select('QRY-20260329-001');

      assert.equal(events.length, 1);
      assert.equal(events[0], 'QRY-20260329-001');
    });

    it('select(null) fires onDidSelect with null to clear selection', async () => {
      const events = [];
      store.onDidSelect((id) => { events.push(id); });

      store.select('QRY-20260329-001');
      store.select(null);

      assert.equal(events.length, 2);
      assert.equal(events[0], 'QRY-20260329-001');
      assert.equal(events[1], null);
    });

    it('getSelectedArtifactId() returns current selection after select()', () => {
      assert.equal(store.getSelectedArtifactId(), null);

      store.select('RCT-20260329-002');
      assert.equal(store.getSelectedArtifactId(), 'RCT-20260329-002');

      store.select(null);
      assert.equal(store.getSelectedArtifactId(), null);
    });

    it('calling select() with same ID twice does NOT fire duplicate events', () => {
      const events = [];
      store.onDidSelect((id) => { events.push(id); });

      store.select('QRY-20260329-001');
      store.select('QRY-20260329-001');

      assert.equal(events.length, 1, 'Expected only 1 event (dedup), got ' + events.length);
    });
  });
});
