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
    const missionState = findMenuEntry('view/item/context', 'thrunt-god.showStateJson');
    const phasesHuntmap = findMenuEntry('view/item/context', 'thrunt-god.analyzeHuntmap');

    assert.ok(titleState, 'showStateJson should appear in the sidebar title');
    assert.ok(titleHuntmap, 'analyzeHuntmap should appear in the sidebar title');
    assert.ok(titleCli, 'runThruntCli should appear in the sidebar title');
    assert.ok(missionState, 'showStateJson should appear on the mission node');
    assert.ok(phasesHuntmap, 'analyzeHuntmap should appear on the phases group node');

    assert.match(titleState.when, /view == thruntGod\.huntTree/);
    assert.match(titleHuntmap.when, /view == thruntGod\.huntTree/);
    assert.match(titleCli.when, /view == thruntGod\.huntTree/);
    assert.match(missionState.when, /viewItem == mission/);
    assert.match(phasesHuntmap.when, /viewItem == phases-group/);
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
