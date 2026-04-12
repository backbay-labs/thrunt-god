import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../src/logger.ts';
import { classifyError, errorResponse } from '../src/errors.ts';
import { runThruntCommand } from '../src/thrunt-tools.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const TOOLS_PATH = path.join(REPO_ROOT, 'thrunt-god', 'bin', 'thrunt-tools.cjs');

// ─── Logger tests ──────────────────────────────────────────────────────────

describe('structured logger', () => {
  test('emits JSON line with required fields', () => {
    const lines: string[] = [];
    const stream = { write(s: string) { lines.push(s); } };
    const logger = createLogger({ stream });

    logger.info('http', 'test request', { path: '/api/health' });

    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.ts).toBeDefined();
    expect(entry.level).toBe('info');
    expect(entry.category).toBe('http');
    expect(entry.msg).toBe('test request');
    expect(entry.path).toBe('/api/health');
  });

  test('filters below minLevel', () => {
    const lines: string[] = [];
    const stream = { write(s: string) { lines.push(s); } };
    const logger = createLogger({ minLevel: 'warn', stream });

    logger.info('http', 'should be filtered');
    expect(lines.length).toBe(0);

    logger.warn('http', 'should appear');
    expect(lines.length).toBe(1);
  });

  test('includes arbitrary metadata', () => {
    const lines: string[] = [];
    const stream = { write(s: string) { lines.push(s); } };
    const logger = createLogger({ stream });

    logger.info('http', 'request', { durationMs: 42, status: 200 });

    const entry = JSON.parse(lines[0]!);
    expect(entry.durationMs).toBe(42);
    expect(entry.status).toBe(200);
  });

  test('debug level allows all messages', () => {
    const lines: string[] = [];
    const stream = { write(s: string) { lines.push(s); } };
    const logger = createLogger({ minLevel: 'debug', stream });

    logger.debug('subprocess', 'debug message');
    logger.info('subprocess', 'info message');
    logger.warn('subprocess', 'warn message');
    logger.error('subprocess', 'error message');

    expect(lines.length).toBe(4);
  });
});

// ─── Error classification tests ────────────────────────────────────────────

describe('classifyError', () => {
  test('classifies ENOENT as file-system', () => {
    const result = classifyError({ code: 'ENOENT', message: 'not found' });
    expect(result.class).toBe('file-system');
    expect(result.code).toBe('FS_ENOENT');
  });

  test('classifies EACCES as file-system', () => {
    const result = classifyError({ code: 'EACCES', message: 'permission denied' });
    expect(result.class).toBe('file-system');
    expect(result.code).toBe('FS_EACCES');
  });

  test('classifies timeout message as timeout', () => {
    const result = classifyError(new Error('Process timed out after 30000ms'));
    expect(result.class).toBe('timeout');
    expect(result.code).toBe('SUBPROCESS_TIMEOUT');
  });

  test('classifies SIGKILL message as timeout', () => {
    const result = classifyError(new Error('Process killed with SIGKILL'));
    expect(result.class).toBe('timeout');
    expect(result.code).toBe('SUBPROCESS_TIMEOUT');
  });

  test('classifies spawn failure as subprocess', () => {
    const result = classifyError(new Error('spawn ENOENT'));
    expect(result.class).toBe('subprocess');
    expect(result.code).toBe('SUBPROCESS_FAILURE');
  });

  test('classifies exit code error as subprocess', () => {
    const result = classifyError(new Error('Process terminated with exit code 1'));
    expect(result.class).toBe('subprocess');
    expect(result.code).toBe('SUBPROCESS_FAILURE');
  });

  test('defaults to validation for unknown errors', () => {
    const result = classifyError(new Error('bad input format'));
    expect(result.class).toBe('validation');
    expect(result.code).toBe('UNKNOWN_ERROR');
  });
});

// ─── Error response tests ──────────────────────────────────────────────────

describe('errorResponse', () => {
  test('returns Response with correct JSON body', async () => {
    const response = errorResponse('bad request', 'validation', 'VAL_ERROR', 400);
    const body = await response.json();
    expect(body).toEqual({ error: 'bad request', code: 'VAL_ERROR', class: 'validation' });
  });

  test('sets correct status', () => {
    const response = errorResponse('not found', 'file-system', 'FS_ENOENT', 404);
    expect(response.status).toBe(404);
  });

  test('sets CORS headers', () => {
    const response = errorResponse('timeout', 'timeout', 'SUBPROCESS_TIMEOUT', 504);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});

// ─── Subprocess timeout tests ──────────────────────────────────────────────

describe('subprocess timeout', () => {
  test('times out a hanging process', async () => {
    // Create a temp script that sleeps for 60s
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-timeout-'));
    const scriptPath = path.join(tmpDir, 'hang.sh');
    fs.writeFileSync(scriptPath, '#!/bin/sh\nsleep 60\n', { mode: 0o755 });

    const result = await runThruntCommand(tmpDir, [], scriptPath, { timeoutMs: 1000 });

    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('timed out');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }, 30_000);

  test('completes fast commands within timeout', async () => {
    const result = await runThruntCommand(REPO_ROOT, ['state', '--raw'], TOOLS_PATH, { timeoutMs: 10_000 });

    expect(result.timedOut).toBe(false);
    expect(result.ok).toBe(true);
  }, 15_000);

  test('logs subprocess execution when logger provided', async () => {
    const lines: string[] = [];
    const stream = { write(s: string) { lines.push(s); } };
    const logger = createLogger({ stream });

    await runThruntCommand(REPO_ROOT, ['state', '--raw'], TOOLS_PATH, { timeoutMs: 10_000, logger });

    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[0]!);
    expect(entry.category).toBe('subprocess');
    expect(entry.msg).toBe('exec');
    expect(entry.timedOut).toBe(false);
    expect(typeof entry.durationMs).toBe('number');
  }, 15_000);
});
