/**
 * THRUNT Tools Tests - Dispatch Coordinator
 *
 * Unit tests for multi-tenant fan-out execution: resolveTenantTargets,
 * cloneTenantSpec, and dispatchMultiTenant.
 *
 * Suites:
 *   1. resolveTenantTargets — target resolution with tag/connector/id filters
 *   2. cloneTenantSpec — spec cloning with parameter merge and tag injection
 *   3. dispatchMultiTenant — concurrent dispatch, error isolation, token cache, timeout
 *   4. Config keys — dispatch config key registration
 *   5. Runtime re-exports — dispatch functions accessible via runtime.cjs
 *   6. CLI subprocess — runtime dispatch subcommand routing (end-to-end)
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup, runThruntTools } = require('./helpers.cjs');

// ─── Time helpers ───────────────────────────────────────────────────────────

const NOW = new Date();
const ONE_HOUR_AGO = new Date(NOW.getTime() - 3600_000).toISOString();
const NOW_ISO = NOW.toISOString();

function baseSpecInput(overrides = {}) {
  return {
    connector: { id: 'sentinel' },
    query: { language: 'kql', statement: 'SecurityEvent | take 10' },
    time_window: { start: ONE_HOUR_AGO, end: NOW_ISO },
    ...overrides,
  };
}

// ─── Shared fixtures ────────────────────────────────────────────────────────

const MOCK_CONFIG = {
  connector_profiles: {
    sentinel: {
      'acme-sentinel': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'ACME_SENTINEL_TOKEN' } } },
      'globex-sentinel': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'GLOBEX_SENTINEL_TOKEN' } } },
      'wayne-sentinel': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'WAYNE_SENTINEL_TOKEN' } } },
    },
    splunk: {
      'acme-splunk': { auth_type: 'bearer', secret_refs: { access_token: { type: 'env', value: 'ACME_SPLUNK_TOKEN' } } },
    },
  },
  tenants: {
    'acme-corp': {
      display_name: 'Acme Corporation',
      tags: ['healthcare', 'enterprise'],
      enabled: true,
      connectors: {
        sentinel: { profile: 'acme-sentinel', parameters: { workspace_id: 'ws-acme' } },
        splunk: { profile: 'acme-splunk', parameters: { index: 'main' } },
      },
    },
    'globex-inc': {
      display_name: 'Globex Industries',
      tags: ['manufacturing'],
      enabled: true,
      connectors: { sentinel: { profile: 'globex-sentinel' } },
    },
    'wayne-ent': {
      display_name: 'Wayne Enterprises',
      tags: ['healthcare', 'finance'],
      enabled: false,
      connectors: { sentinel: { profile: 'wayne-sentinel' } },
    },
  },
};

// ─── resolveTenantTargets ───────────────────────────────────────────────────

describe('resolveTenantTargets', () => {
  let resolveTenantTargets;

  beforeEach(() => {
    resolveTenantTargets = require('../thrunt-god/bin/lib/dispatch.cjs').resolveTenantTargets;
  });

  test('returns all enabled tenants with all connectors when no filters', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG);
    // acme-corp has 2 connectors (sentinel, splunk), globex-inc has 1 (sentinel)
    // wayne-ent is disabled, excluded by default
    assert.strictEqual(targets.length, 3, `Expected 3 targets, got ${targets.length}`);
    const tenantIds = targets.map(t => t.tenant_id);
    assert.ok(tenantIds.includes('acme-corp'), 'Should include acme-corp');
    assert.ok(tenantIds.includes('globex-inc'), 'Should include globex-inc');
    assert.ok(!tenantIds.includes('wayne-ent'), 'Should not include disabled wayne-ent');
  });

  test('filters by tags (intersection)', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { tags: ['healthcare'] });
    // acme-corp has healthcare tag, wayne-ent has it but is disabled
    const tenantIds = [...new Set(targets.map(t => t.tenant_id))];
    assert.deepStrictEqual(tenantIds, ['acme-corp'], 'Only acme-corp matches healthcare + enabled');
  });

  test('filters by connector_id', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { connector_id: 'sentinel' });
    // acme-corp and globex-inc both have sentinel; wayne-ent is disabled
    assert.strictEqual(targets.length, 2, `Expected 2 targets, got ${targets.length}`);
    assert.ok(targets.every(t => t.connector_id === 'sentinel'), 'All should be sentinel');
  });

  test('filters by explicit tenant_ids', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { tenant_ids: ['acme-corp'] });
    const tenantIds = [...new Set(targets.map(t => t.tenant_id))];
    assert.deepStrictEqual(tenantIds, ['acme-corp']);
  });

  test('disabled tenants excluded by default', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG);
    const tenantIds = targets.map(t => t.tenant_id);
    assert.ok(!tenantIds.includes('wayne-ent'), 'wayne-ent should be excluded (disabled)');
  });

  test('disabled tenants included when exclude_disabled=false', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { exclude_disabled: false });
    const tenantIds = [...new Set(targets.map(t => t.tenant_id))];
    assert.ok(tenantIds.includes('wayne-ent'), 'wayne-ent should be included');
  });

  test('returns correct target shape', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { tenant_ids: ['acme-corp'], connector_id: 'sentinel' });
    assert.strictEqual(targets.length, 1);
    const t = targets[0];
    assert.strictEqual(t.tenant_id, 'acme-corp');
    assert.strictEqual(t.connector_id, 'sentinel');
    assert.strictEqual(t.profile_name, 'acme-sentinel');
    assert.deepStrictEqual(t.parameters, { workspace_id: 'ws-acme' });
    assert.strictEqual(t.display_name, 'Acme Corporation');
    assert.deepStrictEqual(t.tags, ['healthcare', 'enterprise']);
  });

  test('when connector_id not specified, returns one target per connector per tenant', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { tenant_ids: ['acme-corp'] });
    // acme-corp has sentinel and splunk
    assert.strictEqual(targets.length, 2, `Expected 2 targets (sentinel + splunk), got ${targets.length}`);
    const connectorIds = targets.map(t => t.connector_id).sort();
    assert.deepStrictEqual(connectorIds, ['sentinel', 'splunk']);
  });

  test('returns empty array when no tenants match', () => {
    const targets = resolveTenantTargets(MOCK_CONFIG, { tags: ['nonexistent'] });
    assert.deepStrictEqual(targets, []);
  });

  test('returns empty array when config has no tenants', () => {
    const targets = resolveTenantTargets({ connector_profiles: {} });
    assert.deepStrictEqual(targets, []);
  });
});

// ─── cloneTenantSpec ────────────────────────────────────────────────────────

describe('cloneTenantSpec', () => {
  let cloneTenantSpec;
  let createQuerySpec;

  beforeEach(() => {
    cloneTenantSpec = require('../thrunt-god/bin/lib/dispatch.cjs').cloneTenantSpec;
    createQuerySpec = require('../thrunt-god/bin/lib/runtime.cjs').createQuerySpec;
  });

  test('overrides connector fields from target', () => {
    const base = createQuerySpec(baseSpecInput({
      connector: { id: 'sentinel', profile: 'default', tenant: null },
    }));
    const target = {
      tenant_id: 'acme-corp',
      connector_id: 'sentinel',
      profile_name: 'acme-sentinel',
      parameters: { workspace_id: 'ws-acme' },
      display_name: 'Acme Corporation',
      tags: ['healthcare'],
    };

    const cloned = cloneTenantSpec(base, target);
    assert.strictEqual(cloned.connector.id, 'sentinel');
    assert.strictEqual(cloned.connector.profile, 'acme-sentinel');
    assert.strictEqual(cloned.connector.tenant, 'acme-corp');
  });

  test('merges parameters with tenant overriding base', () => {
    const base = createQuerySpec(baseSpecInput({
      parameters: { timerange: '24h', workspace_id: 'default' },
    }));
    const target = {
      tenant_id: 'acme-corp',
      connector_id: 'sentinel',
      profile_name: 'acme-sentinel',
      parameters: { workspace_id: 'ws-acme' },
    };

    const cloned = cloneTenantSpec(base, target);
    assert.strictEqual(cloned.parameters.timerange, '24h', 'Should keep base params');
    assert.strictEqual(cloned.parameters.workspace_id, 'ws-acme', 'Tenant params should override base');
  });

  test('adds tenant tag to evidence tags', () => {
    const base = createQuerySpec(baseSpecInput({
      evidence: { tags: ['hunt:H-001'] },
    }));
    const target = {
      tenant_id: 'acme-corp',
      connector_id: 'sentinel',
      profile_name: 'acme-sentinel',
      parameters: {},
    };

    const cloned = cloneTenantSpec(base, target);
    assert.ok(cloned.evidence.tags.includes('tenant:acme-corp'), 'Should include tenant tag');
    assert.ok(cloned.evidence.tags.includes('hunt:H-001'), 'Should keep base tags');
  });

  test('returns a new QuerySpec (not mutating base)', () => {
    const base = createQuerySpec(baseSpecInput());
    const target = {
      tenant_id: 'acme-corp',
      connector_id: 'sentinel',
      profile_name: 'acme-sentinel',
      parameters: { extra: true },
    };

    const cloned = cloneTenantSpec(base, target);
    assert.notStrictEqual(cloned, base, 'Should be a different object');
    assert.strictEqual(cloned.version, base.version, 'Should be a valid QuerySpec');
    assert.ok(!base.parameters.extra, 'Base should not be mutated');
  });
});

// ─── dispatchMultiTenant ────────────────────────────────────────────────────

describe('dispatchMultiTenant', () => {
  let dispatchMultiTenant;
  let createQuerySpec;
  let createConnectorRegistry;

  beforeEach(() => {
    dispatchMultiTenant = require('../thrunt-god/bin/lib/dispatch.cjs').dispatchMultiTenant;
    createQuerySpec = require('../thrunt-god/bin/lib/runtime.cjs').createQuerySpec;
    createConnectorRegistry = require('../thrunt-god/bin/lib/runtime.cjs').createConnectorRegistry;
  });

  function makeSentinelAdapter(overrides = {}) {
    return {
      name: 'sentinel',
      capabilities: {
        id: 'sentinel',
        name: 'Sentinel',
        vendor: 'Microsoft',
        connector_type: 'siem',
        auth_types: ['bearer'],
        query_languages: ['kql'],
        dataset_kinds: ['events'],
        features: [],
        limitations: [],
      },
      prepareQuery: overrides.prepareQuery || (({ spec }) => ({ url: 'https://example.com', method: 'POST', body: spec.query.statement })),
      executeRequest: overrides.executeRequest || (async () => ({ status: 200, body: { tables: [{ rows: [['event1']] }] } })),
      normalizeResponse: overrides.normalizeResponse || (({ response }) => ({
        events: [{ raw: response.body, severity: 'info', timestamp: new Date().toISOString() }],
        has_more: false,
      })),
    };
  }

  function makeMockRegistry(handler) {
    const adapter = handler
      ? makeSentinelAdapter({ executeRequest: handler })
      : makeSentinelAdapter();
    return createConnectorRegistry([adapter]);
  }

  test('dispatches to multiple targets and returns MultiTenantResult shape', async () => {
    const base = createQuerySpec(baseSpecInput());
    const targets = [
      { tenant_id: 'acme-corp', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'Acme', tags: [] },
      { tenant_id: 'globex-inc', connector_id: 'sentinel', profile_name: 'globex-sentinel', parameters: {}, display_name: 'Globex', tags: [] },
    ];
    const registry = makeMockRegistry();

    const result = await dispatchMultiTenant(base, targets, registry, MOCK_CONFIG);

    assert.strictEqual(result.version, '1.0');
    assert.ok(result.dispatch_id.startsWith('MTD-'), `dispatch_id should start with MTD-, got ${result.dispatch_id}`);
    assert.ok(result.summary, 'Should have summary');
    assert.strictEqual(result.summary.tenants_targeted, 2);
    assert.ok(Array.isArray(result.tenant_results), 'Should have tenant_results array');
    assert.ok(Array.isArray(result.errors), 'Should have errors array');
  });

  test('each tenant gets isolated token_cache (new Map)', async () => {
    const tokenCaches = [];
    const base = createQuerySpec(baseSpecInput());
    const targets = [
      { tenant_id: 'tenant-a', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'A', tags: [] },
      { tenant_id: 'tenant-b', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'B', tags: [] },
    ];

    // Override executeRequest to capture token_cache from options
    const registry = createConnectorRegistry([makeSentinelAdapter({
      executeRequest: async ({ options }) => {
        if (options && options.token_cache) {
          tokenCaches.push(options.token_cache);
        }
        return { status: 200, body: { tables: [] } };
      },
      normalizeResponse: () => ({ events: [], has_more: false }),
    })]);

    await dispatchMultiTenant(base, targets, registry, MOCK_CONFIG);

    // Verify we got 2 different Map instances
    assert.strictEqual(tokenCaches.length, 2, 'Should have captured 2 token caches');
    assert.notStrictEqual(tokenCaches[0], tokenCaches[1], 'Token caches should be different Map instances');
  });

  test('error in one tenant does not abort others', async () => {
    let callCount = 0;
    const base = createQuerySpec(baseSpecInput());
    const targets = [
      { tenant_id: 'fail-tenant', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'Fail', tags: [] },
      { tenant_id: 'ok-tenant', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'OK', tags: [] },
    ];

    const registry = createConnectorRegistry([makeSentinelAdapter({
      executeRequest: async ({ spec }) => {
        callCount++;
        if (spec.connector.tenant === 'fail-tenant') {
          throw new Error('Connection refused');
        }
        return { status: 200, body: { tables: [] } };
      },
      normalizeResponse: () => ({ events: [{ raw: {}, severity: 'info', timestamp: new Date().toISOString() }], has_more: false }),
    })]);

    const result = await dispatchMultiTenant(base, targets, registry, MOCK_CONFIG, { concurrency: 1 });

    assert.strictEqual(callCount, 2, 'Both tenants should have been attempted');
    // The ok-tenant should have succeeded
    const okResult = result.tenant_results.find(r => r.tenant_id === 'ok-tenant');
    assert.ok(okResult, 'Should have result for ok-tenant');
    assert.strictEqual(okResult.status, 'ok', `ok-tenant should have status ok, got ${okResult.status}`);

    // The fail-tenant should have error status
    const failResult = result.tenant_results.find(r => r.tenant_id === 'fail-tenant');
    assert.ok(failResult, 'Should have result for fail-tenant');
    assert.strictEqual(failResult.status, 'error', `fail-tenant should have status error, got ${failResult.status}`);
  });

  test('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const base = createQuerySpec(baseSpecInput());
    const targets = Array.from({ length: 6 }, (_, i) => ({
      tenant_id: `tenant-${i}`,
      connector_id: 'sentinel',
      profile_name: 'acme-sentinel',
      parameters: {},
      display_name: `Tenant ${i}`,
      tags: [],
    }));

    const registry = createConnectorRegistry([makeSentinelAdapter({
      executeRequest: async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(r => setTimeout(r, 20));
        currentConcurrent--;
        return { status: 200, body: {} };
      },
      normalizeResponse: () => ({ events: [], has_more: false }),
    })]);

    await dispatchMultiTenant(base, targets, registry, MOCK_CONFIG, { concurrency: 2 });

    assert.ok(maxConcurrent <= 2, `Max concurrent should be <= 2, got ${maxConcurrent}`);
  });

  test('summary has correct counts', async () => {
    const base = createQuerySpec(baseSpecInput());
    const targets = [
      { tenant_id: 'tenant-a', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'A', tags: [] },
      { tenant_id: 'tenant-b', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'B', tags: [] },
    ];
    const registry = makeMockRegistry();

    const result = await dispatchMultiTenant(base, targets, registry, MOCK_CONFIG);

    assert.strictEqual(result.summary.tenants_targeted, 2);
    assert.strictEqual(result.summary.tenants_succeeded, 2);
    assert.strictEqual(result.summary.tenants_failed, 0);
    assert.ok(typeof result.summary.total_events === 'number');
    assert.ok(typeof result.summary.wall_clock_ms === 'number');
    assert.ok(result.summary.wall_clock_ms >= 0);
  });

  test('global timeout cancels remaining tenants', async () => {
    const base = createQuerySpec(baseSpecInput({
      execution: { timeout_ms: 60000 },
    }));
    const targets = Array.from({ length: 4 }, (_, i) => ({
      tenant_id: `tenant-${i}`,
      connector_id: 'sentinel',
      profile_name: 'acme-sentinel',
      parameters: {},
      display_name: `Tenant ${i}`,
      tags: [],
    }));

    const registry = createConnectorRegistry([makeSentinelAdapter({
      executeRequest: async () => {
        // Each execution takes 500ms - global timeout of 200ms should cancel some
        await new Promise(r => setTimeout(r, 500));
        return { status: 200, body: {} };
      },
      normalizeResponse: () => ({ events: [], has_more: false }),
    })]);

    const result = await dispatchMultiTenant(base, targets, registry, MOCK_CONFIG, {
      concurrency: 1,
      global_timeout_ms: 200,
    });

    // Some tenants should have timeout status
    const timeoutResults = result.tenant_results.filter(r => r.status === 'timeout');
    assert.ok(timeoutResults.length > 0, 'At least one tenant should have timed out');
  });

  test('dispatch_id format is MTD-timestamp-random', async () => {
    const base = createQuerySpec(baseSpecInput());
    const registry = makeMockRegistry();
    const result = await dispatchMultiTenant(base, [
      { tenant_id: 't1', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'T1', tags: [] },
    ], registry, MOCK_CONFIG);

    assert.match(result.dispatch_id, /^MTD-\d{14}-[A-F0-9]{8}$/, `dispatch_id format wrong: ${result.dispatch_id}`);
  });

  test('tenant_result includes timing info', async () => {
    const base = createQuerySpec(baseSpecInput());
    const registry = makeMockRegistry();
    const result = await dispatchMultiTenant(base, [
      { tenant_id: 'acme', connector_id: 'sentinel', profile_name: 'acme-sentinel', parameters: {}, display_name: 'Acme', tags: [] },
    ], registry, MOCK_CONFIG);

    const tr = result.tenant_results[0];
    assert.ok(tr.timing, 'Should have timing object');
    assert.ok(tr.timing.started_at, 'Should have started_at');
    assert.ok(tr.timing.completed_at, 'Should have completed_at');
    assert.ok(typeof tr.timing.duration_ms === 'number', 'Should have duration_ms');
  });
});

// ─── Config keys ────────────────────────────────────────────────────────────

describe('dispatch config keys', () => {
  test('dispatch.concurrency is a valid config key', () => {
    const { isValidConfigKey } = require('../thrunt-god/bin/lib/config.cjs');
    assert.strictEqual(isValidConfigKey('dispatch.concurrency'), true, 'dispatch.concurrency should be valid');
  });

  test('dispatch.global_timeout_ms is a valid config key', () => {
    const { isValidConfigKey } = require('../thrunt-god/bin/lib/config.cjs');
    assert.strictEqual(isValidConfigKey('dispatch.global_timeout_ms'), true, 'dispatch.global_timeout_ms should be valid');
  });
});

// ─── Runtime re-exports ─────────────────────────────────────────────────────

describe('runtime re-exports dispatch functions', () => {
  test('runtime.cjs exports resolveTenantTargets', () => {
    const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
    assert.strictEqual(typeof runtime.resolveTenantTargets, 'function');
  });

  test('runtime.cjs exports cloneTenantSpec', () => {
    const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
    assert.strictEqual(typeof runtime.cloneTenantSpec, 'function');
  });

  test('runtime.cjs exports dispatchMultiTenant', () => {
    const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
    assert.strictEqual(typeof runtime.dispatchMultiTenant, 'function');
  });
});

// ─── cmdRuntimeDispatch export ─────────────────────────────────────────────

describe('cmdRuntimeDispatch', () => {
  test('commands.cjs exports cmdRuntimeDispatch as a function', () => {
    const commands = require('../thrunt-god/bin/lib/commands.cjs');
    assert.strictEqual(typeof commands.cmdRuntimeDispatch, 'function',
      'cmdRuntimeDispatch should be exported from commands.cjs');
  });
});

// ─── CLI subprocess: runtime dispatch ──────────────────────────────────────

describe('CLI routing: runtime dispatch subcommand', () => {
  let tmpDir;

  function writeConfig(dir, obj) {
    const configPath = path.join(dir, '.planning', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(obj, null, 2), 'utf-8');
  }

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfig(tmpDir, MOCK_CONFIG);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('runtime dispatch without --tenants/--tags/--all errors', () => {
    const result = runThruntTools(
      ['runtime', 'dispatch', '--connector', 'sentinel', '--query', 'SecurityEvent | take 10', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false, 'Should fail without targeting flag');
    assert.ok(
      result.error.includes('--tenants') || result.error.includes('--tags') || result.error.includes('--all'),
      'Error should mention required targeting flags',
    );
  });

  test('runtime dispatch without --connector (and no --pack) errors', () => {
    const result = runThruntTools(
      ['runtime', 'dispatch', '--tenants', 'acme-corp', '--query', 'SecurityEvent | take 10', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false, 'Should fail without --connector');
    assert.ok(
      result.error.includes('--connector') || result.error.includes('connector'),
      'Error should mention --connector requirement',
    );
  });

  test('runtime dispatch without --query (and no --pack) errors', () => {
    const result = runThruntTools(
      ['runtime', 'dispatch', '--tenants', 'acme-corp', '--connector', 'sentinel', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false, 'Should fail without --query');
    assert.ok(
      result.error.includes('--query') || result.error.includes('query'),
      'Error should mention --query requirement',
    );
  });

  test('runtime dispatch --tenants with nonexistent tenant errors about no matches', () => {
    const result = runThruntTools(
      ['runtime', 'dispatch', '--tenants', 'nonexistent-tenant', '--connector', 'sentinel',
        '--query', 'SecurityEvent | take 10', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false, 'Should fail when no tenants match');
    assert.ok(
      result.error.includes('No tenants') || result.error.includes('no tenants'),
      'Error should indicate no tenant matches',
    );
  });

  test('runtime dispatch --tags with no matching tags errors about no matches', () => {
    const result = runThruntTools(
      ['runtime', 'dispatch', '--tags', 'nonexistent-tag', '--connector', 'sentinel',
        '--query', 'SecurityEvent | take 10', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false, 'Should fail when no tags match');
    assert.ok(
      result.error.includes('No tenants') || result.error.includes('no tenants'),
      'Error should indicate no tenant matches',
    );
  });

  test('runtime dispatch is listed in unknown subcommand error message', () => {
    const result = runThruntTools(
      ['runtime', 'nonexistent-subcommand', '--raw'],
      tmpDir,
    );
    assert.strictEqual(result.success, false);
    assert.ok(
      result.error.includes('dispatch'),
      'Error message should list dispatch as available subcommand',
    );
  });
});
