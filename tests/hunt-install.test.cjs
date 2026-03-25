process.env.THRUNT_TEST_MODE = '1';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeManifest } = require('../bin/install.js');

const tempDirs = [];

afterEach(() => {
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
});
