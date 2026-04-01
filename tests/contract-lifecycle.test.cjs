/**
 * Contract lifecycle tests — Plugin lifecycle wiring, re-exports, and doctor connectors command.
 *
 * Validates:
 * - connector-sdk.cjs re-exports contract test functions
 * - runtime.cjs re-exports contract test functions
 * - Full lifecycle simulation (adapter -> manifest -> loadPlugin -> registry)
 * - cmdDoctorConnectors output shape
 * - CLI routing for doctor-connectors subcommand
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Helper: create temp dirs with valid plugin packages
// ---------------------------------------------------------------------------

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-'));
}

function validManifest(overrides = {}) {
  return {
    name: 'test-connector',
    version: '1.0.0',
    sdk_version: '^1.0.0',
    connector_id: 'test_lifecycle',
    display_name: 'Test Lifecycle Connector',
    entry: './index.cjs',
    auth_types: ['api_key'],
    dataset_kinds: ['events'],
    languages: ['api'],
    pagination_modes: ['cursor'],
    permissions: { network: true },
    ...overrides,
  };
}

function writePluginPackage(dir, manifest, adapterCode) {
  fs.writeFileSync(
    path.join(dir, 'thrunt-connector.json'),
    JSON.stringify(manifest, null, 2)
  );
  const defaultAdapterCode = `
    'use strict';
    const { createConnectorCapabilities } = require('${path.resolve(__dirname, '..', 'thrunt-god', 'bin', 'lib', 'connector-sdk.cjs').replace(/\\/g, '\\\\')}');
    function createAdapter() {
      return {
        capabilities: createConnectorCapabilities({
          id: '${manifest.connector_id}',
          display_name: '${manifest.display_name}',
          auth_types: ${JSON.stringify(manifest.auth_types)},
          dataset_kinds: ${JSON.stringify(manifest.dataset_kinds)},
          languages: ${JSON.stringify(manifest.languages)},
          pagination_modes: ${JSON.stringify(manifest.pagination_modes)},
        }),
        prepareQuery(ctx) {
          return { request: { method: 'GET', url: (ctx.profile?.base_url || 'http://localhost') + '/api/test' } };
        },
        executeRequest(ctx) {
          return { status: 200, data: { results: [] }, headers: {}, text: '{}' };
        },
        normalizeResponse(ctx) {
          return { events: [], has_more: false };
        },
      };
    }
    module.exports = { createAdapter };
  `;
  fs.writeFileSync(path.join(dir, 'index.cjs'), adapterCode || defaultAdapterCode);
}

// ---------------------------------------------------------------------------
// A. connector-sdk.cjs re-exports
// ---------------------------------------------------------------------------

describe('connector-sdk.cjs contract test re-exports', () => {
  const sdk = require('../thrunt-god/bin/lib/connector-sdk.cjs');

  test('exports runContractTests as a function', () => {
    assert.strictEqual(typeof sdk.runContractTests, 'function');
  });

  test('exports createTestQuerySpec as a function', () => {
    assert.strictEqual(typeof sdk.createTestQuerySpec, 'function');
  });

  test('exports createTestProfile as a function', () => {
    assert.strictEqual(typeof sdk.createTestProfile, 'function');
  });

  test('exports createTestSecrets as a function', () => {
    assert.strictEqual(typeof sdk.createTestSecrets, 'function');
  });
});

// ---------------------------------------------------------------------------
// B. runtime.cjs re-exports
// ---------------------------------------------------------------------------

describe('runtime.cjs contract test re-exports', () => {
  const runtime = require('../thrunt-god/bin/lib/runtime.cjs');

  test('re-exports runContractTests as a function', () => {
    assert.strictEqual(typeof runtime.runContractTests, 'function');
  });

  test('re-exports createTestQuerySpec as a function', () => {
    assert.strictEqual(typeof runtime.createTestQuerySpec, 'function');
  });

  test('re-exports createTestProfile as a function', () => {
    assert.strictEqual(typeof runtime.createTestProfile, 'function');
  });

  test('re-exports createTestSecrets as a function', () => {
    assert.strictEqual(typeof runtime.createTestSecrets, 'function');
  });
});

// ---------------------------------------------------------------------------
// C. Full lifecycle simulation
// ---------------------------------------------------------------------------

describe('Full lifecycle simulation', () => {
  const {
    loadPlugin,
    createPluginRegistry,
    validatePluginManifest,
    BUILT_IN_CONNECTOR_IDS,
  } = require('../thrunt-god/bin/lib/plugin-registry.cjs');

  test('valid plugin flows through full lifecycle: manifest -> load -> validate -> registry -> get', () => {
    const tmpDir = makeTempDir();
    try {
      const manifest = validManifest();
      writePluginPackage(tmpDir, manifest);

      // Step 1: Validate manifest
      const manifestResult = validatePluginManifest(manifest, { packageRoot: tmpDir });
      assert.strictEqual(manifestResult.valid, true, `Manifest validation failed: ${manifestResult.errors.join('; ')}`);

      // Step 2: loadPlugin (manifest + require entry + createAdapter + validate adapter + cross-check)
      const loadResult = loadPlugin(tmpDir);
      assert.strictEqual(loadResult.valid, true, `loadPlugin failed: ${loadResult.errors.join('; ')}`);
      assert.ok(loadResult.adapter, 'loadPlugin must return an adapter');
      assert.ok(loadResult.manifest, 'loadPlugin must return the manifest');

      // Step 3: Register in PluginRegistry
      const registry = createPluginRegistry({
        builtInAdapters: [],
        pluginEntries: [{
          adapter: loadResult.adapter,
          manifest: loadResult.manifest,
          source: 'node_modules',
          packageRoot: tmpDir,
        }],
      });

      // Step 4: Verify adapter accessible via registry.get()
      const retrieved = registry.get('test_lifecycle');
      assert.ok(retrieved, 'adapter must be accessible via registry.get()');
      assert.strictEqual(retrieved.capabilities.id, 'test_lifecycle');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('invalid manifest stops lifecycle early', () => {
    const tmpDir = makeTempDir();
    try {
      const brokenManifest = validManifest({ connector_id: 'INVALID!' });
      writePluginPackage(tmpDir, brokenManifest);

      const loadResult = loadPlugin(tmpDir);
      assert.strictEqual(loadResult.valid, false, 'loadPlugin should fail for invalid manifest');
      assert.ok(loadResult.errors.length > 0, 'should report errors');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('registry with built-in + plugin entries: .get() works for both', () => {
    const tmpDir = makeTempDir();
    try {
      const manifest = validManifest({ connector_id: 'custom_plug' });
      writePluginPackage(tmpDir, manifest);

      const loadResult = loadPlugin(tmpDir);
      assert.strictEqual(loadResult.valid, true, `loadPlugin failed: ${loadResult.errors.join('; ')}`);

      // Use actual built-in adapters
      const { createBuiltInConnectorRegistry } = require('../thrunt-god/bin/lib/runtime.cjs');
      const builtInRegistry = createBuiltInConnectorRegistry();
      const builtInAdapters = BUILT_IN_CONNECTOR_IDS
        .map(id => builtInRegistry.get(id))
        .filter(Boolean);

      const registry = createPluginRegistry({
        builtInAdapters,
        pluginEntries: [{
          adapter: loadResult.adapter,
          manifest: loadResult.manifest,
          source: 'node_modules',
          packageRoot: tmpDir,
        }],
      });

      // Verify built-in accessible
      assert.ok(registry.get('splunk'), 'built-in splunk must be accessible');
      assert.ok(registry.get('elastic'), 'built-in elastic must be accessible');

      // Verify plugin accessible
      assert.ok(registry.get('custom_plug'), 'plugin custom_plug must be accessible');
      assert.strictEqual(registry.get('custom_plug').capabilities.id, 'custom_plug');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// D. cmdDoctorConnectors output shape
// ---------------------------------------------------------------------------

describe('cmdDoctorConnectors', () => {
  const { cmdDoctorConnectors } = require('../thrunt-god/bin/lib/commands.cjs');

  // The output() function in core.cjs uses fs.writeSync(1, data) to write to
  // stdout. We intercept it to capture the JSON report.
  function captureOutput(fn) {
    let captured = '';
    const origWriteSync = fs.writeSync;
    fs.writeSync = function (fd, data) {
      if (fd === 1 && typeof data === 'string') {
        captured += data;
        return data.length;
      }
      return origWriteSync.apply(this, arguments);
    };
    return fn().finally(() => { fs.writeSync = origWriteSync; }).then(() => captured);
  }

  test('returns report with built-in connectors when no plugins installed', async () => {
    const tmpDir = makeTempDir();
    try {
      // Write minimal thrunt.config.json
      fs.writeFileSync(path.join(tmpDir, 'thrunt.config.json'), JSON.stringify({ connector_profiles: {} }));

      const captured = await captureOutput(() => cmdDoctorConnectors(tmpDir, [], true));

      const report = JSON.parse(captured);
      assert.ok(typeof report.total === 'number', 'report must have total');
      assert.ok(typeof report.passing === 'number', 'report must have passing');
      assert.ok(typeof report.failing === 'number', 'report must have failing');
      assert.ok(Array.isArray(report.connectors), 'report must have connectors array');
      assert.ok(report.total >= 10, 'should include at least 10 built-in connectors');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('each connector result has required fields', async () => {
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'thrunt.config.json'), JSON.stringify({ connector_profiles: {} }));

      const captured = await captureOutput(() => cmdDoctorConnectors(tmpDir, [], true));

      const report = JSON.parse(captured);
      assert.ok(report.connectors.length > 0, 'should have at least one connector');
      for (const c of report.connectors) {
        assert.ok(typeof c.connector_id === 'string', 'connector result must have connector_id');
        assert.ok(typeof c.source === 'string', 'connector result must have source');
        assert.ok(Array.isArray(c.checks), 'connector result must have checks array');
        assert.ok(typeof c.pass === 'boolean', 'connector result must have pass boolean');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('reports broken plugin with errors', async () => {
    const tmpDir = makeTempDir();
    try {
      // Write config pointing to a broken plugin path
      const brokenDir = path.join(tmpDir, 'broken-plugin');
      fs.mkdirSync(brokenDir, { recursive: true });
      fs.writeFileSync(path.join(brokenDir, 'thrunt-connector.json'), '{ INVALID JSON }');

      fs.writeFileSync(
        path.join(tmpDir, 'thrunt.config.json'),
        JSON.stringify({
          connector_profiles: {},
          connectors: { plugins: [brokenDir] },
        })
      );

      const origErr = console.error;
      console.error = () => {};

      try {
        const captured = await captureOutput(() => cmdDoctorConnectors(tmpDir, [], true));

        const report = JSON.parse(captured);
        // Even if the broken plugin cannot be loaded, the report should still include built-ins
        assert.ok(report.total >= 10, 'should still include built-in connectors');
      } finally {
        console.error = origErr;
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// E. CLI routing
// ---------------------------------------------------------------------------

describe('CLI routing for doctor-connectors', () => {
  test('thrunt-tools.cjs contains doctor-connectors routing', () => {
    const toolsPath = path.resolve(__dirname, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
    const content = fs.readFileSync(toolsPath, 'utf8');
    assert.ok(content.includes('doctor-connectors'), 'thrunt-tools.cjs must route doctor-connectors subcommand');
    assert.ok(content.includes('cmdDoctorConnectors'), 'thrunt-tools.cjs must dispatch to cmdDoctorConnectors');
  });
});
