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
