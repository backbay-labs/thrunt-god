/**
 * Unit tests for HuntTreeDataProvider (sidebar).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: root nodes, verdict badges, phase status indicators,
 * deviation score badges, double-click command, context menu value,
 * store event propagation, and narrow width label conventions.
 */
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

const HUNT_ROOT = '/mock/hunt';

// ---------------------------------------------------------------------------
// Mock store factory
// ---------------------------------------------------------------------------

function createMockStore(options = {}) {
  const emitter = new vscode.EventEmitter();

  const defaultHypotheses = {
    active: [
      {
        id: 'HYP-01',
        signal: 'Brute force',
        assertion: 'The attacker used credential stuffing',
        priority: 'Critical',
        status: 'Supported',
        confidence: 'High',
        scope: 'auth logs',
        dataSources: ['splunk'],
        evidenceNeeded: 'login counts',
        disproofCondition: 'no anomaly',
      },
      {
        id: 'HYP-02',
        signal: 'Lateral movement',
        assertion: 'The attacker moved laterally',
        priority: 'High',
        status: 'Open',
        confidence: 'Low',
        scope: 'network logs',
        dataSources: ['zeek'],
        evidenceNeeded: 'lateral patterns',
        disproofCondition: 'no lateral',
      },
    ],
    parked: [],
    disproved: [
      {
        id: 'HYP-03',
        signal: 'Exfiltration',
        assertion: 'Data was exfiltrated via DNS',
        priority: 'Medium',
        status: 'Disproved',
        confidence: 'High',
        scope: 'dns logs',
        dataSources: ['zeek'],
        evidenceNeeded: 'dns tunneling',
        disproofCondition: 'no dns anomalies',
      },
    ],
  };

  const defaultPhases = [
    { number: 1, name: 'Initial Access', goal: 'Identify entry', status: 'complete', dependsOn: '', plans: [] },
    { number: 2, name: 'Lateral Movement', goal: 'Track spread', status: 'running', dependsOn: 'Phase 1', plans: [] },
    { number: 3, name: 'Persistence', goal: 'Find implants', status: 'planned', dependsOn: 'Phase 2', plans: [] },
  ];

  const defaultReceipts = new Map([
    ['RCT-001', {
      status: 'loaded',
      data: {
        receiptId: 'RCT-001',
        querySpecVersion: '1.0',
        createdAt: '2026-03-29',
        source: 'splunk',
        connectorId: 'c1',
        dataset: 'auth',
        resultStatus: 'success',
        claimStatus: 'supports',
        relatedHypotheses: ['HYP-01'],
        relatedQueries: ['QRY-001'],
        contentHash: 'abc',
        manifestId: 'm1',
        claim: 'Login failures exceeded threshold indicating brute force attack',
        evidence: 'evidence text',
        anomalyFrame: {
          baseline: 'Normal: 5 failures/day',
          prediction: 'Expected benign',
          observation: 'Observed 200 failures',
          deviationScore: {
            category: 'EXPECTED_MALICIOUS',
            baseScore: 2,
            modifiers: [],
            totalScore: 2,
          },
          attackMapping: ['T1110'],
        },
        confidence: 'High',
      },
    }],
    ['RCT-002', {
      status: 'loaded',
      data: {
        receiptId: 'RCT-002',
        querySpecVersion: '1.0',
        createdAt: '2026-03-29',
        source: 'zeek',
        connectorId: 'c2',
        dataset: 'dns',
        resultStatus: 'success',
        claimStatus: 'contradicts',
        relatedHypotheses: ['HYP-01'],
        relatedQueries: ['QRY-002'],
        contentHash: 'def',
        manifestId: 'm2',
        claim: 'Critical anomaly detected in lateral movement',
        evidence: 'evidence text',
        anomalyFrame: {
          baseline: 'Normal pattern',
          prediction: 'Expected benign',
          observation: 'Anomalous lateral',
          deviationScore: {
            category: 'NOVEL',
            baseScore: 4,
            modifiers: [{ factor: 'novelty', value: 'high', contribution: 1 }],
            totalScore: 5,
          },
          attackMapping: ['T1021'],
        },
        confidence: 'Medium',
      },
    }],
    ['RCT-003', {
      status: 'loaded',
      data: {
        receiptId: 'RCT-003',
        querySpecVersion: '1.0',
        createdAt: '2026-03-29',
        source: 'splunk',
        connectorId: 'c3',
        dataset: 'auth',
        resultStatus: 'success',
        claimStatus: 'inconclusive',
        relatedHypotheses: ['HYP-02'],
        relatedQueries: ['QRY-001'],
        contentHash: 'ghi',
        manifestId: 'm3',
        claim: 'Inconclusive receipt with no anomaly framing',
        evidence: 'evidence text',
        anomalyFrame: null,
        confidence: 'Low',
      },
    }],
  ]);

  const defaultQueries = new Map([
    ['QRY-001', {
      status: 'loaded',
      data: {
        queryId: 'QRY-001',
        querySpecVersion: '1.0',
        source: 'splunk',
        connectorId: 'c1',
        dataset: 'auth',
        executedAt: '2026-03-29',
        author: 'hunter',
        relatedHypotheses: ['HYP-01'],
        relatedReceipts: [],
        contentHash: 'abc',
        manifestId: 'm1',
        intent: 'Check logins',
        queryText: 'SELECT *',
        resultSummary: 'events=100, templates=5, entities=3',
        templates: [],
        entityCount: 3,
        eventCount: 100,
        templateCount: 5,
      },
    }],
    ['QRY-002', {
      status: 'loaded',
      data: {
        queryId: 'QRY-002',
        querySpecVersion: '1.0',
        source: 'zeek',
        connectorId: 'c2',
        dataset: 'dns',
        executedAt: '2026-03-29',
        author: 'hunter',
        relatedHypotheses: ['HYP-02'],
        relatedReceipts: [],
        contentHash: 'def',
        manifestId: 'm2',
        intent: 'Check DNS',
        queryText: 'SELECT *',
        resultSummary: 'events=50, templates=3, entities=2',
        templates: [],
        entityCount: 2,
        eventCount: 50,
        templateCount: 3,
      },
    }],
  ]);

  const store = {
    onDidChange: emitter.event,
    _emitter: emitter,
    getChildHunts: () => options.childHunts ?? [],
    getHunt: () => {
      if (options.noHunt) return null;
      return {
        mission: {
          status: 'loaded',
          data: options.mission ?? {
            mode: 'case',
            opened: '2026-03-29',
            owner: 'hunter',
            status: 'Open',
            signal: 'Brute force SSH',
            desiredOutcome: 'Identify attacker',
            scope: 'auth logs',
            workingTheory: 'Credential stuffing',
          },
        },
        hypotheses: {
          status: 'loaded',
          data: options.hypotheses ?? defaultHypotheses,
        },
        huntMap: {
          status: 'loaded',
          data: {
            overview: 'Investigation overview',
            phases: options.phases ?? defaultPhases,
          },
        },
        state: {
          status: 'loaded',
          data: {
            activeSignal: 'Brute force',
            currentFocus: 'auth logs',
            phase: 1,
            totalPhases: 3,
            planInPhase: 1,
            totalPlansInPhase: 2,
            status: 'In Progress',
            lastActivity: '2026-03-29',
            scope: 'auth',
            confidence: 'Medium',
            blockers: 'None',
          },
        },
      };
    },
    getQueries: () => defaultQueries,
    getReceipts: () => defaultReceipts,
    getQuery: (id) => defaultQueries.get(id),
    getReceipt: (id) => defaultReceipts.get(id),
    getArtifactPath: (id) => {
      if (id === 'FINDINGS') {
        return path.join(HUNT_ROOT, 'published', 'FINDINGS.md');
      }
      return undefined;
    },
    getReceiptsForQuery: (queryId) => {
      const results = [];
      for (const [, receipt] of defaultReceipts) {
        if (receipt.status === 'loaded' && receipt.data.relatedQueries.includes(queryId)) {
          results.push(receipt);
        }
      }
      return results;
    },
    getReceiptsForHypothesis: (hypId) => {
      const results = [];
      for (const [, receipt] of defaultReceipts) {
        if (receipt.status === 'loaded' && receipt.data.relatedHypotheses.includes(hypId)) {
          results.push(receipt);
        }
      }
      return results;
    },
    getQueriesForPhase: (phaseNum) => {
      // Phase 1 -> QRY-001, Phase 2 -> QRY-002
      if (phaseNum === 1) return [defaultQueries.get('QRY-001')];
      if (phaseNum === 2) return [defaultQueries.get('QRY-002')];
      return [];
    },
  };

  return store;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HuntTreeDataProvider', () => {
  let provider;
  let store;
  const huntRootUri = vscode.Uri.file(HUNT_ROOT);

  beforeEach(() => {
    store = createMockStore();
    provider = new ext.HuntTreeDataProvider(store, huntRootUri);
  });

  describe('root nodes', () => {
    it('returns Mission, Hypotheses, Phases when store has data', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots.length, 3);
      assert.equal(roots[0].label, 'Mission');
      assert.equal(roots[1].label, 'Hypotheses');
      assert.equal(roots[2].label, 'Phases');
    });

    it('shows Program for program-mode hunts', () => {
      const programProvider = new ext.HuntTreeDataProvider(
        createMockStore({
          mission: {
            mode: 'Program',
            opened: '2026-03-29',
            owner: 'hunter',
            status: 'Open',
            signal: 'Brute force SSH',
            desiredOutcome: 'Identify attacker',
            scope: 'auth logs',
            workingTheory: 'Credential stuffing',
          },
        }),
        huntRootUri
      );

      const roots = programProvider.getChildren(undefined);
      assert.equal(roots[0].label, 'Program');
    });

    it('returns empty array when store returns null hunt', () => {
      const emptyStore = createMockStore({ noHunt: true });
      const emptyProvider = new ext.HuntTreeDataProvider(emptyStore, huntRootUri);
      const roots = emptyProvider.getChildren(undefined);
      assert.equal(roots.length, 0);
    });
  });

  describe('hypothesis nodes', () => {
    it('shows verdict badge descriptions', () => {
      const roots = provider.getChildren(undefined);
      const hypGroup = roots[1]; // Hypotheses group
      const hypotheses = provider.getChildren(hypGroup);

      // Should have 3 hypotheses (2 active + 1 disproved)
      assert.equal(hypotheses.length, 3);

      // HYP-01 is Supported
      assert.equal(hypotheses[0].label, 'HYP-01');
      assert.equal(hypotheses[0].description, 'Supported');

      // HYP-02 is Open
      assert.equal(hypotheses[1].label, 'HYP-02');
      assert.equal(hypotheses[1].description, 'Open');

      // HYP-03 is Disproved
      assert.equal(hypotheses[2].label, 'HYP-03');
      assert.equal(hypotheses[2].description, 'Disproved');
    });

    it('shows correct ThemeIcon per verdict status', () => {
      const roots = provider.getChildren(undefined);
      const hypotheses = provider.getChildren(roots[1]);

      // Supported -> check icon with green color
      assert.equal(hypotheses[0].iconPath.id, 'check');
      assert.equal(hypotheses[0].iconPath.color.id, 'charts.green');

      // Open -> circle-outline icon (no color)
      assert.equal(hypotheses[1].iconPath.id, 'circle-outline');

      // Disproved -> close icon with red color
      assert.equal(hypotheses[2].iconPath.id, 'close');
      assert.equal(hypotheses[2].iconPath.color.id, 'charts.red');
    });
  });

  describe('phase nodes', () => {
    it('shows status indicator in description', () => {
      const roots = provider.getChildren(undefined);
      const phasesGroup = roots[2];
      const phases = provider.getChildren(phasesGroup);

      assert.equal(phases.length, 3);

      // Phase 1: complete
      assert.ok(phases[0].label.includes('Initial Access'));
      assert.equal(phases[0].description, 'complete');
      assert.equal(phases[0].contextValue, 'phase-complete');
      assert.equal(phases[0].iconPath.id, 'check');

      // Phase 2: running
      assert.ok(phases[1].label.includes('Lateral Movement'));
      assert.equal(phases[1].description, 'running');
      assert.equal(phases[1].contextValue, 'phase-runnable');
      assert.equal(phases[1].iconPath.id, 'sync~spin');

      // Phase 3: planned
      assert.ok(phases[2].label.includes('Persistence'));
      assert.equal(phases[2].description, 'planned');
      assert.equal(phases[2].contextValue, 'phase-runnable');
      assert.equal(phases[2].iconPath.id, 'circle-outline');
    });

    it('shows published findings under the final phase when available', () => {
      const publishStore = createMockStore({
        phases: [
          { number: 1, name: 'Initial Access', goal: 'Identify entry', status: 'complete', dependsOn: '', plans: [] },
          { number: 2, name: 'Pilot Hunts', goal: 'Execute evidence collection', status: 'complete', dependsOn: 'Phase 1', plans: [] },
          { number: 3, name: 'Publish', goal: 'Publish findings', status: 'complete', dependsOn: 'Phase 2', plans: [] },
        ],
      });
      const publishProvider = new ext.HuntTreeDataProvider(publishStore, huntRootUri);
      const roots = publishProvider.getChildren(undefined);
      const phases = publishProvider.getChildren(roots[2]);
      const publishChildren = publishProvider.getChildren(phases[2]);

      const findingsNode = publishChildren.find((child) => child.label === 'FINDINGS');
      assert.ok(findingsNode, 'Expected published findings leaf under final phase');
      assert.equal(findingsNode.artifactType, 'phaseSummary');
      assert.equal(findingsNode.description, 'published');
      assert.ok(findingsNode.artifactPath.endsWith('/published/FINDINGS.md'));
    });
  });

  describe('child hunt nodes', () => {
    it('shows a cases group when nested cases are present', () => {
      const providerWithChildren = new ext.HuntTreeDataProvider(
        createMockStore({
          childHunts: [
            {
              id: 'case:test-1',
              name: 'test-1',
              kind: 'case',
              huntRootPath: path.join(HUNT_ROOT, 'cases', 'test-1'),
              missionPath: path.join(HUNT_ROOT, 'cases', 'test-1', 'MISSION.md'),
              signal: 'Investigate three signals from the parent program',
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
        }),
        huntRootUri
      );

      const roots = providerWithChildren.getChildren(undefined);
      const childGroup = roots.find((item) => item.label === 'Cases');
      assert.ok(childGroup, 'Expected Cases group');

      const children = providerWithChildren.getChildren(childGroup);
      assert.equal(children.length, 1);
      assert.equal(children[0].label, 'test-1');
      assert.equal(children[0].description, 'case · Phase 2/5 · ready to plan');
      assert.equal(children[0].artifactType, 'mission');
      assert.ok(children[0].artifactPath.endsWith('/cases/test-1/MISSION.md'));
    });
  });

  describe('receipt nodes', () => {
    it('shows deviation score 0-2 as green', () => {
      const roots = provider.getChildren(undefined);
      const hypotheses = provider.getChildren(roots[1]);
      // HYP-01 has RCT-001 (score 2) and RCT-002 (score 5)
      const receipts = provider.getChildren(hypotheses[0]);

      // Find the receipt with score 2
      const lowScore = receipts.find(r => r.label === 'RCT-001');
      assert.ok(lowScore, 'RCT-001 should exist under HYP-01');
      assert.equal(lowScore.description, 'Score: 2/6');
      assert.equal(lowScore.iconPath.id, 'pass');
      assert.equal(lowScore.iconPath.color.id, 'charts.green');
    });

    it('shows deviation score 5-6 as red', () => {
      const roots = provider.getChildren(undefined);
      const hypotheses = provider.getChildren(roots[1]);
      const receipts = provider.getChildren(hypotheses[0]);

      // Find the receipt with score 5
      const highScore = receipts.find(r => r.label === 'RCT-002');
      assert.ok(highScore, 'RCT-002 should exist under HYP-01');
      assert.equal(highScore.description, 'Score: 5/6');
      assert.equal(highScore.iconPath.id, 'error');
      assert.equal(highScore.iconPath.color.id, 'charts.red');
    });

    it('shows "No score" when anomalyFrame is null', () => {
      const roots = provider.getChildren(undefined);
      const hypotheses = provider.getChildren(roots[1]);
      // HYP-02 has RCT-003 which has anomalyFrame: null
      const receipts = provider.getChildren(hypotheses[1]);

      const noScore = receipts.find(r => r.label === 'RCT-003');
      assert.ok(noScore, 'RCT-003 should exist under HYP-02');
      assert.equal(noScore.description, 'No score');
      assert.equal(noScore.iconPath.id, 'file');
    });
  });

  describe('interaction', () => {
    it('leaf nodes have command for double-click', () => {
      const roots = provider.getChildren(undefined);
      // Mission is a leaf node (collapsibleState = None)
      const missionNode = roots[0];
      assert.ok(missionNode.command, 'Mission leaf should have a command');
      assert.equal(missionNode.command.command, 'thrunt-god.openArtifact');
    });

    it('tree items have contextValue', () => {
      const roots = provider.getChildren(undefined);
      assert.deepEqual(
        roots.map((root) => root.contextValue),
        ['mission', 'hypotheses-group', 'phases-group']
      );

      // Check children too
      const hypotheses = provider.getChildren(roots[1]);
      for (const hyp of hypotheses) {
        assert.equal(hyp.contextValue, 'huntTreeItem');
      }

      const phases = provider.getChildren(roots[2]);
      assert.deepEqual(
        phases.map((phase) => phase.contextValue),
        ['phase-complete', 'phase-runnable', 'phase-runnable']
      );
    });

    it('onDidChangeTreeData fires when store emits a change event', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => {
        fired = true;
      });

      // Simulate a store change event
      store._emitter.fire({
        type: 'artifact:updated',
        artifactType: 'mission',
        id: 'MISSION',
        filePath: '/mock/hunt/MISSION.md',
      });

      assert.ok(fired, 'onDidChangeTreeData should have fired');
    });
  });

  describe('narrow width', () => {
    it('labels use IDs not full text', () => {
      const roots = provider.getChildren(undefined);
      const hypotheses = provider.getChildren(roots[1]);

      // Labels should be short IDs like "HYP-01", not full assertion text
      for (const hyp of hypotheses) {
        assert.ok(hyp.label.startsWith('HYP-'), `Label should be a short ID, got: ${hyp.label}`);
        assert.ok(hyp.label.length < 10, `Label should be short, got: ${hyp.label}`);
      }

      // Check receipt labels are also short IDs
      const receipts = provider.getChildren(hypotheses[0]);
      for (const receipt of receipts) {
        assert.ok(receipt.label.startsWith('RCT-'), `Receipt label should be a short ID, got: ${receipt.label}`);
        // Full claim text should be in tooltip, not label
        assert.ok(receipt.tooltip, 'Receipt should have a tooltip with claim text');
      }
    });
  });
});
