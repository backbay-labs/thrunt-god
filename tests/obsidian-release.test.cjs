'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertObsidianVersionSync } = require('../scripts/lib/obsidian-artifacts.cjs');
const { buildReleaseBundle } = require('../scripts/build-obsidian-release.cjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixtureRepo() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-release-'));
  const appDir = path.join(fixtureRoot, 'apps', 'obsidian');

  writeJson(path.join(fixtureRoot, 'package.json'), { version: '0.3.6' });
  writeJson(path.join(appDir, 'package.json'), { version: '0.3.6' });
  writeJson(path.join(appDir, 'manifest.json'), {
    id: 'thrunt-god',
    name: 'THRUNT God',
    version: '0.3.6',
    minAppVersion: '1.6.0',
  });
  writeJson(path.join(appDir, 'versions.json'), { '0.3.6': '1.6.0' });
  fs.writeFileSync(path.join(appDir, 'styles.css'), '.thrunt-god-view {}\n');

  return fixtureRoot;
}

describe('obsidian release bundle', () => {
  test('bundle command emits the expected release assets', () => {
    const repoRoot = makeFixtureRepo();
    const outputDir = path.join(repoRoot, 'dist', 'obsidian-release');
    let buildCalls = 0;
    const payload = buildReleaseBundle({
      repoRoot,
      runBuild({ appDir }) {
        buildCalls += 1;
        fs.writeFileSync(path.join(appDir, 'main.js'), 'console.log("fixture bundle");\n');
      },
    });

    assert.strictEqual(payload.outputDir, outputDir);
    assert.deepStrictEqual(payload.assets, [
      'main.js',
      'manifest.json',
      'styles.css',
      'versions.json',
    ]);
    assert.strictEqual(buildCalls, 1);
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
    fs.rmSync(repoRoot, { recursive: true, force: true });
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
