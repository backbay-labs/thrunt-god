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

// Load vscode mock so require('vscode') resolves in the bundle
require(path.join(__dirname, '_setup', 'vscode-mock.cjs'));

const BUNDLE_PATH = path.join(__dirname, '..', 'dist', 'extension.js');

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

  console.log('SMOKE PASS: dist/extension.js loads, exports activate and deactivate');
  process.exit(0);
} catch (err) {
  console.error(`SMOKE FAIL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
