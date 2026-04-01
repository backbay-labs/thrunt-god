process.env.THRUNT_TEST_MODE = '1';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { install, writeManifest } = require('../bin/install.js');

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
