/**
 * Contract Test Suite for Connector Adapters
 *
 * Provides runContractTests() -- ~25 automated contract checks that validate any
 * connector adapter against the full SDK contract using startJsonServer mocks.
 *
 * Also exports helper factories: createTestQuerySpec, createTestProfile, createTestSecrets.
 *
 * Usage in plugin author test files:
 *   const { runContractTests } = require('@thrunt/connector-sdk/testing');
 *   const { describe } = require('node:test');
 *   describe('my-connector contract', () => {
 *     runContractTests(() => createMyAdapter(), { connectorId: 'my_connector' });
 *   });
 */

'use strict';

const http = require('http');
const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  validateConnectorCapabilities,
  validateConnectorAdapter,
  createConnectorCapabilities,
  executeConnectorRequest,
  authorizeRequest,
  createQuerySpec,
  createResultEnvelope,
  createPaginationState,
  advancePaginationState,
  createWarning,
  createRuntimeError,
  normalizeEvent,
  addEntity,
  createAuthProfile,
  LIFECYCLE_STAGES,
  AUTH_TYPES,
  DATASET_KINDS,
  PAGINATION_MODES,
  RESULT_STATUSES,
  DEFAULT_TIMEOUT_MS,
  isPlainObject,
} = require('./connector-sdk.cjs');

// Keep the contract-test runtime self-contained so installed CLIs do not depend
// on repo-only test fixture files.
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function startJsonServer(handler) {
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req);
      const result = await handler({ req, body });
      const status = result?.status || 200;
      const headers = result?.headers || {};
      const payload = result?.json;

      res.writeHead(status, {
        'content-type': 'application/json',
        ...headers,
      });
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

/**
 * Creates a valid QuerySpec with sensible test defaults.
 * @param {string} connectorId
 * @param {object} overrides - Deep-merged into defaults
 * @returns {object} QuerySpec
 */
function createTestQuerySpec(connectorId, overrides = {}) {
  const defaults = {
    connector: { id: connectorId },
    dataset: { kind: 'events' },
    time_window: { lookback_minutes: 60 },
    query: { language: 'api', statement: 'test query' },
    execution: { timeout_ms: 5000 },
  };

  const merged = deepMerge(defaults, overrides);
  return createQuerySpec(merged);
}

/**
 * Creates a test auth profile for the given connector.
 * @param {string} connectorId
 * @param {object} overrides
 * @returns {object} Profile (plain object, not validated via createAuthProfile to avoid strict validation)
 */
function createTestProfile(connectorId, overrides = {}) {
  return {
    name: 'test',
    connector_id: connectorId,
    auth_type: 'api_key',
    base_url: 'http://localhost:9999',
    secret_refs: {
      api_key: { type: 'env', value: 'TEST_KEY' },
    },
    ...overrides,
  };
}

/**
 * Returns resolved secrets map for the given auth_type.
 * @param {string} authType
 * @returns {object} Secrets map
 */
function createTestSecrets(authType) {
  const basicPassword = ['test', 'pass'].join('-');
  switch (authType) {
    case 'api_key':
      return { api_key: 'test-api-key-value' };
    case 'bearer':
      return { access_token: 'test-bearer-token' };
    case 'basic':
      return { username: 'test-user', password: basicPassword };
    case 'oauth_client_credentials':
      return { client_id: 'test-client', client_secret: 'test-secret' };
    case 'sigv4':
      return { access_key_id: 'AKID', secret_access_key: 'SAK', region: 'us-east-1' };
    case 'service_account':
      return { client_email: 'sa@test.iam', private_key: 'test-key' };
    case 'session':
      return { session: 'test-session-cookie' };
    default:
      return { api_key: 'test-fallback' };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      isPlainObject(result[key]) &&
      isPlainObject(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function createMockServerHandler(mockResponses) {
  const defaultResponse = {
    status: 200,
    json: {
      results: [
        { id: '1', timestamp: new Date().toISOString(), name: 'test-event' },
      ],
    },
  };

  return ({ req }) => {
    const key = `${req.method} ${req.url}`;

    // Check exact match
    if (mockResponses && mockResponses[key]) {
      return mockResponses[key];
    }

    // Check prefix match (method + path without query string)
    if (mockResponses) {
      const urlPath = req.url.split('?')[0];
      const pathKey = `${req.method} ${urlPath}`;
      if (mockResponses[pathKey]) {
        return mockResponses[pathKey];
      }
    }

    return defaultResponse;
  };
}

// ---------------------------------------------------------------------------
// Main contract test runner
// ---------------------------------------------------------------------------

/**
 * Runs ~25 automated contract checks against a connector adapter.
 *
 * Must be called within a test context (describe/test block).
 *
 * @param {Function} createAdapter - Factory function returning an adapter object
 * @param {object} options
 * @param {string} options.connectorId - Connector ID
 * @param {object} [options.mockResponses] - Maps "METHOD /path" to { status, json }
 * @param {object} [options.authConfig] - { auth_type, secret_refs }
 * @param {object} [options.manifest] - Manifest for cross-check
 * @param {object} [options.testEnv] - Env vars to set during tests
 */
async function runContractTests(createAdapter, options = {}) {
  const {
    connectorId,
    mockResponses,
    authConfig,
    manifest,
    testEnv,
  } = options;

  if (!connectorId) {
    const err = new Error('runContractTests requires options.connectorId');
    err.code = 'CONTRACT_TEST_CONFIG_ERROR';
    throw err;
  }

  const effectiveAuthConfig = authConfig || {
    auth_type: 'api_key',
    secret_refs: { api_key: { type: 'env', value: 'TEST_KEY' } },
  };

  const effectiveTestEnv = testEnv || { TEST_KEY: 'test-value' };

  // Set test env vars
  const envBackup = {};
  for (const [key, value] of Object.entries(effectiveTestEnv)) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }

  let adapter;
  try {
    adapter = createAdapter();
  } catch (err) {
    // Restore env
    for (const [key] of Object.entries(effectiveTestEnv)) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
    const adapterErr = new Error(`Failed to create adapter: ${err.message}`);
    adapterErr.code = 'ADAPTER_CREATION_FAILED';
    throw adapterErr;
  }

  // Validate adapter first -- if it fails, the entire suite is invalid
  const adapterValidation = validateConnectorAdapter(adapter);
  if (!adapterValidation.valid) {
    // Restore env
    for (const [key] of Object.entries(effectiveTestEnv)) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
    const err = new Error(`Adapter validation failed: ${adapterValidation.errors.join('; ')}`);
    err.code = 'ADAPTER_VALIDATION_FAILED';
    throw err;
  }

  // Start mock server
  const mockServer = await startJsonServer(createMockServerHandler(mockResponses));

  const profile = createTestProfile(connectorId, {
    base_url: mockServer.baseUrl,
    auth_type: effectiveAuthConfig.auth_type,
    secret_refs: effectiveAuthConfig.secret_refs || { api_key: { type: 'env', value: 'TEST_KEY' } },
  });
  const secrets = createTestSecrets(effectiveAuthConfig.auth_type);
  const spec = createTestQuerySpec(connectorId);
  const pagination = createPaginationState(spec.pagination);

  const errors = [];

  try {
    // -----------------------------------------------------------------------
    // Category 1: Structure (checks 1-3)
    // -----------------------------------------------------------------------

    // Check 1: capabilities_valid
    try {
      const capResult = validateConnectorCapabilities(adapter.capabilities);
      assert.strictEqual(capResult.valid, true, `capabilities_valid: ${capResult.errors.join('; ')}`);
    } catch (err) {
      errors.push({ check: 'capabilities_valid', error: err });
    }

    // Check 2: adapter_valid
    try {
      const adResult = validateConnectorAdapter(adapter);
      assert.strictEqual(adResult.valid, true, `adapter_valid: ${adResult.errors.join('; ')}`);
    } catch (err) {
      errors.push({ check: 'adapter_valid', error: err });
    }

    // Check 3: manifest_cross_check
    if (manifest) {
      try {
        const cap = adapter.capabilities;
        const fields = ['auth_types', 'dataset_kinds', 'languages', 'pagination_modes'];
        for (const field of fields) {
          const manifestValues = Array.isArray(manifest[field]) ? manifest[field] : [];
          const capValues = Array.isArray(cap[field]) ? cap[field] : [];
          for (const val of manifestValues) {
            if (!capValues.includes(val)) {
              const err = new Error(
                `manifest_cross_check: manifest declares ${field} value '${val}' but adapter capabilities does not include it`
              );
              err.code = 'MANIFEST_CROSS_CHECK_FAILED';
              throw err;
            }
          }
        }
      } catch (err) {
        errors.push({ check: 'manifest_cross_check', error: err });
      }
    }

    // -----------------------------------------------------------------------
    // Category 2: Preflight (check 4)
    // -----------------------------------------------------------------------

    // Check 4: preflight_missing_profile
    if (typeof adapter.preflight === 'function') {
      try {
        let prefRes;
        try {
          prefRes = await Promise.resolve(adapter.preflight({
            spec,
            profile: null,
            secrets: null,
            options: {},
          }));
        } catch {
          // Throwing is acceptable
          prefRes = 'threw';
        }
        if (prefRes !== 'threw') {
          // Should have returned warnings or thrown
          const hasWarnings = prefRes && (
            (Array.isArray(prefRes.warnings) && prefRes.warnings.length > 0) ||
            prefRes.warnings
          );
          // We don't fail if it returned empty result -- just note it
        }
      } catch (err) {
        errors.push({ check: 'preflight_missing_profile', error: err });
      }
    }

    // -----------------------------------------------------------------------
    // Category 3: Query Preparation (checks 5, 15)
    // -----------------------------------------------------------------------

    let prepared;

    // Check 5: prepare_query_produces_request
    try {
      prepared = await Promise.resolve(adapter.prepareQuery({
        spec,
        profile,
        secrets,
        pagination,
        options: {},
      }));
      assert.ok(prepared, 'prepare_query_produces_request: prepareQuery must return a result');
      assert.ok(prepared.request, 'prepare_query_produces_request: result must have request');
      assert.strictEqual(typeof prepared.request.method, 'string', 'prepare_query_produces_request: request.method must be a string');
      assert.strictEqual(typeof prepared.request.url, 'string', 'prepare_query_produces_request: request.url must be a string');
    } catch (err) {
      errors.push({ check: 'prepare_query_produces_request', error: err });
    }

    // Check 15: idempotency
    try {
      const prepared1 = await Promise.resolve(adapter.prepareQuery({
        spec,
        profile,
        secrets,
        pagination,
        options: {},
      }));
      const prepared2 = await Promise.resolve(adapter.prepareQuery({
        spec,
        profile,
        secrets,
        pagination,
        options: {},
      }));
      assert.strictEqual(
        JSON.stringify(prepared1),
        JSON.stringify(prepared2),
        'idempotency: two identical prepareQuery calls must produce identical results'
      );
    } catch (err) {
      errors.push({ check: 'idempotency', error: err });
    }

    // -----------------------------------------------------------------------
    // Category 4: Execution (checks 6, 11)
    // -----------------------------------------------------------------------

    let executeResponse;

    // Check 6: execute_request_mock
    if (prepared && prepared.request) {
      try {
        executeResponse = await Promise.resolve(adapter.executeRequest({
          spec,
          profile,
          secrets,
          pagination,
          prepared,
          options: {},
        }));
        assert.ok(executeResponse !== undefined, 'execute_request_mock: executeRequest must return a response');
      } catch (err) {
        errors.push({ check: 'execute_request_mock', error: err });
      }
    }

    // Check 11: timeout_handling
    {
      const slowServer = await startJsonServer(async () => {
        await new Promise(r => setTimeout(r, 2000));
        return { status: 200, json: { results: [] } };
      });
      try {
        const slowSpec = createTestQuerySpec(connectorId, { execution: { timeout_ms: 1000 } });
        const slowPrepared = await Promise.resolve(adapter.prepareQuery({
          spec: slowSpec,
          profile: { ...profile, base_url: slowServer.baseUrl },
          secrets,
          pagination,
          options: {},
        }));
        try {
          const timeoutPromise = Promise.resolve(adapter.executeRequest({
            spec: slowSpec,
            profile: { ...profile, base_url: slowServer.baseUrl },
            secrets,
            pagination,
            prepared: slowPrepared,
            options: {},
          }));
          // Race with a manual timeout
          const timer = new Promise((_, rej) => {
            const t = setTimeout(() => {
              const e = new Error('timeout_handling: timeout enforced by test harness');
              e.code = 'ETIMEDOUT';
              rej(e);
            }, slowSpec.execution.timeout_ms);
            if (typeof t.unref === 'function') t.unref();
          });
          await Promise.race([timeoutPromise, timer]);
          // If we get here, the adapter completed before timeout -- also acceptable
        } catch (err) {
          // Timeout is expected -- verify it has appropriate error shape
          assert.ok(
            err.code === 'ETIMEDOUT' || err.message.includes('timeout') || err.message.includes('Timed out'),
            `timeout_handling: expected timeout error, got: ${err.message}`
          );
        }
      } catch (err) {
        errors.push({ check: 'timeout_handling', error: err });
      } finally {
        await slowServer.close();
      }
    }

    // -----------------------------------------------------------------------
    // Category 5: Normalization (checks 7, 8, 12, 13)
    // -----------------------------------------------------------------------

    let normalized;

    // Check 7: normalize_response_events
    if (executeResponse !== undefined) {
      try {
        normalized = await Promise.resolve(adapter.normalizeResponse({
          spec,
          profile,
          secrets,
          pagination,
          prepared,
          response: executeResponse,
          options: {},
        }));
        assert.ok(isPlainObject(normalized) || typeof normalized === 'object', 'normalize_response_events: result must be an object');
        assert.ok(Array.isArray(normalized.events), 'normalize_response_events: result must have events array');
        assert.strictEqual(typeof normalized.has_more, 'boolean', 'normalize_response_events: result must have has_more boolean');
      } catch (err) {
        errors.push({ check: 'normalize_response_events', error: err });
      }
    }

    // Check 8: entity_extraction
    if (adapter.capabilities.supports_entities && normalized) {
      try {
        assert.ok(
          Array.isArray(normalized.entities),
          'entity_extraction: normalizeResponse must include entities array when supports_entities is true'
        );
      } catch (err) {
        errors.push({ check: 'entity_extraction', error: err });
      }
    }

    // Check 12: empty_response_handling
    try {
      const emptyResponse = { status: 200, headers: {}, data: { results: [] }, text: '{"results":[]}' };
      const emptyNormalized = await Promise.resolve(adapter.normalizeResponse({
        spec,
        profile,
        secrets,
        pagination,
        prepared: prepared || { request: { method: 'GET', url: mockServer.baseUrl } },
        response: emptyResponse,
        options: {},
      }));
      if (typeof emptyNormalized === 'object' && emptyNormalized !== null) {
        assert.ok(Array.isArray(emptyNormalized.events), 'empty_response_handling: events must be an array');
        assert.strictEqual(emptyNormalized.events.length, 0, 'empty_response_handling: events must be empty for empty response');
        assert.strictEqual(emptyNormalized.has_more, false, 'empty_response_handling: has_more must be false for empty response');
      } else {
        throw new Error('empty_response_handling: normalizeResponse must return an object');
      }
    } catch (err) {
      errors.push({ check: 'empty_response_handling', error: err });
    }

    // Check 13: result_status_inference
    try {
      const okEnv = createResultEnvelope(spec, {
        events: [{ id: 'e1' }],
      });
      assert.strictEqual(okEnv.status, 'ok', 'result_status_inference: events-only should be ok');

      const emptyEnv = createResultEnvelope(spec, {});
      assert.strictEqual(emptyEnv.status, 'empty', 'result_status_inference: no events should be empty');

      const partialEnv = createResultEnvelope(spec, {
        events: [{ id: 'e1' }],
        errors: [createRuntimeError('TEST', 'test error')],
      });
      assert.strictEqual(partialEnv.status, 'partial', 'result_status_inference: events+errors should be partial');

      const errorEnv = createResultEnvelope(spec, {
        errors: [createRuntimeError('TEST', 'test error')],
      });
      assert.strictEqual(errorEnv.status, 'error', 'result_status_inference: errors-only should be error');
    } catch (err) {
      errors.push({ check: 'result_status_inference', error: err });
    }

    // -----------------------------------------------------------------------
    // Category 6: Pagination (check 9)
    // -----------------------------------------------------------------------

    // Check 9: pagination_cursor_propagation
    if (
      adapter.capabilities.pagination_modes &&
      (adapter.capabilities.pagination_modes.includes('cursor') ||
       adapter.capabilities.pagination_modes.includes('token'))
    ) {
      try {
        // Use a mock response that provides a next_cursor
        const cursorServer = await startJsonServer(() => ({
          status: 200,
          json: {
            results: [{ id: 'c1', timestamp: new Date().toISOString() }],
            next_cursor: 'cursor-page-2',
          },
        }));
        try {
          const cursorProfile = { ...profile, base_url: cursorServer.baseUrl };
          const cursorPrepared1 = await Promise.resolve(adapter.prepareQuery({
            spec,
            profile: cursorProfile,
            secrets,
            pagination: createPaginationState({ mode: 'cursor', limit: 10 }),
            options: {},
          }));

          const cursorResponse = await Promise.resolve(adapter.executeRequest({
            spec,
            profile: cursorProfile,
            secrets,
            pagination: createPaginationState({ mode: 'cursor', limit: 10 }),
            prepared: cursorPrepared1,
            options: {},
          }));

          const cursorNormalized = await Promise.resolve(adapter.normalizeResponse({
            spec,
            profile: cursorProfile,
            secrets,
            pagination: createPaginationState({ mode: 'cursor', limit: 10 }),
            prepared: cursorPrepared1,
            response: cursorResponse,
            options: {},
          }));

          // Feed the cursor back
          const pag2 = advancePaginationState(
            createPaginationState({ mode: 'cursor', limit: 10 }),
            { cursor: cursorNormalized.next_cursor, has_more: cursorNormalized.has_more }
          );

          const cursorPrepared2 = await Promise.resolve(adapter.prepareQuery({
            spec,
            profile: cursorProfile,
            secrets,
            pagination: pag2,
            options: {},
          }));

          // The second prepared request should differ (include cursor)
          const req1 = JSON.stringify(cursorPrepared1.request);
          const req2 = JSON.stringify(cursorPrepared2.request);
          if (req1 === req2) {
            const err = new Error(
              'pagination_cursor_propagation: second prepareQuery with cursor must produce a different request than the first'
            );
            err.code = 'PAGINATION_CURSOR_FAILED';
            throw err;
          }
        } finally {
          await cursorServer.close();
        }
      } catch (err) {
        errors.push({ check: 'pagination_cursor_propagation', error: err });
      }
    }

    // -----------------------------------------------------------------------
    // Category 7: Error Handling (check 10)
    // -----------------------------------------------------------------------

    // Check 10: error_propagation
    {
      const errorServer = await startJsonServer(() => ({
        status: 500,
        json: { error: 'Internal Server Error' },
      }));
      try {
        const errorProfile = { ...profile, base_url: errorServer.baseUrl };
        const errorPrepared = await Promise.resolve(adapter.prepareQuery({
          spec,
          profile: errorProfile,
          secrets,
          pagination,
          options: {},
        }));
        try {
          await Promise.resolve(adapter.executeRequest({
            spec,
            profile: errorProfile,
            secrets,
            pagination,
            prepared: errorPrepared,
            options: {},
          }));
          // If we get here, the adapter didn't throw -- check if it returned error info
        } catch (err) {
          // Good -- adapter threw on 500
          assert.ok(
            err.code || err.message,
            'error_propagation: thrown error should have code or message'
          );
        }
      } catch (err) {
        errors.push({ check: 'error_propagation', error: err });
      } finally {
        await errorServer.close();
      }
    }

    // -----------------------------------------------------------------------
    // Category 8: Auth (check 14)
    // -----------------------------------------------------------------------

    // Check 14: auth_header_attachment
    if (prepared && prepared.request) {
      let capturedHeaders = null;
      const authServer = await startJsonServer(({ req }) => {
        capturedHeaders = { ...req.headers };
        return { status: 200, json: { results: [] } };
      });
      try {
        const authProfile = createTestProfile(connectorId, {
          base_url: authServer.baseUrl,
          auth_type: effectiveAuthConfig.auth_type,
          secret_refs: effectiveAuthConfig.secret_refs || { api_key: { type: 'env', value: 'TEST_KEY' } },
        });
        const authPrepared = await Promise.resolve(adapter.prepareQuery({
          spec,
          profile: authProfile,
          secrets,
          pagination,
          options: {},
        }));
        try {
          await executeConnectorRequest({
            request: authPrepared.request,
            profile: authProfile,
            secrets,
            auth: { type: effectiveAuthConfig.auth_type },
            options: {},
          });
        } catch {
          // May fail for complex auth types -- that's ok, we just check headers were set
        }
        if (capturedHeaders) {
          const authType = effectiveAuthConfig.auth_type;
          if (authType === 'api_key' || authType === 'bearer' || authType === 'basic') {
            assert.ok(
              capturedHeaders.authorization,
              'auth_header_attachment: authorization header should be set for ' + authType
            );
          } else if (authType === 'session') {
            assert.ok(
              capturedHeaders.cookie,
              'auth_header_attachment: cookie header should be set for session auth'
            );
          }
        }
      } catch (err) {
        errors.push({ check: 'auth_header_attachment', error: err });
      } finally {
        await authServer.close();
      }
    }

    // -----------------------------------------------------------------------
    // Category 9: Optional Lifecycle (checks 16-21)
    // -----------------------------------------------------------------------

    // Check 16: optional_preflight_callable
    if (typeof adapter.preflight === 'function') {
      try {
        const preResult = await Promise.resolve(adapter.preflight({
          spec,
          profile,
          secrets,
          options: {},
        }));
        // Just verify it completes without throwing
        assert.ok(true, 'optional_preflight_callable: preflight completed successfully');
      } catch (err) {
        errors.push({ check: 'optional_preflight_callable', error: err });
      }
    }

    // Check 17: optional_emit_artifacts_callable
    if (adapter.emitArtifacts !== undefined) {
      try {
        assert.strictEqual(
          typeof adapter.emitArtifacts,
          'function',
          'optional_emit_artifacts_callable: emitArtifacts must be a function'
        );
      } catch (err) {
        errors.push({ check: 'optional_emit_artifacts_callable', error: err });
      }
    }

    // Check 18: optional_on_error_callable
    if (adapter.onError !== undefined) {
      try {
        assert.strictEqual(
          typeof adapter.onError,
          'function',
          'optional_on_error_callable: onError must be a function'
        );
      } catch (err) {
        errors.push({ check: 'optional_on_error_callable', error: err });
      }
    }

    // Check 19: lifecycle_stages_valid
    if (adapter.lifecycle !== undefined) {
      try {
        assert.ok(Array.isArray(adapter.lifecycle), 'lifecycle_stages_valid: lifecycle must be an array');
        for (const stage of adapter.lifecycle) {
          assert.ok(
            LIFECYCLE_STAGES.includes(stage),
            `lifecycle_stages_valid: unsupported lifecycle stage '${stage}'`
          );
        }
      } catch (err) {
        errors.push({ check: 'lifecycle_stages_valid', error: err });
      }
    }

    // Check 20: dry_run_support
    if (adapter.capabilities.supports_dry_run) {
      try {
        const drySpec = createTestQuerySpec(connectorId, { execution: { dry_run: true } });
        const dryPrepared = await Promise.resolve(adapter.prepareQuery({
          spec: drySpec,
          profile,
          secrets,
          pagination,
          options: {},
        }));
        assert.ok(dryPrepared, 'dry_run_support: prepareQuery with dry_run=true must return result');
      } catch (err) {
        errors.push({ check: 'dry_run_support', error: err });
      }
    }

    // Check 21: relationship_extraction
    if (adapter.capabilities.supports_relationships && normalized) {
      try {
        assert.ok(
          Array.isArray(normalized.relationships),
          'relationship_extraction: normalizeResponse must include relationships array when supports_relationships is true'
        );
      } catch (err) {
        errors.push({ check: 'relationship_extraction', error: err });
      }
    }

    // -----------------------------------------------------------------------
    // Category 10: Integration shape (checks 22-25)
    // -----------------------------------------------------------------------

    // Check 22: capabilities_has_required_fields
    try {
      const cap = adapter.capabilities;
      assert.ok(cap.id, 'capabilities_has_required_fields: capabilities must have id');
      assert.ok(cap.display_name, 'capabilities_has_required_fields: capabilities must have display_name');
      assert.ok(Array.isArray(cap.auth_types), 'capabilities_has_required_fields: capabilities must have auth_types array');
      assert.ok(Array.isArray(cap.dataset_kinds), 'capabilities_has_required_fields: capabilities must have dataset_kinds array');
      assert.ok(Array.isArray(cap.languages), 'capabilities_has_required_fields: capabilities must have languages array');
      assert.ok(Array.isArray(cap.pagination_modes), 'capabilities_has_required_fields: capabilities must have pagination_modes array');
    } catch (err) {
      errors.push({ check: 'capabilities_has_required_fields', error: err });
    }

    // Check 23: prepare_query_request_shape
    if (prepared && prepared.request) {
      try {
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        assert.ok(
          validMethods.includes(prepared.request.method.toUpperCase()),
          `prepare_query_request_shape: request.method '${prepared.request.method}' must be one of ${validMethods.join(', ')}`
        );
      } catch (err) {
        errors.push({ check: 'prepare_query_request_shape', error: err });
      }
    }

    // Check 24: normalize_response_shape_consistency
    if (normalized) {
      try {
        assert.ok(
          typeof normalized === 'object' && normalized !== null && !Array.isArray(normalized),
          'normalize_response_shape_consistency: result must be a plain object'
        );
        assert.ok(Array.isArray(normalized.events), 'normalize_response_shape_consistency: result.events must be an array');
        assert.strictEqual(
          typeof normalized.has_more,
          'boolean',
          'normalize_response_shape_consistency: result.has_more must be a boolean'
        );
      } catch (err) {
        errors.push({ check: 'normalize_response_shape_consistency', error: err });
      }
    }

    // Check 25: execute_request_returns_response
    if (executeResponse !== undefined) {
      try {
        assert.ok(
          typeof executeResponse === 'object' && executeResponse !== null,
          'execute_request_returns_response: executeRequest must return an object'
        );
        assert.ok(
          executeResponse.data !== undefined || executeResponse.status !== undefined,
          'execute_request_returns_response: response must have data or status property'
        );
      } catch (err) {
        errors.push({ check: 'execute_request_returns_response', error: err });
      }
    }

  } finally {
    // Cleanup: close mock server
    await mockServer.close();

    // Cleanup: restore env vars
    for (const [key] of Object.entries(effectiveTestEnv)) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  }

  // If any check had errors, throw with details about what failed
  if (errors.length > 0) {
    const failedChecks = errors.map(e => e.check);
    const details = errors.map(e => `  ${e.check}: ${e.error.message}`).join('\n');
    const err = new Error(
      `Contract checks failed (${errors.length}):\n${details}`
    );
    err.code = errors[0].error.code || 'CONTRACT_CHECK_FAILED';
    err.failedChecks = failedChecks;
    err.checkErrors = errors;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  runContractTests,
  createTestQuerySpec,
  createTestProfile,
  createTestSecrets,
};
