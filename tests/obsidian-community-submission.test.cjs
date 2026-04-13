'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

describe('obsidian community submission contract', () => {
  test('committed root submission metadata stays aligned with the app package', () => {
    assert.deepStrictEqual(readJson('manifest.json'), readJson('apps/obsidian/manifest.json'));
    assert.deepStrictEqual(readJson('versions.json'), readJson('apps/obsidian/versions.json'));
  });

  test('sync script rewrites stale metadata in an isolated temp repo', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-sync-'));
    const tmpScriptsDir = path.join(tmpRoot, 'scripts');
    const tmpAppDir = path.join(tmpRoot, 'apps', 'obsidian');

    fs.mkdirSync(tmpScriptsDir, { recursive: true });
    fs.mkdirSync(tmpAppDir, { recursive: true });
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', 'sync-obsidian-submission-files.cjs'),
      path.join(tmpScriptsDir, 'sync-obsidian-submission-files.cjs'),
    );

    const sourceManifest = { id: 'thrunt-god', name: 'THRUNT God', version: '0.3.6' };
    const sourceVersions = { '0.3.6': '1.6.0' };
    fs.writeFileSync(path.join(tmpAppDir, 'manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`);
    fs.writeFileSync(path.join(tmpAppDir, 'versions.json'), `${JSON.stringify(sourceVersions, null, 2)}\n`);
    fs.writeFileSync(path.join(tmpRoot, 'manifest.json'), `${JSON.stringify({ stale: true }, null, 2)}\n`);
    fs.writeFileSync(path.join(tmpRoot, 'versions.json'), `${JSON.stringify({ stale: true }, null, 2)}\n`);

    execFileSync(process.execPath, ['scripts/sync-obsidian-submission-files.cjs'], {
      cwd: tmpRoot,
      stdio: 'pipe',
    });

    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(tmpRoot, 'manifest.json'), 'utf8')),
      sourceManifest,
    );
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(tmpRoot, 'versions.json'), 'utf8')),
      sourceVersions,
    );

    fs.rmSync(tmpRoot, { recursive: true, force: true });
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
