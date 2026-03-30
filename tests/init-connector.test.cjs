'use strict';

/**
 * Connector scaffolder (thrunt-tools init connector) tests.
 *
 * Covers: input validation, dry-run mode, file generation, contract validation,
 * Docker integration generation, template engine, and manifest exports.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Run `thrunt-tools init connector` as a subprocess, capturing structured output.
 * Always appends --raw for JSON output parsing.
 */
function runInitConnector(args = []) {
  try {
    const stdout = execFileSync('node', [TOOLS_PATH, 'init', 'connector', ...args, '--raw'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    return { success: true, data: JSON.parse(stdout) };
  } catch (err) {
    return {
      success: false,
      stderr: (err.stderr || '').toString(),
      stdout: (err.stdout || '').toString(),
      exitCode: err.status,
    };
  }
}

// ---------------------------------------------------------------------------
// 1. Input validation
// ---------------------------------------------------------------------------

describe('init connector — input validation', () => {

  test('rejects invalid connector ID format (starts with digit)', () => {
    const result = runInitConnector(['123bad_id']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('connector ID must match'),
      `Expected ID format error, got: ${result.stderr}`
    );
  });

  test('rejects invalid connector ID format (contains uppercase)', () => {
    const result = runInitConnector(['Bad_Id']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('connector ID must match'),
      `Expected ID format error, got: ${result.stderr}`
    );
  });

  test('rejects existing built-in connector ID (splunk)', () => {
    const result = runInitConnector(['splunk']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('collides with a built-in connector'),
      `Expected collision error, got: ${result.stderr}`
    );
  });

  test('rejects invalid auth type', () => {
    const result = runInitConnector(['test_auth_bad', '--auth', 'notreal', '--dry-run']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Invalid auth type'),
      `Expected auth type error, got: ${result.stderr}`
    );
  });

  test('rejects invalid dataset kind', () => {
    const result = runInitConnector(['test_ds_bad', '--datasets', 'notreal', '--dry-run']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Invalid dataset kind'),
      `Expected dataset kind error, got: ${result.stderr}`
    );
  });

  test('rejects invalid pagination mode', () => {
    const result = runInitConnector(['test_pg_bad', '--pagination', 'notreal', '--dry-run']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Invalid pagination mode'),
      `Expected pagination error, got: ${result.stderr}`
    );
  });

  test('rejects --docker-image without --docker-port', () => {
    const result = runInitConnector(['test_docker_bad', '--docker-image', 'nginx:latest', '--dry-run']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('--docker-image requires --docker-port'),
      `Expected docker flag pairing error, got: ${result.stderr}`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Dry-run mode
// ---------------------------------------------------------------------------

describe('init connector — dry-run mode', () => {

  test('dry-run produces manifest without writing files', () => {
    const result = runInitConnector(['test_dryrun_check', '--dry-run']);
    assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

    const data = result.data;
    assert.strictEqual(data.dry_run, true);
    assert.strictEqual(data.connector_id, 'test_dryrun_check');
    assert.ok(Array.isArray(data.files), 'files should be an array');
    assert.ok(data.files.length >= 3, `Expected >= 3 files in manifest, got ${data.files.length}`);

    // Verify no files were actually written to disk
    const adapterPath = path.join(
      PROJECT_ROOT, 'thrunt-god', 'bin', 'lib', 'connectors', 'test_dryrun_check.cjs'
    );
    assert.strictEqual(
      fs.existsSync(adapterPath), false,
      'Dry-run should not create adapter file on disk'
    );
  });

  test('dry-run with Docker flags includes Docker files in manifest', () => {
    const result = runInitConnector([
      'test_dryrun_docker', '--dry-run',
      '--docker-image', 'nginx:latest', '--docker-port', '80',
    ]);
    assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

    const data = result.data;
    assert.strictEqual(data.dry_run, true);
    assert.ok(
      data.files.length >= 6,
      `Expected >= 6 files with Docker, got ${data.files.length}: ${JSON.stringify(data.files.map(f => f.path))}`
    );

    // Verify Docker-specific entries are present
    const paths = data.files.map(f => f.path);
    assert.ok(
      paths.some(p => p.includes('integration') && p.endsWith('.test.cjs')),
      'Should include integration test file'
    );
    assert.ok(
      paths.some(p => p.includes('docker-compose.yml')),
      'Should include docker-compose.yml append'
    );
    assert.ok(
      paths.some(p => p.includes('seed-data.cjs')),
      'Should include seed-data.cjs append'
    );
    assert.ok(
      paths.some(p => p.includes('helpers.cjs')),
      'Should include helpers.cjs append'
    );
  });
});
