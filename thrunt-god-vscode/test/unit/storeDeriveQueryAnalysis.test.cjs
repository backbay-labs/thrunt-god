/**
 * Unit tests for deriveQueryAnalysis (store ViewModel derivation).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: empty store, 2-query comparison, 3+-query heatmap,
 * sort by count, receipt inspector with anomalyFrame, receipt inspector
 * without anomalyFrame.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);

// ---------------------------------------------------------------------------
// Helpers: call deriveQueryAnalysis on a mock store via prototype.call()
// ---------------------------------------------------------------------------

const deriveQueryAnalysis = ext.HuntDataStore.prototype.deriveQueryAnalysis;

/**
 * Create a minimal mock store shape that deriveQueryAnalysis.call() can use.
 * Only the methods called inside deriveQueryAnalysis need to be present:
 * getQueries(), getReceipts(), getReceiptsForQuery().
 */
function createMockStore(options = {}) {
  const defaultQueries = options.queries ?? new Map();
  const defaultReceipts = options.receipts ?? new Map();
  const receiptsByQuery = options.receiptsByQuery ?? {};

  return {
    getQueries: () => defaultQueries,
    getReceipts: () => defaultReceipts,
    getReceiptsForQuery: (queryId) => receiptsByQuery[queryId] ?? [],
  };
}

function callDerive(mockStore, selectedQueryIds, sortBy, inspectorReceiptId) {
  return deriveQueryAnalysis.call(
    mockStore,
    selectedQueryIds ?? [],
    sortBy ?? 'count',
    inspectorReceiptId ?? null
  );
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeQuery(id, title, templates, opts = {}) {
  return {
    status: 'loaded',
    data: {
      queryId: id,
      title: title,
      templates: templates,
      eventCount: opts.eventCount ?? templates.reduce((s, t) => s + t.count, 0),
      templateCount: templates.length,
      entityCount: opts.entityCount ?? 0,
      executedAt: opts.executedAt ?? '2026-03-29T10:00:00Z',
      relatedHypotheses: opts.relatedHypotheses ?? [],
      relatedReceipts: opts.relatedReceipts ?? [],
    },
  };
}

function makeTemplate(id, template, count, percentage) {
  return { templateId: id, template, count, percentage };
}

function makeReceipt(id, claim, claimStatus, opts = {}) {
  return {
    status: 'loaded',
    data: {
      receiptId: id,
      claim,
      claimStatus,
      confidence: opts.confidence ?? 'Medium',
      relatedHypotheses: opts.relatedHypotheses ?? [],
      relatedQueries: opts.relatedQueries ?? [],
      anomalyFrame: opts.anomalyFrame ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveQueryAnalysis', () => {

  describe('empty store', () => {
    it('returns empty queries array, null comparison, null heatmap, null inspector', () => {
      const store = createMockStore();
      const vm = callDerive(store, [], 'count', null);

      assert.deepEqual(vm.queries, []);
      assert.equal(vm.comparison, null);
      assert.equal(vm.heatmap, null);
      assert.equal(vm.receiptInspector, null);
    });
  });

  describe('2-query comparison', () => {
    it('returns comparison data with shared, aOnly, and bOnly templates', () => {
      const queries = new Map([
        ['QRY-001', makeQuery('QRY-001', 'DNS lookups', [
          makeTemplate('T1', 'dns lookup <*>', 50, 50),
          makeTemplate('T2', 'dns resolve <*>', 30, 30),
          makeTemplate('T3', 'dns timeout <*>', 20, 20),
        ])],
        ['QRY-002', makeQuery('QRY-002', 'HTTP requests', [
          makeTemplate('T1', 'dns lookup <*>', 40, 40),
          makeTemplate('T4', 'http get <*>', 35, 35),
          makeTemplate('T5', 'http post <*>', 25, 25),
        ])],
      ]);

      const store = createMockStore({ queries });
      const vm = callDerive(store, ['QRY-001', 'QRY-002'], 'count', null);

      assert.ok(vm.comparison, 'comparison should not be null for 2 queries');
      assert.equal(vm.comparison.queryA.queryId, 'QRY-001');
      assert.equal(vm.comparison.queryB.queryId, 'QRY-002');

      // T1 is in both
      const both = vm.comparison.templates.filter((t) => t.presence === 'both');
      assert.ok(both.length >= 1, 'should have at least 1 shared template');
      const t1 = vm.comparison.templates.find((t) => t.templateId === 'T1');
      assert.ok(t1);
      assert.equal(t1.countA, 50);
      assert.equal(t1.countB, 40);
      assert.equal(t1.presence, 'both');

      // T2, T3 are a-only
      const aOnly = vm.comparison.templates.filter((t) => t.presence === 'a-only');
      assert.ok(aOnly.length >= 2, 'should have at least 2 a-only templates');

      // T4, T5 are b-only
      const bOnly = vm.comparison.templates.filter((t) => t.presence === 'b-only');
      assert.ok(bOnly.length >= 2, 'should have at least 2 b-only templates');

      // Heatmap should be null with only 2 selected
      assert.equal(vm.heatmap, null);
    });
  });

  describe('3+-query heatmap', () => {
    it('returns heatmap rows where each row is a template with count-per-query array', () => {
      const queries = new Map([
        ['QRY-001', makeQuery('QRY-001', 'DNS lookups', [
          makeTemplate('T1', 'dns lookup <*>', 50, 50),
          makeTemplate('T2', 'dns resolve <*>', 30, 30),
        ])],
        ['QRY-002', makeQuery('QRY-002', 'HTTP requests', [
          makeTemplate('T1', 'dns lookup <*>', 40, 40),
          makeTemplate('T3', 'http get <*>', 35, 35),
        ])],
        ['QRY-003', makeQuery('QRY-003', 'Auth events', [
          makeTemplate('T1', 'dns lookup <*>', 20, 20),
          makeTemplate('T2', 'dns resolve <*>', 10, 10),
          makeTemplate('T3', 'http get <*>', 15, 15),
        ])],
      ]);

      const store = createMockStore({ queries });
      const vm = callDerive(store, ['QRY-001', 'QRY-002', 'QRY-003'], 'count', null);

      assert.ok(vm.heatmap, 'heatmap should not be null for 3+ queries');
      assert.deepEqual(vm.heatmap.queryIds, ['QRY-001', 'QRY-002', 'QRY-003']);
      assert.deepEqual(vm.heatmap.queryTitles, ['DNS lookups', 'HTTP requests', 'Auth events']);

      // T1 appears in all 3 queries
      const t1Row = vm.heatmap.rows.find((r) => r.templateId === 'T1');
      assert.ok(t1Row);
      assert.equal(t1Row.cells.length, 3);
      assert.equal(t1Row.totalCount, 110); // 50 + 40 + 20

      // T2 appears in QRY-001 and QRY-003 but not QRY-002
      const t2Row = vm.heatmap.rows.find((r) => r.templateId === 'T2');
      assert.ok(t2Row);
      const t2Qry2Cell = t2Row.cells.find((c) => c.queryId === 'QRY-002');
      assert.equal(t2Qry2Cell.count, 0);

      // Comparison should be null with 3+ selected
      assert.equal(vm.comparison, null);
    });
  });

  describe('sort by count', () => {
    it('orders templates by descending total count in heatmap rows', () => {
      const queries = new Map([
        ['QRY-001', makeQuery('QRY-001', 'Query A', [
          makeTemplate('T1', 'template one', 10, 10),
          makeTemplate('T2', 'template two', 100, 50),
          makeTemplate('T3', 'template three', 50, 25),
        ])],
        ['QRY-002', makeQuery('QRY-002', 'Query B', [
          makeTemplate('T1', 'template one', 5, 5),
          makeTemplate('T2', 'template two', 80, 40),
          makeTemplate('T3', 'template three', 60, 30),
        ])],
        ['QRY-003', makeQuery('QRY-003', 'Query C', [
          makeTemplate('T1', 'template one', 3, 3),
        ])],
      ]);

      const store = createMockStore({ queries });
      const vm = callDerive(store, ['QRY-001', 'QRY-002', 'QRY-003'], 'count', null);

      assert.ok(vm.heatmap);
      // T2 total: 180, T3 total: 110, T1 total: 18
      assert.equal(vm.heatmap.rows[0].templateId, 'T2');
      assert.equal(vm.heatmap.rows[1].templateId, 'T3');
      assert.equal(vm.heatmap.rows[2].templateId, 'T1');
    });
  });

  describe('receipt inspector with anomalyFrame', () => {
    it('returns inspector data with deviation breakdown when receipt has anomalyFrame', () => {
      const receipts = new Map([
        ['RCT-001', makeReceipt('RCT-001', 'DNS beaconing confirmed', 'supports', {
          confidence: 'High',
          relatedQueries: ['QRY-001'],
          anomalyFrame: {
            baseline: 'Normal DNS resolution pattern',
            prediction: 'Expected benign lookup',
            observation: 'Periodic C2 callback pattern',
            deviationScore: {
              category: 'EXPECTED_MALICIOUS',
              baseScore: 3,
              modifiers: [
                { factor: 'periodicity', value: 'regular', contribution: 1.5 },
                { factor: 'domain_age', value: 'new', contribution: 0.5 },
              ],
              totalScore: 5,
            },
            attackMapping: ['T1071.004'],
          },
        })],
      ]);

      const store = createMockStore({ receipts });
      const vm = callDerive(store, [], 'count', 'RCT-001');

      assert.ok(vm.receiptInspector, 'receiptInspector should not be null');
      assert.equal(vm.receiptInspector.receipts.length, 1);
      assert.equal(vm.receiptInspector.selectedReceiptId, 'RCT-001');

      const item = vm.receiptInspector.receipts[0];
      assert.equal(item.receiptId, 'RCT-001');
      assert.equal(item.hasAnomalyFrame, true);
      assert.equal(item.deviationScore, 5);
      assert.equal(item.deviationCategory, 'EXPECTED_MALICIOUS');
      assert.equal(item.baseScore, 3);
      assert.equal(item.modifiers.length, 2);
      assert.equal(item.baseline, 'Normal DNS resolution pattern');
      assert.equal(item.prediction, 'Expected benign lookup');
      assert.equal(item.observation, 'Periodic C2 callback pattern');
      assert.deepEqual(item.attackMapping, ['T1071.004']);
    });
  });

  describe('receipt inspector without anomalyFrame', () => {
    it('returns inspector data with null anomalyFrame fields', () => {
      const receipts = new Map([
        ['RCT-002', makeReceipt('RCT-002', 'No lateral movement', 'contradicts', {
          confidence: 'Medium',
          relatedQueries: ['QRY-001'],
          anomalyFrame: null,
        })],
      ]);

      const store = createMockStore({ receipts });
      const vm = callDerive(store, [], 'count', 'RCT-002');

      assert.ok(vm.receiptInspector, 'receiptInspector should not be null');
      const item = vm.receiptInspector.receipts[0];
      assert.equal(item.receiptId, 'RCT-002');
      assert.equal(item.hasAnomalyFrame, false);
      assert.equal(item.deviationScore, null);
      assert.equal(item.deviationCategory, null);
      assert.equal(item.baseScore, null);
      assert.deepEqual(item.modifiers, []);
      assert.equal(item.baseline, null);
      assert.equal(item.prediction, null);
      assert.equal(item.observation, null);
      assert.deepEqual(item.attackMapping, []);
    });
  });

});
