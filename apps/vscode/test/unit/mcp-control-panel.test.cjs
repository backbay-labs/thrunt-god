'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const pkg = require(path.join(__dirname, '..', '..', 'package.json'));

describe('McpControlPanel', () => {
  it('is exported from bundle', () => {
    assert.equal(typeof ext.McpControlPanel, 'function');
  });

  it('exports MCP_CONTROL_VIEW_TYPE constant', () => {
    assert.equal(ext.MCP_CONTROL_VIEW_TYPE, 'thruntGod.mcpControlPanel');
  });

  it('has static createOrShow method', () => {
    assert.equal(typeof ext.McpControlPanel.createOrShow, 'function');
  });

  it('has static restorePanel method', () => {
    assert.equal(typeof ext.McpControlPanel.restorePanel, 'function');
  });

  it('currentPanel is initially undefined', () => {
    assert.equal(ext.McpControlPanel.currentPanel, undefined);
  });
});

describe('MCP Control Panel manifest', () => {
  it('has mcpOpenPanel command registered', () => {
    const cmd = pkg.contributes.commands.find(c => c.command === 'thrunt-god.mcpOpenPanel');
    assert.ok(cmd, 'mcpOpenPanel command exists');
    assert.equal(cmd.title, 'Open MCP Control Panel');
    assert.equal(cmd.category, 'THRUNT');
  });

  it('has mcpOpenPanel context menu entry', () => {
    const ctx = pkg.contributes.menus['view/item/context'];
    const entry = ctx.find(m => m.command === 'thrunt-god.mcpOpenPanel');
    assert.ok(entry, 'mcpOpenPanel menu entry exists');
    assert.ok(entry.when.includes('automationMcp'));
    assert.ok(entry.when.includes('view == thruntGod.automationTree'));
  });

  it('has mcpOpenPanel context menu in mcp@8 group', () => {
    const ctx = pkg.contributes.menus['view/item/context'];
    const entry = ctx.find(m => m.command === 'thrunt-god.mcpOpenPanel');
    assert.equal(entry.group, 'mcp@8');
  });

  it('has mcpControlPanel activation event', () => {
    assert.ok(
      pkg.activationEvents.includes('onWebviewPanel:thruntGod.mcpControlPanel'),
      'activation event registered'
    );
  });

  it('webview-mcp-control.js build output exists', () => {
    const distPath = path.join(__dirname, '..', '..', 'dist', 'webview-mcp-control.js');
    assert.ok(fs.existsSync(distPath), 'webview-mcp-control.js exists in dist');
  });

  it('webview-mcp-control.css build output exists', () => {
    const distPath = path.join(__dirname, '..', '..', 'dist', 'webview-mcp-control.css');
    assert.ok(fs.existsSync(distPath), 'webview-mcp-control.css exists in dist');
  });

  it('does not bundle the MCP runtime into dist', () => {
    const distPath = path.join(__dirname, '..', '..', 'dist', 'apps', 'mcp');
    assert.equal(fs.existsSync(distPath), false);
  });

  it('registers 8 MCP commands total', () => {
    const mcpCommands = pkg.contributes.commands.filter(
      c => c.command.startsWith('thrunt-god.mcp')
    );
    assert.equal(mcpCommands.length, 8);
  });

  it('registers 8 MCP context menu entries gated by automationMcp', () => {
    const ctx = pkg.contributes.menus['view/item/context'];
    const mcpMenus = ctx.filter(m => m.command.startsWith('thrunt-god.mcp'));
    assert.equal(mcpMenus.length, 8);
    for (const menu of mcpMenus) {
      assert.ok(
        menu.when.includes('viewItem == automationMcp'),
        `${menu.command} when clause should include automationMcp`
      );
    }
  });
});
