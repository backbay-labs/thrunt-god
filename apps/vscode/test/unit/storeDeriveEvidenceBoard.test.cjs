/**
 * Unit tests for deriveEvidenceBoard (store ViewModel derivation).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: empty store, hypothesis nodes, receipt nodes, query nodes,
 * edge derivation (receipt->hypothesis, query->receipt), matrixCells for
 * every hypothesis x receipt pair, blindSpots extraction from EvidenceReview.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);

// ---------------------------------------------------------------------------
// Helpers: call deriveEvidenceBoard on a mock store via prototype.call()
// ---------------------------------------------------------------------------

const deriveEvidenceBoard = ext.HuntDataStore.prototype.deriveEvidenceBoard;

/**
 * Create a minimal mock store shape that deriveEvidenceBoard.call() can use.
 * Only the methods called inside deriveEvidenceBoard need to be present:
 * getHunt(), getQueries(), getReceipts(), getEvidenceReview().
 */
function createMockStore(options = {}) {
  const defaultQueries = options.queries ?? new Map();
  const defaultReceipts = options.receipts ?? new Map();

  return {
    getHunt: () => options.hunt ?? null,
    getQueries: () => defaultQueries,
    getReceipts: () => defaultReceipts,
    getEvidenceReview: () => options.evidenceReview ?? undefined,
  };
}

function callDerive(mockStore) {
  return deriveEvidenceBoard.call(mockStore);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveEvidenceBoard', () => {

  describe('empty store (null hunt)', () => {
    it('returns empty arrays for all fields when getHunt returns null', () => {
      const store = createMockStore({ hunt: null });
      const vm = callDerive(store);

      assert.deepEqual(vm.nodes, []);
      assert.deepEqual(vm.edges, []);
      assert.deepEqual(vm.matrixCells, []);
      assert.deepEqual(vm.hypothesisIds, []);
      assert.deepEqual(vm.receiptIds, []);
      assert.deepEqual(vm.blindSpots, []);
    });
  });

  describe('hypothesis nodes', () => {
    it('produces 2 nodes with tier=0 from 2 hypotheses (1 Supported, 1 Open)', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [
                {
                  id: 'HYP-01', assertion: 'DNS beaconing to suspicious domain',
                  status: 'Supported', confidence: 'High',
                  signal: '', priority: '', scope: '', dataSources: [],
                  evidenceNeeded: '', disproofCondition: '',
                },
                {
                  id: 'HYP-02', assertion: 'Lateral movement via SMB',
                  status: 'Open', confidence: 'Medium',
                  signal: '', priority: '', scope: '', dataSources: [],
                  evidenceNeeded: '', disproofCondition: '',
                },
              ],
              parked: [],
              disproved: [],
            },
          },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
      });

      const vm = callDerive(store);
      const hypNodes = vm.nodes.filter((n) => n.type === 'hypothesis');

      assert.equal(hypNodes.length, 2);

      const hyp1 = hypNodes.find((n) => n.id === 'HYP-01');
      assert.ok(hyp1);
      assert.equal(hyp1.tier, 0);
      assert.equal(hyp1.verdict, 'Supported');
      assert.equal(hyp1.confidence, 'High');
      assert.ok(hyp1.label.startsWith('DNS beaconing'));

      const hyp2 = hypNodes.find((n) => n.id === 'HYP-02');
      assert.ok(hyp2);
      assert.equal(hyp2.tier, 0);
      assert.equal(hyp2.verdict, 'Open');
      assert.equal(hyp2.confidence, 'Medium');
    });
  });

  describe('receipt nodes', () => {
    it('produces 2 nodes with tier=1 from 2 receipts with correct verdict and deviationScore', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: { status: 'loaded', data: { active: [], parked: [], disproved: [] } },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
        receipts: new Map([
          ['RCT-001', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-001',
              claim: 'DNS beaconing confirmed via C2 callbacks',
              claimStatus: 'supports',
              confidence: 'High',
              relatedHypotheses: ['HYP-01'],
              relatedQueries: [],
              anomalyFrame: {
                deviationScore: { totalScore: 4.2 },
              },
            },
          }],
          ['RCT-002', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-002',
              claim: 'No lateral movement observed in SMB logs',
              claimStatus: 'contradicts',
              confidence: 'Medium',
              relatedHypotheses: ['HYP-02'],
              relatedQueries: [],
              anomalyFrame: null,
            },
          }],
        ]),
      });

      const vm = callDerive(store);
      const rctNodes = vm.nodes.filter((n) => n.type === 'receipt');

      assert.equal(rctNodes.length, 2);

      const rct1 = rctNodes.find((n) => n.id === 'RCT-001');
      assert.ok(rct1);
      assert.equal(rct1.tier, 1);
      assert.equal(rct1.verdict, 'supports');
      assert.equal(rct1.confidence, 'High');
      assert.equal(rct1.deviationScore, 4.2);

      const rct2 = rctNodes.find((n) => n.id === 'RCT-002');
      assert.ok(rct2);
      assert.equal(rct2.tier, 1);
      assert.equal(rct2.verdict, 'contradicts');
      assert.equal(rct2.deviationScore, undefined);
    });
  });

  describe('query nodes', () => {
    it('produces 1 node with tier=2 from a query linked to receipt', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: { status: 'loaded', data: { active: [], parked: [], disproved: [] } },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
        queries: new Map([
          ['QRY-001', {
            status: 'loaded',
            data: {
              queryId: 'QRY-001',
              title: 'DNS resolution logs for suspicious domains',
              relatedHypotheses: [],
              relatedReceipts: ['RCT-001'],
              templateCount: 3,
            },
          }],
        ]),
      });

      const vm = callDerive(store);
      const qryNodes = vm.nodes.filter((n) => n.type === 'query');

      assert.equal(qryNodes.length, 1);
      assert.equal(qryNodes[0].id, 'QRY-001');
      assert.equal(qryNodes[0].tier, 2);
      assert.equal(qryNodes[0].verdict, undefined);
      assert.equal(qryNodes[0].confidence, undefined);
      assert.equal(qryNodes[0].deviationScore, undefined);
      assert.ok(qryNodes[0].label.startsWith('DNS resolution'));
    });
  });

  describe('edge derivation', () => {
    it('derives edges from receipt.relatedHypotheses and receipt.relatedQueries', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [
                { id: 'HYP-01', assertion: 'Test', status: 'Open', confidence: 'Low', signal: '', priority: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
              parked: [],
              disproved: [],
            },
          },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
        receipts: new Map([
          ['RCT-001', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-001',
              claim: 'Test claim',
              claimStatus: 'supports',
              confidence: 'High',
              relatedHypotheses: ['HYP-01'],
              relatedQueries: ['QRY-001'],
              anomalyFrame: null,
            },
          }],
        ]),
        queries: new Map([
          ['QRY-001', {
            status: 'loaded',
            data: {
              queryId: 'QRY-001',
              title: 'Test query',
              relatedHypotheses: [],
              relatedReceipts: ['RCT-001'],
              templateCount: 1,
            },
          }],
        ]),
      });

      const vm = callDerive(store);

      // receipt -> hypothesis edge (claimStatus as relationship)
      const rctToHyp = vm.edges.find((e) => e.source === 'RCT-001' && e.target === 'HYP-01');
      assert.ok(rctToHyp, 'Expected edge from RCT-001 to HYP-01');
      assert.equal(rctToHyp.relationship, 'supports');

      // query -> receipt edge (always 'context')
      const qryToRct = vm.edges.find((e) => e.source === 'QRY-001' && e.target === 'RCT-001');
      assert.ok(qryToRct, 'Expected edge from QRY-001 to RCT-001');
      assert.equal(qryToRct.relationship, 'context');
    });

    it('maps inconclusive claimStatus to context relationship', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [
                { id: 'HYP-01', assertion: 'Test', status: 'Open', confidence: 'Low', signal: '', priority: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
              parked: [],
              disproved: [],
            },
          },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
        receipts: new Map([
          ['RCT-001', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-001',
              claim: 'Inconclusive evidence',
              claimStatus: 'inconclusive',
              confidence: 'Low',
              relatedHypotheses: ['HYP-01'],
              relatedQueries: [],
              anomalyFrame: null,
            },
          }],
        ]),
      });

      const vm = callDerive(store);
      const edge = vm.edges.find((e) => e.source === 'RCT-001' && e.target === 'HYP-01');
      assert.ok(edge);
      assert.equal(edge.relationship, 'context');
    });
  });

  describe('matrixCells', () => {
    it('produces matrixCells for every hypothesis x receipt pair', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [
                { id: 'HYP-01', assertion: 'A', status: 'Open', confidence: 'Low', signal: '', priority: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
                { id: 'HYP-02', assertion: 'B', status: 'Open', confidence: 'Low', signal: '', priority: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
              parked: [],
              disproved: [],
            },
          },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
        receipts: new Map([
          ['RCT-001', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-001',
              claim: 'Supports HYP-01',
              claimStatus: 'supports',
              confidence: 'High',
              relatedHypotheses: ['HYP-01'],
              relatedQueries: [],
              anomalyFrame: { deviationScore: { totalScore: 3.5 } },
            },
          }],
          ['RCT-002', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-002',
              claim: 'Contradicts HYP-02',
              claimStatus: 'contradicts',
              confidence: 'Medium',
              relatedHypotheses: ['HYP-02'],
              relatedQueries: [],
              anomalyFrame: null,
            },
          }],
        ]),
      });

      const vm = callDerive(store);

      // 2 hypotheses x 2 receipts = 4 matrixCells
      assert.equal(vm.matrixCells.length, 4);

      // HYP-01 x RCT-001: supports (present edge)
      const cell1 = vm.matrixCells.find((c) => c.hypothesisId === 'HYP-01' && c.receiptId === 'RCT-001');
      assert.ok(cell1);
      assert.equal(cell1.relationship, 'supports');
      assert.equal(cell1.deviationScore, 3.5);

      // HYP-01 x RCT-002: absent (no edge)
      const cell2 = vm.matrixCells.find((c) => c.hypothesisId === 'HYP-01' && c.receiptId === 'RCT-002');
      assert.ok(cell2);
      assert.equal(cell2.relationship, 'absent');
      assert.equal(cell2.deviationScore, null);

      // HYP-02 x RCT-001: absent (no edge)
      const cell3 = vm.matrixCells.find((c) => c.hypothesisId === 'HYP-02' && c.receiptId === 'RCT-001');
      assert.ok(cell3);
      assert.equal(cell3.relationship, 'absent');
      assert.equal(cell3.deviationScore, null);

      // HYP-02 x RCT-002: contradicts (present edge)
      const cell4 = vm.matrixCells.find((c) => c.hypothesisId === 'HYP-02' && c.receiptId === 'RCT-002');
      assert.ok(cell4);
      assert.equal(cell4.relationship, 'contradicts');
      assert.equal(cell4.deviationScore, null); // no anomalyFrame
    });

    it('returns hypothesisIds and receiptIds arrays matching the nodes', () => {
      const store = createMockStore({
        hunt: {
          mission: { status: 'loaded', data: {} },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [
                { id: 'HYP-01', assertion: 'A', status: 'Open', confidence: 'Low', signal: '', priority: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
              parked: [],
              disproved: [],
            },
          },
          huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
          state: { status: 'loaded', data: { phase: 1, confidence: 'Medium', blockers: '' } },
        },
        receipts: new Map([
          ['RCT-001', {
            status: 'loaded',
            data: {
              receiptId: 'RCT-001', claim: 'Test', claimStatus: 'supports',
              confidence: 'High', relatedHypotheses: ['HYP-01'], relatedQueries: [],
              anomalyFrame: null,
            },
          }],
        ]),
      });

      const vm = callDerive(store);
      assert.deepEqual(vm.hypothesisIds, ['HYP-01']);
      assert.deepEqual(vm.receiptIds, ['RCT-001']);
    });
  });

  describe('blindSpots extraction', () => {
    it('extracts blindSpots from EvidenceReview artifact', () => {
      const store = createMockStore({
        hunt: null,
        evidenceReview: {
          status: 'loaded',
          data: {
            blindSpots: 'No cloud telemetry coverage\nLimited endpoint visibility\n\nMissing DNS logs',
          },
        },
      });

      const vm = callDerive(store);

      assert.deepEqual(vm.blindSpots, [
        'No cloud telemetry coverage',
        'Limited endpoint visibility',
        'Missing DNS logs',
      ]);
    });

    it('returns empty array when no EvidenceReview artifact exists', () => {
      const store = createMockStore({
        hunt: null,
        evidenceReview: undefined,
      });

      const vm = callDerive(store);
      assert.deepEqual(vm.blindSpots, []);
    });

    it('returns empty array when blindSpots string is empty', () => {
      const store = createMockStore({
        hunt: null,
        evidenceReview: {
          status: 'loaded',
          data: {
            blindSpots: '',
          },
        },
      });

      const vm = callDerive(store);
      assert.deepEqual(vm.blindSpots, []);
    });
  });

});
