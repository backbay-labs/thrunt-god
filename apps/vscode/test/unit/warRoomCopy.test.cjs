'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
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

function createMockWatcher() {
  const emitter = new vscode.EventEmitter();
  return {
    onDidChange: emitter.event,
    fire: (paths) => emitter.fire(paths),
    dispose: () => emitter.dispose(),
  };
}

function createMockOutputChannel() {
  return {
    appendLine: () => {},
    dispose: () => {},
  };
}

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

describe('WarRoomFormatter', () => {
  const huntRoot = '/mock-war-room';
  let store;
  let watcher;

  beforeEach(async () => {
    populateMockFiles(huntRoot);
    watcher = createMockWatcher();
    store = new ext.HuntDataStore(
      vscode.Uri.file(huntRoot),
      watcher,
      createMockOutputChannel()
    );
    await store.initialScanComplete();
  });

  afterEach(() => {
    watcher.dispose();
    store.dispose();
    vscode.workspace._mockFiles.clear();
  });

  it('formats a finding summary with score, hypotheses, and related query context', () => {
    const formatter = new ext.WarRoomFormatter(store);
    const receipt = store.getReceipt('RCT-20260329-001');
    assert.equal(receipt.status, 'loaded');

    const output = formatter.formatFinding(receipt.data);
    assert.match(output.markdown, /\*\*RCT-20260329-001\*\*/);
    assert.match(output.markdown, /Score: 4\/6 \(MEDIUM\)/);
    assert.match(output.markdown, /Supports HYP-01/);
    assert.match(output.markdown, /QRY-20260329-001 \(1247 events, 3 templates\)/);
    assert.match(output.plainText, /ATT&CK: T1078, T1110\.003|ATT&CK: T1110\.003, T1078/);
  });

  it('formats a hypothesis summary with linked receipts and status', () => {
    const formatter = new ext.WarRoomFormatter(store);
    const hypothesis = formatter.getHypothesisById('HYP-02');
    assert.ok(hypothesis);

    const output = formatter.formatHypothesis(hypothesis);
    assert.match(output.markdown, /\*\*HYP-02\*\*/);
    assert.match(output.markdown, /Supported/);
    assert.match(output.markdown, /RCT-20260329-002/);
  });

  it('formats a hunt overview with integrity counts, techniques, and impacted entities', () => {
    const formatter = new ext.WarRoomFormatter(store);
    const output = formatter.formatHuntOverview();

    assert.match(output.markdown, /\*\*THRUNT Hunt:/);
    assert.match(output.markdown, /Evidence integrity: \d+ errors, \d+ warnings/);
    assert.match(output.markdown, /ATT&CK coverage:/);
    assert.match(output.markdown, /Impacted:/);
  });

  it('formats an ATT&CK summary grouped by technique', () => {
    const formatter = new ext.WarRoomFormatter(store);
    const output = formatter.formatAttackSummary();

    assert.match(output.attack, /ATT&CK Techniques Observed:/);
    assert.match(output.attack, /T1078/);
    assert.match(output.attack, /RCT-20260329-001/);
  });

  it('uses concise fallback copy when data is missing', () => {
    const formatter = new ext.WarRoomFormatter({
      getHunt() {
        return {
          mission: {
            status: 'loaded',
            data: {
              signal: 'Sparse hunt',
              owner: 'Analyst',
              scope: '',
            },
          },
          hypotheses: {
            status: 'loaded',
            data: {
              active: [],
              parked: [],
              disproved: [],
            },
          },
          state: {
            status: 'loaded',
            data: {
              phase: 1,
              totalPhases: 4,
            },
          },
        };
      },
      getReceipts() {
        return new Map();
      },
      getQueries() {
        return new Map();
      },
      getReceiptsForHypothesis() {
        return [];
      },
      getQuery() {
        return undefined;
      },
    });

    const finding = formatter.formatFinding({
      receiptId: 'RCT-EMPTY',
      relatedHypotheses: [],
      claimStatus: 'supports',
      relatedQueries: [],
      claim: 'No email addresses in this claim',
      source: 'analyst',
      createdAt: '2026-04-03T12:00:00Z',
      evidence: 'No mapped ATT&CK IDs here either.',
      anomalyFrame: null,
      confidence: 'Low',
    });
    assert.match(finding.plainText, /Entity: Unknown/);

    const hypothesis = formatter.formatHypothesis({
      id: 'HYP-EMPTY',
      assertion: 'Test missing evidence',
      status: 'Open',
      confidence: 'Low',
      evidence: '',
      nextTest: '',
    });
    assert.match(hypothesis.plainText, /Evidence: No linked receipts/);
    assert.match(hypothesis.plainText, /Key finding: No key finding captured/);

    const overview = formatter.formatHuntOverview();
    assert.match(overview.plainText, /No hypotheses recorded\./);
    assert.match(overview.plainText, /ATT&CK coverage: Unmapped/);
    assert.match(overview.plainText, /Impacted: None identified/);
  });
});
