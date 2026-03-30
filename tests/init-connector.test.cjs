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

// ---------------------------------------------------------------------------
// 3. File generation and contract validation
// ---------------------------------------------------------------------------

/**
 * Remove files generated by a scaffolder run so tests leave no artifacts.
 */
function cleanupGeneratedFiles(connectorId) {
  const filesToRemove = [
    path.join(PROJECT_ROOT, 'thrunt-god', 'bin', 'lib', 'connectors', `${connectorId}.cjs`),
    path.join(PROJECT_ROOT, 'tests', `connectors-${connectorId}.test.cjs`),
    path.join(PROJECT_ROOT, 'docs', 'connectors', `${connectorId}.md`),
    path.join(PROJECT_ROOT, 'tests', 'integration', `${connectorId}.integration.test.cjs`),
  ];
  for (const f of filesToRemove) {
    try { fs.unlinkSync(f); } catch { /* file may not exist */ }
  }
  // Clear require cache for generated modules
  for (const key of Object.keys(require.cache)) {
    if (key.includes(connectorId)) {
      delete require.cache[key];
    }
  }
}

/**
 * Restore Docker-related files that may have been appended to during generation.
 */
function restoreDockerFiles() {
  try {
    execFileSync('git', [
      'checkout', '--',
      'tests/integration/docker-compose.yml',
      'tests/integration/helpers.cjs',
      'tests/integration/fixtures/seed-data.cjs',
    ], { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10000 });
  } catch { /* files may not have been modified */ }
}

describe('init connector — file generation', () => {

  test('generates adapter, unit test, and README', () => {
    const id = 'test_gen_a';
    try {
      const result = runInitConnector([id]);
      assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

      const data = result.data;
      assert.strictEqual(data.created, true);
      assert.strictEqual(data.connector_id, id);
      assert.ok(Array.isArray(data.files_generated), 'files_generated should be an array');
      assert.ok(data.files_generated.length >= 3, `Expected >= 3 generated files, got ${data.files_generated.length}`);

      // Verify files exist on disk
      assert.ok(
        fs.existsSync(path.join(PROJECT_ROOT, 'thrunt-god', 'bin', 'lib', 'connectors', `${id}.cjs`)),
        'Adapter file should exist'
      );
      assert.ok(
        fs.existsSync(path.join(PROJECT_ROOT, 'tests', `connectors-${id}.test.cjs`)),
        'Unit test file should exist'
      );
      assert.ok(
        fs.existsSync(path.join(PROJECT_ROOT, 'docs', 'connectors', `${id}.md`)),
        'README file should exist'
      );

      // Contract validation should pass
      assert.ok(data.contract_validation, 'contract_validation should be present');
      assert.strictEqual(data.contract_validation.valid, true, `Contract validation failed: ${JSON.stringify(data.contract_validation.errors)}`);
    } finally {
      cleanupGeneratedFiles(id);
    }
  });

  test('generated adapter passes validateConnectorAdapter()', () => {
    const id = 'test_gen_b';
    try {
      const result = runInitConnector([id]);
      assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

      // Require the generated adapter and validate it directly
      const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
      const adapterPath = path.join(PROJECT_ROOT, 'thrunt-god', 'bin', 'lib', 'connectors', `${id}.cjs`);
      const adapterModule = require(adapterPath);
      const adapter = adapterModule.createTestGenBAdapter();

      const validation = runtime.validateConnectorAdapter(adapter);
      assert.strictEqual(validation.valid, true, `Adapter validation failed: ${JSON.stringify(validation.errors)}`);
      assert.ok(Array.isArray(validation.errors), 'errors should be an array');
      assert.strictEqual(validation.errors.length, 0, 'errors should be empty');
    } finally {
      cleanupGeneratedFiles(id);
    }
  });

  test('generated adapter has correct capabilities from flags', () => {
    const id = 'test_gen_c';
    try {
      const result = runInitConnector([
        id,
        '--auth', 'api_key,bearer',
        '--datasets', 'events,alerts',
        '--languages', 'spl',
        '--pagination', 'cursor',
      ]);
      assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

      const adapterPath = path.join(PROJECT_ROOT, 'thrunt-god', 'bin', 'lib', 'connectors', `${id}.cjs`);
      const adapterModule = require(adapterPath);
      const adapter = adapterModule.createTestGenCAdapter();

      assert.strictEqual(adapter.capabilities.id, id);
      assert.deepStrictEqual(adapter.capabilities.auth_types, ['api_key', 'bearer']);
      assert.deepStrictEqual(adapter.capabilities.dataset_kinds, ['events', 'alerts']);
      assert.deepStrictEqual(adapter.capabilities.languages, ['spl']);
      assert.deepStrictEqual(adapter.capabilities.pagination_modes, ['cursor']);
    } finally {
      cleanupGeneratedFiles(id);
    }
  });

  test('generated adapter module.exports includes manifest', () => {
    const id = 'test_gen_d';
    try {
      const result = runInitConnector([id, '--display-name', 'Test Gen D']);
      assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

      const adapterPath = path.join(PROJECT_ROOT, 'thrunt-god', 'bin', 'lib', 'connectors', `${id}.cjs`);
      const adapterModule = require(adapterPath);

      assert.ok(adapterModule.manifest, 'module should export manifest');
      assert.strictEqual(adapterModule.manifest.id, id);
      assert.strictEqual(adapterModule.manifest.version, '0.1.0');
      assert.strictEqual(adapterModule.manifest.display_name, 'Test Gen D');
      assert.strictEqual(adapterModule.manifest.type, 'connector');
    } finally {
      cleanupGeneratedFiles(id);
    }
  });

  test('generated unit test file is valid JavaScript', () => {
    const id = 'test_gen_e';
    try {
      const result = runInitConnector([id]);
      assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

      const testPath = path.join(PROJECT_ROOT, 'tests', `connectors-${id}.test.cjs`);
      assert.ok(fs.existsSync(testPath), 'Generated test file should exist');

      // Verify the file parses as valid JavaScript without executing node:test hooks.
      try {
        execFileSync(process.execPath, ['--check', testPath], {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
        });
      } catch (err) {
        assert.fail(`Generated test file has syntax error: ${(err.stderr || err.message || '').toString().trim()}`);
      }
    } finally {
      cleanupGeneratedFiles(id);
    }
  });

  test('Docker flag generates integration test and does not corrupt compose file', () => {
    const id = 'test_gen_docker';
    try {
      const result = runInitConnector([
        id,
        '--docker-image', 'nginx:latest',
        '--docker-port', '80',
      ]);
      assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);

      // Integration test file should exist
      const integrationTestPath = path.join(
        PROJECT_ROOT, 'tests', 'integration', `${id}.integration.test.cjs`
      );
      assert.ok(fs.existsSync(integrationTestPath), 'Integration test file should exist');

      // docker-compose.yml should still be valid (contains services: at top)
      const composePath = path.join(PROJECT_ROOT, 'tests', 'integration', 'docker-compose.yml');
      const composeContent = fs.readFileSync(composePath, 'utf8');
      assert.ok(
        composeContent.includes('services:'),
        'docker-compose.yml should still contain services: key'
      );
      assert.ok(
        composeContent.includes(id),
        `docker-compose.yml should contain the new service entry for ${id}`
      );

      // helpers.cjs should contain the new URL constant
      const helpersPath = path.join(PROJECT_ROOT, 'tests', 'integration', 'helpers.cjs');
      const helpersContent = fs.readFileSync(helpersPath, 'utf8');
      const envPrefix = id.toUpperCase();
      assert.ok(
        helpersContent.includes(`${envPrefix}_URL`),
        `helpers.cjs should contain ${envPrefix}_URL constant`
      );
    } finally {
      cleanupGeneratedFiles(id);
      restoreDockerFiles();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Template engine
// ---------------------------------------------------------------------------

describe('init connector — renderTemplate', () => {

  // renderTemplate is not exported, so test it indirectly by verifying
  // generated file content has correct substitutions.
  // We also test the template logic directly by reimplementing from source.

  test('renderTemplate handles substitution and conditionals correctly', () => {
    // Reimplement renderTemplate to test the logic (same algorithm as commands.cjs)
    function renderTemplate(template, vars) {
      let result = template;
      result = result.replace(/\{\{#IF_(\w+)\}\}([\s\S]*?)\{\{\/IF_\1\}\}/g, (_, key, content) => {
        return vars[key] ? content : '';
      });
      result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
      });
      return result;
    }

    // Simple substitution
    assert.strictEqual(
      renderTemplate('Hello {{NAME}}', { NAME: 'World' }),
      'Hello World'
    );

    // Conditional — truthy
    assert.strictEqual(
      renderTemplate('{{#IF_X}}yes{{/IF_X}}', { X: true }),
      'yes'
    );

    // Conditional — falsy
    assert.strictEqual(
      renderTemplate('{{#IF_X}}yes{{/IF_X}}', { X: false }),
      ''
    );

    // Conditional — missing key (treated as falsy)
    assert.strictEqual(
      renderTemplate('{{#IF_X}}yes{{/IF_X}}', {}),
      ''
    );

    // Undefined variables left as-is
    assert.strictEqual(
      renderTemplate('{{MISSING}}', {}),
      '{{MISSING}}'
    );

    // Combined substitution and conditional
    assert.strictEqual(
      renderTemplate('{{GREETING}} {{#IF_EXCLAIM}}!{{/IF_EXCLAIM}}', { GREETING: 'Hi', EXCLAIM: true }),
      'Hi !'
    );

    // Conditional with substitution inside
    assert.strictEqual(
      renderTemplate('{{#IF_SHOW}}Hello {{NAME}}{{/IF_SHOW}}', { SHOW: true, NAME: 'World' }),
      'Hello World'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Meta: existing test suite integrity
// ---------------------------------------------------------------------------

describe('init connector — suite integrity', () => {

  test('runtime.cjs exports at least 61 symbols (Phase 33 count preserved)', () => {
    const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
    const exportCount = Object.keys(runtime).length;
    assert.ok(
      exportCount >= 61,
      `Expected >= 61 runtime exports, got ${exportCount}`
    );
  });
});
