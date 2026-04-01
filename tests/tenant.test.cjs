/**
 * THRUNT Tools Tests - Tenant Registry
 *
 * Unit and CLI tests for tenant configuration validation, readiness
 * assessment, CRUD commands, and CLI subprocess routing.
 *
 * Suites:
 *   1. validateTenantConfig schema validation
 *   2. assessTenantReadiness status aggregation
 *   3. CRUD commands (cmdTenantAdd, cmdTenantDisable, cmdTenantEnable)
 *   4. CLI subprocess routing (runtime tenant <subcommand>)
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createTempProject, cleanup, runThruntTools } = require('./helpers.cjs');

const TOOLS_PATH = path.resolve(__dirname, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs');

// ─── Shared fixtures ────────────────────────────────────────────────────────

const MOCK_CONFIG = {
  connector_profiles: {
    sentinel: {
      'acme-sentinel': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'ACME_SENTINEL_TOKEN' } } },
      'globex-sentinel': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'GLOBEX_SENTINEL_TOKEN' } } },
    },
    splunk: {
      'acme-splunk': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'ACME_SPLUNK_TOKEN' } } },
    },
  },
  tenants: {
    'acme-corp': {
      display_name: 'Acme Corporation',
      tags: ['healthcare'],
      enabled: true,
      connectors: { sentinel: { profile: 'acme-sentinel' }, splunk: { profile: 'acme-splunk' } },
    },
    'globex-inc': {
      display_name: 'Globex Industries',
      tags: ['manufacturing'],
      enabled: true,
      connectors: { sentinel: { profile: 'globex-sentinel' } },
    },
  },
};

function writeConfig(tmpDir, obj) {
  const configPath = path.join(tmpDir, '.planning', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(obj, null, 2), 'utf-8');
}

function readConfig(tmpDir) {
  const configPath = path.join(tmpDir, '.planning', 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// ─── Suite 1: validateTenantConfig ──────────────────────────────────────────

describe('validateTenantConfig', () => {
  const { validateTenantConfig } = require('../thrunt-god/bin/lib/tenant.cjs');

  test('valid tenant config with sentinel connector returns valid: true, no errors, no warnings', () => {
    const tenant = {
      id: 'acme-corp',
      display_name: 'Acme Corporation',
      tags: ['healthcare'],
      enabled: true,
      connectors: { sentinel: { profile: 'acme-sentinel' } },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.warnings, []);
  });

  test('rejects ID with uppercase letters', () => {
    const tenant = {
      id: 'AcmeCorp',
      connectors: { sentinel: { profile: 'acme-sentinel' } },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('must match')), 'Expected regex error for uppercase ID');
  });

  test('rejects ID with spaces', () => {
    const tenant = {
      id: 'acme corp',
      connectors: { sentinel: { profile: 'acme-sentinel' } },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('must match')), 'Expected regex error for spaces');
  });

  test('rejects ID starting with hyphen', () => {
    const tenant = {
      id: '-acme',
      connectors: { sentinel: { profile: 'acme-sentinel' } },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('must match')), 'Expected regex error for hyphen-start');
  });

  test('rejects ID longer than 64 chars', () => {
    const tenant = {
      id: 'a'.repeat(65),
      connectors: { sentinel: { profile: 'acme-sentinel' } },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('at most 64')), 'Expected max-length error');
  });

  test('rejects empty connectors object', () => {
    const tenant = {
      id: 'valid-id',
      connectors: {},
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('at least one entry')), 'Expected empty connectors error');
  });

  test('rejects connector entry with missing profile field', () => {
    const tenant = {
      id: 'valid-id',
      connectors: { sentinel: {} },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('profile') && e.includes('required')), 'Expected missing profile error');
  });

  test('errors when referenced profile does not exist in connector_profiles', () => {
    const tenant = {
      id: 'valid-id',
      connectors: { sentinel: { profile: 'nonexistent-profile' } },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('does not exist') && e.includes('nonexistent-profile')), 'Expected missing profile reference error');
  });

  test('warns when two tenants reference same env var value for different secret_refs', () => {
    // ENV-VAR-ISOLATION-CHECK: code checks for string values starting with '$' in
    // secret_refs and top-level profile fields. Use two different profiles that both
    // reference the same $-prefixed env var string.
    const sharedConfig = {
      connector_profiles: {
        sentinel: {
          'profile-a': { auth_type: 'bearer', secret_refs: { access_token: '$SHARED_TOKEN' } },
          'profile-b': { auth_type: 'bearer', secret_refs: { access_token: '$SHARED_TOKEN' } },
        },
      },
      tenants: {
        'tenant-a': {
          display_name: 'Tenant A',
          enabled: true,
          connectors: { sentinel: { profile: 'profile-a' } },
        },
        'tenant-b': {
          display_name: 'Tenant B',
          enabled: true,
          connectors: { sentinel: { profile: 'profile-b' } },
        },
      },
    };
    // Validate tenant-b; tenant-a already in config.tenants
    const tenant = { id: 'tenant-b', connectors: { sentinel: { profile: 'profile-b' } } };
    const result = validateTenantConfig(tenant, sharedConfig);
    assert.ok(result.warnings.some(w => w.includes('Credential isolation warning') && w.includes('SHARED_TOKEN')),
      'Expected credential isolation warning for shared env var');
  });

  test('valid config with multiple connectors returns no errors', () => {
    const tenant = {
      id: 'acme-corp',
      display_name: 'Acme Corporation',
      tags: ['healthcare'],
      enabled: true,
      connectors: {
        sentinel: { profile: 'acme-sentinel' },
        splunk: { profile: 'acme-splunk' },
      },
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  test('rejects when connectors is not an object (array)', () => {
    const tenant = {
      id: 'valid-id',
      connectors: ['sentinel'],
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('must be an object')));
  });

  test('rejects when connectors is null', () => {
    const tenant = {
      id: 'valid-id',
      connectors: null,
    };
    const result = validateTenantConfig(tenant, MOCK_CONFIG);
    assert.strictEqual(result.valid, false);
  });
});

// ─── Suite 2: assessTenantReadiness ─────────────────────────────────────────

describe('assessTenantReadiness', () => {
  const { assessTenantReadiness } = require('../thrunt-god/bin/lib/tenant.cjs');

  test('returns status not_found when tenant does not exist in config', async () => {
    const config = { tenants: {} };
    const result = await assessTenantReadiness('nonexistent', config);
    assert.strictEqual(result.tenant_id, 'nonexistent');
    assert.strictEqual(result.status, 'not_found');
    assert.deepStrictEqual(result.connectors, []);
  });

  test('returns unconfigured when no connectors are ready (env vars not set)', async () => {
    // Without real env vars, assessConnectorReadiness will return non-ready statuses
    const config = {
      connector_profiles: {
        sentinel: {
          'test-profile': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'NONEXISTENT_TOKEN' } } },
        },
      },
      tenants: {
        'test-tenant': {
          display_name: 'Test Tenant',
          enabled: true,
          connectors: { sentinel: { profile: 'test-profile' } },
        },
      },
    };
    const result = await assessTenantReadiness('test-tenant', config);
    assert.strictEqual(result.tenant_id, 'test-tenant');
    assert.strictEqual(result.display_name, 'Test Tenant');
    assert.strictEqual(result.enabled, true);
    // Without live env vars, connectors won't be ready
    assert.ok(['unconfigured', 'partial'].includes(result.status),
      `Expected unconfigured or partial, got ${result.status}`);
    assert.ok(Array.isArray(result.connectors));
    assert.strictEqual(result.connectors.length, 1);
  });

  test('includes display_name and enabled in result', async () => {
    const config = {
      connector_profiles: {
        sentinel: {
          'test-profile': { auth_type: 'bearer' },
        },
      },
      tenants: {
        'my-tenant': {
          display_name: 'My Tenant Display',
          enabled: false,
          connectors: { sentinel: { profile: 'test-profile' } },
        },
      },
    };
    const result = await assessTenantReadiness('my-tenant', config);
    assert.strictEqual(result.display_name, 'My Tenant Display');
    assert.strictEqual(result.enabled, false);
  });

  test('result shape includes tenant_id, display_name, enabled, status, connectors', async () => {
    const config = {
      connector_profiles: {},
      tenants: {
        'shape-test': {
          display_name: 'Shape Test',
          enabled: true,
          connectors: {},
        },
      },
    };
    const result = await assessTenantReadiness('shape-test', config);
    assert.ok('tenant_id' in result, 'Missing tenant_id');
    assert.ok('display_name' in result, 'Missing display_name');
    assert.ok('enabled' in result, 'Missing enabled');
    assert.ok('status' in result, 'Missing status');
    assert.ok('connectors' in result, 'Missing connectors');
    assert.ok(Array.isArray(result.connectors));
  });

  test('returns unconfigured when tenant has empty connectors object', async () => {
    const config = {
      connector_profiles: {},
      tenants: {
        'empty-connectors': {
          display_name: 'Empty',
          enabled: true,
          connectors: {},
        },
      },
    };
    const result = await assessTenantReadiness('empty-connectors', config);
    assert.strictEqual(result.status, 'unconfigured');
  });

  test('passes correct profile name to assessConnectorReadiness per connector', async () => {
    const config = {
      connector_profiles: {
        sentinel: {
          'specific-profile': { auth_type: 'bearer' },
        },
      },
      tenants: {
        'profile-test': {
          display_name: 'Profile Test',
          enabled: true,
          connectors: { sentinel: { profile: 'specific-profile' } },
        },
      },
    };
    const result = await assessTenantReadiness('profile-test', config);
    // The connector result should reference the profile passed
    assert.strictEqual(result.connectors.length, 1);
    assert.strictEqual(result.connectors[0].profile, 'specific-profile');
  });
});

// ─── Suite 3: CRUD commands ─────────────────────────────────────────────────

describe('cmdTenantAdd / cmdTenantDisable / cmdTenantEnable (subprocess)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfig(tmpDir, JSON.parse(JSON.stringify(MOCK_CONFIG)));
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('cmdTenantAdd creates tenant entry in config.json with correct structure', () => {
    const result = runThruntTools(
      ['runtime', 'tenant', 'add', 'new-tenant', '--connector', 'sentinel:acme-sentinel', '--display-name', 'New Tenant', '--tag', 'finance', '--raw'],
      tmpDir,
    );
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.added, true);
    assert.strictEqual(out.tenant_id, 'new-tenant');

    // Verify config was written
    const config = readConfig(tmpDir);
    assert.ok(config.tenants['new-tenant'], 'Tenant should exist in config');
    assert.strictEqual(config.tenants['new-tenant'].display_name, 'New Tenant');
    assert.strictEqual(config.tenants['new-tenant'].enabled, true);
    assert.deepStrictEqual(config.tenants['new-tenant'].tags, ['finance']);
    assert.strictEqual(config.tenants['new-tenant'].connectors.sentinel.profile, 'acme-sentinel');
  });

  test('cmdTenantAdd rejects invalid tenant ID format', () => {
    const result = runThruntTools(
      ['runtime', 'tenant', 'add', 'INVALID-ID', '--connector', 'sentinel:acme-sentinel', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('must match') || result.output.includes('must match'),
      'Expected format validation error');
  });

  test('cmdTenantDisable sets enabled to false', () => {
    const result = runThruntTools(
      ['runtime', 'tenant', 'disable', 'acme-corp', '--raw'],
      tmpDir,
    );
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.disabled, true);
    assert.strictEqual(out.tenant_id, 'acme-corp');

    const config = readConfig(tmpDir);
    assert.strictEqual(config.tenants['acme-corp'].enabled, false);
  });

  test('cmdTenantEnable sets enabled to true', () => {
    // First disable, then enable
    runThruntTools(['runtime', 'tenant', 'disable', 'acme-corp', '--raw'], tmpDir);
    const result = runThruntTools(
      ['runtime', 'tenant', 'enable', 'acme-corp', '--raw'],
      tmpDir,
    );
    assert.ok(result.success, `Command failed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.enabled, true);
    assert.strictEqual(out.tenant_id, 'acme-corp');

    const config = readConfig(tmpDir);
    assert.strictEqual(config.tenants['acme-corp'].enabled, true);
  });

  test('cmdTenantDisable errors on nonexistent tenant', () => {
    const result = runThruntTools(
      ['runtime', 'tenant', 'disable', 'no-such-tenant', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not found'), 'Expected not found error');
  });

  test('cmdTenantEnable errors on nonexistent tenant', () => {
    const result = runThruntTools(
      ['runtime', 'tenant', 'enable', 'no-such-tenant', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not found'), 'Expected not found error');
  });
});

// ─── Suite 4: CLI subprocess routing ────────────────────────────────────────

describe('CLI routing: runtime tenant subcommands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfig(tmpDir, JSON.parse(JSON.stringify(MOCK_CONFIG)));
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('runtime tenant list returns JSON with tenants array', () => {
    const out = execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'list', '--raw'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(Array.isArray(parsed.tenants), 'tenants should be an array');
    assert.strictEqual(parsed.count, 2);
    const ids = parsed.tenants.map(t => t.id);
    assert.ok(ids.includes('acme-corp'), 'Should include acme-corp');
    assert.ok(ids.includes('globex-inc'), 'Should include globex-inc');
  });

  test('runtime tenant add creates new tenant and returns JSON', () => {
    const out = execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'add', 'cli-tenant',
      '--connector', 'sentinel:acme-sentinel', '--display-name', 'CLI Tenant', '--raw'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(out.trim());
    assert.strictEqual(parsed.added, true);
    assert.strictEqual(parsed.tenant_id, 'cli-tenant');
  });

  test('runtime tenant status returns JSON for existing tenant', () => {
    const out = execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'status', 'acme-corp', '--raw'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(out.trim());
    assert.strictEqual(parsed.tenant_id, 'acme-corp');
    assert.ok('status' in parsed, 'Should include status field');
    assert.ok('connectors' in parsed, 'Should include connectors field');
  });

  test('runtime tenant disable succeeds for existing tenant', () => {
    const out = execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'disable', 'acme-corp', '--raw'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(out.trim());
    assert.strictEqual(parsed.disabled, true);
  });

  test('runtime tenant enable succeeds for existing tenant', () => {
    const out = execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'enable', 'acme-corp', '--raw'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(out.trim());
    assert.strictEqual(parsed.enabled, true);
  });

  test('runtime tenant doctor returns JSON with summary', () => {
    const out = execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'doctor', '--raw'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(out.trim());
    assert.ok(Array.isArray(parsed.tenants), 'tenants should be an array');
    assert.ok('summary' in parsed, 'Should include summary');
    assert.ok('total' in parsed.summary, 'Summary should include total');
    assert.ok('ready' in parsed.summary, 'Summary should include ready');
    assert.ok('partial' in parsed.summary, 'Summary should include partial');
    assert.ok('unconfigured' in parsed.summary, 'Summary should include unconfigured');
    assert.strictEqual(parsed.summary.total, 2);
  });

  test('runtime tenant invalid-subcommand errors with available subcommands message', () => {
    try {
      execFileSync(process.execPath, [TOOLS_PATH, 'runtime', 'tenant', 'invalid-subcommand', '--raw'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });
      assert.fail('Expected command to fail with nonzero exit code');
    } catch (err) {
      assert.ok(err.status !== 0, 'Should exit with non-zero status');
      const stderr = err.stderr?.toString() || '';
      assert.ok(stderr.includes('list') && stderr.includes('status') && stderr.includes('add'),
        'Error should list available subcommands');
    }
  });
});
