/**
 * Plugin manifest validation and loading tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  BUILT_IN_CONNECTOR_IDS,
  validatePluginManifest,
  loadPluginManifest,
  loadPlugin,
  createPluginRegistry,
  discoverPlugins,
  _scanNodeModules,
} = require('../thrunt-god/bin/lib/plugin-registry.cjs');

// -- Helpers --

function validManifest(overrides = {}) {
  return {
    name: 'my-connector',
    version: '1.0.0',
    sdk_version: '^1.0.0',
    connector_id: 'my_connector',
    display_name: 'My Connector',
    entry: './index.cjs',
    auth_types: ['api_key'],
    dataset_kinds: ['events'],
    languages: ['spl'],
    pagination_modes: ['cursor'],
    permissions: { network: true },
    ...overrides,
  };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-reg-'));
}

// -- BUILT_IN_CONNECTOR_IDS --

describe('BUILT_IN_CONNECTOR_IDS', () => {
  test('contains exactly 10 built-in connector IDs', () => {
    assert.strictEqual(BUILT_IN_CONNECTOR_IDS.length, 10);
    const expected = ['splunk', 'elastic', 'sentinel', 'opensearch', 'defender_xdr', 'okta', 'm365', 'crowdstrike', 'aws', 'gcp'];
    for (const id of expected) {
      assert.ok(BUILT_IN_CONNECTOR_IDS.includes(id), `Missing built-in ID: ${id}`);
    }
  });

  test('is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(BUILT_IN_CONNECTOR_IDS));
  });
});

// -- validatePluginManifest --

describe('validatePluginManifest', () => {
  test('rejects empty manifest with all missing required fields', () => {
    const result = validatePluginManifest({});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0, 'should have errors for missing fields');
    // Should mention multiple missing fields
    const errorText = result.errors.join(' ');
    assert.ok(errorText.includes('name'), 'should mention missing name');
    assert.ok(errorText.includes('version'), 'should mention missing version');
    assert.ok(errorText.includes('connector_id'), 'should mention missing connector_id');
  });

  test('rejects connector_id with invalid characters', () => {
    const result = validatePluginManifest(validManifest({ connector_id: 'INVALID!' }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /connector_id must match/.test(e)));
  });

  test('accepts connector_id with 2 characters (min valid length)', () => {
    const result = validatePluginManifest(validManifest({ connector_id: 'ab' }));
    // Should not have connector_id regex errors
    const idErrors = result.errors.filter(e => /connector_id must match/.test(e));
    assert.strictEqual(idErrors.length, 0, 'ab should be valid connector_id');
  });

  test('rejects connector_id starting with digit', () => {
    const result = validatePluginManifest(validManifest({ connector_id: '9bad' }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /connector_id must match/.test(e)));
  });

  test('rejects non-semver sdk_version', () => {
    const result = validatePluginManifest(validManifest({ sdk_version: 'not-semver' }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /sdk_version.*semver/i.test(e)));
  });

  test('accepts valid semver range sdk_version ^1.0.0', () => {
    const result = validatePluginManifest(validManifest({ sdk_version: '^1.0.0' }));
    const sdkErrors = result.errors.filter(e => /sdk_version/i.test(e));
    assert.strictEqual(sdkErrors.length, 0, '^1.0.0 should be valid sdk_version');
  });

  test('rejects entry pointing to non-existent file when packageRoot provided', () => {
    const tmpDir = makeTempDir();
    try {
      const result = validatePluginManifest(
        validManifest({ entry: './missing.cjs' }),
        { packageRoot: tmpDir }
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /entry.*exist/i.test(e)));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('accepts entry pointing to existing file when packageRoot provided', () => {
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'index.cjs'), 'module.exports = {}');
      const result = validatePluginManifest(
        validManifest({ entry: './index.cjs' }),
        { packageRoot: tmpDir }
      );
      const entryErrors = result.errors.filter(e => /entry.*exist/i.test(e));
      assert.strictEqual(entryErrors.length, 0, 'existing entry file should pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rejects invalid auth_types', () => {
    const result = validatePluginManifest(validManifest({ auth_types: ['api_key', 'bogus'] }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /auth_types.*bogus/i.test(e)));
  });

  test('rejects invalid dataset_kinds', () => {
    const result = validatePluginManifest(validManifest({ dataset_kinds: ['events', 'fake'] }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /dataset_kinds.*fake/i.test(e)));
  });

  test('rejects invalid pagination_modes', () => {
    const result = validatePluginManifest(validManifest({ pagination_modes: ['cursor', 'nope'] }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /pagination_modes.*nope/i.test(e)));
  });

  test('warns when connector_id collides with built-in (not an error)', () => {
    const result = validatePluginManifest(validManifest({ connector_id: 'splunk' }));
    // Should be a WARNING not an error
    assert.ok(result.warnings.some(w => /collides.*built-in/i.test(w)),
      'should warn about collision');
    // connector_id collision alone should not cause invalid
    const idErrors = result.errors.filter(e => /collides/i.test(e));
    assert.strictEqual(idErrors.length, 0, 'collision should not be an error');
  });

  test('rejects manifest without permissions object', () => {
    const m = validManifest();
    delete m.permissions;
    const result = validatePluginManifest(m);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /permissions.*required/i.test(e)));
  });

  test('accepts fully valid manifest', () => {
    const result = validatePluginManifest(validManifest());
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
    assert.ok(Array.isArray(result.warnings));
  });
});

// -- loadPluginManifest --

describe('loadPluginManifest', () => {
  test('reads and validates thrunt-connector.json from package root', () => {
    const tmpDir = makeTempDir();
    try {
      const manifest = validManifest();
      fs.writeFileSync(path.join(tmpDir, 'thrunt-connector.json'), JSON.stringify(manifest));
      fs.writeFileSync(path.join(tmpDir, 'index.cjs'), 'module.exports = {}');
      const result = loadPluginManifest(tmpDir);
      assert.strictEqual(result.valid, true);
      assert.ok(result.manifest);
      assert.strictEqual(result.manifest.connector_id, 'my_connector');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns error when thrunt-connector.json does not exist', () => {
    const tmpDir = makeTempDir();
    try {
      const result = loadPluginManifest(path.join(tmpDir, 'nonexistent'));
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /thrunt-connector\.json/i.test(e)));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns error when thrunt-connector.json contains invalid JSON', () => {
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'thrunt-connector.json'), 'not valid json {{{');
      const result = loadPluginManifest(tmpDir);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// -- loadPlugin --

describe('loadPlugin', () => {
  test('loads entry module, validates adapter, and returns result', () => {
    const tmpDir = makeTempDir();
    try {
      const manifest = validManifest({
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        pagination_modes: ['cursor'],
      });
      fs.writeFileSync(path.join(tmpDir, 'thrunt-connector.json'), JSON.stringify(manifest));

      // Create a minimal adapter module
      const adapterCode = `
'use strict';
const sdk = require('${require.resolve('../thrunt-god/bin/lib/connector-sdk.cjs').replace(/\\/g, '\\\\')}');
module.exports = {
  createAdapter() {
    return {
      capabilities: sdk.createConnectorCapabilities({
        id: 'my_connector',
        display_name: 'My Connector',
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        languages: ['spl'],
        pagination_modes: ['cursor'],
      }),
      prepareQuery(spec) { return spec; },
      executeRequest(req) { return { status: 200, body: {} }; },
      normalizeResponse(resp) { return { events: [] }; },
    };
  },
};
`;
      fs.writeFileSync(path.join(tmpDir, 'index.cjs'), adapterCode);

      const result = loadPlugin(tmpDir);
      assert.strictEqual(result.valid, true);
      assert.ok(result.adapter, 'should return adapter');
      assert.ok(result.manifest, 'should return manifest');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('cross-check: adapter capabilities not matching manifest produces error', () => {
    const tmpDir = makeTempDir();
    try {
      // Manifest declares bearer auth, but adapter only supports api_key
      const manifest = validManifest({
        auth_types: ['api_key', 'bearer'],
        dataset_kinds: ['events'],
        pagination_modes: ['cursor'],
      });
      fs.writeFileSync(path.join(tmpDir, 'thrunt-connector.json'), JSON.stringify(manifest));

      const adapterCode = `
'use strict';
const sdk = require('${require.resolve('../thrunt-god/bin/lib/connector-sdk.cjs').replace(/\\/g, '\\\\')}');
module.exports = {
  createAdapter() {
    return {
      capabilities: sdk.createConnectorCapabilities({
        id: 'my_connector',
        display_name: 'My Connector',
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        languages: ['spl'],
        pagination_modes: ['cursor'],
      }),
      prepareQuery(spec) { return spec; },
      executeRequest(req) { return { status: 200, body: {} }; },
      normalizeResponse(resp) { return { events: [] }; },
    };
  },
};
`;
      fs.writeFileSync(path.join(tmpDir, 'index.cjs'), adapterCode);

      const result = loadPlugin(tmpDir);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /auth_type/i.test(e) || /bearer/i.test(e)),
        'should report auth_types mismatch');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns error when entry module has no createAdapter export', () => {
    const tmpDir = makeTempDir();
    try {
      const manifest = validManifest();
      fs.writeFileSync(path.join(tmpDir, 'thrunt-connector.json'), JSON.stringify(manifest));
      fs.writeFileSync(path.join(tmpDir, 'index.cjs'), 'module.exports = {};');

      const result = loadPlugin(tmpDir);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /createAdapter/i.test(e)));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Helper: create a mock plugin directory with valid adapter
// ---------------------------------------------------------------------------

const sdkPath = require.resolve('../thrunt-god/bin/lib/connector-sdk.cjs').replace(/\\/g, '\\\\');

function createMockPluginDir(connectorId, overrides = {}) {
  const tmpDir = makeTempDir();
  const manifest = validManifest({
    connector_id: connectorId,
    display_name: `Test ${connectorId}`,
    ...overrides,
  });
  fs.writeFileSync(path.join(tmpDir, 'thrunt-connector.json'), JSON.stringify(manifest));

  const adapterCode = `
'use strict';
const sdk = require('${sdkPath}');
module.exports = {
  createAdapter() {
    return {
      capabilities: sdk.createConnectorCapabilities({
        id: '${connectorId}',
        display_name: 'Test ${connectorId}',
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        languages: ['spl'],
        pagination_modes: ['cursor'],
      }),
      prepareQuery(spec) { return spec; },
      executeRequest(req) { return { status: 200, body: {} }; },
      normalizeResponse(resp) { return { events: [] }; },
    };
  },
};
`;
  fs.writeFileSync(path.join(tmpDir, 'index.cjs'), adapterCode);
  return tmpDir;
}

// -- createPluginRegistry --

describe('createPluginRegistry', () => {
  test('with zero adapters and zero plugins returns registry with all methods', () => {
    const reg = createPluginRegistry({ builtInAdapters: [], pluginEntries: [] });
    assert.strictEqual(typeof reg.get, 'function');
    assert.strictEqual(typeof reg.has, 'function');
    assert.strictEqual(typeof reg.list, 'function');
    assert.strictEqual(typeof reg.getPluginInfo, 'function');
    assert.strictEqual(typeof reg.listPlugins, 'function');
    assert.strictEqual(typeof reg.isBuiltIn, 'function');
    assert.strictEqual(typeof reg.isOverridden, 'function');
    assert.strictEqual(typeof reg.register, 'function');
    assert.deepStrictEqual(reg.list(), []);
    assert.deepStrictEqual(reg.listPlugins(), []);
  });

  test('with built-in adapters: isBuiltIn returns true, getPluginInfo has source built-in', () => {
    const rt = require('../thrunt-god/bin/lib/runtime.cjs');
    const builtInRegistry = rt.createBuiltInConnectorRegistry();
    const builtInAdapters = BUILT_IN_CONNECTOR_IDS.map(id => builtInRegistry.get(id));

    const reg = createPluginRegistry({ builtInAdapters, pluginEntries: [] });
    assert.strictEqual(reg.isBuiltIn('splunk'), true);
    assert.strictEqual(reg.isBuiltIn('elastic'), true);
    const info = reg.getPluginInfo('splunk');
    assert.ok(info);
    assert.strictEqual(info.source, 'built-in');
    assert.strictEqual(info.connector_id, 'splunk');
  });

  test('with a plugin adapter: isBuiltIn returns false, source matches', () => {
    const pluginDir = createMockPluginDir('custom_siem');
    try {
      const pluginResult = loadPlugin(pluginDir);
      assert.strictEqual(pluginResult.valid, true);

      const reg = createPluginRegistry({
        builtInAdapters: [],
        pluginEntries: [{
          adapter: pluginResult.adapter,
          manifest: pluginResult.manifest,
          source: 'config-path',
          packageRoot: pluginDir,
        }],
      });

      assert.strictEqual(reg.isBuiltIn('custom_siem'), false);
      assert.strictEqual(reg.has('custom_siem'), true);
      const info = reg.getPluginInfo('custom_siem');
      assert.strictEqual(info.source, 'config-path');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  test('plugin overriding splunk: isOverridden returns true, get returns plugin adapter', () => {
    const rt = require('../thrunt-god/bin/lib/runtime.cjs');
    const builtInRegistry = rt.createBuiltInConnectorRegistry();
    const builtInAdapters = BUILT_IN_CONNECTOR_IDS.map(id => builtInRegistry.get(id));

    const pluginDir = createMockPluginDir('splunk');
    try {
      const pluginResult = loadPlugin(pluginDir);
      assert.strictEqual(pluginResult.valid, true);

      const reg = createPluginRegistry({
        builtInAdapters,
        pluginEntries: [{
          adapter: pluginResult.adapter,
          manifest: pluginResult.manifest,
          source: 'config-override',
          packageRoot: pluginDir,
        }],
      });

      assert.strictEqual(reg.isOverridden('splunk'), true);
      assert.strictEqual(reg.isBuiltIn('splunk'), false);
      // get() should return the plugin adapter, not built-in
      const adapter = reg.get('splunk');
      assert.ok(adapter);
      assert.strictEqual(adapter.capabilities.id, 'splunk');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  test('listPlugins returns PluginInfo array with correct sources', () => {
    const rt = require('../thrunt-god/bin/lib/runtime.cjs');
    const builtInRegistry = rt.createBuiltInConnectorRegistry();
    const builtInAdapters = BUILT_IN_CONNECTOR_IDS.map(id => builtInRegistry.get(id));

    const pluginDir = createMockPluginDir('custom_siem');
    try {
      const pluginResult = loadPlugin(pluginDir);

      const reg = createPluginRegistry({
        builtInAdapters,
        pluginEntries: [{
          adapter: pluginResult.adapter,
          manifest: pluginResult.manifest,
          source: 'node_modules',
          packageRoot: pluginDir,
        }],
      });

      const plugins = reg.listPlugins();
      assert.ok(Array.isArray(plugins));
      // 10 built-in + 1 plugin = 11
      assert.strictEqual(plugins.length, 11);

      const builtInInfos = plugins.filter(p => p.source === 'built-in');
      assert.strictEqual(builtInInfos.length, 10);

      const pluginInfos = plugins.filter(p => p.source === 'node_modules');
      assert.strictEqual(pluginInfos.length, 1);
      assert.strictEqual(pluginInfos[0].connector_id, 'custom_siem');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  test('getPluginInfo returns null for unknown id', () => {
    const reg = createPluginRegistry({ builtInAdapters: [], pluginEntries: [] });
    assert.strictEqual(reg.getPluginInfo('nonexistent'), null);
  });

  test('register adds a new adapter with its PluginInfo', () => {
    const reg = createPluginRegistry({ builtInAdapters: [], pluginEntries: [] });
    const pluginDir = createMockPluginDir('dynamic_plugin');
    try {
      const pluginResult = loadPlugin(pluginDir);
      reg.register(pluginResult.adapter, {
        connector_id: 'dynamic_plugin',
        source: 'config-path',
        package_name: null,
        manifest_path: null,
        version: '1.0.0',
        sdk_version_range: '^1.0.0',
        sdk_compatible: true,
        permissions: { network: true },
      });

      assert.strictEqual(reg.has('dynamic_plugin'), true);
      assert.strictEqual(reg.getPluginInfo('dynamic_plugin').source, 'config-path');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });
});

// -- discoverPlugins --

describe('discoverPlugins', () => {
  test('with includeBuiltIn=true and no plugins returns same IDs as createBuiltInConnectorRegistry', () => {
    const rt = require('../thrunt-god/bin/lib/runtime.cjs');
    const builtIn = rt.createBuiltInConnectorRegistry();
    const pluginReg = discoverPlugins({ includeBuiltIn: true });

    const builtInIds = builtIn.list().map(c => c.id).sort();
    const pluginIds = pluginReg.list().map(c => c.id).sort();
    assert.deepStrictEqual(pluginIds, builtInIds);
  });

  test('with config.plugins pointing to mock plugin dir: plugin registered with source config-path', () => {
    const pluginDir = createMockPluginDir('custom_connector');
    try {
      const reg = discoverPlugins({
        includeBuiltIn: false,
        config: { connectors: { plugins: [pluginDir] } },
      });

      assert.strictEqual(reg.has('custom_connector'), true);
      const info = reg.getPluginInfo('custom_connector');
      assert.strictEqual(info.source, 'config-path');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  test('with config.overrides mapping splunk to mock plugin: splunk is overridden', () => {
    const pluginDir = createMockPluginDir('splunk');
    try {
      const reg = discoverPlugins({
        includeBuiltIn: true,
        config: { connectors: { overrides: { splunk: pluginDir } } },
      });

      assert.strictEqual(reg.isOverridden('splunk'), true);
      assert.strictEqual(reg.has('splunk'), true);
      const info = reg.getPluginInfo('splunk');
      assert.strictEqual(info.source, 'config-override');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  test('override with mismatched connector_id is skipped', () => {
    const pluginDir = createMockPluginDir('wrong_id');
    try {
      // Override key says 'splunk' but plugin has connector_id 'wrong_id'
      const origError = console.error;
      const errors = [];
      console.error = (...args) => errors.push(args.join(' '));
      try {
        const reg = discoverPlugins({
          includeBuiltIn: true,
          config: { connectors: { overrides: { splunk: pluginDir } } },
        });
        // Splunk should NOT be overridden since connector_id doesn't match
        assert.strictEqual(reg.isOverridden('splunk'), false);
        // Should have logged an error
        assert.ok(errors.length > 0, 'should log error about mismatched connector_id');
      } finally {
        console.error = origError;
      }
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  test('includeBuiltIn=false with no config returns empty registry', () => {
    const reg = discoverPlugins({ includeBuiltIn: false });
    assert.deepStrictEqual(reg.list(), []);
    assert.deepStrictEqual(reg.listPlugins(), []);
  });
});

// -- _scanNodeModules --

describe('_scanNodeModules', () => {
  test('discovers @thrunt/connector-* packages with thrunt-connector.json', () => {
    const tmpDir = makeTempDir();
    try {
      // Create node_modules/@thrunt/connector-test
      const scopeDir = path.join(tmpDir, 'node_modules', '@thrunt');
      const pkgDir = path.join(scopeDir, 'connector-test');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'thrunt-connector.json'), '{}');

      const results = _scanNodeModules(tmpDir);
      assert.ok(results.length >= 1, 'should find @thrunt/connector-test');
      assert.ok(results.some(r => r.packageRoot.includes('connector-test')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('discovers thrunt-connector-* packages with thrunt-connector.json', () => {
    const tmpDir = makeTempDir();
    try {
      const pkgDir = path.join(tmpDir, 'node_modules', 'thrunt-connector-foo');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'thrunt-connector.json'), '{}');

      const results = _scanNodeModules(tmpDir);
      assert.ok(results.length >= 1, 'should find thrunt-connector-foo');
      assert.ok(results.some(r => r.packageRoot.includes('thrunt-connector-foo')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skips directories without thrunt-connector.json', () => {
    const tmpDir = makeTempDir();
    try {
      const pkgDir = path.join(tmpDir, 'node_modules', 'thrunt-connector-bar');
      fs.mkdirSync(pkgDir, { recursive: true });
      // No thrunt-connector.json

      const results = _scanNodeModules(tmpDir);
      assert.strictEqual(results.length, 0, 'should skip directory without manifest');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skips .cache and .package-lock.json entries', () => {
    const tmpDir = makeTempDir();
    try {
      const nmDir = path.join(tmpDir, 'node_modules');
      fs.mkdirSync(path.join(nmDir, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(nmDir, '.cache', 'thrunt-connector.json'), '{}');
      fs.mkdirSync(path.join(nmDir, '.package-lock.json'), { recursive: true });

      const results = _scanNodeModules(tmpDir);
      assert.strictEqual(results.length, 0, 'should skip dot-prefixed entries');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns empty array when node_modules does not exist', () => {
    const tmpDir = makeTempDir();
    try {
      const results = _scanNodeModules(tmpDir);
      assert.deepStrictEqual(results, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('cache is invalidated when lockfile mtime changes', () => {
    const tmpDir = makeTempDir();
    try {
      const pkgDir = path.join(tmpDir, 'node_modules', 'thrunt-connector-cached');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'thrunt-connector.json'), '{}');
      // Create a lockfile
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');

      // First scan populates cache
      const results1 = _scanNodeModules(tmpDir);
      assert.strictEqual(results1.length, 1);

      // Add another plugin directory
      const pkgDir2 = path.join(tmpDir, 'node_modules', 'thrunt-connector-new');
      fs.mkdirSync(pkgDir2, { recursive: true });
      fs.writeFileSync(path.join(pkgDir2, 'thrunt-connector.json'), '{}');

      // Without changing lockfile mtime, cache should return stale data
      // (We can't guarantee this because scanNodeModules may or may not cache)
      // Instead, update lockfile to force invalidation
      const futureTime = new Date(Date.now() + 60000);
      fs.utimesSync(path.join(tmpDir, 'package-lock.json'), futureTime, futureTime);

      const results2 = _scanNodeModules(tmpDir);
      assert.strictEqual(results2.length, 2, 'cache should be invalidated after lockfile mtime change');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
