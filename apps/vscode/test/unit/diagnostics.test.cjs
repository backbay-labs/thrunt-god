/**
 * Unit tests for EvidenceIntegrityDiagnostics.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

const nullToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => {} }),
};

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

function createMockDocument(lines, fsPath) {
  return {
    uri: { fsPath, scheme: 'file' },
    lineCount: lines.length,
    lineAt: (index) => ({ text: lines[index] ?? '' }),
  };
}

function createReceipt(overrides = {}) {
  const defaultReceipt = {
    receiptId: 'RCT-20260329-001',
    querySpecVersion: '1.0',
    createdAt: '2026-03-29T15:20:00Z',
    source: 'Okta System Log',
    connectorId: 'okta',
    dataset: 'identity',
    resultStatus: 'ok',
    claimStatus: 'supports',
    relatedHypotheses: ['HYP-01'],
    relatedQueries: ['QRY-20260329-001'],
    contentHash: 'sha256:test',
    manifestId: 'MAN-20260329-001',
    claim: 'Test claim with supporting evidence.',
    evidence: 'Test evidence.',
    anomalyFrame: {
      baseline: 'Normal user activity over 48 hours.',
      prediction: 'Expected a small number of retries.',
      observation: 'Observed a moderate increase in failures.',
      deviationScore: {
        category: 'EXPECTED_MALICIOUS',
        baseScore: 3,
        modifiers: [{ factor: 'scope', value: 'medium', contribution: 1 }],
        totalScore: 4,
      },
      attackMapping: ['T1110'],
    },
    confidence: 'High',
  };

  const merged = { ...defaultReceipt, ...overrides };

  if (overrides.anomalyFrame === null) {
    merged.anomalyFrame = null;
  } else if (overrides.anomalyFrame) {
    merged.anomalyFrame = {
      ...defaultReceipt.anomalyFrame,
      ...overrides.anomalyFrame,
      deviationScore: {
        ...defaultReceipt.anomalyFrame.deviationScore,
        ...(overrides.anomalyFrame.deviationScore ?? {}),
      },
    };
  }

  return merged;
}

function createLoadedReceipt(overrides = {}) {
  const data = createReceipt(overrides);
  return {
    status: 'loaded',
    data,
  };
}

function createMockStore(initialReceipts = new Map()) {
  const emitter = new vscode.EventEmitter();
  const receipts = initialReceipts;
  const artifactPaths = new Map();

  for (const [id, result] of receipts) {
    if (result.status === 'loaded') {
      artifactPaths.set(id, `/mock/hunt/RECEIPTS/${id}.md`);
    }
  }

  return {
    onDidChange: emitter.event,
    _emitter: emitter,
    _receipts: receipts,
    initialScanComplete: () => Promise.resolve(),
    getReceipts: () => receipts,
    getArtifactPath: (id) => artifactPaths.get(id),
    setReceipt(id, result) {
      receipts.set(id, result);
      artifactPaths.set(id, `/mock/hunt/RECEIPTS/${id}.md`);
    },
    deleteReceipt(id) {
      receipts.delete(id);
      artifactPaths.delete(id);
    },
  };
}

function getDiagnostics(instance, receiptId) {
  return (
    instance.diagnosticCollection.get(
      vscode.Uri.file(`/mock/hunt/RECEIPTS/${receiptId}.md`)
    ) ?? []
  );
}

function createWarning(message) {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 0),
    message,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = 'THRUNT Evidence';
  return diagnostic;
}

describe('EvidenceIntegrityDiagnostics', () => {
  it('creates Error diagnostic for unsupported claims', async () => {
    const store = createMockStore(
      new Map([
        ['RCT-20260329-001', createLoadedReceipt({ relatedQueries: [] })],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-001');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Unsupported claim/);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Error);
    assert.equal(items[0].source, 'THRUNT Evidence');

    diagnostics.dispose();
  });

  it('creates Error diagnostic for causality claims without anomaly framing', async () => {
    const store = createMockStore(
      new Map([
        [
          'RCT-20260329-002',
          createLoadedReceipt({
            claim: 'After the password reset, the attacker moved laterally.',
            anomalyFrame: null,
          }),
        ],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-002');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Causality claim without supporting evidence framework/);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Error);

    diagnostics.dispose();
  });

  it('creates Warning diagnostic for missing baseline', async () => {
    const store = createMockStore(
      new Map([
        [
          'RCT-20260329-003',
          createLoadedReceipt({
            anomalyFrame: {
              baseline: '   ',
            },
          }),
        ],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-003');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Missing baseline/);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Warning);

    diagnostics.dispose();
  });

  it('creates Warning diagnostic for missing prediction', async () => {
    const store = createMockStore(
      new Map([
        [
          'RCT-20260329-004',
          createLoadedReceipt({
            anomalyFrame: {
              prediction: '  ',
            },
          }),
        ],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-004');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Missing prediction/);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Warning);

    diagnostics.dispose();
  });

  it('creates Warning diagnostic for score inflation without modifiers', async () => {
    const store = createMockStore(
      new Map([
        [
          'RCT-20260329-005',
          createLoadedReceipt({
            anomalyFrame: {
              deviationScore: {
                baseScore: 3,
                modifiers: [],
                totalScore: 5,
              },
            },
          }),
        ],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-005');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Score inflation/);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Warning);

    diagnostics.dispose();
  });

  it('creates Information diagnostic for post-hoc rationalization language', async () => {
    const store = createMockStore(
      new Map([
        [
          'RCT-20260329-006',
          createLoadedReceipt({
            anomalyFrame: {
              observation: 'In hindsight, the account lockout pattern was clearly malicious.',
            },
          }),
        ],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-006');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /post-hoc rationalization/i);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Information);

    diagnostics.dispose();
  });

  it('creates Information diagnostic for temporal gaps', async () => {
    const store = createMockStore(
      new Map([
        [
          'RCT-20260329-007',
          createLoadedReceipt({
            anomalyFrame: {
              observation:
                'Observed 2026-03-29T14:10:00Z before a correlated event at 2026-03-29T14:05:00Z.',
            },
          }),
        ],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-007');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Temporal gap/);
    assert.equal(items[0].severity, vscode.DiagnosticSeverity.Information);

    diagnostics.dispose();
  });

  it('creates no diagnostics for a clean receipt', async () => {
    const store = createMockStore(
      new Map([
        ['RCT-20260329-008', createLoadedReceipt()],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const items = getDiagnostics(diagnostics, 'RCT-20260329-008');
    assert.equal(items.length, 0);

    diagnostics.dispose();
  });

  it('recomputes diagnostics when the store emits a change event', async () => {
    const store = createMockStore(
      new Map([
        ['RCT-20260329-009', createLoadedReceipt()],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();
    assert.equal(getDiagnostics(diagnostics, 'RCT-20260329-009').length, 0);

    store.setReceipt(
      'RCT-20260329-009',
      createLoadedReceipt({ relatedQueries: [] })
    );
    store._emitter.fire({
      type: 'artifact:updated',
      artifactType: 'receipt',
      id: 'RCT-20260329-009',
      filePath: '/mock/hunt/RECEIPTS/RCT-20260329-009.md',
    });

    const items = getDiagnostics(diagnostics, 'RCT-20260329-009');
    assert.equal(items.length, 1);
    assert.match(items[0].message, /Unsupported claim/);

    diagnostics.dispose();
  });

  it('dispose clears diagnostics and subscriptions', async () => {
    const store = createMockStore(
      new Map([
        ['RCT-20260329-010', createLoadedReceipt({ relatedQueries: [] })],
      ])
    );

    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();
    assert.equal(getDiagnostics(diagnostics, 'RCT-20260329-010').length, 1);

    diagnostics.dispose();

    assert.equal(getDiagnostics(diagnostics, 'RCT-20260329-010').length, 0);
    assert.equal(diagnostics.diagnosticCollection._disposed, true);
  });

  it('provides a prediction quick fix for warning diagnostics', async () => {
    const store = createMockStore();
    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const document = createMockDocument(
      ['# Receipt', '', '## Claim', 'Claim text', '', '## Evidence', 'Evidence text'],
      '/mock/hunt/RECEIPTS/RCT-20260329-011.md'
    );

    const actions = diagnostics.provideCodeActions(
      document,
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [createWarning('Missing prediction: no predicted outcomes documented before observation')] },
      nullToken
    );

    assert.equal(actions.length, 1);
    assert.equal(actions[0].title, 'Insert prediction section scaffold');
    assert.equal(actions[0].kind, vscode.CodeActionKind.QuickFix);
    assert.equal(actions[0].diagnostics.length, 1);
    assert.match(actions[0].edit._edits[0].text, /## Prediction/);
    assert.equal(actions[0].edit._edits[0].position.line, 5);

    diagnostics.dispose();
  });

  it('provides a baseline quick fix for warning diagnostics', async () => {
    const store = createMockStore();
    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const document = createMockDocument(
      ['# Receipt', '', '## Claim', 'Claim text'],
      '/mock/hunt/RECEIPTS/RCT-20260329-012.md'
    );

    const actions = diagnostics.provideCodeActions(
      document,
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [createWarning('Missing baseline: deviation scored without documented normal behavior')] },
      nullToken
    );

    assert.equal(actions.length, 1);
    assert.equal(actions[0].title, 'Insert baseline section scaffold');
    assert.match(actions[0].edit._edits[0].text, /## Baseline/);
    assert.equal(actions[0].edit._edits[0].position.line, 3);
    assert.equal(actions[0].edit._edits[0].position.character, 'Claim text'.length);

    diagnostics.dispose();
  });

  it('does not provide quick fixes for Error diagnostics', async () => {
    const store = createMockStore();
    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const document = createMockDocument(
      ['# Receipt'],
      '/mock/hunt/RECEIPTS/RCT-20260329-013.md'
    );

    const errorDiagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 0),
      'Unsupported claim: receipt has no related queries in frontmatter',
      vscode.DiagnosticSeverity.Error
    );
    errorDiagnostic.source = 'THRUNT Evidence';

    const actions = diagnostics.provideCodeActions(
      document,
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [errorDiagnostic] },
      nullToken
    );

    assert.equal(actions.length, 0);

    diagnostics.dispose();
  });

  it('does not provide quick fixes for Information diagnostics', async () => {
    const store = createMockStore();
    const diagnostics = new ext.EvidenceIntegrityDiagnostics(store);
    await flushMicrotasks();

    const document = createMockDocument(
      ['# Receipt'],
      '/mock/hunt/RECEIPTS/RCT-20260329-014.md'
    );

    const infoDiagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 0),
      'Possible post-hoc rationalization: language suggests retroactive reasoning',
      vscode.DiagnosticSeverity.Information
    );
    infoDiagnostic.source = 'THRUNT Evidence';

    const actions = diagnostics.provideCodeActions(
      document,
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [infoDiagnostic] },
      nullToken
    );

    assert.equal(actions.length, 0);

    diagnostics.dispose();
  });
});
