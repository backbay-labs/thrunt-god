'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

describe('CLI bridge helpers', () => {
  it('parses structured CLI JSON lines', () => {
    const parsed = ext.parseStructuredCliLine(
      JSON.stringify({
        type: 'progress',
        phase: 3,
        queriesComplete: 1,
        queriesTotal: 2,
      })
    );

    assert.equal(parsed.type, 'progress');
    assert.equal(parsed.phase, 3);
    assert.equal(ext.parseStructuredCliLine('plain text line'), null);
  });

  it('maps connector and query diagnostics onto hunt artifact URIs', () => {
    const huntRoot = vscode.Uri.file('/mock-hunt-root');
    const mapped = ext.mapCliDiagnostics(huntRoot, [
      { code: 'CONNECTOR_NOT_CONFIGURED', message: 'connector okta not configured' },
      { code: 'QUERY_TIMEOUT', message: 'query timeout for QRY-20260329-003', queryId: 'QRY-20260329-003' },
      { code: 'QUERY_TIMEOUT', message: 'query timeout for QRY-alpha-7f9c' },
    ]);

    assert.equal(mapped.length, 3);
    assert.equal(mapped[0][1][0].source, 'THRUNT CLI');
    assert.ok(mapped.some(([uri]) => uri.fsPath.endsWith('/MISSION.md')));
    assert.ok(mapped.some(([uri]) => uri.fsPath.endsWith('/QUERIES/QRY-20260329-003.md')));
    assert.ok(mapped.some(([uri]) => uri.fsPath.endsWith('/QUERIES/QRY-alpha-7f9c.md')));
  });
});

describe('CLIBridge', () => {
  it('streams progress lines and completes successfully', async () => {
    const lines = [];
    const outputChannel = {
      appendLine: (line) => lines.push(line),
      show: () => {},
      clear: () => {},
      dispose: () => {},
    };

    const bridge = new ext.CLIBridge(outputChannel, () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};

      process.nextTick(() => {
        child.stdout.write(
          `${JSON.stringify({
            type: 'progress',
            phase: 4,
            queriesComplete: 1,
            queriesTotal: 2,
            eventsTotal: 149,
            receiptsGenerated: 0,
            elapsedMs: 1200,
          })}\n`
        );
        child.stdout.write(
          `${JSON.stringify({
            type: 'complete',
            phase: 4,
            queriesExecuted: 2,
            receiptsGenerated: 1,
            totalEvents: 149,
          })}\n`
        );
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });

      return child;
    });

    let lastProgress = null;
    bridge.onDidProgress((progress) => {
      lastProgress = progress;
    });

    const result = await bridge.run({
      cliPath: '/mock/thrunt-tools.cjs',
      command: ['runtime', 'execute', '--pack', 'domain.identity-abuse'],
      cwd: '/mock/workspace',
      phase: 4,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(lastProgress.phase, 4);
    assert.equal(lastProgress.queriesComplete, 1);
    assert.ok(lines.some((line) => line.includes('runtime execute --pack domain.identity-abuse')));
    assert.ok(lines.some((line) => line.includes('Phase 4 complete: 2 queries, 1 receipts, 149 events')));

    bridge.dispose();
  });

  it('captures timeout diagnostics for alphanumeric query IDs from stderr output', async () => {
    const lines = [];
    const outputChannel = {
      appendLine: (line) => lines.push(line),
      show: () => {},
      clear: () => {},
      dispose: () => {},
    };

    const bridge = new ext.CLIBridge(outputChannel, () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};

      process.nextTick(() => {
        child.stderr.write('query timeout for QRY-alpha-7f9c\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 1);
      });

      return child;
    });

    const result = await bridge.run({
      cliPath: '/mock/thrunt-tools.cjs',
      command: ['runtime', 'execute', '--pack', 'domain.identity-abuse'],
      cwd: '/mock/workspace',
      huntRoot: vscode.Uri.file('/mock-hunt-root'),
      phase: 4,
    });

    assert.equal(result.exitCode, 1);
    assert.ok(
      bridge.diagnostics
        .get(vscode.Uri.file('/mock-hunt-root/QUERIES/QRY-alpha-7f9c.md'))
        ?.some((diagnostic) => diagnostic.message.includes('query timeout'))
    );
    assert.ok(lines.some((line) => line.includes('query timeout for QRY-alpha-7f9c')));

    bridge.dispose();
  });

  it('cleans up bridge state after a child process error', async () => {
    const outputChannel = {
      appendLine: () => {},
      show: () => {},
      clear: () => {},
      dispose: () => {},
    };

    const childError = new Error('spawn EPERM');
    let completion = null;
    let receivedEnv = null;
    const bridge = new ext.CLIBridge(outputChannel, (_command, _args, options) => {
      receivedEnv = options.env;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};

      process.nextTick(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit('error', childError);
      });

      return child;
    });

    bridge.onDidComplete((event) => {
      completion = event;
    });

    await assert.rejects(
      bridge.run({
        cliPath: '/mock/thrunt-tools.cjs',
        command: ['state', 'json'],
        cwd: '/mock/workspace',
        env: { ...process.env, THRUNT_PLANNING_DIR: '.hunt' },
      }),
      /spawn EPERM/
    );

    assert.equal(receivedEnv.THRUNT_PLANNING_DIR, '.hunt');
    assert.equal(bridge.isRunning, false);
    assert.equal(bridge.getActiveRun(), null);
    assert.deepEqual(completion, {
      status: 'failed',
      exitCode: null,
      summary: null,
    });

    bridge.dispose();
  });

  it('does not let a cancelled run kill the next process via stale SIGKILL fallback', async () => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const timers = [];
    let nextTimerId = 1;

    global.setTimeout = (callback, delay, ...args) => {
      const handle = { id: nextTimerId++ };
      timers.push({ handle, callback: () => callback(...args), delay, cleared: false });
      return handle;
    };
    global.clearTimeout = (handle) => {
      const timer = timers.find((entry) => entry.handle === handle);
      if (timer) {
        timer.cleared = true;
      }
    };

    try {
      const outputChannel = {
        appendLine: () => {},
        show: () => {},
        clear: () => {},
        dispose: () => {},
      };

      const children = [];
      const bridge = new ext.CLIBridge(outputChannel, () => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.killSignals = [];
        child.kill = (signal) => {
          child.killSignals.push(signal);
        };
        children.push(child);
        return child;
      });

      const firstRun = bridge.run({
        cliPath: '/mock/thrunt-tools.cjs',
        command: ['runtime', 'execute', '--pack', 'domain.identity-abuse'],
        cwd: '/mock/workspace',
        timeoutMs: 60000,
      });

      const firstChild = children[0];
      bridge.cancel();
      const cancelKillTimer = timers.find((entry) => entry.delay === 5000);
      assert.ok(cancelKillTimer, 'expected SIGKILL fallback timer for cancelled run');
      firstChild.stdout.end();
      firstChild.stderr.end();
      firstChild.emit('close', null);
      await firstRun;
      assert.equal(cancelKillTimer.cleared, true);

      const secondRun = bridge.run({
        cliPath: '/mock/thrunt-tools.cjs',
        command: ['runtime', 'execute', '--pack', 'domain.identity-abuse'],
        cwd: '/mock/workspace',
        timeoutMs: 60000,
      });

      const secondChild = children[1];
      cancelKillTimer.callback();

      assert.deepEqual(firstChild.killSignals, ['SIGTERM']);
      assert.deepEqual(secondChild.killSignals, []);

      secondChild.stdout.end();
      secondChild.stderr.end();
      secondChild.emit('close', 0);
      await secondRun;
      bridge.dispose();
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
});
