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
    it('returns empty array for MCP children (placeholder)', () => {
      const roots = provider.getChildren(undefined);
      const mcpChildren = provider.getChildren(roots[0]);
      assert.deepEqual(mcpChildren, []);
    });

    it('returns empty array for Command Deck children (placeholder)', () => {
      const roots = provider.getChildren(undefined);
      const deckChildren = provider.getChildren(roots[1]);
      assert.deepEqual(deckChildren, []);
    });

    it('returns empty array for Runbooks children (placeholder)', () => {
      const roots = provider.getChildren(undefined);
      const runbookChildren = provider.getChildren(roots[2]);
      assert.deepEqual(runbookChildren, []);
    });

    it('returns empty array for Recent Runs children (placeholder)', () => {
      const roots = provider.getChildren(undefined);
      const runsChildren = provider.getChildren(roots[3]);
      assert.deepEqual(runsChildren, []);
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
