/**
 * Contract test suite unit tests
 *
 * Verifies that runContractTests() executes ~25 automated contract checks
 * against any adapter, catching common bugs via startJsonServer mocks.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  runContractTests,
  createTestQuerySpec,
  createTestProfile,
  createTestSecrets,
} = require('../thrunt-god/bin/lib/contract-tests.cjs');

const {
  createConnectorCapabilities,
  validateConnectorAdapter,
  createQuerySpec,
  createResultEnvelope,
  normalizeEvent,
  addEntity,
  LIFECYCLE_STAGES,
} = require('../thrunt-god/bin/lib/connector-sdk.cjs');

const { startJsonServer } = require('./runtime-fixtures.cjs');

// -- Helper factories --

function createValidTestAdapter(baseUrl) {
  return {
    capabilities: createConnectorCapabilities({
      id: 'test_connector',
      display_name: 'Test Connector',
      auth_types: ['api_key'],
      dataset_kinds: ['events'],
      languages: ['api'],
      pagination_modes: ['cursor'],
      supports_entities: true,
      supports_relationships: false,
      supports_dry_run: true,
    }),
    lifecycle: ['preflight', 'prepare', 'execute', 'normalize', 'complete'],
    preflight(ctx) {
      if (!ctx.profile || !ctx.secrets) {
        return { warnings: [{ code: 'MISSING_PROFILE', message: 'No profile or secrets provided' }] };
      }
      return {};
    },
    prepareQuery(ctx) {
      const url = (ctx.profile?.base_url || baseUrl) + '/api/events';
      const request = {
        method: 'GET',
        url: ctx.pagination?.cursor
          ? `${url}?cursor=${ctx.pagination.cursor}`
          : url,
        headers: { 'content-type': 'application/json' },
      };
      return { request };
    },
    executeRequest(ctx) {
      const fetchImpl = global.fetch;
      return fetchImpl(ctx.prepared.request.url, {
        method: ctx.prepared.request.method,
        headers: ctx.prepared.request.headers,
      }).then(async (res) => {
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: res.status, headers: {}, data, text };
      });
    },
    normalizeResponse(ctx) {
      const data = ctx.response?.data || {};
      const results = Array.isArray(data.results) ? data.results : [];
      const events = results.map(r => normalizeEvent('test_connector', r));
      const entities = [];
      for (const r of results) {
        if (r.name) addEntity(entities, 'test_connector', 'name', r.name);
      }
      return {
        events,
        entities,
        has_more: !!data.next_cursor,
        next_cursor: data.next_cursor || null,
      };
    },
  };
}

// -- createTestQuerySpec tests --

describe('createTestQuerySpec', () => {
  test('returns a valid QuerySpec with defaults', () => {
    const spec = createTestQuerySpec('test_connector');
    assert.strictEqual(spec.version, '1.0');
    assert.strictEqual(spec.connector.id, 'test_connector');
    assert.strictEqual(spec.dataset.kind, 'events');
    assert.strictEqual(spec.query.language, 'api');
    assert.strictEqual(spec.query.statement, 'test query');
    assert.ok(spec.time_window.start);
    assert.ok(spec.time_window.end);
  });

  test('applies overrides via deep merge', () => {
    const spec = createTestQuerySpec('my_conn', {
      dataset: { kind: 'alerts' },
      query: { statement: 'custom query' },
    });
    assert.strictEqual(spec.connector.id, 'my_conn');
    assert.strictEqual(spec.dataset.kind, 'alerts');
    assert.strictEqual(spec.query.statement, 'custom query');
  });
});

// -- createTestProfile tests --

describe('createTestProfile', () => {
  test('returns profile with matching connector_id', () => {
    const profile = createTestProfile('test_connector');
    assert.strictEqual(profile.connector_id, 'test_connector');
    assert.strictEqual(profile.auth_type, 'api_key');
    assert.ok(profile.base_url);
    assert.ok(profile.secret_refs);
    assert.ok(profile.secret_refs.api_key);
  });

  test('applies overrides', () => {
    const profile = createTestProfile('my_conn', { auth_type: 'bearer' });
    assert.strictEqual(profile.connector_id, 'my_conn');
    assert.strictEqual(profile.auth_type, 'bearer');
  });
});

// -- createTestSecrets tests --

describe('createTestSecrets', () => {
  test('returns api_key secrets for api_key auth_type', () => {
    const secrets = createTestSecrets('api_key');
    assert.ok(secrets.api_key);
    assert.strictEqual(typeof secrets.api_key, 'string');
  });

  test('returns bearer secrets for bearer auth_type', () => {
    const secrets = createTestSecrets('bearer');
    assert.ok(secrets.access_token);
  });

  test('returns basic secrets for basic auth_type', () => {
    const secrets = createTestSecrets('basic');
    assert.ok(secrets.username);
    assert.ok(secrets.password);
  });

  test('returns oauth_client_credentials secrets', () => {
    const secrets = createTestSecrets('oauth_client_credentials');
    assert.ok(secrets.client_id);
    assert.ok(secrets.client_secret);
  });

  test('returns sigv4 secrets', () => {
    const secrets = createTestSecrets('sigv4');
    assert.ok(secrets.access_key_id);
    assert.ok(secrets.secret_access_key);
    assert.ok(secrets.region);
  });

  test('returns service_account secrets', () => {
    const secrets = createTestSecrets('service_account');
    assert.ok(secrets.client_email);
    assert.ok(secrets.private_key);
  });

  test('returns session secrets', () => {
    const secrets = createTestSecrets('session');
    assert.ok(secrets.session);
  });

  test('returns fallback secrets for unknown auth_type', () => {
    const secrets = createTestSecrets('unknown_type');
    assert.ok(secrets.api_key);
  });
});

// -- runContractTests: valid adapter --

describe('runContractTests against valid adapter', () => {
  test('all checks pass against a valid minimal adapter', async () => {
    const server = await startJsonServer(({ req }) => {
      return {
        status: 200,
        json: {
          results: [
            { id: '1', timestamp: new Date().toISOString(), name: 'test-event' },
          ],
        },
      };
    });

    try {
      await runContractTests(() => createValidTestAdapter(server.baseUrl), {
        connectorId: 'test_connector',
        testEnv: { TEST_KEY: 'test-value' },
      });
    } finally {
      await server.close();
    }
  });
});

// -- runContractTests: broken adapters --

describe('runContractTests catches broken adapters', () => {
  test('reports error for adapter missing prepareQuery', async () => {
    const createBroken = () => ({
      capabilities: createConnectorCapabilities({
        id: 'broken_adapter',
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        languages: ['api'],
        pagination_modes: ['none'],
      }),
      executeRequest() { return { status: 200, data: {} }; },
      normalizeResponse() { return { events: [], has_more: false }; },
    });

    await assert.rejects(
      () => runContractTests(createBroken, {
        connectorId: 'broken_adapter',
        testEnv: { TEST_KEY: 'test-value' },
      }),
      (err) => {
        // Should report adapter validation failure
        return err.message.includes('prepareQuery') || err.code === 'ADAPTER_VALIDATION_FAILED';
      }
    );
  });

  test('catches adapter returning wrong normalizeResponse shape', async () => {
    const server = await startJsonServer(() => ({
      status: 200,
      json: { results: [{ id: '1', timestamp: new Date().toISOString() }] },
    }));

    try {
      const createBroken = () => ({
        capabilities: createConnectorCapabilities({
          id: 'wrong_shape',
          auth_types: ['api_key'],
          dataset_kinds: ['events'],
          languages: ['api'],
          pagination_modes: ['none'],
        }),
        prepareQuery(ctx) {
          return { request: { method: 'GET', url: server.baseUrl + '/api/events' } };
        },
        executeRequest(ctx) {
          return global.fetch(ctx.prepared.request.url).then(async (res) => {
            const text = await res.text();
            let data; try { data = JSON.parse(text); } catch { data = text; }
            return { status: res.status, data, text };
          });
        },
        normalizeResponse() {
          return 'not an object'; // WRONG -- should be { events: [], has_more: bool }
        },
      });

      await assert.rejects(
        () => runContractTests(createBroken, {
          connectorId: 'wrong_shape',
          testEnv: { TEST_KEY: 'test-value' },
        }),
        (err) => {
          return err.message.includes('events') || err.message.includes('normalize') || err.code === 'NORMALIZE_SHAPE_FAILED';
        }
      );
    } finally {
      await server.close();
    }
  });

  test('catches adapter with broken pagination (always same cursor)', async () => {
    const server = await startJsonServer(() => ({
      status: 200,
      json: { results: [{ id: '1', timestamp: new Date().toISOString() }], next_cursor: 'same-cursor' },
    }));

    try {
      const createBroken = () => ({
        capabilities: createConnectorCapabilities({
          id: 'broken_pagination',
          auth_types: ['api_key'],
          dataset_kinds: ['events'],
          languages: ['api'],
          pagination_modes: ['cursor'],
        }),
        prepareQuery(ctx) {
          // Bug: ignores cursor, always produces same URL
          return { request: { method: 'GET', url: server.baseUrl + '/api/events' } };
        },
        executeRequest(ctx) {
          return global.fetch(ctx.prepared.request.url).then(async (res) => {
            const text = await res.text();
            let data; try { data = JSON.parse(text); } catch { data = text; }
            return { status: res.status, data, text };
          });
        },
        normalizeResponse() {
          return { events: [{ id: '1' }], has_more: true, next_cursor: 'same-cursor' };
        },
      });

      await assert.rejects(
        () => runContractTests(createBroken, {
          connectorId: 'broken_pagination',
          testEnv: { TEST_KEY: 'test-value' },
        }),
        (err) => {
          return err.message.includes('pagination') || err.message.includes('cursor') || err.code === 'PAGINATION_CURSOR_FAILED';
        }
      );
    } finally {
      await server.close();
    }
  });

  test('catches capabilities auth_types mismatch with manifest', async () => {
    const server = await startJsonServer(() => ({
      status: 200,
      json: { results: [{ id: '1', timestamp: new Date().toISOString(), name: 'evt' }] },
    }));

    try {
      const createAdapter = () => createValidTestAdapter(server.baseUrl);
      await assert.rejects(
        () => runContractTests(createAdapter, {
          connectorId: 'test_connector',
          manifest: {
            name: 'test-connector',
            version: '1.0.0',
            sdk_version: '^1.0.0',
            connector_id: 'test_connector',
            display_name: 'Test Connector',
            entry: './index.cjs',
            auth_types: ['api_key', 'bearer'], // mismatch -- adapter only has api_key
            dataset_kinds: ['events'],
            languages: ['api'],
            pagination_modes: ['cursor'],
          },
          testEnv: { TEST_KEY: 'test-value' },
        }),
        (err) => {
          return err.message.includes('auth_types') || err.message.includes('manifest') || err.code === 'MANIFEST_CROSS_CHECK_FAILED';
        }
      );
    } finally {
      await server.close();
    }
  });
});

// -- runContractTests produces enough checks --

describe('contract test check coverage', () => {
  test('at least 20 distinct check names exist in contract-tests module', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'bin', 'lib', 'contract-tests.cjs'),
      'utf-8'
    );
    const checkNames = [
      'capabilities_valid',
      'adapter_valid',
      'manifest_cross_check',
      'preflight_missing_profile',
      'prepare_query_produces_request',
      'execute_request_mock',
      'normalize_response_events',
      'entity_extraction',
      'pagination_cursor_propagation',
      'error_propagation',
      'timeout_handling',
      'empty_response_handling',
      'result_status_inference',
      'auth_header_attachment',
      'idempotency',
      'optional_preflight_callable',
      'optional_emit_artifacts_callable',
      'optional_on_error_callable',
      'lifecycle_stages_valid',
      'dry_run_support',
    ];
    let found = 0;
    for (const name of checkNames) {
      if (source.includes(name)) found++;
    }
    assert.ok(found >= 20, `Expected at least 20 check names in source, found ${found}`);
  });
});

// -- runContractTests function exists --

describe('contract-tests module exports', () => {
  test('runContractTests is an exported async function', () => {
    assert.strictEqual(typeof runContractTests, 'function');
  });

  test('createTestQuerySpec is an exported function', () => {
    assert.strictEqual(typeof createTestQuerySpec, 'function');
  });

  test('createTestProfile is an exported function', () => {
    assert.strictEqual(typeof createTestProfile, 'function');
  });

  test('createTestSecrets is an exported function', () => {
    assert.strictEqual(typeof createTestSecrets, 'function');
  });
});
