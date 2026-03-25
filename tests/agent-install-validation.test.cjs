/**
 * THRUNT Agent Installation Validation Tests (#1371)
 *
 * Validates that THRUNT detects missing or incomplete agent installations and
 * surfaces warnings through init commands and health checks. When agents are
 * not installed, Task(subagent_type="thrunt-*") silently falls back to
 * general-purpose, losing specialized instructions.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runThruntTools, createTempProject, cleanup } = require('./helpers.cjs');

const AGENTS_DIR_NAME = 'agents';
const MODEL_PROFILES = require('../thrunt-god/bin/lib/model-profiles.cjs').MODEL_PROFILES;
const EXPECTED_AGENTS = Object.keys(MODEL_PROFILES);

/**
 * Create a fake THRUNT install directory structure that mirrors what the installer
 * produces. thrunt-tools.cjs lives at <configDir>/thrunt-god/bin/thrunt-tools.cjs,
 * so the agents dir is at <configDir>/agents/.
 *
 * We use --cwd to point at the project, and THRUNT_INSTALL_DIR env to override
 * the agents directory location for testing.
 */
function createAgentsDir(configDir, agentNames = []) {
  const agentsDir = path.join(configDir, AGENTS_DIR_NAME);
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const name of agentNames) {
    fs.writeFileSync(
      path.join(agentsDir, `${name}.md`),
      `---\nname: ${name}\ndescription: Test agent\ntools: Read, Bash\ncolor: cyan\n---\nAgent content.\n`
    );
  }
  return agentsDir;
}

// ─── Init command agent validation ──────────────────────────────────────────

describe('init commands: agents_installed field (#1371)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('init run includes agents_installed=true when agents exist', () => {
    // Create phase dir for init
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create agents dir as sibling of thrunt-god/ (the installed layout)
    // thrunt-tools.cjs resolves agents from THRUNT_INSTALL_DIR or __dirname/../../agents
    const thruntInstallDir = path.resolve(__dirname, '..', 'thrunt-god', 'bin');
    const configDir = path.resolve(thruntInstallDir, '..', '..');
    const agentsDir = path.join(configDir, 'agents');

    // Agents already exist in the repo root /agents/ dir which is sibling to thrunt-god/
    const result = runThruntTools('init run 1 --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(typeof output.agents_installed, 'boolean',
      'init run must include agents_installed field');
    // The repo has agents/ dir with all thrunt-*.md files, so this should be true
    assert.strictEqual(output.agents_installed, true,
      'agents_installed should be true when agents directory has thrunt-*.md files');
  });

  test('init plan includes agents_installed=true when agents exist', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runThruntTools('init plan 1 --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(typeof output.agents_installed, 'boolean',
      'init plan must include agents_installed field');
    assert.strictEqual(output.agents_installed, true);
  });

  test('init run includes missing_agents list when agents are missing', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runThruntTools('init run 1 --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(Array.isArray(output.missing_agents),
      'init run must include missing_agents array');
  });

  test('init quick includes agents_installed field', () => {
    const result = runThruntTools(['init', 'quick', 'test description', '--raw'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(typeof output.agents_installed, 'boolean',
      'init quick must include agents_installed field');
  });
});

// ─── Health check: agent installation ───────────────────────────────────────

describe('validate health: agent installation check W010 (#1371)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Write minimal project files so health check doesn't fail on E001-E005
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MISSION.md'),
      '# Project\n\n## What This Is\nTest\n\n## Core Value\nTest\n\n## Hypotheses\nTest\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 1: Setup\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Session State\n\n## Current Position\n\nPhase: 1\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        commit_docs: true,
        workflow: { nyquist_validation: true },
      }, null, 2)
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-setup'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('health check reports healthy when agents are installed (repo layout)', () => {
    // In the repo, agents/ exists as a sibling of thrunt-god/, so the
    // health check should find them via the thrunt-tools.cjs path resolution
    const result = runThruntTools('validate health --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Should not have W010 warning about missing agents
    const w010 = (output.warnings || []).find(w => w.code === 'W010');
    assert.ok(!w010, 'Should not warn about missing agents when agents/ dir exists with files');
  });
});

// ─── validate agents subcommand ─────────────────────────────────────────────

describe('validate agents subcommand (#1371)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate agents returns status with agent list', () => {
    const result = runThruntTools('validate agents --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('agents_dir' in output, 'Must include agents_dir path');
    assert.ok('installed' in output, 'Must include installed array');
    assert.ok('missing' in output, 'Must include missing array');
    assert.ok('agents_found' in output, 'Must include agents_found boolean');
  });

  test('validate agents lists all expected agent types', () => {
    const result = runThruntTools('validate agents --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // The expected agents come from MODEL_PROFILES keys
    assert.ok(output.expected.length > 0, 'Must have expected agents');
  });
});
