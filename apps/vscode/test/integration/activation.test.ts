import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Extension Activation', () => {
  test('extension is present in extensions list', () => {
    const ext = vscode.extensions.getExtension('backbay-labs.thrunt-god');
    assert.ok(ext, 'Extension should be found by ID');
  });

  test('extension activates in hunt workspace', async () => {
    const ext = vscode.extensions.getExtension('backbay-labs.thrunt-god');
    assert.ok(ext, 'Extension should be found');

    // Extension may already be active due to workspaceContains activation
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive, 'Extension should be active');
  });

  test('showInfo command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('thrunt-god.showInfo'),
      'thrunt-god.showInfo command should be registered'
    );
  });
});
