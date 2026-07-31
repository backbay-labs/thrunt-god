'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('obsidian community review contract', () => {
  test('manifest remains mobile-safe', () => {
    const manifest = JSON.parse(read('apps/obsidian/manifest.json'));
    assert.strictEqual(manifest.isDesktopOnly, false);
  });

  test('command labels do not redundantly repeat the plugin name', () => {
    const main = read('apps/obsidian/src/main.ts');
    const artifacts = read('apps/obsidian/src/artifacts.ts');

    assert.doesNotMatch(main, /Open THRUNT workspace/);
    assert.doesNotMatch(main, /Create THRUNT mission scaffold/);
    assert.doesNotMatch(artifacts, /Open THRUNT /);
  });

  test('settings UI avoids a raw heading for the single-section panel', () => {
    const settings = read('apps/obsidian/src/settings.ts');

    assert.doesNotMatch(settings, /createEl\('h2'/);
    assert.doesNotMatch(settings, /createEl\("h2"/);
  });

  test('styles stay scoped to plugin classes and Obsidian theme variables', () => {
    const styles = read('apps/obsidian/styles.css');

    assert.match(styles, /\.thrunt-god-view/);
    assert.match(styles, /var\(--/);
    assert.doesNotMatch(styles, /(^|\s)body\s*\{/m);
  });
});
