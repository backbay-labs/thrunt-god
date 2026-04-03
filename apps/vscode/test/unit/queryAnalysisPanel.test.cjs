'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createStore() {
  const changeEmitter = new vscode.EventEmitter();
  const selectEmitter = new vscode.EventEmitter();
  const queries = new Map([
    ['QRY-001', { status: 'loaded', data: { queryId: 'QRY-001', title: 'Query 1' } }],
    ['QRY-002', { status: 'loaded', data: { queryId: 'QRY-002', title: 'Query 2' } }],
    ['QRY-003', { status: 'loaded', data: { queryId: 'QRY-003', title: 'Query 3' } }],
  ]);

  return {
    onDidChange: changeEmitter.event,
    onDidSelect: selectEmitter.event,
    _changeEmitter: changeEmitter,
    _selectEmitter: selectEmitter,
    _selectedArtifactId: null,
    getQueries() {
      return queries;
    },
    getSelectedArtifactId() {
      return this._selectedArtifactId;
    },
    select(id) {
      this._selectedArtifactId = id;
      this._selectEmitter.fire(id);
    },
    deriveQueryAnalysis(selectedQueryIds, sortBy, inspectorReceiptId, mode) {
      return {
        queries: [...queries.values()].map((entry) => ({
          queryId: entry.data.queryId,
          title: entry.data.title,
          templates: [],
          eventCount: 0,
          templateCount: 0,
          executedAt: '2026-03-29T10:00:00Z',
        })),
        selectedQueryIds,
        mode,
        sortBy,
        comparison: null,
        heatmap: null,
        receiptInspector: inspectorReceiptId
          ? { receipts: [], selectedReceiptId: inspectorReceiptId }
          : null,
        availableSorts: [
          { key: 'count', available: true, tooltip: '' },
          { key: 'deviation', available: true, tooltip: '' },
          { key: 'novelty', available: true, tooltip: '' },
          { key: 'recency', available: true, tooltip: '' },
        ],
      };
    },
  };
}

describe('QueryAnalysisPanel', () => {
  beforeEach(() => {
    ext.QueryAnalysisPanel.currentPanel?.dispose();
    vscode.window._createdWebviewPanels.length = 0;
  });

  it('replaces only the targeted query slot when the webview updates a selector', async () => {
    const store = createStore();
    const context = {
      extensionUri: vscode.Uri.file('/mock/extension'),
      workspaceState: vscode.workspace.createMemento({
        [ext.QA_STATE_KEY]: {
          leftQueryId: 'QRY-001',
          rightQueryId: 'QRY-002',
          inspectorReceiptId: null,
          mode: 'comparison',
          sortBy: 'count',
        },
      }),
      subscriptions: [],
    };

    const panel = ext.QueryAnalysisPanel.createOrShow(context, store);
    const rawPanel = vscode.window._createdWebviewPanels[0];

    rawPanel.webview._fireMessage({ type: 'webview:ready' });
    await flush();

    rawPanel.webview._fireMessage({
      type: 'query:set',
      slot: 'left',
      queryId: 'QRY-003',
    });
    await flush();

    const update = rawPanel.webview._messages.at(-1);
    assert.equal(update.type, 'update');
    assert.deepEqual(update.viewModel.selectedQueryIds, ['QRY-003', 'QRY-002']);
    assert.equal(store._selectedArtifactId, 'QRY-003');

    panel.dispose();
  });

  it('switches an existing panel into inspector mode when opening a receipt inspector', async () => {
    const store = createStore();
    const context = {
      extensionUri: vscode.Uri.file('/mock/extension'),
      workspaceState: vscode.workspace.createMemento({
        [ext.QA_STATE_KEY]: {
          leftQueryId: 'QRY-001',
          rightQueryId: 'QRY-002',
          inspectorReceiptId: null,
          mode: 'comparison',
          sortBy: 'count',
        },
      }),
      subscriptions: [],
    };

    const panel = ext.QueryAnalysisPanel.createOrShow(context, store);
    const rawPanel = vscode.window._createdWebviewPanels[0];

    rawPanel.webview._fireMessage({ type: 'webview:ready' });
    await flush();

    ext.QueryAnalysisPanel.createOrShow(context, store, 'RCT-009');
    await flush();

    const update = rawPanel.webview._messages.at(-1);
    assert.equal(update.type, 'update');
    assert.equal(update.viewModel.mode, 'inspector');
    assert.equal(update.viewModel.receiptInspector.selectedReceiptId, 'RCT-009');
    assert.equal(context.workspaceState.get(ext.QA_STATE_KEY).mode, 'inspector');

    panel.dispose();
  });
});
