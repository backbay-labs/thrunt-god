#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS = path.join(__dirname, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
const repoRoot = path.join(__dirname, '..');

const packLib = require('../thrunt-god/bin/lib/pack.cjs');
const registry = packLib.loadPackRegistry(repoRoot);

const results = [];
let allPassed = true;

for (const pack of registry.packs) {
  try {
    const output = execFileSync(
      process.execPath,
      [TOOLS, 'pack', 'test', pack.id],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(output.trim());
    results.push({
      id: pack.id,
      kind: pack.kind,
      test: parsed.valid === true,
      bootstrap_ok: parsed.packs?.[0]?.bootstrap_ok ?? false,
      render_ok: parsed.packs?.[0]?.render_ok ?? false,
    });
    if (parsed.valid !== true) {
      allPassed = false;
    }
  } catch (err) {
    allPassed = false;
    results.push({
      id: pack.id,
      kind: pack.kind,
      test: false,
      bootstrap_ok: false,
      render_ok: false,
      error: err.stderr?.toString().trim() || err.message,
    });
  }
}

const report = {
  timestamp: new Date().toISOString(),
  total: results.length,
  passed: results.filter(r => r.test).length,
  failed: results.filter(r => !r.test).length,
  packs: results,
};

fs.writeFileSync(
  path.join(repoRoot, 'pack-validation-report.json'),
  JSON.stringify(report, null, 2)
);

console.log(`Pack validation: ${report.passed}/${report.total} passed`);

if (!allPassed) {
  const failures = results.filter(r => !r.test);
  for (const f of failures) {
    console.error(`  FAIL ${f.id}${f.error ? ': ' + f.error : ''}`);
  }
  process.exit(1);
}
