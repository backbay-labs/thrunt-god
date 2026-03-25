/**
 * THRUNT Tools Tests - Antigravity Install Plumbing
 *
 * Tests for Antigravity runtime directory resolution, config paths,
 * content conversion functions, and integration with the multi-runtime installer.
 */

process.env.THRUNT_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createTempDir, cleanup } = require('./helpers.cjs');

const {
  getDirName,
  getGlobalDir,
  getConfigDirFromHome,
  convertClaudeToAntigravityContent,
  convertClaudeCommandToAntigravitySkill,
  convertClaudeAgentToAntigravityAgent,
  copyCommandsAsAntigravitySkills,
  writeManifest,
} = require('../bin/install.js');

// ─── getDirName ─────────────────────────────────────────────────────────────────

describe('getDirName (Antigravity)', () => {
  test('returns .agent for antigravity', () => {
    assert.strictEqual(getDirName('antigravity'), '.agent');
  });

  test('does not break existing runtimes', () => {
    assert.strictEqual(getDirName('claude'), '.claude');
    assert.strictEqual(getDirName('opencode'), '.opencode');
    assert.strictEqual(getDirName('gemini'), '.gemini');
    assert.strictEqual(getDirName('codex'), '.codex');
    assert.strictEqual(getDirName('copilot'), '.github');
  });
});

// ─── getGlobalDir ───────────────────────────────────────────────────────────────

describe('getGlobalDir (Antigravity)', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.ANTIGRAVITY_CONFIG_DIR;
    delete process.env.ANTIGRAVITY_CONFIG_DIR;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.ANTIGRAVITY_CONFIG_DIR = savedEnv;
    } else {
      delete process.env.ANTIGRAVITY_CONFIG_DIR;
    }
  });

  test('returns ~/.gemini/antigravity by default', () => {
    const result = getGlobalDir('antigravity');
    assert.strictEqual(result, path.join(os.homedir(), '.gemini', 'antigravity'));
  });

  test('respects ANTIGRAVITY_CONFIG_DIR env var', () => {
    const customDir = path.join(os.homedir(), 'custom-ag');
    process.env.ANTIGRAVITY_CONFIG_DIR = customDir;
    const result = getGlobalDir('antigravity');
    assert.strictEqual(result, customDir);
  });

  test('explicit config-dir overrides env var', () => {
    process.env.ANTIGRAVITY_CONFIG_DIR = path.join(os.homedir(), 'from-env');
    const explicit = path.join(os.homedir(), 'explicit-ag');
    const result = getGlobalDir('antigravity', explicit);
    assert.strictEqual(result, explicit);
  });

  test('does not change Claude Code global dir', () => {
    assert.strictEqual(getGlobalDir('claude'), path.join(os.homedir(), '.claude'));
  });
});

// ─── getConfigDirFromHome ───────────────────────────────────────────────────────

describe('getConfigDirFromHome (Antigravity)', () => {
  test('returns .agent for local installs', () => {
    assert.strictEqual(getConfigDirFromHome('antigravity', false), "'.agent'");
  });

  test('returns .gemini, antigravity for global installs', () => {
    assert.strictEqual(getConfigDirFromHome('antigravity', true), "'.gemini', 'antigravity'");
  });

  test('does not change other runtimes', () => {
    assert.strictEqual(getConfigDirFromHome('claude', true), "'.claude'");
    assert.strictEqual(getConfigDirFromHome('gemini', true), "'.gemini'");
    assert.strictEqual(getConfigDirFromHome('copilot', true), "'.copilot'");
  });
});

// ─── convertClaudeToAntigravityContent ─────────────────────────────────────────

describe('convertClaudeToAntigravityContent', () => {
  describe('global install path replacements', () => {
    test('replaces ~/. claude/ with ~/.gemini/antigravity/', () => {
      const input = 'See ~/.claude/thrunt-god/workflows/';
      const result = convertClaudeToAntigravityContent(input, true);
      assert.ok(result.includes('~/.gemini/antigravity/thrunt-god/workflows/'), result);
      assert.ok(!result.includes('~/.claude/'), result);
    });

    test('replaces $HOME/.claude/ with $HOME/.gemini/antigravity/', () => {
      const input = 'path.join($HOME/.claude/thrunt-god)';
      const result = convertClaudeToAntigravityContent(input, true);
      assert.ok(result.includes('$HOME/.gemini/antigravity/'), result);
      assert.ok(!result.includes('$HOME/.claude/'), result);
    });
  });

  describe('local install path replacements', () => {
    test('replaces ~/.claude/ with .agent/ for local installs', () => {
      const input = 'See ~/.claude/thrunt-god/';
      const result = convertClaudeToAntigravityContent(input, false);
      assert.ok(result.includes('.agent/thrunt-god/'), result);
      assert.ok(!result.includes('~/.claude/'), result);
    });

    test('replaces ./.claude/ with ./.agent/', () => {
      const input = 'path ./.claude/hooks/thrunt-check-update.js';
      const result = convertClaudeToAntigravityContent(input, false);
      assert.ok(result.includes('./.agent/hooks/'), result);
      assert.ok(!result.includes('./.claude/'), result);
    });

    test('replaces .claude/ with .agent/', () => {
      const input = 'node .claude/hooks/thrunt-statusline.js';
      const result = convertClaudeToAntigravityContent(input, false);
      assert.ok(result.includes('.agent/hooks/thrunt-statusline.js'), result);
      assert.ok(!result.includes('.claude/'), result);
    });
  });

  describe('command name conversion', () => {
    test('converts /thrunt:command to /thrunt-command', () => {
      const input = 'Run /hunt:new-program to start';
      const result = convertClaudeToAntigravityContent(input, true);
      assert.ok(result.includes('/hunt-new-program'), result);
      assert.ok(!result.includes('thrunt:'), result);
    });

    test('converts all thrunt: references', () => {
      const input = '/hunt:plan and /hunt:run';
      const result = convertClaudeToAntigravityContent(input, false);
      assert.ok(result.includes('/hunt-plan'), result);
      assert.ok(result.includes('/hunt-run'), result);
    });
  });

  test('does not modify unrelated content', () => {
    const input = 'This is a plain text description with no paths.';
    const result = convertClaudeToAntigravityContent(input, false);
    assert.strictEqual(result, input);
  });
});

// ─── convertClaudeCommandToAntigravitySkill ─────────────────────────────────────

describe('convertClaudeCommandToAntigravitySkill', () => {
  const claudeCommand = `---
name: hunt:new-program
description: Initialize a new THRUNT project with requirements and roadmap
argument-hint: "[project-name]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
---

Initialize new project at ~/.claude/thrunt-god/workflows/hunt-bootstrap.md
`;

  test('produces name and description only in frontmatter', () => {
    const result = convertClaudeCommandToAntigravitySkill(claudeCommand, 'hunt-new-program', false);
    assert.ok(result.startsWith('---\n'), result);
    assert.ok(result.includes('name: hunt-new-program'), result);
    assert.ok(result.includes('description: Initialize a new THRUNT project'), result);
    // No allowed-tools in output
    assert.ok(!result.includes('allowed-tools'), result);
    // No argument-hint in output
    assert.ok(!result.includes('argument-hint'), result);
  });

  test('applies path replacement in body', () => {
    const result = convertClaudeCommandToAntigravitySkill(claudeCommand, 'hunt-new-program', false);
    assert.ok(result.includes('.agent/thrunt-god/'), result);
    assert.ok(!result.includes('~/.claude/'), result);
  });

  test('uses provided skillName for name field', () => {
    const result = convertClaudeCommandToAntigravitySkill(claudeCommand, 'thrunt-custom-name', false);
    assert.ok(result.includes('name: thrunt-custom-name'), result);
  });

  test('converts thrunt: command references in body', () => {
    const content = `---
name: test
description: test skill
---
Run /hunt:new-program to get started.
`;
    const result = convertClaudeCommandToAntigravitySkill(content, 'thrunt-test', false);
    assert.ok(result.includes('/hunt-new-program'), result);
    assert.ok(!result.includes('thrunt:'), result);
  });

  test('returns unchanged content when no frontmatter', () => {
    const noFm = 'Just some text without frontmatter.';
    const result = convertClaudeCommandToAntigravitySkill(noFm, 'thrunt-test', false);
    // Path replacements still apply, but no frontmatter transformation
    assert.ok(!result.startsWith('---'), result);
  });
});

// ─── convertClaudeAgentToAntigravityAgent ──────────────────────────────────────

describe('convertClaudeAgentToAntigravityAgent', () => {
  const claudeAgent = `---
name: thrunt-telemetry-executor
description: Executes THRUNT plans with atomic commits
tools: Read, Write, Edit, Bash, Glob, Grep, Task
color: blue
---

Execute plans from ~/.claude/thrunt-god/workflows/hunt-run.md
`;

  test('preserves name and description', () => {
    const result = convertClaudeAgentToAntigravityAgent(claudeAgent, false);
    assert.ok(result.includes('name: thrunt-telemetry-executor'), result);
    assert.ok(result.includes('description: Executes THRUNT plans'), result);
  });

  test('maps Claude tools to Gemini tool names', () => {
    const result = convertClaudeAgentToAntigravityAgent(claudeAgent, false);
    // Read → read_file, Bash → run_shell_command
    assert.ok(result.includes('read_file'), result);
    assert.ok(result.includes('run_shell_command'), result);
    // Original Claude names should not appear in tools line
    const fmEnd = result.indexOf('---', 3);
    const frontmatter = result.slice(0, fmEnd);
    assert.ok(!frontmatter.includes('tools: Read,'), frontmatter);
  });

  test('preserves color field', () => {
    const result = convertClaudeAgentToAntigravityAgent(claudeAgent, false);
    assert.ok(result.includes('color: blue'), result);
  });

  test('applies path replacement in body', () => {
    const result = convertClaudeAgentToAntigravityAgent(claudeAgent, false);
    assert.ok(result.includes('.agent/thrunt-god/'), result);
    assert.ok(!result.includes('~/.claude/'), result);
  });

  test('uses global path for global installs', () => {
    const result = convertClaudeAgentToAntigravityAgent(claudeAgent, true);
    assert.ok(result.includes('~/.gemini/antigravity/thrunt-god/'), result);
  });

  test('excludes Task tool (filtered by convertGeminiToolName)', () => {
    const result = convertClaudeAgentToAntigravityAgent(claudeAgent, false);
    // Task is excluded by convertGeminiToolName (returns null for Task)
    const fmEnd = result.indexOf('---', 3);
    const frontmatter = result.slice(0, fmEnd);
    assert.ok(!frontmatter.includes('Task'), frontmatter);
  });
});

// ─── copyCommandsAsAntigravitySkills ───────────────────────────────────────────

describe('copyCommandsAsAntigravitySkills', () => {
  let tmpDir;
  let srcDir;
  let skillsDir;

  beforeEach(() => {
    tmpDir = createTempDir('thrunt-ag-test-');
    srcDir = path.join(tmpDir, 'commands', 'hunt');
    skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(srcDir, { recursive: true });

    // Create a sample command file
    fs.writeFileSync(path.join(srcDir, 'new-program.md'), `---
name: hunt:new-program
description: Initialize a new program
allowed-tools:
  - Read
  - Write
---
Initialize a new program at ~/.claude/thrunt-god/workflows/hunt-bootstrap.md
`);

    // Create a subdirectory command
    const subDir = path.join(srcDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'sub-command.md'), `---
name: thrunt:sub-command
description: A sub-command
allowed-tools:
  - Read
---
Body text.
`);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates skills directory', () => {
    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);
    assert.ok(fs.existsSync(skillsDir));
  });

  test('creates one skill directory per command with SKILL.md', () => {
    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);
    const skillDir = path.join(skillsDir, 'hunt-new-program');
    assert.ok(fs.existsSync(skillDir), 'skill dir should exist');
    assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')), 'SKILL.md should exist');
  });

  test('handles subdirectory commands with prefixed names', () => {
    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);
    const subSkillDir = path.join(skillsDir, 'hunt-subdir-sub-command');
    assert.ok(fs.existsSync(subSkillDir), 'subdirectory skill dir should exist');
  });

  test('SKILL.md has minimal frontmatter (name + description only)', () => {
    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);
    const content = fs.readFileSync(path.join(skillsDir, 'hunt-new-program', 'SKILL.md'), 'utf8');
    assert.ok(content.includes('name: hunt-new-program'), content);
    assert.ok(content.includes('description: Initialize a new program'), content);
    assert.ok(!content.includes('allowed-tools'), content);
  });

  test('SKILL.md body has paths converted for local install', () => {
    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);
    const content = fs.readFileSync(path.join(skillsDir, 'hunt-new-program', 'SKILL.md'), 'utf8');
    // thrunt: → thrunt- conversion
    assert.ok(!content.includes('thrunt:'), content);
  });

  test('removes old hunt-* skill dirs before reinstalling', () => {
    // Create a stale skill dir
    const staleDir = path.join(skillsDir, 'hunt-old-skill');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '---\nname: old\n---\n');

    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);

    assert.ok(!fs.existsSync(staleDir), 'stale skill dir should be removed');
  });

  test('does not remove non-hunt skill dirs', () => {
    // Create a non-THRUNT skill dir
    const otherDir = path.join(skillsDir, 'my-custom-skill');
    fs.mkdirSync(otherDir, { recursive: true });

    copyCommandsAsAntigravitySkills(srcDir, skillsDir, 'hunt', false);

    assert.ok(fs.existsSync(otherDir), 'non-THRUNT skill dir should be preserved');
  });
});

// ─── writeManifest (Antigravity) ───────────────────────────────────────────────

describe('writeManifest (Antigravity)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('thrunt-manifest-ag-');
    // Create minimal structure
    const skillsDir = path.join(tmpDir, 'skills', 'thrunt-help');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '---\nname: thrunt-help\ndescription: Help\n---\n');
    const thruntDir = path.join(tmpDir, 'thrunt-god');
    fs.mkdirSync(thruntDir, { recursive: true });
    fs.writeFileSync(path.join(thruntDir, 'VERSION'), '1.0.0');
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'thrunt-telemetry-executor.md'), '---\nname: thrunt-telemetry-executor\n---\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes manifest JSON file', () => {
    writeManifest(tmpDir, 'antigravity');
    const manifestPath = path.join(tmpDir, 'thrunt-file-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest file should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.version, 'should have version');
    assert.ok(manifest.files, 'should have files');
  });

  test('manifest includes skills in skills/ directory', () => {
    writeManifest(tmpDir, 'antigravity');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'thrunt-file-manifest.json'), 'utf8'));
    const skillFiles = Object.keys(manifest.files).filter(f => f.startsWith('skills/'));
    assert.ok(skillFiles.length > 0, 'should have skill files in manifest');
  });

  test('manifest includes agent files', () => {
    writeManifest(tmpDir, 'antigravity');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'thrunt-file-manifest.json'), 'utf8'));
    const agentFiles = Object.keys(manifest.files).filter(f => f.startsWith('agents/'));
    assert.ok(agentFiles.length > 0, 'should have agent files in manifest');
  });
});
