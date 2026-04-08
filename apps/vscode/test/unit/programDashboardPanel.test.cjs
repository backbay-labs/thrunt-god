/**
 * Unit tests for ProgramDashboardPanel and deriveProgramDashboard.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Tests cover: panel lifecycle (create/restore/dispose), viewModel derivation,
 * message handling (ready/open/refresh), and store reactivity.
 */
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

const {
  ProgramDashboardPanel,
  PROGRAM_DASHBOARD_VIEW_TYPE,
} = ext;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStore(overrides = {}) {
  const changeEmitter = new vscode.EventEmitter();
  const selectEmitter = new vscode.EventEmitter();

  const store = {
    onDidChange: changeEmitter.event,
    onDidSelect: selectEmitter.event,
    _changeEmitter: changeEmitter,
    _selectEmitter: selectEmitter,
    getHunt: () => ({
      mission: {
        status: 'loaded',
        data: {
          signal: 'Test Program Signal',
          owner: 'alice',
          opened: '2026-03-01',
          mode: 'program',
          scope: 'Investigate lateral movement across endpoints',
        },
      },
      hypotheses: { status: 'loaded', data: { active: [], parked: [], disproved: [] } },
      huntMap: { status: 'loaded', data: { overview: '', phases: [] } },
      state: { status: 'loaded', data: { phase: 1, lastActivity: '2026-03-29' } },
    }),
    getChildHunts: () => [
      {
        id: 'case:alpha',
        name: 'alpha',
        kind: 'case',
        huntRootPath: '/workspace/cases/alpha',
        missionPath: '/workspace/cases/alpha/MISSION.md',
        signal: 'Suspicious auth events',
        mode: 'case',
        status: 'Open',
        opened: '2026-03-10',
        owner: 'bob',
        currentPhase: 2,
        totalPhases: 4,
        phaseName: 'Collection',
        lastActivity: new Date().toISOString().slice(0, 10),
        blockerCount: 0,
        findingsPublished: false,
        techniqueIds: ['T1059.001', 'T1078'],
      },
      {
        id: 'case:beta',
        name: 'beta',
        kind: 'case',
        huntRootPath: '/workspace/cases/beta',
        missionPath: '/workspace/cases/beta/MISSION.md',
        signal: 'Exfiltration patterns',
        mode: 'case',
        status: 'Closed',
        opened: '2026-02-15',
        owner: 'carol',
        currentPhase: 3,
        totalPhases: 3,
        phaseName: 'Reporting',
        lastActivity: '2026-03-20',
        blockerCount: 0,
        findingsPublished: true,
        techniqueIds: ['T1041', 'T1059.001'],
      },
      {
        id: 'case:gamma',
        name: 'gamma',
        kind: 'case',
        huntRootPath: '/workspace/cases/gamma',
        missionPath: '/workspace/cases/gamma/MISSION.md',
        signal: 'Old stale case',
        mode: 'case',
        status: 'Open',
        opened: '2026-01-01',
        owner: 'dave',
        currentPhase: 1,
        totalPhases: 2,
        phaseName: 'Triage',
        lastActivity: '2025-01-01',
        blockerCount: 1,
        findingsPublished: false,
        techniqueIds: ['T1053.005'],
      },
    ],
    getQueries: () => new Map(),
    getReceipts: () => new Map(),
    initialScanComplete: () => Promise.resolve(),
    ...overrides,
  };

  // Add deriveProgramDashboard that mirrors the real store logic
  store.deriveProgramDashboard = function () {
    const hunt = this.getHunt();
    const childHunts = this.getChildHunts();
    const programName = hunt?.mission?.status === 'loaded' ? hunt.mission.data.signal : 'Program';
    const missionSnippet = hunt?.mission?.status === 'loaded'
      ? (hunt.mission.data.scope || hunt.mission.data.signal)
      : '';

    const STALE_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const cases = childHunts.map((child) => {
      const lower = child.status.toLowerCase();
      const isClosed = lower === 'closed' || lower === 'complete';
      const lastMs = child.lastActivity ? new Date(child.lastActivity).getTime() : 0;
      const isStale = !isClosed && (now - lastMs > STALE_MS);
      let status;
      if (isClosed) status = 'closed';
      else if (isStale) status = 'stale';
      else status = 'active';

      return {
        slug: child.name,
        name: child.name,
        kind: child.kind,
        status,
        openedAt: child.opened,
        closedAt: isClosed ? child.lastActivity : null,
        techniqueCount: (child.techniqueIds || []).length,
        signal: child.signal,
        currentPhase: child.currentPhase,
        totalPhases: child.totalPhases,
        phaseName: child.phaseName,
        lastActivity: child.lastActivity,
        findingsPublished: child.findingsPublished,
      };
    });

    const active = cases.filter((c) => c.status === 'active').length;
    const closed = cases.filter((c) => c.status === 'closed').length;
    const stale = cases.filter((c) => c.status === 'stale').length;

    const allTechniques = new Set();
    for (const child of childHunts) {
      for (const tid of (child.techniqueIds || [])) {
        allTechniques.add(tid);
      }
    }

    const timeline = [...childHunts]
      .filter((c) => c.opened)
      .sort((a, b) => new Date(a.opened).getTime() - new Date(b.opened).getTime())
      .map((c) => ({ date: c.opened, event: `Opened: ${c.name}`, slug: c.name }));

    return {
      programName,
      missionSnippet,
      cases,
      aggregates: { total: cases.length, active, closed, stale, uniqueTechniques: allTechniques.size },
      timeline,
    };
  };

  return store;
}

function createMockContext() {
  return {
    extensionUri: { fsPath: '/mock/extension', path: '/mock/extension', scheme: 'file' },
    subscriptions: [],
    workspaceState: vscode.workspace.createMemento(),
    globalState: vscode.workspace.createMemento(),
  };
}

// ---------------------------------------------------------------------------
// PROGRAM_DASHBOARD_VIEW_TYPE
// ---------------------------------------------------------------------------

describe('PROGRAM_DASHBOARD_VIEW_TYPE', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof PROGRAM_DASHBOARD_VIEW_TYPE, 'string');
    assert.ok(PROGRAM_DASHBOARD_VIEW_TYPE.length > 0);
    assert.equal(PROGRAM_DASHBOARD_VIEW_TYPE, 'thruntGod.programDashboard');
  });
});

// ---------------------------------------------------------------------------
// ProgramDashboardPanel lifecycle
// ---------------------------------------------------------------------------

describe('ProgramDashboardPanel lifecycle', () => {
  beforeEach(() => {
    // Clear any existing panel between tests
    if (ProgramDashboardPanel.currentPanel) {
      ProgramDashboardPanel.currentPanel.dispose();
    }
    ProgramDashboardPanel.currentPanel = undefined;
    vscode.window._createdWebviewPanels.length = 0;
    vscode.commands._executed.length = 0;
  });

  it('has a static restorePanel method', () => {
    assert.equal(typeof ProgramDashboardPanel.restorePanel, 'function');
  });

  it('has a static createOrShow method', () => {
    assert.equal(typeof ProgramDashboardPanel.createOrShow, 'function');
  });

  it('createOrShow creates a panel and sets currentPanel', () => {
    const store = createMockStore();
    const context = createMockContext();

    const panel = ProgramDashboardPanel.createOrShow(context, store);

    assert.ok(panel);
    assert.equal(ProgramDashboardPanel.currentPanel, panel);
    assert.ok(vscode.window._createdWebviewPanels.length >= 1);
  });

  it('second createOrShow reveals existing panel instead of creating new', () => {
    const store = createMockStore();
    const context = createMockContext();

    const panel1 = ProgramDashboardPanel.createOrShow(context, store);
    const panelCountAfterFirst = vscode.window._createdWebviewPanels.length;

    const panel2 = ProgramDashboardPanel.createOrShow(context, store);

    assert.equal(panel1, panel2);
    assert.equal(vscode.window._createdWebviewPanels.length, panelCountAfterFirst);
  });

  it('restorePanel restores from serialized state', () => {
    const store = createMockStore();
    const context = createMockContext();

    const mockWebviewPanel = vscode.window.createWebviewPanel(
      PROGRAM_DASHBOARD_VIEW_TYPE,
      'Program Dashboard',
      vscode.ViewColumn.Active,
      {}
    );

    const restored = ProgramDashboardPanel.restorePanel(context, store, mockWebviewPanel);

    assert.ok(restored);
    assert.equal(ProgramDashboardPanel.currentPanel, restored);
  });

  it('dispose clears currentPanel', () => {
    const store = createMockStore();
    const context = createMockContext();

    const panel = ProgramDashboardPanel.createOrShow(context, store);
    assert.ok(ProgramDashboardPanel.currentPanel);

    panel.dispose();
    assert.equal(ProgramDashboardPanel.currentPanel, undefined);
  });
});

// ---------------------------------------------------------------------------
// deriveProgramDashboard viewModel
// ---------------------------------------------------------------------------

describe('deriveProgramDashboard', () => {
  beforeEach(() => {
    if (ProgramDashboardPanel.currentPanel) {
      ProgramDashboardPanel.currentPanel.dispose();
    }
    ProgramDashboardPanel.currentPanel = undefined;
    vscode.window._createdWebviewPanels.length = 0;
    vscode.commands._executed.length = 0;
  });

  it('returns valid ProgramDashboardViewModel with correct aggregates', () => {
    const store = createMockStore();
    const context = createMockContext();

    // Create a panel so deriveProgramDashboard is accessible via the store
    const panel = ProgramDashboardPanel.createOrShow(context, store);

    // Get the webview panel messages after sending webview:ready
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];
    webviewPanel.webview._fireMessage({ type: 'webview:ready' });

    // The init message should contain the viewModel
    const initMsg = webviewPanel.webview._messages.find((m) => m.type === 'init');
    assert.ok(initMsg, 'init message should have been sent');
    assert.ok(initMsg.viewModel, 'viewModel should be present');

    const vm = initMsg.viewModel;

    // Program name should come from mission signal
    assert.equal(vm.programName, 'Test Program Signal');

    // Should have 3 cases
    assert.equal(vm.aggregates.total, 3);

    // beta is Closed -> closed
    assert.equal(vm.aggregates.closed, 1);

    // gamma has lastActivity '2025-01-01' which is >14 days ago -> stale
    assert.equal(vm.aggregates.stale, 1);

    // alpha is active (recent lastActivity, not closed)
    assert.equal(vm.aggregates.active, 1);

    // uniqueTechniques = 4 (T1059.001, T1078, T1041, T1053.005 across 3 cases)
    assert.equal(vm.aggregates.uniqueTechniques, 4);

    panel.dispose();
  });

  it('maps cases correctly with status badges', () => {
    const store = createMockStore();
    const context = createMockContext();

    const panel = ProgramDashboardPanel.createOrShow(context, store);
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];
    webviewPanel.webview._fireMessage({ type: 'webview:ready' });

    const initMsg = webviewPanel.webview._messages.find((m) => m.type === 'init');
    const cases = initMsg.viewModel.cases;

    const alpha = cases.find((c) => c.slug === 'alpha');
    assert.ok(alpha);
    assert.equal(alpha.status, 'active');
    assert.equal(alpha.signal, 'Suspicious auth events');

    const beta = cases.find((c) => c.slug === 'beta');
    assert.ok(beta);
    assert.equal(beta.status, 'closed');
    assert.ok(beta.closedAt);

    const gamma = cases.find((c) => c.slug === 'gamma');
    assert.ok(gamma);
    assert.equal(gamma.status, 'stale');

    panel.dispose();
  });

  it('builds timeline sorted by opened date', () => {
    const store = createMockStore();
    const context = createMockContext();

    const panel = ProgramDashboardPanel.createOrShow(context, store);
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];
    webviewPanel.webview._fireMessage({ type: 'webview:ready' });

    const initMsg = webviewPanel.webview._messages.find((m) => m.type === 'init');
    const timeline = initMsg.viewModel.timeline;

    assert.equal(timeline.length, 3);
    // Should be sorted chronologically: gamma (Jan 1), beta (Feb 15), alpha (Mar 10)
    assert.equal(timeline[0].slug, 'gamma');
    assert.equal(timeline[1].slug, 'beta');
    assert.equal(timeline[2].slug, 'alpha');

    panel.dispose();
  });
});

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

describe('ProgramDashboardPanel message handling', () => {
  beforeEach(() => {
    if (ProgramDashboardPanel.currentPanel) {
      ProgramDashboardPanel.currentPanel.dispose();
    }
    ProgramDashboardPanel.currentPanel = undefined;
    vscode.window._createdWebviewPanels.length = 0;
    vscode.commands._executed.length = 0;
  });

  it('webview:ready triggers init message with viewModel and isDark', () => {
    const store = createMockStore();
    const context = createMockContext();

    ProgramDashboardPanel.createOrShow(context, store);
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];

    webviewPanel.webview._fireMessage({ type: 'webview:ready' });

    const initMsg = webviewPanel.webview._messages.find((m) => m.type === 'init');
    assert.ok(initMsg, 'Should send init message on webview:ready');
    assert.ok('viewModel' in initMsg);
    assert.ok('isDark' in initMsg);

    ProgramDashboardPanel.currentPanel.dispose();
  });

  it('case:open triggers vscode.open command with mission path', () => {
    const store = createMockStore();
    const context = createMockContext();

    ProgramDashboardPanel.createOrShow(context, store);
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];

    // Must be ready first
    webviewPanel.webview._fireMessage({ type: 'webview:ready' });
    vscode.commands._executed.length = 0;

    webviewPanel.webview._fireMessage({ type: 'case:open', slug: 'alpha' });

    const openCmd = vscode.commands._executed.find((c) => c.name === 'vscode.open');
    assert.ok(openCmd, 'Should execute vscode.open command');
    assert.ok(openCmd.args[0].fsPath.includes('alpha'));

    ProgramDashboardPanel.currentPanel.dispose();
  });

  it('refresh triggers update message', () => {
    const store = createMockStore();
    const context = createMockContext();

    ProgramDashboardPanel.createOrShow(context, store);
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];

    // Must be ready first
    webviewPanel.webview._fireMessage({ type: 'webview:ready' });
    const msgCountAfterInit = webviewPanel.webview._messages.length;

    webviewPanel.webview._fireMessage({ type: 'refresh' });

    const updateMsgs = webviewPanel.webview._messages
      .slice(msgCountAfterInit)
      .filter((m) => m.type === 'update');
    assert.ok(updateMsgs.length >= 1, 'Should send update message on refresh');

    ProgramDashboardPanel.currentPanel.dispose();
  });
});

// ---------------------------------------------------------------------------
// Store reactivity
// ---------------------------------------------------------------------------

describe('ProgramDashboardPanel store reactivity', () => {
  beforeEach(() => {
    if (ProgramDashboardPanel.currentPanel) {
      ProgramDashboardPanel.currentPanel.dispose();
    }
    ProgramDashboardPanel.currentPanel = undefined;
    vscode.window._createdWebviewPanels.length = 0;
  });

  it('store.onDidChange fires -> panel sends update message to webview', () => {
    const store = createMockStore();
    const context = createMockContext();

    ProgramDashboardPanel.createOrShow(context, store);
    const webviewPanel = vscode.window._createdWebviewPanels[
      vscode.window._createdWebviewPanels.length - 1
    ];

    // Must be ready first
    webviewPanel.webview._fireMessage({ type: 'webview:ready' });
    const msgCountAfterInit = webviewPanel.webview._messages.length;

    // Fire store change
    store._changeEmitter.fire();

    const updateMsgs = webviewPanel.webview._messages
      .slice(msgCountAfterInit)
      .filter((m) => m.type === 'update');
    assert.ok(updateMsgs.length >= 1, 'Should send update message when store changes');
    assert.ok(updateMsgs[0].viewModel, 'Update message should contain viewModel');

    ProgramDashboardPanel.currentPanel.dispose();
  });
});
