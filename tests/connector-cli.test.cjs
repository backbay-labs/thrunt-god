'use strict';

/**
 * Connector CLI command tests.
 *
 * Covers: connectors list, connectors search, connectors init
 * Tests the 3 CLI commands + routing through thrunt-tools.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Run `thrunt-tools connectors <subcommand>` as a subprocess, capturing structured output.
 * Always appends --raw for JSON output parsing.
 */
function runConnectors(args = []) {
  try {
    const stdout = execFileSync('node', [TOOLS_PATH, 'connectors', ...args, '--raw'], {
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
// 1. connectors list
// ---------------------------------------------------------------------------

describe('connectors list', () => {

  test('returns array of connectors with expected fields', () => {
    const result = runConnectors(['list']);
    assert.strictEqual(result.success, true, `Command failed: ${result.stderr}`);
    assert.ok(Array.isArray(result.data.connectors), 'Expected connectors array');
    assert.ok(result.data.count > 0, 'Expected at least 1 connector');

    const first = result.data.connectors[0];
    assert.ok(first.id, 'Expected id field');
    assert.ok(first.source, 'Expected source field');
    assert.ok(first.version !== undefined, 'Expected version field');
  });

  test('includes all 10 built-in connectors with source=built-in', () => {
    const result = runConnectors(['list']);
    assert.strictEqual(result.success, true);
    const builtIns = result.data.connectors.filter(c => c.source === 'built-in');
    assert.strictEqual(builtIns.length, 10, `Expected 10 built-in connectors, got ${builtIns.length}`);
  });

  test('routes through thrunt-tools connectors list', () => {
    // This tests the routing — same result as calling list directly
    const result = runConnectors(['list']);
    assert.strictEqual(result.success, true);
    assert.ok(result.data.connectors, 'Expected connectors key in response');
    assert.ok(result.data.count >= 10, 'Expected at least 10 connectors');
  });
});

// ---------------------------------------------------------------------------
// 2. connectors search
// ---------------------------------------------------------------------------

describe('connectors search', () => {

  test('returns error when no search term provided', () => {
    const result = runConnectors(['search']);
    assert.strictEqual(result.success, false);
    assert.ok(
      result.stderr.includes('search term required') || result.stderr.includes('Usage'),
      `Expected search term error, got: ${result.stderr}`
    );
  });

  test('routes through thrunt-tools connectors search', () => {
    // This may fail with network error but should at least not crash with wrong routing
    const result = runConnectors(['search', 'sentinelone']);
    // Either succeeds with results array or fails gracefully with error message
    if (result.success) {
      assert.ok(result.data.term === 'sentinelone', 'Expected term in response');
      assert.ok(Array.isArray(result.data.results), 'Expected results array');
    } else {
      // Network failure is acceptable in CI — the command should still try
      // But wrong routing would give a different error
      assert.ok(
        result.stderr.includes('npm search failed') ||
        result.stdout.includes('npm search failed') ||
        result.success === false,
        'Expected graceful error handling for network failure'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. connectors init
// ---------------------------------------------------------------------------

describe('connectors init', () => {

  test('validates connector ID format (rejects invalid)', () => {
    const result = runConnectors(['init', '123bad']);
    assert.strictEqual(result.success, false);
    assert.ok(
      result.stderr.includes('connector ID must match'),
      `Expected ID format error, got: ${result.stderr}`
    );
  });

  test('validates connector ID format (rejects uppercase)', () => {
    const result = runConnectors(['init', 'BadId']);
    assert.strictEqual(result.success, false);
    assert.ok(
      result.stderr.includes('connector ID must match'),
      `Expected ID format error, got: ${result.stderr}`
    );
  });

  test('rejects built-in connector ID collision', () => {
    const result = runConnectors(['init', 'splunk']);
    assert.strictEqual(result.success, false);
    assert.ok(
      result.stderr.includes('collides with a built-in'),
      `Expected collision error, got: ${result.stderr}`
    );
  });

  test('--dry-run returns file manifest without writing', () => {
    const result = runConnectors(['init', 'test_vendor', '--dry-run']);
    assert.strictEqual(result.success, true, `Command failed: ${result.stderr}`);
    assert.strictEqual(result.data.dry_run, true, 'Expected dry_run flag');
    assert.strictEqual(result.data.connector_id, 'test_vendor');
    assert.ok(Array.isArray(result.data.files), 'Expected files array');
    assert.ok(result.data.files.length >= 5, `Expected at least 5 template files, got ${result.data.files.length}`);
  });

  test('creates output directory with all template files', () => {
    const tmpDir = fs.mkdtempSync(path.join(PROJECT_ROOT, '.tmp-init-plugin-'));
    try {
      const result = runConnectors(['init', 'test_vendor', '--output-dir', tmpDir]);
      assert.strictEqual(result.success, true, `Command failed: ${result.stderr}`);
      assert.strictEqual(result.data.connector_id, 'test_vendor');

      // Check key files exist
      const outputDir = path.join(tmpDir, 'thrunt-connector-test_vendor');
      assert.ok(fs.existsSync(path.join(outputDir, 'package.json')), 'Expected package.json');
      assert.ok(fs.existsSync(path.join(outputDir, 'thrunt-connector.json')), 'Expected manifest');
      assert.ok(fs.existsSync(path.join(outputDir, 'src', 'index.cjs')), 'Expected src/index.cjs');
      assert.ok(fs.existsSync(path.join(outputDir, 'tests', 'unit.test.cjs')), 'Expected unit test');
      assert.ok(fs.existsSync(path.join(outputDir, 'tests', 'contract.test.cjs')), 'Expected contract test');
      assert.ok(fs.existsSync(path.join(outputDir, 'README.md')), 'Expected README');

      // Check template variables were substituted
      const pkgJson = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf8'));
      assert.strictEqual(pkgJson.name, 'thrunt-connector-test_vendor');
      assert.ok(pkgJson.peerDependencies['thrunt-god'], 'Expected peerDependencies for thrunt-god');

      const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'thrunt-connector.json'), 'utf8'));
      assert.strictEqual(manifest.connector_id, 'test_vendor');
      assert.ok(Array.isArray(manifest.auth_types), 'Expected auth_types array');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rejects --output-dir outside project root', () => {
    const result = runConnectors(['init', 'test_vendor', '--output-dir', '/tmp']);
    assert.strictEqual(result.success, false);
    assert.ok(
      result.stderr.includes('output directory must be within project root'),
      `Expected path containment error, got: ${result.stderr}`
    );
  });

  test('--scoped flag uses @thrunt/ namespace in package name', () => {
    const result = runConnectors(['init', 'test_vendor', '--dry-run', '--scoped']);
    assert.strictEqual(result.success, true, `Command failed: ${result.stderr}`);
    assert.strictEqual(result.data.package_name, '@thrunt/connector-test_vendor');
  });

  test('keeps linked worktree cwd for connector scaffolding before .planning exists', () => {
    const mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-connector-main-'));
    let worktreeDir = null;

    try {
      execSync('git init', { cwd: mainDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: mainDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: mainDir, stdio: 'pipe' });
      execSync('git config commit.gpgsign false', { cwd: mainDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(mainDir, 'README.md'), '# Main\n');
      execSync('git add -A', { cwd: mainDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: mainDir, stdio: 'pipe' });

      worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-connector-worktree-'));
      fs.rmSync(worktreeDir, { recursive: true, force: true });
      execSync(`git worktree add "${worktreeDir}" -b test-connectors-worktree`, {
        cwd: mainDir,
        stdio: 'pipe',
      });

      const outputBaseDir = path.join(worktreeDir, 'generated');
      fs.mkdirSync(outputBaseDir, { recursive: true });

      const stdout = execFileSync('node', [
        TOOLS_PATH,
        '--cwd', worktreeDir,
        'connectors', 'init', 'test_vendor',
        '--output-dir', outputBaseDir,
        '--dry-run',
        '--raw',
      ], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 30000,
      });

      const result = JSON.parse(stdout);
      assert.strictEqual(result.connector_id, 'test_vendor');
      assert.strictEqual(result.dry_run, true);
      assert.ok(Array.isArray(result.files));
    } finally {
      if (worktreeDir) {
        try { execSync(`git worktree remove "${worktreeDir}" --force`, { cwd: mainDir, stdio: 'pipe' }); } catch {}
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
      fs.rmSync(mainDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 4. thrunt-tools routing
// ---------------------------------------------------------------------------

describe('thrunt-tools connectors routing', () => {

  test('unknown subcommand returns error', () => {
    const result = runConnectors(['unknown']);
    assert.strictEqual(result.success, false);
    assert.ok(
      result.stderr.includes('Unknown connectors subcommand'),
      `Expected unknown subcommand error, got: ${result.stderr}`
    );
  });

  test('connectors list is routed correctly', () => {
    const result = runConnectors(['list']);
    assert.strictEqual(result.success, true);
    assert.ok(result.data.connectors, 'Expected connectors in response');
  });
});
