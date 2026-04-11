'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

describe('obsidian community submission contract', () => {
  test('sync script keeps root submission metadata aligned with the app package', () => {
    execFileSync(process.execPath, ['scripts/sync-obsidian-submission-files.cjs'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    assert.deepStrictEqual(readJson('manifest.json'), readJson('apps/obsidian/manifest.json'));
    assert.deepStrictEqual(readJson('versions.json'), readJson('apps/obsidian/versions.json'));
  });

  test('package exposes the sync command and git ignores dist output', () => {
    const pkg = readJson('package.json');
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

    assert.strictEqual(pkg.scripts['sync:obsidian-submission'], 'node scripts/sync-obsidian-submission-files.cjs');
    assert.match(gitignore, /^dist\/$/m);
  });

  test('community plugin entry snippet matches the current plugin metadata', () => {
    const entry = readJson('docs/obsidian-community-plugin-entry.json');
    const manifest = readJson('apps/obsidian/manifest.json');

    assert.strictEqual(entry.id, manifest.id);
    assert.strictEqual(entry.name, manifest.name);
    assert.strictEqual(entry.author, manifest.author);
    assert.strictEqual(entry.description, manifest.description);
    assert.strictEqual(entry.repo, 'backbay-labs/thrunt-god');
  });
});
