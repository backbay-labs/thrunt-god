/**
 * Unit tests for HuntStatusBar.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: THRUNT Phase N/M format, warning background on critical
 * deviation, clearing warning when no critical, hiding when no hunt,
 * and store event propagation.
 */
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

// ---------------------------------------------------------------------------
// Mock store factory for status bar tests
// ---------------------------------------------------------------------------

function createMockStore(options = {}) {
  const emitter = new vscode.EventEmitter();

  const defaultReceipts = options.receipts ?? new Map();

  const store = {
    onDidChange: emitter.event,
    _emitter: emitter,
    getHunt: () => {
      if (options.noHunt) return null;
      return {
        mission: { status: 'loaded', data: { mode: 'case' } },
        hypotheses: { status: 'loaded', data: { active: [], parked: [], disproved: [] } },
        huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
        state: {
          status: options.stateStatus ?? 'loaded',
          data: {
            activeSignal: 'Test signal',
            currentFocus: 'Test focus',
            phase: options.phase ?? 3,
            totalPhases: options.totalPhases ?? 7,
            planInPhase: 1,
            totalPlansInPhase: 2,
            status: 'In Progress',
            lastActivity: '2026-03-29',
            scope: 'test',
            confidence: 'Medium',
            blockers: 'None',
          },
        },
      };
    },
    getQueries: () => new Map(),
    getReceipts: () => defaultReceipts,
    getQuery: () => undefined,
    getReceipt: () => undefined,
  };

  return store;
}

/**
 * Create a mock receipt Map with configurable deviation scores.
 */
function createReceiptsMap(scores) {
  const receipts = new Map();
  scores.forEach((score, idx) => {
    const id = `RCT-${String(idx + 1).padStart(3, '0')}`;
    receipts.set(id, {
      status: 'loaded',
      data: {
        receiptId: id,
        claimStatus: 'supports',
        relatedHypotheses: [],
        relatedQueries: [],
        claim: 'Test claim',
        evidence: 'Test evidence',
        anomalyFrame: score !== null ? {
          baseline: 'Normal',
          prediction: 'Expected benign',
          observation: 'Anomalous',
          deviationScore: {
            category: 'EXPECTED_MALICIOUS',
            baseScore: score,
            modifiers: [],
            totalScore: score,
          },
          attackMapping: [],
        } : null,
        confidence: 'Medium',
      },
    });
  });
  return receipts;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HuntStatusBar', () => {
  it('sets text to "$(shield) THRUNT: Phase N/M" format from HuntState', () => {
    const store = createMockStore({ phase: 3, totalPhases: 7 });
    const statusBar = new ext.HuntStatusBar(store);

    // The status bar item is created internally. Access it via the mock
    // by checking that after construction the update() has been called.
    // Since our mock createStatusBarItem returns an object with .text,
    // we can inspect the effect by triggering a manual update.

    // The constructor calls update(), so the internal item should already have text set.
    // We test by directly calling update() and checking state through the mock.
    // Since the statusBarItem is private, we verify through the store mock behavior.

    // Better approach: use the vscode mock's createStatusBarItem which returns trackable object
    // The status bar was created in the constructor. We trigger a store event and check
    // the text indirectly. But since the item is private, we rely on the constructor's
    // initial update working correctly. Let's verify the format is in the source code
    // and check the status bar by examining the mock object created.

    // Actually, the vscode mock's createStatusBarItem returns an object we can track.
    // Let's capture it by wrapping the mock.
    statusBar.dispose();

    // Create a captured statusBarItem
    let capturedItem;
    const origCreate = vscode.window.createStatusBarItem;
    vscode.window.createStatusBarItem = (alignment, priority) => {
      capturedItem = origCreate(alignment, priority);
      return capturedItem;
    };

    const store2 = createMockStore({ phase: 3, totalPhases: 7 });
    const statusBar2 = new ext.HuntStatusBar(store2);

    assert.ok(capturedItem, 'StatusBarItem should have been created');
    assert.equal(capturedItem.text, '$(shield) THRUNT: Phase 3/7');
    assert.equal(capturedItem.command, 'thrunt-god.showProgressReport');
    assert.ok(capturedItem._visible, 'StatusBarItem should be visible');

    statusBar2.dispose();
    vscode.window.createStatusBarItem = origCreate;
  });

  it('sets warningBackground when any receipt has deviation >= 5', () => {
    const receipts = createReceiptsMap([2, 5]); // one low, one critical

    let capturedItem;
    const origCreate = vscode.window.createStatusBarItem;
    vscode.window.createStatusBarItem = (alignment, priority) => {
      capturedItem = origCreate(alignment, priority);
      return capturedItem;
    };

    const store = createMockStore({ receipts });
    const statusBar = new ext.HuntStatusBar(store);

    assert.ok(capturedItem.backgroundColor, 'Should have warning background');
    assert.equal(capturedItem.backgroundColor.id, 'statusBarItem.warningBackground');
    assert.ok(capturedItem.tooltip.includes('Critical deviation'), 'Tooltip should mention critical deviation');
    assert.ok(capturedItem.tooltip.includes('progress report'), 'Tooltip should point to progress report');

    statusBar.dispose();
    vscode.window.createStatusBarItem = origCreate;
  });

  it('clears warningBackground when no critical deviations', () => {
    const receipts = createReceiptsMap([1, 2, 4]); // all below 5

    let capturedItem;
    const origCreate = vscode.window.createStatusBarItem;
    vscode.window.createStatusBarItem = (alignment, priority) => {
      capturedItem = origCreate(alignment, priority);
      return capturedItem;
    };

    const store = createMockStore({ receipts });
    const statusBar = new ext.HuntStatusBar(store);

    assert.equal(capturedItem.backgroundColor, undefined, 'Should have no warning background');
    assert.equal(
      capturedItem.tooltip,
      'THRUNT God Hunt Investigation. Click to open the progress report.'
    );

    statusBar.dispose();
    vscode.window.createStatusBarItem = origCreate;
  });

  it('hides status bar when store.getHunt() returns null', () => {
    let capturedItem;
    const origCreate = vscode.window.createStatusBarItem;
    vscode.window.createStatusBarItem = (alignment, priority) => {
      capturedItem = origCreate(alignment, priority);
      return capturedItem;
    };

    const store = createMockStore({ noHunt: true });
    const statusBar = new ext.HuntStatusBar(store);

    assert.equal(capturedItem._visible, false, 'StatusBarItem should be hidden when no hunt');

    statusBar.dispose();
    vscode.window.createStatusBarItem = origCreate;
  });

  it('updates when store emits change event', () => {
    let capturedItem;
    const origCreate = vscode.window.createStatusBarItem;
    vscode.window.createStatusBarItem = (alignment, priority) => {
      capturedItem = origCreate(alignment, priority);
      return capturedItem;
    };

    const store = createMockStore({ phase: 1, totalPhases: 5 });
    const statusBar = new ext.HuntStatusBar(store);

    assert.equal(capturedItem.text, '$(shield) THRUNT: Phase 1/5');

    // Now change the store to return different data
    store.getHunt = () => ({
      mission: { status: 'loaded', data: { mode: 'case' } },
      hypotheses: { status: 'loaded', data: { active: [], parked: [], disproved: [] } },
      huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
      state: {
        status: 'loaded',
        data: {
          activeSignal: 'Updated',
          currentFocus: 'Updated',
          phase: 4,
          totalPhases: 5,
          planInPhase: 2,
          totalPlansInPhase: 3,
          status: 'In Progress',
          lastActivity: '2026-03-30',
          scope: 'updated',
          confidence: 'High',
          blockers: 'None',
        },
      },
    });

    // Fire store change event
    store._emitter.fire({
      type: 'artifact:updated',
      artifactType: 'state',
      id: 'STATE',
      filePath: '/mock/STATE.md',
    });

    assert.equal(capturedItem.text, '$(shield) THRUNT: Phase 4/5');

    statusBar.dispose();
    vscode.window.createStatusBarItem = origCreate;
  });
});
