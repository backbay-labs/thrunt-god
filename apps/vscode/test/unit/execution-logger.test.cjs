'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);

// ---------------------------------------------------------------------------
// Export tests
// ---------------------------------------------------------------------------

describe('ExecutionLogger exports', () => {
  it('ExecutionLogger is exported from bundle', () => {
    assert.equal(typeof ext.ExecutionLogger, 'function');
  });

  it('confirmMutatingAction is exported from bundle', () => {
    assert.equal(typeof ext.confirmMutatingAction, 'function');
  });

  it('buildCommandEntry is exported from bundle', () => {
    assert.equal(typeof ext.buildCommandEntry, 'function');
  });

  it('buildRunbookEntry is exported from bundle', () => {
    assert.equal(typeof ext.buildRunbookEntry, 'function');
  });
});

// ---------------------------------------------------------------------------
// buildCommandEntry tests
// ---------------------------------------------------------------------------

describe('buildCommandEntry', () => {
  it('returns ExecutionEntry with type command', () => {
    const startedAt = Date.now() - 100;
    const result = ext.buildCommandEntry(
      'Test',
      ['arg1'],
      'out',
      'err',
      0,
      startedAt,
      'success',
      'production',
      true,
    );

    assert.equal(result.type, 'command');
    assert.equal(result.name, 'Test');
    assert.deepEqual(result.args, ['arg1']);
    assert.equal(result.stdout, 'out');
    assert.equal(result.stderr, 'err');
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, 'success');
    assert.equal(result.environment, 'production');
    assert.equal(result.mutating, true);
    assert.ok(result.id.startsWith('EXE-'), `id should start with EXE-, got: ${result.id}`);
    assert.equal(typeof result.duration, 'number');
    assert.ok(result.duration >= 0, `duration should be >= 0, got: ${result.duration}`);
  });

  it('returns failure status for failed command', () => {
    const result = ext.buildCommandEntry(
      'Failing Command',
      [],
      '',
      'error output',
      1,
      Date.now() - 50,
      'failure',
      null,
      false,
    );

    assert.equal(result.status, 'failure');
    assert.equal(result.exitCode, 1);
  });

  it('handles null environment', () => {
    const result = ext.buildCommandEntry(
      'Local Command',
      [],
      'output',
      '',
      0,
      Date.now() - 10,
      'success',
      null,
      false,
    );

    assert.equal(result.environment, null);
  });
});

// ---------------------------------------------------------------------------
// buildRunbookEntry tests
// ---------------------------------------------------------------------------

describe('buildRunbookEntry', () => {
  it('returns ExecutionEntry with type runbook from RunbookRunRecord', () => {
    const record = {
      id: 'RUN-123',
      runbookName: 'Test Runbook',
      runbookPath: '/test/path.yaml',
      startTime: Date.now() - 5000,
      endTime: Date.now(),
      durationMs: 5000,
      status: 'success',
      stepResults: [
        { stepIndex: 0, action: 'cli', description: 'step 1', status: 'success', output: 'step1 output', durationMs: 1000 },
        { stepIndex: 1, action: 'cli', description: 'step 2', status: 'success', output: 'step2 output', durationMs: 2000 },
      ],
      inputs: { domain: 'example.com' },
      dryRun: false,
    };

    const result = ext.buildRunbookEntry(record, 'staging');

    assert.equal(result.type, 'runbook');
    assert.equal(result.name, 'Test Runbook');
    assert.deepEqual(result.args, ['domain=example.com']);
    assert.ok(result.stdout.includes('step1 output'), 'stdout should contain step1 output');
    assert.ok(result.stdout.includes('step2 output'), 'stdout should contain step2 output');
    assert.equal(result.status, 'success');
    assert.ok(result.id.startsWith('EXE-'), `id should start with EXE-, got: ${result.id}`);
    assert.equal(result.duration, 5000);
  });

  it('maps aborted runbook status correctly', () => {
    const record = {
      id: 'RUN-456',
      runbookName: 'Aborted Runbook',
      runbookPath: '/test/path.yaml',
      startTime: Date.now() - 3000,
      endTime: Date.now(),
      durationMs: 3000,
      status: 'aborted',
      stepResults: [
        { stepIndex: 0, action: 'cli', description: 'step 1', status: 'success', output: 'done', durationMs: 1000 },
      ],
      inputs: {},
      dryRun: false,
    };

    const result = ext.buildRunbookEntry(record, null);

    assert.equal(result.status, 'aborted');
  });

  it('maps failed runbook status correctly', () => {
    const record = {
      id: 'RUN-789',
      runbookName: 'Failed Runbook',
      runbookPath: '/test/path.yaml',
      startTime: Date.now() - 2000,
      endTime: Date.now(),
      durationMs: 2000,
      status: 'failure',
      stepResults: [
        { stepIndex: 0, action: 'cli', description: 'step 1', status: 'failure', output: 'error', durationMs: 500 },
      ],
      inputs: { key: 'value' },
      dryRun: false,
    };

    const result = ext.buildRunbookEntry(record, null);

    assert.equal(result.status, 'failure');
    assert.equal(result.exitCode, 1);
  });
});

// ---------------------------------------------------------------------------
// ExecutionLogger constructor tests
// ---------------------------------------------------------------------------

describe('ExecutionLogger constructor', () => {
  it('can be instantiated with workspace root', () => {
    assert.doesNotThrow(() => {
      new ext.ExecutionLogger('/tmp/test-workspace');
    });
  });
});
