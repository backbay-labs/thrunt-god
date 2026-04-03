'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

function createContext() {
  return {
    workspaceState: vscode.workspace.createMemento(),
    subscriptions: [],
  };
}

describe('SLA timer helpers', () => {
  it('formats durations for minute and hour scales', () => {
    assert.equal(ext.formatSlaDuration(23 * 60 * 1000 + 15 * 1000), '23m 15s');
    assert.equal(ext.formatSlaDuration(4 * 60 * 60 * 1000 + 2 * 60 * 1000), '4h 2m');
  });

  it('derives remaining time from pause-adjusted timer state', () => {
    const state = {
      config: { phase: 'ttd', label: 'TTD', durationMs: 30 * 60 * 1000 },
      startedAt: 1_000,
      pausedAt: null,
      accumulatedPauseMs: 5_000,
    };

    assert.equal(ext.getRemainingMs(state, 10_000), 1_796_000);
  });

  it('resolves SLA visual thresholds', () => {
    const nominal = {
      config: { phase: 'ttd', label: 'TTD', durationMs: 100_000 },
      startedAt: 0,
      pausedAt: null,
      accumulatedPauseMs: 0,
    };
    assert.equal(ext.resolveSlaVisualState(nominal, 25, 10, 20_000), 'nominal');
    assert.equal(ext.resolveSlaVisualState(nominal, 25, 10, 80_000), 'warning');
    assert.equal(ext.resolveSlaVisualState(nominal, 25, 10, 95_000), 'critical');
    assert.equal(ext.resolveSlaVisualState(nominal, 25, 10, 120_000), 'expired');
  });

  it('summarizes SLA status for clipboard output', () => {
    const activeTimer = {
      config: { phase: 'ttd', label: 'TTD', durationMs: 30 * 60 * 1000 },
      startedAt: 0,
      pausedAt: null,
      accumulatedPauseMs: 0,
    };
    const completed = [
      {
        phase: 'ttd',
        label: 'TTD',
        startedAt: 0,
        deadline: 1,
        completedAt: 2,
        overageMs: 0,
      },
    ];

    const summary = ext.summarizeSlaStatus(activeTimer, completed, 'plainText', 5 * 60 * 1000);
    assert.match(summary, /SLA Status/);
    assert.match(summary, /Active: TTD/);
    assert.match(summary, /Completed:/);
  });
});

describe('SLATimerManager', () => {
  it('starts, persists, and clears a timer through the manager lifecycle', async () => {
    let capturedItem;
    const originalCreate = vscode.window.createStatusBarItem;
    vscode.window.createStatusBarItem = (alignment, priority) => {
      capturedItem = originalCreate(alignment, priority);
      return capturedItem;
    };

    const manager = new ext.SLATimerManager(createContext());
    await manager.start({ phase: 'ttd', label: 'TTD', durationMs: 30 * 60 * 1000 });

    assert.ok(capturedItem.text.includes('TTD'));
    assert.ok(capturedItem._visible);
    assert.ok(manager.getActiveTimer());

    await manager.stop();
    assert.equal(manager.getActiveTimer(), null);
    assert.equal(capturedItem._visible, false);

    manager.dispose();
    vscode.window.createStatusBarItem = originalCreate;
  });
});
