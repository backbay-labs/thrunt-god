'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

function createStore() {
  const changeEmitter = new vscode.EventEmitter();
  const selectEmitter = new vscode.EventEmitter();

  return {
    onDidChange: changeEmitter.event,
    onDidSelect: selectEmitter.event,
    _selectedArtifactId: null,
    getSelectedArtifactId() {
      return this._selectedArtifactId;
    },
    select(id) {
      this._selectedArtifactId = id;
      selectEmitter.fire(id);
    },
    deriveEvidenceBoard() {
      return {
        nodes: [],
        edges: [],
        selectedArtifactId: this._selectedArtifactId,
        mode: 'graph',
      };
    },
  };
}

describe('EvidenceBoardPanel', () => {
  beforeEach(() => {
    ext.EvidenceBoardPanel.currentPanel?.dispose();
    vscode.window._createdWebviewPanels.length = 0;
  });

  it('replays the current selection when the webview becomes ready', async () => {
    const store = createStore();
    const context = {
      extensionUri: vscode.Uri.file('/mock/extension'),
      workspaceState: vscode.workspace.createMemento(),
      subscriptions: [],
    };

    const panel = ext.EvidenceBoardPanel.createOrShow(context, store);
    const rawPanel = vscode.window._createdWebviewPanels[0];

    store.select('RCT-001');
    rawPanel.webview._fireMessage({ type: 'webview:ready' });

    const lastMessage = rawPanel.webview._messages.at(-1);
    assert.deepEqual(lastMessage, {
      type: 'selection:highlight',
      artifactId: 'RCT-001',
    });

    panel.dispose();
  });
});
