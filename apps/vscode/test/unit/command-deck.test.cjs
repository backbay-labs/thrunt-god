'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const pkg = require(path.join(__dirname, '..', '..', 'package.json'));

describe('CommandDeckRegistry', () => {
  it('CommandDeckRegistry is exported from bundle', () => {
    assert.equal(typeof ext.CommandDeckRegistry, 'function');
  });

  it('CommandDeckPanel is exported from bundle', () => {
    assert.equal(typeof ext.CommandDeckPanel, 'function');
  });

  it('COMMAND_DECK_VIEW_TYPE constant is correct', () => {
    assert.equal(ext.COMMAND_DECK_VIEW_TYPE, 'thruntGod.commandDeckPanel');
  });

  it('BUILT_IN_COMMANDS is exported as array', () => {
    assert.ok(Array.isArray(ext.BUILT_IN_COMMANDS));
  });

  it('BUILT_IN_COMMANDS has 10 entries', () => {
    assert.equal(ext.BUILT_IN_COMMANDS.length, 10);
  });

  it('CommandDeckPanel has static createOrShow', () => {
    assert.equal(typeof ext.CommandDeckPanel.createOrShow, 'function');
  });

  it('CommandDeckPanel has static restorePanel', () => {
    assert.equal(typeof ext.CommandDeckPanel.restorePanel, 'function');
  });

  it('CommandDeckPanel.currentPanel is initially undefined', () => {
    assert.equal(ext.CommandDeckPanel.currentPanel, undefined);
  });

  it('All built-in commands have required fields', () => {
    for (const cmd of ext.BUILT_IN_COMMANDS) {
      assert.ok(cmd.id, `command missing id`);
      assert.ok(cmd.label, `command ${cmd.id} missing label`);
      assert.ok(cmd.icon, `command ${cmd.id} missing icon`);
      assert.ok(cmd.description, `command ${cmd.id} missing description`);
      assert.ok(cmd.category, `command ${cmd.id} missing category`);
      assert.equal(typeof cmd.mutating, 'boolean', `command ${cmd.id} mutating should be boolean`);
    }
  });

  it('Built-in commands have correct categories', () => {
    const validCategories = ['Investigation', 'Execution', 'Intelligence', 'Maintenance'];
    for (const cmd of ext.BUILT_IN_COMMANDS) {
      assert.ok(
        validCategories.includes(cmd.category),
        `command ${cmd.id} has invalid category: ${cmd.category}`
      );
    }
  });
});

describe('getContextRelevantIds', () => {
  it('getContextRelevantIds is exported', () => {
    assert.equal(typeof ext.getContextRelevantIds, 'function');
  });

  it('getContextRelevantIds returns empty for null', () => {
    assert.equal(ext.getContextRelevantIds(null).length, 0);
  });

  it('getContextRelevantIds returns run-pack for phase context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'phase' });
    assert.ok(ids.includes('run-pack'), 'should include run-pack');
    assert.ok(ids.includes('analyze-coverage'), 'should include analyze-coverage');
  });

  it('getContextRelevantIds returns empty for removed case context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'case' });
    assert.equal(ids.length, 0);
  });

  it('getContextRelevantIds returns correct ids for query context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'query' });
    assert.ok(ids.includes('query-knowledge'));
    assert.ok(ids.includes('analyze-coverage'));
  });

  it('getContextRelevantIds returns correct ids for receipt context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'receipt' });
    assert.ok(ids.includes('open-evidence-board'));
    assert.ok(ids.includes('publish-findings'));
  });

  it('getContextRelevantIds returns correct ids for hypothesis context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'hypothesis' });
    assert.ok(ids.includes('analyze-coverage'));
    assert.ok(ids.includes('query-knowledge'));
  });

  it('getContextRelevantIds returns empty for removed finding context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'finding' });
    assert.equal(ids.length, 0);
  });

  it('getContextRelevantIds returns correct ids for mission context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'mission' });
    assert.ok(ids.includes('open-program-dashboard'));
    assert.ok(ids.includes('runtime-doctor'));
  });

  it('getContextRelevantIds returns empty for removed huntmap context', () => {
    const ids = ext.getContextRelevantIds({ nodeType: 'huntmap' });
    assert.equal(ids.length, 0);
  });

  it('getContextRelevantIds returns empty for unknown context', () => {
    assert.equal(ext.getContextRelevantIds({ nodeType: 'xyz' }).length, 0);
  });
});

describe('extractPlaceholders', () => {
  it('CommandDeckRegistry.extractPlaceholders is a function', () => {
    assert.equal(typeof ext.CommandDeckRegistry.extractPlaceholders, 'function');
  });

  it('extractPlaceholders finds {packId} in string', () => {
    assert.deepEqual(ext.CommandDeckRegistry.extractPlaceholders('runtime execute --pack {packId}'), ['packId']);
  });

  it('extractPlaceholders finds multiple placeholders', () => {
    assert.deepEqual(ext.CommandDeckRegistry.extractPlaceholders('{a} --flag {b}'), ['a', 'b']);
  });

  it('extractPlaceholders deduplicates', () => {
    assert.deepEqual(ext.CommandDeckRegistry.extractPlaceholders('{x} {x}'), ['x']);
  });

  it('extractPlaceholders returns empty for no placeholders', () => {
    assert.deepEqual(ext.CommandDeckRegistry.extractPlaceholders('no placeholders'), []);
  });
});

describe('BUILT_IN_COMMANDS execution targets', () => {
  it('BUILT_IN_COMMANDS each have either commandId or cliArgs', () => {
    for (const cmd of ext.BUILT_IN_COMMANDS) {
      assert.ok(
        cmd.commandId || cmd.cliArgs,
        `command ${cmd.id} missing both commandId and cliArgs`
      );
    }
  });

  it('BUILT_IN_COMMANDS mutating flag: runtime-doctor is false', () => {
    const cmd = ext.BUILT_IN_COMMANDS.find(c => c.id === 'runtime-doctor');
    assert.ok(cmd, 'runtime-doctor not found');
    assert.equal(cmd.mutating, false);
  });

  it('BUILT_IN_COMMANDS mutating flag: close-case is true', () => {
    const cmd = ext.BUILT_IN_COMMANDS.find(c => c.id === 'close-case');
    assert.ok(cmd, 'close-case not found');
    assert.equal(cmd.mutating, true);
  });
});

describe('Command Deck manifest', () => {
  it('openCommandDeck command registered', () => {
    const cmd = pkg.contributes.commands.find(c => c.command === 'thrunt-god.openCommandDeck');
    assert.ok(cmd, 'openCommandDeck command exists');
    assert.equal(cmd.title, 'Open Command Deck');
    assert.equal(cmd.category, 'THRUNT');
  });

  it('openCommandDeck context menu entry exists', () => {
    const ctx = pkg.contributes.menus['view/item/context'];
    const entry = ctx.find(m => m.command === 'thrunt-god.openCommandDeck');
    assert.ok(entry, 'openCommandDeck menu entry exists');
    assert.ok(entry.when.includes('automationCommandDeck'));
    assert.ok(entry.when.includes('view == thruntGod.automationTree'));
  });

  it('commandDeckPanel activation event registered', () => {
    assert.ok(
      pkg.activationEvents.includes('onWebviewPanel:thruntGod.commandDeckPanel'),
      'commandDeckPanel activation event exists'
    );
  });

  it('webview-command-deck.js build output exists', () => {
    const distPath = path.join(__dirname, '..', '..', 'dist', 'webview-command-deck.js');
    assert.ok(fs.existsSync(distPath), 'webview-command-deck.js exists in dist');
  });

  it('webview-command-deck.css build output exists', () => {
    const distPath = path.join(__dirname, '..', '..', 'dist', 'webview-command-deck.css');
    assert.ok(fs.existsSync(distPath), 'webview-command-deck.css exists in dist');
  });
});
