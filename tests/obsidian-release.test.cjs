'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { assertObsidianVersionSync } = require('../scripts/lib/obsidian-artifacts.cjs');

const repoRoot = path.join(__dirname, '..');
const outputDir = path.join(repoRoot, 'dist', 'obsidian-release');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseBundlePayload(rawOutput) {
  const trimmed = rawOutput.trim();
  const jsonStart = trimmed.lastIndexOf('\n{');
  return JSON.parse(jsonStart === -1 ? trimmed : trimmed.slice(jsonStart + 1));
}

describe('obsidian release bundle', () => {
  test('bundle command emits the expected release assets', () => {
    const outputDirExisted = fs.existsSync(outputDir);
    const raw = execFileSync(process.execPath, ['scripts/build-obsidian-release.cjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const payload = parseBundlePayload(raw);

    assert.strictEqual(payload.outputDir, outputDir);
    assert.deepStrictEqual(payload.assets, [
      'main.js',
      'manifest.json',
      'styles.css',
      'versions.json',
    ]);
    assert.ok(fs.existsSync(outputDir));

    for (const fileName of payload.assets) {
      assert.ok(
        fs.existsSync(path.join(outputDir, fileName)),
        `${fileName} should exist in the release bundle output`
      );
    }

    const rootPackage = readJson(path.join(repoRoot, 'package.json'));
    const manifest = readJson(path.join(outputDir, 'manifest.json'));
    const versions = readJson(path.join(outputDir, 'versions.json'));

    assert.strictEqual(versions[rootPackage.version], manifest.minAppVersion);

    if (!outputDirExisted) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test('shared version contract throws on drift', () => {
    assert.throws(
      () =>
        assertObsidianVersionSync({
          rootPackage: { version: '0.3.6' },
          obsidianPackage: { version: '0.3.5' },
          manifest: { version: '0.3.6', minAppVersion: '1.6.0' },
          versions: { '0.3.6': '1.6.0' },
        }),
      /Version drift/
    );
  });
});
