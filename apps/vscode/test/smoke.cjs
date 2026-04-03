#!/usr/bin/env node
'use strict';

/**
 * CI Smoke Test -- BUILD-03
 * Validates that the extension host CJS bundle loads without error.
 * Catches CJS/ESM collision bugs, missing externals, and bundler regressions.
 *
 * The vscode module is mocked since this runs outside the VS Code runtime.
 * Only structural checks are performed (exports exist, correct types, no throw).
 *
 * Usage: node test/smoke.cjs
 * Exit 0 = success, Exit 1 = failure
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// Load vscode mock so require('vscode') resolves in the bundle
require(path.join(__dirname, '_setup', 'vscode-mock.cjs'));

const BUNDLE_PATH = path.join(__dirname, '..', 'dist', 'extension.js');
const CLI_PATH = path.join(__dirname, '..', 'dist', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
const BUNDLED_PACKAGE_JSON = path.join(__dirname, '..', 'dist', 'package.json');
const BUNDLED_AGENTS_DIR = path.join(__dirname, '..', 'dist', 'agents');
const BRUTE_FORCE_FIXTURE = path.join(__dirname, 'fixtures', 'brute-force-hunt');

function assertBundledRuntimeExists() {
  const requiredPaths = [CLI_PATH, BUNDLED_PACKAGE_JSON, BUNDLED_AGENTS_DIR];
  const missing = requiredPaths.filter(target => !fs.existsSync(target));

  if (missing.length > 0) {
    throw new Error(`Missing bundled THRUNT runtime assets: ${missing.join(', ')}`);
  }
}

function runBundledCliSmoke() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-vscode-smoke-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const planningRoot = path.join(workspaceRoot, '.planning');

  fs.mkdirSync(planningRoot, { recursive: true });
  fs.cpSync(BRUTE_FORCE_FIXTURE, planningRoot, { recursive: true });

  try {
    const stdout = execFileSync(
      process.execPath,
      [CLI_PATH, 'state', 'json', '--cwd', workspaceRoot],
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(stdout);

    if (parsed.milestone !== 'v1.0' || parsed.status !== 'completed') {
      throw new Error(`Unexpected bundled CLI output: ${stdout.trim()}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  const ext = require(BUNDLE_PATH);

  // Verify expected exports exist
  const required_exports = ['activate', 'deactivate'];
  const missing = required_exports.filter(name => typeof ext[name] !== 'function');

  if (missing.length > 0) {
    console.error(`SMOKE FAIL: Missing exports: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Verify deactivate() doesn't throw when called without context
  ext.deactivate();
  assertBundledRuntimeExists();
  runBundledCliSmoke();

  console.log('SMOKE PASS: extension bundle and bundled THRUNT CLI load successfully');
  process.exit(0);
} catch (err) {
  console.error(`SMOKE FAIL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
