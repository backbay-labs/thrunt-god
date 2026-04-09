'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);

// ---------------------------------------------------------------------------
// Export tests
// ---------------------------------------------------------------------------

describe('Runbook exports', () => {
  it('validateRunbook is exported from bundle', () => {
    assert.equal(typeof ext.validateRunbook, 'function');
  });

  it('parseRunbook is exported from bundle', () => {
    assert.equal(typeof ext.parseRunbook, 'function');
  });

  it('RunbookRegistry is exported from bundle', () => {
    assert.equal(typeof ext.RunbookRegistry, 'function');
  });

  it('RUNBOOK_PANEL_VIEW_TYPE constant is correct', () => {
    assert.equal(ext.RUNBOOK_PANEL_VIEW_TYPE, 'thruntGod.runbookPanel');
  });

  it('VALID_STEP_ACTIONS contains exactly the five action types', () => {
    assert.deepEqual(ext.VALID_STEP_ACTIONS, ['cli', 'mcp', 'open', 'note', 'confirm']);
  });
});

// ---------------------------------------------------------------------------
// parseRunbook — valid YAML tests
// ---------------------------------------------------------------------------

describe('parseRunbook valid YAML', () => {
  it('parseRunbook accepts valid example runbook YAML', () => {
    const yamlPath = path.join(__dirname, '..', '..', '..', '..', '.planning', 'runbooks', 'example-domain-hunt.yaml');
    const content = fs.readFileSync(yamlPath, 'utf8');
    const result = ext.parseRunbook(content);

    assert.notEqual(result.runbook, null, 'runbook should not be null');
    assert.equal(result.errors.length, 0, 'should have no errors');
    assert.equal(result.runbook.name, 'Domain Investigation Runbook');
    assert.equal(result.runbook.steps.length, 5);
    assert.equal(result.runbook.inputs.length, 3);
  });

  it('parseRunbook applies defaults for optional fields', () => {
    const yaml = [
      'name: test',
      'description: test runbook',
      'steps:',
      '  - action: cli',
      '    params:',
      '      command: echo hi',
    ].join('\n');

    const result = ext.parseRunbook(yaml);
    assert.notEqual(result.runbook, null, 'runbook should not be null');
    assert.equal(result.errors.length, 0, 'should have no errors');
    assert.equal(result.runbook.dry_run, false, 'dry_run defaults to false');
    assert.equal(result.runbook.output_capture, 'all', 'output_capture defaults to all');
    assert.equal(result.runbook.success_conditions.length, 0, 'success_conditions defaults to empty');
    assert.equal(result.runbook.failure_conditions.length, 0, 'failure_conditions defaults to empty');
    assert.equal(result.runbook.inputs.length, 0, 'inputs defaults to empty');
  });
});

// ---------------------------------------------------------------------------
// parseRunbook — rejection tests
// ---------------------------------------------------------------------------

describe('parseRunbook rejection', () => {
  it('parseRunbook rejects YAML missing name', () => {
    const yaml = [
      'description: test',
      'steps:',
      '  - action: cli',
      '    params:',
      '      command: echo hi',
    ].join('\n');

    const result = ext.parseRunbook(yaml);
    assert.equal(result.runbook, null, 'runbook should be null');
    assert.ok(result.errors.length > 0, 'should have errors');
  });

  it('parseRunbook rejects YAML missing steps', () => {
    const yaml = [
      'name: test',
      'description: test runbook',
    ].join('\n');

    const result = ext.parseRunbook(yaml);
    assert.equal(result.runbook, null, 'runbook should be null');
    assert.ok(result.errors.length > 0, 'should have errors');
  });

  it('parseRunbook rejects YAML with invalid step action', () => {
    const yaml = [
      'name: test',
      'description: test runbook',
      'steps:',
      '  - action: invalid',
      '    params:',
      '      command: echo hi',
    ].join('\n');

    const result = ext.parseRunbook(yaml);
    assert.equal(result.runbook, null, 'runbook should be null');
    assert.ok(result.errors.length > 0, 'should have errors');
  });

  it('parseRunbook rejects YAML with empty steps array', () => {
    const yaml = [
      'name: test',
      'description: test runbook',
      'steps: []',
    ].join('\n');

    const result = ext.parseRunbook(yaml);
    assert.equal(result.runbook, null, 'runbook should be null');
    assert.ok(result.errors.length > 0, 'should have errors');
  });

  it('parseRunbook rejects invalid YAML syntax', () => {
    const result = ext.parseRunbook(':\n  - bad:\n  bad');
    assert.equal(result.runbook, null, 'runbook should be null');
    assert.ok(result.errors.length > 0, 'should have errors');
    assert.ok(
      result.errors[0].includes('YAML parse error'),
      `error should mention YAML parse error, got: ${result.errors[0]}`
    );
  });
});

// ---------------------------------------------------------------------------
// RunbookRegistry tests
// ---------------------------------------------------------------------------

describe('RunbookRegistry', () => {
  it('RunbookRegistry.discover finds example runbook', async () => {
    const workspaceRoot = path.join(__dirname, '..', '..', '..', '..');
    const registry = new ext.RunbookRegistry(workspaceRoot);
    await registry.discover();

    assert.ok(registry.count >= 1, `expected at least 1 runbook, got ${registry.count}`);

    const runbooks = registry.getRunbooks();
    const example = runbooks.find((r) => r.name === 'Domain Investigation Runbook');
    assert.ok(example, 'should find Domain Investigation Runbook');
    assert.equal(example.valid, true, 'example runbook should be valid');
    assert.equal(example.errors.length, 0, 'example runbook should have no errors');
  });

  it('RunbookRegistry.getRunbook returns RunbookDef for valid file', async () => {
    const workspaceRoot = path.join(__dirname, '..', '..', '..', '..');
    const registry = new ext.RunbookRegistry(workspaceRoot);
    await registry.discover();

    const runbooks = registry.getRunbooks();
    const example = runbooks.find((r) => r.name === 'Domain Investigation Runbook');
    assert.ok(example, 'should find example runbook');

    const def = registry.getRunbook(example.path);
    assert.notEqual(def, null, 'should return a RunbookDef');
    assert.equal(def.name, 'Domain Investigation Runbook');
    assert.equal(def.steps.length, 5);
  });

  it('RunbookRegistry.refresh clears and re-discovers', async () => {
    const workspaceRoot = path.join(__dirname, '..', '..', '..', '..');
    const registry = new ext.RunbookRegistry(workspaceRoot);
    await registry.discover();
    const countBefore = registry.count;

    await registry.refresh();
    assert.equal(registry.count, countBefore, 'count should be same after refresh');
  });
});

// ---------------------------------------------------------------------------
// RunbookEngine tests
// ---------------------------------------------------------------------------

describe('RunbookEngine', () => {
  // Helper to consume the async generator and collect results + final record
  async function collectResults(gen) {
    const results = [];
    let record;
    while (true) {
      const { value, done } = await gen.next();
      if (done) { record = value; break; }
      results.push(value);
    }
    return { results, record };
  }

  // --- Export tests ---

  it('RunbookEngine is exported from bundle', () => {
    assert.equal(typeof ext.RunbookEngine, 'function');
  });

  it('resolveParams is exported from bundle', () => {
    assert.equal(typeof ext.resolveParams, 'function');
  });

  // --- resolveParams tests ---

  it('resolveParams replaces single placeholder', () => {
    const result = ext.resolveParams({ command: 'query {domain}' }, { domain: 'evil.com' });
    assert.deepEqual(result, { command: 'query evil.com' });
  });

  it('resolveParams replaces multiple placeholders', () => {
    const result = ext.resolveParams(
      { command: 'query {domain} --days {days}' },
      { domain: 'evil.com', days: '30' },
    );
    assert.deepEqual(result, { command: 'query evil.com --days 30' });
  });

  it('resolveParams leaves unknown placeholders as empty string', () => {
    const result = ext.resolveParams({ command: 'query {unknown}' }, {});
    assert.deepEqual(result, { command: 'query ' });
  });

  it('resolveParams handles no placeholders', () => {
    const result = ext.resolveParams({ command: 'echo hello' }, {});
    assert.deepEqual(result, { command: 'echo hello' });
  });

  // --- Dry-run behavior tests ---

  it('RunbookEngine dry-run produces dry-run status for all steps', async () => {
    const engine = new ext.RunbookEngine('/tmp', '/tmp/fake');
    const runbook = {
      name: 'Test Runbook',
      description: 'test',
      inputs: [],
      steps: [
        { action: 'cli', params: { command: 'echo test' } },
        { action: 'note', params: { file: 'test.md', content: 'hello' } },
        { action: 'confirm', params: { message: 'Continue?' } },
      ],
      dry_run: true,
      output_capture: 'all',
      success_conditions: [],
      failure_conditions: [],
    };

    const gen = engine.executeRunbook(runbook, '/tmp/test.yaml', {}, {
      dryRun: true,
      onConfirm: async () => true,
    });

    const { results, record } = await collectResults(gen);

    assert.equal(results.length, 3, 'should have 3 step results');
    for (const r of results) {
      assert.equal(r.status, 'dry-run', `step ${r.stepIndex} should be dry-run`);
    }
    assert.equal(record.status, 'success', 'overall status should be success');
    assert.equal(record.dryRun, true, 'record should indicate dry run');
  });

  it('RunbookEngine dry-run output describes planned CLI action', async () => {
    const engine = new ext.RunbookEngine('/tmp', '/tmp/fake');
    const runbook = {
      name: 'CLI Test',
      description: 'test',
      inputs: [],
      steps: [
        { action: 'cli', params: { command: 'echo test' } },
      ],
      dry_run: true,
      output_capture: 'all',
      success_conditions: [],
      failure_conditions: [],
    };

    const gen = engine.executeRunbook(runbook, '/tmp/test.yaml', {}, {
      dryRun: true,
      onConfirm: async () => true,
    });

    const { results } = await collectResults(gen);

    assert.ok(results[0].output.includes('[DRY RUN]'), 'output should include [DRY RUN]');
    assert.ok(results[0].output.includes('echo test'), 'output should include the command');
  });

  it('RunbookEngine dry-run output describes planned note action', async () => {
    const engine = new ext.RunbookEngine('/tmp', '/tmp/fake');
    const runbook = {
      name: 'Note Test',
      description: 'test',
      inputs: [],
      steps: [
        { action: 'note', params: { file: 'test.md', content: 'hello' } },
      ],
      dry_run: true,
      output_capture: 'all',
      success_conditions: [],
      failure_conditions: [],
    };

    const gen = engine.executeRunbook(runbook, '/tmp/test.yaml', {}, {
      dryRun: true,
      onConfirm: async () => true,
    });

    const { results } = await collectResults(gen);

    assert.ok(results[0].output.includes('[DRY RUN]'), 'output should include [DRY RUN]');
    assert.ok(results[0].output.includes('test.md'), 'output should include the file path');
  });

  it('RunbookEngine dry-run with input placeholders resolves correctly', async () => {
    const engine = new ext.RunbookEngine('/tmp', '/tmp/fake');
    const runbook = {
      name: 'Placeholder Test',
      description: 'test',
      inputs: [],
      steps: [
        { action: 'cli', params: { command: 'query {domain}' } },
      ],
      dry_run: true,
      output_capture: 'all',
      success_conditions: [],
      failure_conditions: [],
    };

    const gen = engine.executeRunbook(runbook, '/tmp/test.yaml', { domain: 'evil.com' }, {
      dryRun: true,
      onConfirm: async () => true,
    });

    const { results } = await collectResults(gen);

    assert.ok(results[0].output.includes('query evil.com'), 'output should have resolved placeholder');
  });

  it('RunbookEngine dry-run record contains all step results', async () => {
    const engine = new ext.RunbookEngine('/tmp', '/tmp/fake');
    const runbook = {
      name: 'Record Test',
      description: 'test',
      inputs: [],
      steps: [
        { action: 'cli', params: { command: 'echo a' } },
        { action: 'mcp', params: { tool: 'test-tool', input: '{}' } },
        { action: 'open', params: { file: 'test.txt' } },
      ],
      dry_run: true,
      output_capture: 'all',
      success_conditions: [],
      failure_conditions: [],
    };

    const gen = engine.executeRunbook(runbook, '/tmp/test.yaml', {}, {
      dryRun: true,
      onConfirm: async () => true,
    });

    const { record } = await collectResults(gen);

    assert.equal(record.stepResults.length, 3, 'record should contain all step results');
    assert.equal(record.runbookName, 'Record Test');
    assert.ok(record.id.startsWith('RUN-'), 'id should start with RUN-');
    assert.ok(record.durationMs >= 0, 'durationMs should be non-negative');
    assert.ok(record.startTime <= record.endTime, 'startTime should be <= endTime');
  });
});

// ---------------------------------------------------------------------------
// RunbookPanel tests
// ---------------------------------------------------------------------------

describe('RunbookPanel', () => {
  it('RunbookPanel is exported from bundle', () => {
    assert.equal(typeof ext.RunbookPanel, 'function');
  });

  it('RunbookPanel has static createOrShow', () => {
    assert.equal(typeof ext.RunbookPanel.createOrShow, 'function');
  });

  it('RunbookPanel has static restorePanel', () => {
    assert.equal(typeof ext.RunbookPanel.restorePanel, 'function');
  });

  it('RunbookPanel.currentPanel is initially undefined', () => {
    assert.equal(ext.RunbookPanel.currentPanel, undefined);
  });
});

// ---------------------------------------------------------------------------
// Runbook webview build artifacts
// ---------------------------------------------------------------------------

describe('Runbook webview build', () => {
  it('webview-runbook.js exists in dist', () => {
    const jsPath = path.join(__dirname, '..', '..', 'dist', 'webview-runbook.js');
    assert.ok(fs.existsSync(jsPath), 'dist/webview-runbook.js should exist');
  });

  it('webview-runbook.css exists in dist', () => {
    const cssPath = path.join(__dirname, '..', '..', 'dist', 'webview-runbook.css');
    assert.ok(fs.existsSync(cssPath), 'dist/webview-runbook.css should exist');
  });
});
