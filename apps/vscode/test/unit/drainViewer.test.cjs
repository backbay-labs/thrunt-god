'use strict';

const { beforeEach, describe, it } = require('node:test');
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

function loadQuery(name) {
  const parsed = ext.parseQuery(fixture(name));
  assert.equal(parsed.status, 'loaded');
  return parsed.data;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createStore(queries) {
  const emitter = new vscode.EventEmitter();
  const queryMap = new Map(
    queries.map((query) => [
      query.queryId,
      {
        status: 'loaded',
        data: query,
      },
    ])
  );

  const selectEmitter = new vscode.EventEmitter();
  return {
    onDidChange: emitter.event,
    onDidSelect: selectEmitter.event,
    _emitter: emitter,
    _selectEmitter: selectEmitter,
    getQuery(id) {
      return queryMap.get(id);
    },
    getArtifactPath(id) {
      return `/mock/hunt/QUERIES/${id}.md`;
    },
  };
}

describe('Drain viewer host helpers', () => {
  beforeEach(() => {
    ext.DrainTemplatePanel.currentPanel?.dispose();
    vscode.window._createdWebviewPanels.length = 0;
    vscode.commands._executed.length = 0;
    vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.Dark };
  });

  it('builds a view model from a parsed query and pin state', () => {
    const query = loadQuery('QUERIES/QRY-20260329-001.md');
    const viewModel = ext.buildDrainViewerViewModel(query, '/mock/hunt/QUERIES/QRY-20260329-001.md', {
      [query.queryId]: [
        {
          queryId: query.queryId,
          queryTitle: query.title,
          templateId: 'T2',
          template: 'Authentication succeeded for <EMAIL> from <IP> -- SUCCESS',
          count: 43,
        },
      ],
      'QRY-OTHER': [
        {
          queryId: 'QRY-OTHER',
          queryTitle: 'Other query',
          templateId: 'T1',
          template: 'Different template',
          count: 7,
        },
      ],
    });

    assert.equal(viewModel.query.title, query.title);
    assert.deepEqual(viewModel.query.timeWindow, query.timeWindow);
    assert.equal(viewModel.clusters.length, 3);
    assert.equal(viewModel.clusters[0].templateId, 'T1');
    assert.equal(viewModel.clusters[0].sampleEventId, null);
    assert.deepEqual(viewModel.clusters[0].eventIds, []);
    assert.ok(viewModel.clusters[0].detailSummary.includes('failed authentication attempts'));
    assert.equal(viewModel.clusters[1].templateId, 'T2');
    assert.equal(viewModel.clusters[1].isPinned, true);
    assert.equal(viewModel.pinnedTemplates.length, 2);
  });

  it('toggles pins on and off without leaving empty query buckets behind', () => {
    const query = loadQuery('QUERIES/QRY-20260329-001.md');

    const pinnedOnce = ext.togglePinnedTemplate({}, query, 'T1');
    assert.equal(pinnedOnce[query.queryId].length, 1);
    assert.equal(pinnedOnce[query.queryId][0].templateId, 'T1');

    const pinnedTwice = ext.togglePinnedTemplate(pinnedOnce, query, 'T1');
    assert.equal(pinnedTwice[query.queryId], undefined);
  });

  it('renders HTML with boot data plus webview JS and CSS assets', () => {
    const html = ext.createDrainViewerHtml(
      {
        cspSource: 'vscode-resource:',
        asWebviewUri(uri) {
          return {
            toString() {
              return `webview:${uri.fsPath}`;
            },
          };
        },
      },
      vscode.Uri.file('/mock/extension'),
      { queryId: 'QRY-20260329-001' }
    );

    assert.match(html, /webview-drain\.js/);
    assert.match(html, /webview-drain\.css/);
    assert.match(html, /__THRUNT_DRAIN_BOOT__/);
    assert.match(html, /QRY-20260329-001/);
  });

  it('creates a reusable panel, posts init on ready, and persists template pins', async () => {
    const queryA = loadQuery('QUERIES/QRY-20260329-001.md');
    const queryB = loadQuery('QUERIES/QRY-20260329-003.md');
    const store = createStore([queryA, queryB]);
    const context = {
      extensionUri: vscode.Uri.file('/mock/extension'),
      workspaceState: vscode.workspace.createMemento(),
      subscriptions: [],
    };

    const panelA = ext.DrainTemplatePanel.createOrShow(context, store, queryA.queryId);
    const rawPanel = vscode.window._createdWebviewPanels[0];

    rawPanel.webview._fireMessage({ type: 'webview:ready' });
    await flush();

    assert.equal(rawPanel.webview._messages[0].type, 'init');
    assert.equal(rawPanel.webview._messages[0].viewModel.query.queryId, queryA.queryId);

    rawPanel.webview._fireMessage({
      type: 'template:pin',
      queryId: queryA.queryId,
      templateId: 'T1',
    });
    await flush();

    const savedPins = context.workspaceState.get(ext.DRAIN_VIEWER_PIN_KEY, {});
    assert.equal(savedPins[queryA.queryId][0].templateId, 'T1');
    assert.equal(rawPanel.webview._messages.at(-1).type, 'update');

    const panelB = ext.DrainTemplatePanel.createOrShow(context, store, queryB.queryId);
    assert.equal(panelA, panelB);
    assert.equal(vscode.window._createdWebviewPanels.length, 1);

    panelB.dispose();
    assert.equal(ext.DrainTemplatePanel.currentPanel, undefined);
    assert.equal(rawPanel._disposed, true);
  });
});
