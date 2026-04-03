/**
 * Unit tests for HuntCodeLensProvider.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: empty for non-artifacts, deviation score on ## Claim in receipts,
 * template count on ## Result Summary in queries, scrollToSection command arguments,
 * onDidChangeCodeLenses store propagation, empty when no anomalyFrame.
 */
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock TextDocument with controllable lines and fsPath.
 */
function createMockDocument(lines, fsPath) {
  return {
    uri: { fsPath, scheme: 'file' },
    lineCount: lines.length,
    lineAt: (i) => ({ text: lines[i] || '' }),
  };
}

/**
 * Create a mock store for CodeLens tests with configurable receipt/query data.
 */
function createMockStore(options = {}) {
  const emitter = new vscode.EventEmitter();

  const receipts = options.receipts ?? new Map();
  const queries = options.queries ?? new Map();

  const store = {
    onDidChange: emitter.event,
    _emitter: emitter,
    getHunt: () => null,
    getQueries: () => queries,
    getReceipts: () => receipts,
    getQuery: (id) => queries.get(id),
    getReceipt: (id) => receipts.get(id),
  };

  return store;
}

// Cancellation token stub
const nullToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HuntCodeLensProvider', () => {
  it('returns empty array for non-artifact files', () => {
    const store = createMockStore();
    const provider = new ext.HuntCodeLensProvider(store);

    // README.md is not a recognized artifact type
    const doc = createMockDocument(
      ['# README', '', '## Claim', 'Some text'],
      '/mock/hunt/README.md'
    );

    const lenses = provider.provideCodeLenses(doc, nullToken);
    assert.equal(lenses.length, 0, 'Non-artifact files should return empty CodeLens array');

    provider.dispose();
  });

  it('returns deviation score lenses above ## Claim in receipt files', () => {
    const receipts = new Map([
      ['RCT-20260329-001', {
        status: 'loaded',
        data: {
          receiptId: 'RCT-20260329-001',
          claimStatus: 'supports',
          relatedHypotheses: [],
          relatedQueries: [],
          claim: 'Test claim',
          evidence: 'Test evidence',
          anomalyFrame: {
            baseline: 'Normal',
            prediction: 'Expected benign',
            observation: 'Anomalous',
            deviationScore: {
              category: 'EXPECTED_MALICIOUS',
              baseScore: 4,
              modifiers: [{ factor: 'novelty', value: 'high', contribution: 1 }],
              totalScore: 5,
            },
            attackMapping: ['T1110'],
          },
          confidence: 'High',
        },
      }],
    ]);

    const store = createMockStore({ receipts });
    const provider = new ext.HuntCodeLensProvider(store);

    const doc = createMockDocument(
      [
        '---',
        'receipt_id: RCT-20260329-001',
        '---',
        '',
        '## Claim',
        'The attacker brute-forced credentials.',
        '',
        '## Evidence',
        'Log data shows 200 failures.',
        '',
        '## Assessment',
        'This is a critical finding.',
      ],
      '/mock/hunt/RECEIPTS/RCT-20260329-001.md'
    );

    const lenses = provider.provideCodeLenses(doc, nullToken);

    // Should have lenses on ## Claim (line 4) and ## Assessment (line 10)
    assert.equal(lenses.length, 2, 'Should have 2 CodeLens (Claim + Assessment)');

    // Check first lens (## Claim at line 4)
    assert.equal(lenses[0].range.start.line, 4, 'First lens should be on line 4 (## Claim)');
    assert.ok(lenses[0].command.title.includes('Deviation Score: 5/6'), 'Title should contain deviation score');
    assert.ok(lenses[0].command.title.includes('[critical]'), 'Score >= 5 should be critical');

    // Check second lens (## Assessment at line 10)
    assert.equal(lenses[1].range.start.line, 10, 'Second lens should be on line 10 (## Assessment)');

    provider.dispose();
  });

  it('returns summary and viewer lenses above ## Result Summary in query files', () => {
    const queries = new Map([
      ['QRY-20260329-001', {
        status: 'loaded',
        data: {
          queryId: 'QRY-20260329-001',
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
          title: 'Query Log: Test Authentication Events',
          intent: 'Check logins',
          queryText: 'SELECT *',
          resultSummary: 'events=100, templates=5, entities=3',
          templates: [],
          templateDetails: [],
          entityCount: 3,
          eventCount: 100,
          templateCount: 5,
          timeWindow: null,
        },
      }],
    ]);

    const store = createMockStore({ queries });
    const provider = new ext.HuntCodeLensProvider(store);

    const doc = createMockDocument(
      [
        '---',
        'query_id: QRY-20260329-001',
        '---',
        '',
        '## Intent',
        'Identify brute force attempts.',
        '',
        '## Result Summary',
        'events=100, templates=5, entities=3',
        '',
        '| Template | Count |',
      ],
      '/mock/hunt/QUERIES/QRY-20260329-001.md'
    );

    const lenses = provider.provideCodeLenses(doc, nullToken);

    assert.equal(lenses.length, 2, 'Should have 2 CodeLens on Result Summary');
    assert.equal(lenses[0].range.start.line, 7, 'Lens should be on line 7 (## Result Summary)');
    assert.ok(lenses[0].command.title.includes('5 templates'), 'Title should include template count');
    assert.ok(lenses[0].command.title.includes('100 events'), 'Title should include event count');
    assert.equal(lenses[1].command.command, 'thrunt-god.openTemplateViewer');
    assert.deepEqual(lenses[1].command.arguments, ['QRY-20260329-001']);

    provider.dispose();
  });

  it('CodeLens command is thrunt-god.scrollToSection with correct arguments', () => {
    const receipts = new Map([
      ['RCT-20260329-001', {
        status: 'loaded',
        data: {
          receiptId: 'RCT-20260329-001',
          claimStatus: 'supports',
          relatedHypotheses: [],
          relatedQueries: [],
          claim: 'Test',
          evidence: 'Evidence',
          anomalyFrame: {
            baseline: 'Normal',
            prediction: 'Expected',
            observation: 'Anomalous',
            deviationScore: {
              category: 'EXPECTED_MALICIOUS',
              baseScore: 3,
              modifiers: [],
              totalScore: 3,
            },
            attackMapping: [],
          },
          confidence: 'Medium',
        },
      }],
    ]);

    const store = createMockStore({ receipts });
    const provider = new ext.HuntCodeLensProvider(store);

    const doc = createMockDocument(
      ['# Receipt', '', '## Claim', 'The claim text.'],
      '/mock/hunt/RECEIPTS/RCT-20260329-001.md'
    );

    const lenses = provider.provideCodeLenses(doc, nullToken);
    assert.ok(lenses.length > 0, 'Should have at least one lens');

    const lens = lenses[0];
    assert.equal(lens.command.command, 'thrunt-god.scrollToSection', 'Command should be scrollToSection');
    assert.equal(lens.command.arguments[0], doc.uri, 'First argument should be the document URI');
    assert.equal(lens.command.arguments[1], 2, 'Second argument should be the line number (2)');

    provider.dispose();
  });

  it('onDidChangeCodeLenses fires when store emits change', () => {
    const store = createMockStore();
    const provider = new ext.HuntCodeLensProvider(store);

    let fired = false;
    provider.onDidChangeCodeLenses(() => {
      fired = true;
    });

    store._emitter.fire({
      type: 'artifact:updated',
      artifactType: 'receipt',
      id: 'RCT-001',
      filePath: '/mock/hunt/RECEIPTS/RCT-001.md',
    });

    assert.ok(fired, 'onDidChangeCodeLenses should fire when store emits change');

    provider.dispose();
  });

  it('returns empty when receipt has no anomalyFrame', () => {
    const receipts = new Map([
      ['RCT-20260329-002', {
        status: 'loaded',
        data: {
          receiptId: 'RCT-20260329-002',
          claimStatus: 'inconclusive',
          relatedHypotheses: [],
          relatedQueries: [],
          claim: 'Test',
          evidence: 'Evidence',
          anomalyFrame: null,
          confidence: 'Low',
        },
      }],
    ]);

    const store = createMockStore({ receipts });
    const provider = new ext.HuntCodeLensProvider(store);

    const doc = createMockDocument(
      ['# Receipt', '', '## Claim', 'The claim.', '', '## Assessment', 'Assessment text.'],
      '/mock/hunt/RECEIPTS/RCT-20260329-002.md'
    );

    const lenses = provider.provideCodeLenses(doc, nullToken);

    // Even with no anomalyFrame, CodeLens should still appear with "No deviation score" text
    assert.equal(lenses.length, 2, 'Should still show CodeLens on Claim and Assessment');
    assert.ok(lenses[0].command.title.includes('No deviation score'), 'Title should say no deviation score');
    assert.ok(lenses[0].command.title.includes('[unknown]'), 'Severity should be unknown');

    provider.dispose();
  });
});
