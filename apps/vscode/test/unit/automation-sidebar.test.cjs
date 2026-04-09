/**
 * Unit tests for AutomationTreeDataProvider (automation sidebar).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 */
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

describe('AutomationTreeDataProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new ext.AutomationTreeDataProvider();
  });

  describe('root nodes', () => {
    it('returns exactly four root nodes', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots.length, 4);
    });

    it('returns MCP as first root node with plug icon', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots[0].label, 'MCP');
      assert.equal(roots[0].iconPath.id, 'plug');
      assert.equal(roots[0].description, 'No MCP server configured');
      assert.equal(roots[0].nodeType, 'mcp');
      assert.equal(roots[0].contextValue, 'automationMcp');
    });

    it('returns Command Deck as second root node with terminal icon', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots[1].label, 'Command Deck');
      assert.equal(roots[1].iconPath.id, 'terminal');
      assert.equal(roots[1].nodeType, 'command-deck');
      assert.equal(roots[1].contextValue, 'automationCommandDeck');
    });

    it('returns Runbooks as third root node with notebook icon', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots[2].label, 'Runbooks');
      assert.equal(roots[2].iconPath.id, 'notebook');
      assert.equal(roots[2].nodeType, 'runbooks');
      assert.equal(roots[2].contextValue, 'automationRunbooks');
    });

    it('returns Recent Runs as fourth root node with history icon', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots[3].label, 'Recent Runs');
      assert.equal(roots[3].iconPath.id, 'history');
      assert.equal(roots[3].description, 'No recent runs');
      assert.equal(roots[3].nodeType, 'recent-runs');
      assert.equal(roots[3].contextValue, 'automationRecentRuns');
    });

    it('all root nodes have Collapsed collapsible state', () => {
      const roots = provider.getChildren(undefined);
      for (const root of roots) {
        assert.equal(root.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
      }
    });
  });

  describe('children of root nodes', () => {
    it('returns empty array for MCP children when no mcpStatus provided', () => {
      const roots = provider.getChildren(undefined);
      const mcpChildren = provider.getChildren(roots[0]);
      assert.deepEqual(mcpChildren, []);
    });

    it('returns empty array for Command Deck children (placeholder)', () => {
      const roots = provider.getChildren(undefined);
      const deckChildren = provider.getChildren(roots[1]);
      assert.deepEqual(deckChildren, []);
    });

    it('returns "No registry" placeholder for Runbooks children when no registry set', () => {
      const roots = provider.getChildren(undefined);
      const runbookChildren = provider.getChildren(roots[2]);
      assert.equal(runbookChildren.length, 1);
      assert.equal(runbookChildren[0].label, 'No registry');
      assert.equal(runbookChildren[0].contextValue, 'automationRunbookChild');
    });

    it('returns "No history available" for Recent Runs children when no logger set', () => {
      const roots = provider.getChildren(undefined);
      const runsChildren = provider.getChildren(roots[3]);
      assert.equal(runsChildren.length, 1);
      assert.equal(runsChildren[0].label, 'No history available');
      assert.equal(runsChildren[0].contextValue, 'automationRecentRunChild');
    });
  });

  describe('refresh', () => {
    it('fires onDidChangeTreeData event when refresh is called', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => {
        fired = true;
      });
      provider.refresh();
      assert.equal(fired, true);
    });

    it('fires onDidChangeTreeData independently (not coupled to HuntTreeDataProvider)', () => {
      // Verify AutomationTreeDataProvider has its own event emitter
      const huntProvider = new ext.HuntTreeDataProvider(
        createMinimalMockStore(),
        vscode.Uri.file('/mock')
      );

      let automationFired = false;
      let huntFired = false;

      provider.onDidChangeTreeData(() => { automationFired = true; });
      huntProvider.onDidChangeTreeData(() => { huntFired = true; });

      provider.refresh();

      assert.equal(automationFired, true, 'automation tree should have fired');
      assert.equal(huntFired, false, 'hunt tree should NOT have fired');

      huntProvider.dispose();
    });
  });

  describe('runbook count', () => {
    it('shows "No runbooks found" when count is 0', () => {
      const roots = provider.getChildren(undefined);
      assert.equal(roots[2].description, 'No runbooks found');
    });

    it('updates Runbooks description after setRunbookCount', () => {
      provider.setRunbookCount(3);
      const roots = provider.getChildren(undefined);
      assert.equal(roots[2].description, '3 runbooks');
    });

    it('setRunbookCount fires refresh event', () => {
      let fireCount = 0;
      provider.onDidChangeTreeData(() => { fireCount++; });
      provider.setRunbookCount(5);
      assert.equal(fireCount, 1);
    });

    it('handles singular runbook count', () => {
      provider.setRunbookCount(1);
      const roots = provider.getChildren(undefined);
      assert.match(roots[2].description, /1 runbook/);
    });
  });

  describe('command count', () => {
    it('AutomationTreeDataProvider default command count is 0', () => {
      const p = new ext.AutomationTreeDataProvider();
      const roots = p.getChildren(undefined);
      const deckNode = roots.find(n => n.label === 'Command Deck');
      assert.ok(deckNode, 'Command Deck node should exist');
      assert.equal(deckNode.description, '0 commands');
    });

    it('AutomationTreeDataProvider setCommandCount updates description', () => {
      const p = new ext.AutomationTreeDataProvider();
      p.setCommandCount(10);
      const roots = p.getChildren(undefined);
      const deckNode = roots.find(n => n.label === 'Command Deck');
      assert.ok(deckNode, 'Command Deck node should exist');
      assert.equal(deckNode.description, '10 commands');
    });

    it('setCommandCount fires refresh event', () => {
      let fireCount = 0;
      provider.onDidChangeTreeData(() => { fireCount++; });
      provider.setCommandCount(5);
      assert.equal(fireCount, 1);
    });

    it('constructor accepts commandCount option', () => {
      const p = new ext.AutomationTreeDataProvider({ commandCount: 7 });
      const roots = p.getChildren(undefined);
      const deckNode = roots.find(n => n.label === 'Command Deck');
      assert.equal(deckNode.description, '7 commands');
    });
  });

  describe('getTreeItem', () => {
    it('returns the element unchanged', () => {
      const roots = provider.getChildren(undefined);
      const item = provider.getTreeItem(roots[0]);
      assert.strictEqual(item, roots[0]);
    });
  });

  describe('dispose', () => {
    it('can be called without error', () => {
      assert.doesNotThrow(() => provider.dispose());
    });
  });

  describe('MCP status rendering', () => {
    function createMockMcpStatus(status) {
      return { getStatus: () => ({ ...status }) };
    }

    it('MCP node shows "Disconnected" when mcpStatus has disconnected connection', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'disconnected',
        profile: null,
        lastHealthCheck: null,
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      assert.equal(roots[0].description, 'Disconnected');
      assert.equal(roots[0].iconPath.color.id, 'charts.red');
    });

    it('MCP node shows "Connected" with green icon when mcpStatus is connected', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'connected',
        profile: null,
        lastHealthCheck: null,
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      assert.equal(roots[0].description, 'Connected');
      assert.equal(roots[0].iconPath.color.id, 'charts.green');
    });

    it('MCP node shows profile name when connected with profile', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'connected',
        profile: 'production',
        lastHealthCheck: null,
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      assert.match(roots[0].description, /production/);
    });

    it('MCP node shows health check timestamp when lastHealthCheck present', () => {
      const ts = Date.now();
      const mockStatus = createMockMcpStatus({
        connection: 'connected',
        profile: null,
        lastHealthCheck: { status: 'healthy', toolCount: 10, dbSizeBytes: 1024, dbTableCount: 5, uptimeMs: 50, timestamp: ts },
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      const expectedTime = new Date(ts).toLocaleTimeString();
      assert.match(roots[0].description, new RegExp(expectedTime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('MCP node shows "Checking..." with sync icon when checking', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'checking',
        profile: null,
        lastHealthCheck: null,
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      assert.equal(roots[0].description, 'Checking...');
      assert.equal(roots[0].iconPath.id, 'sync~spin');
    });

    it('MCP children show health check details when lastHealthCheck is available', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'connected',
        profile: null,
        lastHealthCheck: { status: 'healthy', toolCount: 10, dbSizeBytes: 2048, dbTableCount: 7, uptimeMs: 100, timestamp: Date.now() },
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      const mcpNode = roots[0];
      const children = p.getChildren(mcpNode);

      assert.ok(children.length >= 3, 'should have at least 3 children (Status, Tools, DB)');
      assert.equal(children[0].label, 'Status: healthy');
      assert.equal(children[0].iconPath.id, 'pass');
      assert.equal(children[1].label, 'Tools: 10');
      assert.equal(children[1].iconPath.id, 'wrench');
      assert.match(children[2].label, /DB:.*2\.0 KB.*7 tables/);
      assert.equal(children[2].iconPath.id, 'database');
    });

    it('MCP children show error when lastHealthCheck has error', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'disconnected',
        profile: null,
        lastHealthCheck: { status: 'unhealthy', toolCount: 0, dbSizeBytes: 0, dbTableCount: 0, uptimeMs: 0, timestamp: Date.now(), error: 'DB not found' },
        hasError: true,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      const mcpNode = roots[0];
      const children = p.getChildren(mcpNode);

      const errorChild = children.find(c => c.label.startsWith('Error:'));
      assert.ok(errorChild, 'should have error child');
      assert.match(errorChild.label, /DB not found/);
      assert.equal(errorChild.iconPath.id, 'warning');
    });

    it('MCP children show placeholder when no lastHealthCheck', () => {
      const mockStatus = createMockMcpStatus({
        connection: 'disconnected',
        profile: null,
        lastHealthCheck: null,
        hasError: false,
      });
      const p = new ext.AutomationTreeDataProvider({ mcpStatus: mockStatus });
      const roots = p.getChildren(undefined);
      const mcpNode = roots[0];
      const children = p.getChildren(mcpNode);

      assert.equal(children.length, 1);
      assert.equal(children[0].label, 'Run health check to see status');
      assert.equal(children[0].iconPath.id, 'info');
    });
  });
});

// ---------------------------------------------------------------------------
// Recent Runs children tests
// ---------------------------------------------------------------------------

function createMockExecutionLogger(entries) {
  return {
    getRecent: () => entries,
    append: () => {},
    prune: () => {},
    clear: () => {},
    getMaxEntries: () => 100,
  };
}

describe('Recent Runs children', () => {
  it('Recent Runs node shows "No history available" when no logger set', () => {
    const p = new ext.AutomationTreeDataProvider();
    const roots = p.getChildren(undefined);
    const recentNode = roots[3];
    const children = p.getChildren(recentNode);
    assert.equal(children.length, 1);
    assert.equal(children[0].label, 'No history available');
    assert.equal(children[0].iconPath.id, 'info');
    assert.equal(children[0].contextValue, 'automationRecentRunChild');
  });

  it('Recent Runs node shows "No recent runs" when logger has empty history', () => {
    const p = new ext.AutomationTreeDataProvider({ executionLogger: createMockExecutionLogger([]) });
    const roots = p.getChildren(undefined);
    const recentNode = roots[3];
    const children = p.getChildren(recentNode);
    assert.equal(children.length, 1);
    assert.equal(children[0].label, 'No recent runs');
    assert.equal(children[0].iconPath.id, 'info');
    assert.equal(children[0].contextValue, 'automationRecentRunChild');
  });

  it('Recent Runs node shows entries with correct status icons', () => {
    const entries = [
      { id: 'EXE-1', type: 'command', name: 'Runtime Doctor', args: [], stdout: 'ok', stderr: '', exitCode: 0, startedAt: Date.now(), duration: 500, status: 'success', environment: 'production', mutating: false },
      { id: 'EXE-2', type: 'runbook', name: 'Domain Hunt', args: ['domain=test.com'], stdout: 'done', stderr: '', exitCode: 1, startedAt: Date.now(), duration: 3000, status: 'failure', environment: null, mutating: true },
    ];
    const p = new ext.AutomationTreeDataProvider({ executionLogger: createMockExecutionLogger(entries) });
    const roots = p.getChildren(undefined);
    const recentNode = roots[3];
    const children = p.getChildren(recentNode);

    assert.equal(children.length, 2);
    assert.equal(children[0].label, 'Runtime Doctor');
    assert.equal(children[0].iconPath.id, 'pass');
    assert.equal(children[1].label, 'Domain Hunt');
    assert.equal(children[1].iconPath.id, 'error');
    assert.equal(children[0].contextValue, 'automationRecentRunChild');
    assert.equal(children[1].contextValue, 'automationRecentRunChild');
  });

  it('Recent Runs root node description shows run count', () => {
    const entries = [
      { id: 'EXE-1', type: 'command', name: 'Cmd 1', args: [], stdout: '', stderr: '', exitCode: 0, startedAt: Date.now(), duration: 100, status: 'success', environment: null, mutating: false },
      { id: 'EXE-2', type: 'command', name: 'Cmd 2', args: [], stdout: '', stderr: '', exitCode: 0, startedAt: Date.now(), duration: 200, status: 'success', environment: null, mutating: false },
      { id: 'EXE-3', type: 'runbook', name: 'Runbook 1', args: [], stdout: '', stderr: '', exitCode: 0, startedAt: Date.now(), duration: 300, status: 'success', environment: null, mutating: true },
    ];
    const p = new ext.AutomationTreeDataProvider({ executionLogger: createMockExecutionLogger(entries) });
    const roots = p.getChildren(undefined);
    assert.equal(roots[3].description, '3 runs');
  });

  it('Recent Runs root node description shows "No recent runs" with empty logger', () => {
    const p = new ext.AutomationTreeDataProvider({ executionLogger: createMockExecutionLogger([]) });
    const roots = p.getChildren(undefined);
    assert.equal(roots[3].description, 'No recent runs');
  });

  it('setExecutionLogger triggers refresh', () => {
    const p = new ext.AutomationTreeDataProvider();
    let fireCount = 0;
    p.onDidChangeTreeData(() => { fireCount++; });
    p.setExecutionLogger(createMockExecutionLogger([]));
    assert.equal(fireCount, 1);
  });
});

// Minimal mock store for independence test
function createMinimalMockStore() {
  const emitter = new vscode.EventEmitter();
  return {
    onDidChange: emitter.event,
    getHunt: () => null,
    getQueries: () => new Map(),
    getReceipts: () => new Map(),
    getChildHunts: () => [],
    getReceiptsForHypothesis: () => [],
    getReceiptsForQuery: () => [],
    getQueriesForPhase: () => [],
    getArtifactPath: () => undefined,
    dispose: () => emitter.dispose(),
  };
}
