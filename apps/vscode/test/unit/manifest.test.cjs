'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(__dirname, '..', '..', 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const vscodeIgnorePath = path.join(__dirname, '..', '..', '.vscodeignore');
const vscodeIgnoreLines = fs.readFileSync(vscodeIgnorePath, 'utf8').split(/\r?\n/);

function findCommand(commandId) {
  return manifest.contributes.commands.find((entry) => entry.command === commandId);
}

function findMenuEntry(menuId, commandId) {
  return (manifest.contributes.menus[menuId] || []).find((entry) => entry.command === commandId);
}

describe('extension manifest', () => {
  it('contributes curated THRUNT commands with icons', () => {
    const stateCommand = findCommand('thrunt-god.showStateJson');
    const progressCommand = findCommand('thrunt-god.showProgressReport');
    const huntmapCommand = findCommand('thrunt-god.analyzeHuntmap');
    const cliCommand = findCommand('thrunt-god.runThruntCli');
    const runtimeDoctorCommand = findCommand('thrunt-god.showRuntimeDoctor');
    const queryAnalysisCommand = findCommand('thrunt-god.openQueryAnalysis');
    const receiptReviewCommand = findCommand('thrunt-god.openReceiptInspector');
    const huntSummaryCommand = findCommand('thrunt-god.copyWarRoomSummary');

    assert.ok(stateCommand, 'showStateJson command should be contributed');
    assert.ok(progressCommand, 'showProgressReport command should be contributed');
    assert.ok(huntmapCommand, 'analyzeHuntmap command should be contributed');
    assert.ok(cliCommand, 'runThruntCli command should be contributed');
    assert.ok(runtimeDoctorCommand, 'showRuntimeDoctor command should be contributed');
    assert.ok(queryAnalysisCommand, 'openQueryAnalysis command should be contributed');
    assert.ok(receiptReviewCommand, 'openReceiptInspector command should be contributed');
    assert.ok(huntSummaryCommand, 'copyWarRoomSummary command should be contributed');

    assert.equal(stateCommand.icon, '$(output)');
    assert.equal(progressCommand.icon, '$(graph)');
    assert.equal(huntmapCommand.icon, '$(graph)');
    assert.equal(cliCommand.icon, '$(terminal)');
    assert.equal(runtimeDoctorCommand.icon, '$(tools)');
    assert.equal(runtimeDoctorCommand.title, 'THRUNT: Check Runtime');
    assert.equal(queryAnalysisCommand.title, 'THRUNT: Open Query Analysis');
    assert.equal(receiptReviewCommand.title, 'THRUNT: Open Receipt Review');
    assert.equal(huntSummaryCommand.title, 'THRUNT: Copy Hunt Summary');
  });

  it('surfaces THRUNT actions in the sidebar title and relevant item menus', () => {
    const titleState = findMenuEntry('view/title', 'thrunt-god.showStateJson');
    const titleHuntmap = findMenuEntry('view/title', 'thrunt-god.analyzeHuntmap');
    const titleCli = findMenuEntry('view/title', 'thrunt-god.runThruntCli');
    const titleRunPhase = findMenuEntry('view/title', 'thrunt-god.runHuntPhase');
    const missionState = findMenuEntry('view/item/context', 'thrunt-god.showStateJson');
    const phasesHuntmap = findMenuEntry('view/item/context', 'thrunt-god.analyzeHuntmap');
    const phaseRun = findMenuEntry('view/item/context', 'thrunt-god.runHuntPhase');

    assert.ok(titleState, 'showStateJson should appear in the sidebar title');
    assert.ok(titleHuntmap, 'analyzeHuntmap should appear in the sidebar title');
    assert.ok(titleCli, 'runThruntCli should appear in the sidebar title');
    assert.ok(titleRunPhase, 'runHuntPhase should appear in the sidebar title');
    assert.ok(missionState, 'showStateJson should appear on the mission node');
    assert.ok(phasesHuntmap, 'analyzeHuntmap should appear on the phases group node');
    assert.ok(phaseRun, 'runHuntPhase should appear on runnable phase nodes');

    assert.match(titleState.when, /view == thruntGod\.huntTree/);
    assert.match(titleHuntmap.when, /view == thruntGod\.huntTree/);
    assert.match(titleCli.when, /view == thruntGod\.huntTree/);
    assert.match(titleRunPhase.when, /thruntGod\.hasRunnablePhases/);
    assert.match(missionState.when, /viewItem == mission/);
    assert.match(phasesHuntmap.when, /viewItem == phases-group/);
    assert.match(phaseRun.when, /viewItem == phase-runnable/);
  });

  it('registers automation tree view alongside investigation tree', () => {
    const views = manifest.contributes.views.thruntGodSidebar;
    assert.equal(views.length, 2, 'should have two sidebar views');

    const huntView = views.find((v) => v.id === 'thruntGod.huntTree');
    const automationView = views.find((v) => v.id === 'thruntGod.automationTree');

    assert.ok(huntView, 'huntTree view should exist');
    assert.ok(automationView, 'automationTree view should exist');

    assert.equal(huntView.name, 'Investigation');
    assert.equal(automationView.name, 'Automation');

    assert.equal(huntView.when, 'thruntGod.huntDetected');
    assert.equal(automationView.when, 'thruntGod.huntDetected');
  });

  it('contributes automation sidebar refresh command and toolbar button', () => {
    const refreshCmd = findCommand('thrunt-god.refreshAutomationSidebar');
    assert.ok(refreshCmd, 'refreshAutomationSidebar command should be contributed');
    assert.equal(refreshCmd.icon, '$(refresh)');

    const titleMenu = findMenuEntry('view/title', 'thrunt-god.refreshAutomationSidebar');
    assert.ok(titleMenu, 'refresh should appear in automation tree toolbar');
    assert.match(titleMenu.when, /view == thruntGod\.automationTree/);
  });

  it('keeps built assets while excluding dist sourcemaps from packaged VSIX output', () => {
    const keepDistIndex = vscodeIgnoreLines.indexOf('!dist/**');
    const excludeSourcemapIndex = vscodeIgnoreLines.indexOf('dist/**/*.map');

    assert.notEqual(keepDistIndex, -1, 'expected dist re-include rule');
    assert.notEqual(excludeSourcemapIndex, -1, 'expected dist sourcemap exclusion');
    assert.ok(
      excludeSourcemapIndex > keepDistIndex,
      'dist sourcemap exclusion must come after the dist re-include rule'
    );
  });
});

describe('Command Deck manifest', () => {
  it('registers openCommandDeck command', () => {
    const cmd = findCommand('thrunt-god.openCommandDeck');
    assert.ok(cmd, 'openCommandDeck command exists');
    assert.equal(cmd.title, 'Open Command Deck');
    assert.equal(cmd.category, 'THRUNT');
  });

  it('has openCommandDeck context menu entry for automationCommandDeck', () => {
    const entry = findMenuEntry('view/item/context', 'thrunt-god.openCommandDeck');
    assert.ok(entry, 'openCommandDeck context menu entry exists');
    assert.ok(entry.when.includes('automationCommandDeck'), 'when clause includes automationCommandDeck');
    assert.ok(entry.when.includes('view == thruntGod.automationTree'), 'when clause includes automationTree');
  });

  it('has commandDeckPanel activation event', () => {
    assert.ok(
      manifest.activationEvents.includes('onWebviewPanel:thruntGod.commandDeckPanel'),
      'commandDeckPanel activation event registered'
    );
  });
});

describe('MCP commands', () => {
  it('registers 6 MCP commands in package.json', () => {
    const mcpCommands = manifest.contributes.commands.filter(
      (c) => c.command.startsWith('thrunt-god.mcp')
    );
    assert.equal(mcpCommands.length, 6);
  });

  it('registers mcpStart command with THRUNT category', () => {
    const cmd = manifest.contributes.commands.find(c => c.command === 'thrunt-god.mcpStart');
    assert.ok(cmd, 'mcpStart command exists');
    assert.equal(cmd.category, 'THRUNT');
    assert.equal(cmd.title, 'Start MCP Server');
  });

  it('registers mcpHealthCheck command', () => {
    const cmd = manifest.contributes.commands.find(c => c.command === 'thrunt-god.mcpHealthCheck');
    assert.ok(cmd, 'mcpHealthCheck command exists');
    assert.equal(cmd.title, 'Run MCP Health Check');
  });

  it('registers 6 MCP context menu entries gated by automationMcp', () => {
    const ctx = manifest.contributes.menus['view/item/context'];
    const mcpMenus = ctx.filter(m => m.command.startsWith('thrunt-god.mcp'));
    assert.equal(mcpMenus.length, 6);
    for (const menu of mcpMenus) {
      assert.ok(
        menu.when.includes('viewItem == automationMcp'),
        `${menu.command} when clause should include automationMcp`
      );
      assert.ok(
        menu.when.includes('view == thruntGod.automationTree'),
        `${menu.command} when clause should include automationTree`
      );
    }
  });

  it('MCP context menu entries use ordered mcp@ groups', () => {
    const ctx = manifest.contributes.menus['view/item/context'];
    const mcpMenus = ctx.filter(m => m.command.startsWith('thrunt-god.mcp'));
    const groups = mcpMenus.map(m => m.group).sort();
    assert.deepEqual(groups, ['mcp@1', 'mcp@2', 'mcp@3', 'mcp@4', 'mcp@5', 'mcp@6']);
  });

  it('has mcpControlPanel activation event', () => {
    assert.ok(
      manifest.activationEvents.includes('onWebviewPanel:thruntGod.mcpControlPanel'),
      'mcpControlPanel activation event exists'
    );
  });
});
