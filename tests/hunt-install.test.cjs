process.env.THRUNT_TEST_MODE = '1';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  install,
  writeManifest,
  installObsidian,
  discoverObsidianVaults,
  linkObsidianBundleIntoVault,
  OBSIDIAN_ASSET_FILES,
  OBSIDIAN_PLUGIN_ID,
  getObsidianPluginDir,
} = require('../bin/install.js');

const tempDirs = [];
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-install-'));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeObsidianAssets(dir, label = 'fixture') {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.js'), `console.log(${JSON.stringify(label)});\n`);
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ id: OBSIDIAN_PLUGIN_ID, name: 'THRUNT God', version: '0.0.0' }, null, 2)
  );
  fs.writeFileSync(path.join(dir, 'styles.css'), `/* ${label} */\n`);
}

function writeObsidianConfig(configPath, vaultPaths) {
  const vaults = Object.fromEntries(
    vaultPaths.map((vaultPath, index) => [
      `id-${index + 1}`,
      index === 0
        ? { path: vaultPath, ts: index + 1, open: true }
        : { path: vaultPath, ts: index + 1 },
    ])
  );
  writeFile(configPath, JSON.stringify({ vaults }));
}

function captureLogs() {
  const entries = [];
  return {
    entries,
    logger(message) {
      entries.push(String(message).replace(/\x1B\[[0-9;]*m/g, ''));
    },
    output() {
      return entries.join('\n');
    },
  };
}

function assertVaultSymlinks(vaultPath, stageDir) {
  const pluginDir = getObsidianPluginDir(vaultPath);

  for (const assetFile of OBSIDIAN_ASSET_FILES) {
    const targetPath = path.join(pluginDir, assetFile);
    assert.ok(fs.existsSync(targetPath), `${assetFile} should exist in the vault plugin directory`);
    assert.ok(fs.lstatSync(targetPath).isSymbolicLink(), `${assetFile} should be symlinked`);
    assert.strictEqual(fs.realpathSync(targetPath), fs.realpathSync(path.join(stageDir, assetFile)));
  }

  return pluginDir;
}

describe('hunt command installation manifest', () => {
  test('tracks hunt commands for Claude-style installs', () => {
    const dir = makeTempDir();

    fs.mkdirSync(path.join(dir, 'commands', 'thrunt'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'commands', 'hunt'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'commands', 'thrunt', 'help.md'), '# thrunt');
    fs.writeFileSync(path.join(dir, 'commands', 'hunt', 'help.md'), '# hunt');

    const manifest = writeManifest(dir, 'claude');

    assert.ok(manifest.files['commands/thrunt/help.md']);
    assert.ok(manifest.files['commands/hunt/help.md']);
  });

  test('tracks hunt skills for Codex-style installs', () => {
    const dir = makeTempDir();

    fs.mkdirSync(path.join(dir, 'skills', 'thrunt-help'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'skills', 'hunt-help'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'thrunt-help', 'SKILL.md'), '# thrunt');
    fs.writeFileSync(path.join(dir, 'skills', 'hunt-help', 'SKILL.md'), '# hunt');

    const manifest = writeManifest(dir, 'codex');

    assert.ok(manifest.files['skills/thrunt-help/SKILL.md']);
    assert.ok(manifest.files['skills/hunt-help/SKILL.md']);
  });

  test('local Claude installs copy working hook files even without hooks/dist', () => {
    const dir = makeTempDir();

    process.chdir(dir);
    install(false, 'claude');

    const hooksDir = path.join(dir, '.claude', 'hooks');
    assert.ok(fs.existsSync(path.join(hooksDir, 'thrunt-check-update.js')));
    assert.ok(fs.existsSync(path.join(hooksDir, 'thrunt-context-monitor.js')));
    assert.ok(fs.existsSync(path.join(hooksDir, 'thrunt-prompt-guard.js')));
    assert.ok(fs.existsSync(path.join(hooksDir, 'thrunt-statusline.js')));
  });

  test('local Claude installs can run generate-claude-md from the installed thrunt-tools path', () => {
    const dir = makeTempDir();

    process.chdir(dir);
    install(false, 'claude');

    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'MISSION.md'),
      '# Test Program\n\n## What This Is\n\nA local install smoke test.\n'
    );

    const toolsPath = path.join(dir, '.claude', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
    const raw = execFileSync(
      process.execPath,
      [toolsPath, 'generate-claude-md', '--output', path.join(dir, 'CLAUDE.md'), '--auto', '--raw'],
      {
        cwd: dir,
        encoding: 'utf8',
      }
    );
    const output = JSON.parse(raw);

    assert.strictEqual(output.action, 'created');
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')));
  });
});

describe('obsidian installer helpers', () => {
  test('discoverObsidianVaults returns configured vaults in config order', () => {
    const dir = makeTempDir();
    const configPath = path.join(dir, 'obsidian.json');
    const vaultA = path.join(dir, 'vault-a');
    const vaultB = path.join(dir, 'vault-b');

    fs.mkdirSync(vaultA, { recursive: true });
    fs.mkdirSync(vaultB, { recursive: true });
    writeObsidianConfig(configPath, [vaultA, vaultB]);

    assert.deepStrictEqual(discoverObsidianVaults({ configPath }), [vaultA, vaultB]);
  });

  test('linkObsidianBundleIntoVault creates symlinks for staged assets', () => {
    const dir = makeTempDir();
    const stageDir = path.join(dir, 'stage');
    const vaultPath = path.join(dir, 'vault');

    writeObsidianAssets(stageDir, 'stage assets');
    fs.mkdirSync(vaultPath, { recursive: true });

    const result = linkObsidianBundleIntoVault(vaultPath, stageDir);

    assert.strictEqual(result.status, 'success');
    assertVaultSymlinks(vaultPath, stageDir);
  });

  test('linkObsidianBundleIntoVault repairs stale files and broken links', () => {
    const dir = makeTempDir();
    const stageDir = path.join(dir, 'stage');
    const vaultPath = path.join(dir, 'vault');
    const pluginDir = getObsidianPluginDir(vaultPath);
    const unrelatedDir = path.join(dir, 'old-assets');

    writeObsidianAssets(stageDir, 'fresh assets');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(unrelatedDir, { recursive: true });

    fs.writeFileSync(path.join(pluginDir, 'main.js'), 'stale file');
    fs.symlinkSync(path.join(dir, 'missing-manifest.json'), path.join(pluginDir, 'manifest.json'));
    fs.writeFileSync(path.join(unrelatedDir, 'styles.css'), 'old styles');
    fs.symlinkSync(path.join(unrelatedDir, 'styles.css'), path.join(pluginDir, 'styles.css'));

    const result = linkObsidianBundleIntoVault(vaultPath, stageDir);

    assert.strictEqual(result.status, 'success');
    assertVaultSymlinks(vaultPath, stageDir);
  });

  test('installObsidian falls back cleanly when no vaults are detected', () => {
    const dir = makeTempDir();
    const homeDir = path.join(dir, 'home');
    const pluginDir = path.join(dir, 'plugin-source');
    const configPath = path.join(dir, 'missing', 'obsidian.json');
    const manualVault = path.join(dir, 'manual-vault');
    let buildCalls = 0;
    const logs = captureLogs();

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(manualVault, { recursive: true });
    writeObsidianAssets(pluginDir, 'fallback assets');

    const result = installObsidian({
      homeDir,
      configPath,
      pluginDir,
      runBuild() {
        buildCalls += 1;
      },
      logger: logs.logger,
    });

    assert.strictEqual(buildCalls, 1);
    assert.strictEqual(result.status, 'no_vaults');
    assert.deepStrictEqual(fs.readdirSync(result.stageDir).sort(), [...OBSIDIAN_ASSET_FILES].sort());
    assert.ok(!fs.existsSync(path.join(manualVault, '.obsidian', 'plugins', OBSIDIAN_PLUGIN_ID)));
    assert.match(logs.output(), /No Obsidian vaults detected/);
    assert.match(logs.output(), /Install manually by copying/);
  });

  test('installObsidian stages the bundle and links it into discovered vaults', () => {
    const dir = makeTempDir();
    const homeDir = path.join(dir, 'home');
    const pluginDir = path.join(dir, 'plugin-source');
    const configPath = path.join(dir, 'obsidian.json');
    const vaultPath = path.join(dir, 'vault');
    let buildCalls = 0;
    const logs = captureLogs();

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(vaultPath, { recursive: true });
    writeObsidianAssets(pluginDir, 'happy path');
    writeObsidianConfig(configPath, [vaultPath]);

    const result = installObsidian({
      homeDir,
      configPath,
      pluginDir,
      runBuild() {
        buildCalls += 1;
      },
      logger: logs.logger,
    });

    assert.strictEqual(buildCalls, 1);
    assert.strictEqual(result.status, 'success');
    assert.deepStrictEqual(fs.readdirSync(result.stageDir).sort(), [...OBSIDIAN_ASSET_FILES].sort());
    assertVaultSymlinks(vaultPath, result.stageDir);
    assert.match(logs.output(), /Restart Obsidian and enable THRUNT God in Community Plugins\./);
  });
});
