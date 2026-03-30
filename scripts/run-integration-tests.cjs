#!/usr/bin/env node
// Integration test runner — discovers tests/integration/*.integration.test.cjs
// and runs them via node:test. Separate from unit test runner (run-tests.cjs).
'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const testDir = join(__dirname, '..', 'tests', 'integration');
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.integration.test.cjs'))
  .sort()
  .map(f => join('tests', 'integration', f));

if (files.length === 0) {
  console.error('No integration test files found in tests/integration/');
  process.exit(1);
}

try {
  execFileSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  process.exit(err.status || 1);
}
