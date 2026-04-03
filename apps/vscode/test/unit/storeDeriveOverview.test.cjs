/**
 * Unit tests for deriveHuntOverview (store ViewModel derivation).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: empty/null hunt defaults, mission field mapping,
 * hypothesis verdict counting, evidence counting from queries/receipts,
 * structured blocker parsing (text + timestamp), and diagnostics/sessionDiff
 * pass-through.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

// ---------------------------------------------------------------------------
// Helpers: call deriveHuntOverview on a mock store via prototype.call()
// ---------------------------------------------------------------------------

const deriveHuntOverview = ext.HuntDataStore.prototype.deriveHuntOverview;

/**
 * Create a minimal mock store shape that deriveHuntOverview.call() can use.
 * Only the methods called inside deriveHuntOverview need to be present:
 * getHunt(), getQueries(), getReceipts().
 */
function createMockStore(options = {}) {
  const defaultQueries = options.queries ?? new Map();
  const defaultReceipts = options.receipts ?? new Map();

  return {
    getHunt: () => options.hunt ?? null,
    getChildHunts: () => options.childHunts ?? [],
    getQueries: () => defaultQueries,
    getReceipts: () => defaultReceipts,
  };
}

function callDerive(mockStore, health, sessionDiff) {
  return deriveHuntOverview.call(mockStore, health, sessionDiff);
}

// Default diagnostics health (clean)
const CLEAN_HEALTH = { warnings: 0, errors: 0 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveHuntOverview', () => {

  describe('null hunt data', () => {
    it('returns empty/zero defaults when getHunt returns null', () => {
      const store = createMockStore({ hunt: null });
      const vm = callDerive(store, CLEAN_HEALTH, null);

      assert.equal(vm.mission, null);
      assert.deepEqual(vm.childHunts, []);
      assert.deepEqual(vm.phases, []);
      assert.equal(vm.currentPhase, 0);
      assert.deepEqual(vm.verdicts, { supported: 0, disproved: 0, inconclusive: 0, open: 0 });
      assert.deepEqual(vm.evidence, { receipts: 0, queries: 0, templates: 0 });
      assert.equal(vm.confidence, 'Unknown');
      assert.deepEqual(vm.blockers, []);
    });
  });

  describe('mission field mapping', () => {
    it('maps mission fields correctly from loaded hunt data', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: {
              signal: 'test-signal',
              owner: 'analyst-1',
              opened: '2026-03-29',
              mode: 'case',
              scope: 'network segment',
            },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: 'test',
              currentFocus: 'test',
              phase: 2,
              totalPhases: 5,
              planInPhase: 1,
              totalPlansInPhase: 2,
              status: 'In Progress',
              lastActivity: '2026-03-29',
              scope: 'network',
              confidence: 'High',
              blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.deepEqual(vm.mission, {
        signal: 'test-signal',
        owner: 'analyst-1',
        opened: '2026-03-29',
        mode: 'case',
        focus: 'network segment',
      });
    });
  });

  describe('child hunt summaries', () => {
    it('passes through nested case summaries separately from the program mission', () => {
      const store = createMockStore({
        childHunts: [
          {
            id: 'case:test-1',
            name: 'test-1',
            kind: 'case',
            huntRootPath: '/mock/.planning/cases/test-1',
            missionPath: '/mock/.planning/cases/test-1/MISSION.md',
            signal: 'Investigate the three inherited signals',
            mode: 'Case',
            status: 'Ready to plan',
            opened: '2026-04-01',
            owner: 'TBD',
            currentPhase: 2,
            totalPhases: 5,
            phaseName: 'Hypothesis Shaping',
            lastActivity: '2026-04-01',
            blockerCount: 4,
            findingsPublished: false,
          },
        ],
        hunt: {
          mission: {
            status: 'loaded',
            data: {
              signal: 'Program hunt',
              owner: 'analyst-1',
              opened: '2026-03-29',
              mode: 'program',
              scope: 'cloud and endpoint',
            },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: 'program',
              currentFocus: 'coordination',
              phase: 1,
              totalPhases: 5,
              planInPhase: 1,
              totalPlansInPhase: 1,
              status: 'In Progress',
              lastActivity: '2026-04-01',
              scope: 'shared program scope',
              confidence: 'Medium',
              blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.equal(vm.childHunts.length, 1);
      assert.equal(vm.childHunts[0].name, 'test-1');
      assert.equal(vm.childHunts[0].kind, 'case');
      assert.equal(vm.childHunts[0].currentPhase, 2);
      assert.equal(vm.childHunts[0].phaseName, 'Hypothesis Shaping');
    });
  });

  describe('verdict counting', () => {
    it('counts hypothesis verdicts across active, parked, and disproved', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: {
              signal: 's', owner: 'o', opened: 'd',
              mode: 'case', scope: 'sc',
            },
          },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [
                { id: 'HYP-01', status: 'Supported', signal: '', assertion: '', priority: '', confidence: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
                { id: 'HYP-02', status: 'Open', signal: '', assertion: '', priority: '', confidence: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
              parked: [
                { id: 'HYP-03', status: 'Inconclusive', signal: '', assertion: '', priority: '', confidence: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
              disproved: [
                { id: 'HYP-04', status: 'Disproved', signal: '', assertion: '', priority: '', confidence: '', scope: '', dataSources: [], evidenceNeeded: '', disproofCondition: '' },
              ],
            },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 1, totalPhases: 3,
              planInPhase: 1, totalPlansInPhase: 1,
              status: 'In Progress', lastActivity: '2026-03-29',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.deepEqual(vm.verdicts, {
        supported: 1,
        disproved: 1,
        inconclusive: 1,
        open: 1,
      });
    });
  });

  describe('evidence counting', () => {
    it('counts evidence from queries and receipts', () => {
      const queries = new Map([
        ['QRY-001', { status: 'loaded', data: { queryId: 'QRY-001', templateCount: 3, contentHash: 'a' } }],
        ['QRY-002', { status: 'loaded', data: { queryId: 'QRY-002', templateCount: 2, contentHash: 'b' } }],
      ]);
      const receipts = new Map([
        ['RCT-001', { status: 'loaded', data: { receiptId: 'RCT-001', contentHash: 'c' } }],
        ['RCT-002', { status: 'loaded', data: { receiptId: 'RCT-002', contentHash: 'd' } }],
        ['RCT-003', { status: 'loaded', data: { receiptId: 'RCT-003', contentHash: 'e' } }],
      ]);

      const store = createMockStore({
        queries,
        receipts,
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 1, totalPhases: 1,
              planInPhase: 1, totalPlansInPhase: 1,
              status: 'In Progress', lastActivity: '2026-03-29',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.equal(vm.evidence.queries, 2);
      assert.equal(vm.evidence.receipts, 3);
      assert.equal(vm.evidence.templates, 5); // 3 + 2 from the two queries
    });
  });

  describe('blocker parsing', () => {
    it('parses blockers from newline-separated string into structured objects with text and timestamp', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 1, totalPhases: 1,
              planInPhase: 1, totalPlansInPhase: 1,
              status: 'In Progress', lastActivity: '2026-03-30',
              scope: '', confidence: 'Low',
              blockers: 'Blocker A\nBlocker B\n',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.equal(vm.blockers.length, 2);

      assert.equal(vm.blockers[0].text, 'Blocker A');
      assert.equal(typeof vm.blockers[0].timestamp, 'string');
      assert.equal(vm.blockers[0].timestamp, '2026-03-30');

      assert.equal(vm.blockers[1].text, 'Blocker B');
      assert.equal(vm.blockers[1].timestamp, '2026-03-30');
    });

    it('returns empty blockers array when blockers string is empty', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 1, totalPhases: 1,
              planInPhase: 1, totalPlansInPhase: 1,
              status: 'In Progress', lastActivity: '2026-03-29',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.deepEqual(vm.blockers, []);
    });
  });

  describe('diagnostics and session diff pass-through', () => {
    it('passes through diagnosticsHealth', () => {
      const store = createMockStore({ hunt: null });
      const health = { warnings: 3, errors: 1 };
      const vm = callDerive(store, health, null);

      assert.equal(vm.diagnosticsHealth.warnings, 3);
      assert.equal(vm.diagnosticsHealth.errors, 1);
    });

    it('passes through sessionDiff when provided', () => {
      const store = createMockStore({ hunt: null });
      const sessionDiff = {
        entries: [
          { artifactType: 'query', artifactId: 'QRY-001', diffKind: 'added', timestamp: '2026-03-29' },
        ],
        summary: '1 added since last session',
      };
      const vm = callDerive(store, CLEAN_HEALTH, sessionDiff);

      assert.equal(vm.sessionDiff, sessionDiff);
      assert.equal(vm.activityFeed.length, 1);
      assert.equal(vm.activityFeed[0].diffKind, 'added');
    });

    it('returns empty activityFeed when sessionDiff is null', () => {
      const store = createMockStore({ hunt: null });
      const vm = callDerive(store, CLEAN_HEALTH, null);

      assert.equal(vm.sessionDiff, null);
      assert.deepEqual(vm.activityFeed, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Session continuity (16-03)
  // ---------------------------------------------------------------------------

  describe('sessionContinuity', () => {

    it('returns lastActivity from STATE artifact when hunt is loaded', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 3, totalPhases: 5,
              planInPhase: 2, totalPlansInPhase: 3,
              status: 'In Progress',
              lastActivity: '2026-04-02 -- Completed 15-03 Receipt QA Inspector',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.equal(vm.sessionContinuity.lastActivity, '2026-04-02 -- Completed 15-03 Receipt QA Inspector');
    });

    it('returns changesSummary from sessionDiff.summary when diff exists', () => {
      const store = createMockStore({ hunt: null });
      const sessionDiff = {
        entries: [
          { artifactType: 'query', artifactId: 'QRY-001', diffKind: 'added', timestamp: '2026-04-02' },
          { artifactType: 'receipt', artifactId: 'RCT-001', diffKind: 'modified', timestamp: '2026-04-02' },
        ],
        summary: '1 added, 1 modified since last session',
      };
      const vm = callDerive(store, CLEAN_HEALTH, sessionDiff);

      assert.equal(vm.sessionContinuity.changesSummary, '1 added, 1 modified since last session');
      assert.equal(vm.sessionContinuity.hasChanges, true);
    });

    it('returns "No changes since last session" when sessionDiff is null', () => {
      const store = createMockStore({ hunt: null });
      const vm = callDerive(store, CLEAN_HEALTH, null);

      assert.equal(vm.sessionContinuity.changesSummary, 'No changes since last session');
      assert.equal(vm.sessionContinuity.hasChanges, false);
    });

    it('returns suggestedAction containing phase number when state is loaded', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: {
              overview: '',
              phases: [
                { number: 3, name: 'Evidence Collection', status: 'running' },
              ],
            },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 3, totalPhases: 5,
              planInPhase: 1, totalPlansInPhase: 2,
              status: 'In Progress',
              lastActivity: '2026-04-02',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.ok(vm.sessionContinuity.suggestedAction.includes('Phase 3'));
      assert.ok(vm.sessionContinuity.suggestedAction.includes('Evidence Collection'));
    });

    it('returns "Review N changed artifacts" when many changes exist', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 2, totalPhases: 5,
              planInPhase: 1, totalPlansInPhase: 2,
              status: 'In Progress',
              lastActivity: '2026-04-02',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const sessionDiff = {
        entries: [
          { artifactType: 'query', artifactId: 'QRY-001', diffKind: 'added', timestamp: '2026-04-02' },
          { artifactType: 'query', artifactId: 'QRY-002', diffKind: 'modified', timestamp: '2026-04-02' },
          { artifactType: 'receipt', artifactId: 'RCT-001', diffKind: 'added', timestamp: '2026-04-02' },
        ],
        summary: '2 added, 1 modified since last session',
      };

      const vm = callDerive(store, sessionDiff.entries.length >= 3 ? CLEAN_HEALTH : CLEAN_HEALTH, sessionDiff);
      assert.equal(vm.sessionContinuity.suggestedAction, 'Review 3 changed artifacts');
    });

    it('returns currentPosition with phase and plan info when state is loaded', () => {
      const store = createMockStore({
        hunt: {
          mission: {
            status: 'loaded',
            data: { signal: 's', owner: 'o', opened: 'd', mode: 'case', scope: 'sc' },
          },
          hypotheses: {
            status: 'loaded',
            data: { active: [], parked: [], disproved: [] },
          },
          huntMap: {
            status: 'loaded',
            data: { overview: '', phases: [] },
          },
          state: {
            status: 'loaded',
            data: {
              activeSignal: '', currentFocus: '',
              phase: 3, totalPhases: 5,
              planInPhase: 2, totalPlansInPhase: 3,
              status: 'In Progress',
              lastActivity: '2026-04-02',
              scope: '', confidence: 'Medium', blockers: '',
            },
          },
        },
      });

      const vm = callDerive(store, CLEAN_HEALTH, null);
      assert.equal(vm.sessionContinuity.currentPosition, 'Phase 3 of 5, Plan 2 of 3');
    });

    it('returns defaults when hunt is null', () => {
      const store = createMockStore({ hunt: null });
      const vm = callDerive(store, CLEAN_HEALTH, null);

      assert.equal(vm.sessionContinuity.lastActivity, 'Unknown');
      assert.equal(vm.sessionContinuity.currentPosition, 'No hunt detected');
      assert.equal(vm.sessionContinuity.suggestedAction, 'Open a workspace with hunt artifacts');
    });
  });
});
