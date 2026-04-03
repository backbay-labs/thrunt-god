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
    ]);

    assert.equal(mapped.length, 2);
    assert.equal(mapped[0][1][0].source, 'THRUNT CLI');
    assert.ok(mapped.some(([uri]) => uri.fsPath.endsWith('/MISSION.md')));
    assert.ok(mapped.some(([uri]) => uri.fsPath.endsWith('/QUERIES/QRY-20260329-003.md')));
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
});
