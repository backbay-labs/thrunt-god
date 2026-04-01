/**
 * CLAUDE.md generation and new-program workflow tests
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runThruntTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('generate-claude-md', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates CLAUDE.md with workflow enforcement section', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MISSION.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );

    const result = runThruntTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'created');
    assert.strictEqual(output.sections_total, 5);
    assert.ok(output.sections_generated.includes('workflow'));

    const claudePath = path.join(tmpDir, 'CLAUDE.md');
    const content = fs.readFileSync(claudePath, 'utf-8');
    assert.ok(content.includes('## THRUNT Workflow Enforcement'));
    assert.ok(content.includes('/thrunt:quick'));
    assert.ok(content.includes('/thrunt:debug'));
    assert.ok(content.includes('/hunt:run'));
    assert.ok(content.includes('Do not make direct repo edits outside a THRUNT workflow'));
  });

  test('adds workflow enforcement section when updating an existing CLAUDE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MISSION.md'),
      '# Test Project\n\n## What This Is\n\nA small test project.\n'
    );
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '## Local Notes\n\nKeep this intro.\n');

    const result = runThruntTools('generate-claude-md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.action, 'updated');

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('## Local Notes'));
    assert.ok(content.includes('## THRUNT Workflow Enforcement'));
  });
});

describe('new-program workflow stays hunt-native', () => {
  const workflowPath = path.join(__dirname, '..', 'thrunt-god', 'workflows', 'hunt-bootstrap.md');

  test('new-program workflow does not depend on CLAUDE.md generation', () => {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(content.includes('Do not generate or update `CLAUDE.md` during hunt bootstrap.'));
    assert.ok(content.includes('.planning/environment/ENVIRONMENT.md'));
    assert.ok(content.includes('.planning/STATE.md'));
    assert.ok(!content.includes('generate-claude-md'));
  });
});
