/**
 * SDK Export Surface tests (Phase 33)
 * Verifies all 18 new exports are present and callable from external modules.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../thrunt-god/bin/lib/runtime.cjs');

// ──────────────────────────────────────────────────────────────────────────────
// 1. Export presence
// ──────────────────────────────────────────────────────────────────────────────
describe('SDK export surface — presence', () => {
  const NEW_EXPORTS = [
    'normalizeBaseUrl',
    'joinUrl',
    'buildUrl',
    'executeConnectorRequest',
    'authorizeRequest',
    'toArray',
    'isPlainObject',
    'cloneObject',
    'getSecret',
    'normalizeSecretRef',
    'getNestedValue',
    'addEntitiesFromRecord',
    'addEntity',
    'normalizeEvent',
    'toIsoOrNull',
    'toUnixSeconds',
    'parseResponseBody',
    'parseLinkHeader',
  ];

  // All 43 symbols that existed in module.exports before Phase 33 additions.
  // Note: the plan interface doc listed 32 but the actual module had 43 prior
  // to this phase (the 11 extra had been added in earlier v1.x phases).
  const EXISTING_EXPORTS = [
    'QUERY_SPEC_VERSION',
    'RESULT_ENVELOPE_VERSION',
    'DATASET_KINDS',
    'PAGINATION_MODES',
    'CONSISTENCY_MODES',
    'RESULT_STATUSES',
    'EVIDENCE_POLICIES',
    'LIFECYCLE_STAGES',
    'AUTH_TYPES',
    'SECRET_REF_TYPES',
    'DEFAULT_TIMEOUT_MS',
    'DEFAULT_MAX_PAGES',
    'DEFAULT_PAGE_SIZE',
    'DEFAULT_MAX_RETRIES',
    'DEFAULT_BACKOFF_MS',
    'createQuerySpec',
    'validateQuerySpec',
    'normalizeTimeWindow',
    'normalizePagination',
    'normalizeExecution',
    'normalizeEvidence',
    'createConnectorCapabilities',
    'createAuthProfile',
    'validateAuthProfile',
    'resolveConnectorProfile',
    'resolveSecretRefs',
    'selectConnectorProfileName',
    'createPaginationState',
    'advancePaginationState',
    'computeBackoffDelayMs',
    'createConnectorRegistry',
    'createBuiltInConnectorRegistry',
    'getBuiltInSmokeDefinition',
    'buildConnectorSmokeSpec',
    'assessConnectorReadiness',
    'assessRuntimeReadiness',
    'validateConnectorCapabilities',
    'validateConnectorAdapter',
    'createWarning',
    'createRuntimeError',
    'createResultEnvelope',
    'performHttpRequest',
    'executeQuerySpec',
  ];

  test('all 18 new SDK functions are exported as typeof function', () => {
    for (const name of NEW_EXPORTS) {
      assert.strictEqual(
        typeof runtime[name],
        'function',
        `Expected runtime.${name} to be a function, got ${typeof runtime[name]}`
      );
    }
  });

  test('all 32 existing exports are still present (backward compatibility)', () => {
    for (const name of EXISTING_EXPORTS) {
      assert.ok(
        name in runtime,
        `Expected runtime.${name} to still be exported`
      );
    }
  });

  test('total export count is 64 (43 pre-existing + 18 Phase 33 + 3 Phase 43 dispatch)', () => {
    // 43 pre-Phase 33 + 18 SDK exports + 3 dispatch re-exports = 64
    assert.strictEqual(Object.keys(runtime).length, 64);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. URL utilities
// ──────────────────────────────────────────────────────────────────────────────
describe('SDK export surface — URL utilities', () => {
  const { normalizeBaseUrl, joinUrl, buildUrl } = runtime;

  test('normalizeBaseUrl strips trailing slash from profile.base_url', () => {
    const result = normalizeBaseUrl({ base_url: 'https://example.com/' }, 'https://fallback.com');
    assert.strictEqual(result, 'https://example.com');
  });

  test('normalizeBaseUrl returns fallback when profile has no base_url', () => {
    const result = normalizeBaseUrl({}, 'https://fallback.com');
    assert.strictEqual(result, 'https://fallback.com');
  });

  test('joinUrl concatenates base and path without double slash', () => {
    assert.strictEqual(joinUrl('https://example.com', '/api/v1'), 'https://example.com/api/v1');
  });

  test('joinUrl strips trailing slash from base before joining', () => {
    assert.strictEqual(joinUrl('https://example.com/', '/api/v1'), 'https://example.com/api/v1');
  });

  test('buildUrl appends query params to URL', () => {
    const result = buildUrl('https://example.com', '/search', { q: 'test' });
    assert.ok(result.includes('?q=test'), `Expected '?q=test' in '${result}'`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. General utilities
// ──────────────────────────────────────────────────────────────────────────────
describe('SDK export surface — general utilities', () => {
  const {
    toArray,
    isPlainObject,
    cloneObject,
    toIsoOrNull,
    toUnixSeconds,
    parseResponseBody,
    parseLinkHeader,
    getNestedValue,
    normalizeSecretRef,
    addEntity,
    normalizeEvent,
  } = runtime;

  // toArray
  test("toArray('a') returns ['a']", () => {
    assert.deepStrictEqual(toArray('a'), ['a']);
  });

  test("toArray(['a','b']) returns ['a','b']", () => {
    assert.deepStrictEqual(toArray(['a', 'b']), ['a', 'b']);
  });

  test('toArray(null) returns []', () => {
    assert.deepStrictEqual(toArray(null), []);
  });

  // isPlainObject
  test('isPlainObject({}) returns true', () => {
    assert.strictEqual(isPlainObject({}), true);
  });

  test('isPlainObject([]) returns false', () => {
    assert.strictEqual(isPlainObject([]), false);
  });

  test('isPlainObject(null) returns false', () => {
    assert.strictEqual(isPlainObject(null), false);
  });

  // cloneObject
  test('cloneObject returns deep equal value', () => {
    assert.deepStrictEqual(cloneObject({ a: 1 }), { a: 1 });
  });

  test('cloneObject returns a new reference', () => {
    const original = { a: 1 };
    const clone = cloneObject(original);
    assert.notStrictEqual(clone, original);
  });

  // toIsoOrNull
  test("toIsoOrNull('2024-01-01T00:00:00Z') returns an ISO string", () => {
    const result = toIsoOrNull('2024-01-01T00:00:00Z');
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.includes('2024'), `Expected ISO string containing 2024, got: ${result}`);
  });

  test('toIsoOrNull(null) returns null', () => {
    assert.strictEqual(toIsoOrNull(null), null);
  });

  // toUnixSeconds
  test("toUnixSeconds('2024-01-01T00:00:00Z') returns 1704067200", () => {
    assert.strictEqual(toUnixSeconds('2024-01-01T00:00:00Z'), 1704067200);
  });

  // parseResponseBody
  test("parseResponseBody('{\"a\":1}', 'application/json') returns { a: 1 }", () => {
    assert.deepStrictEqual(parseResponseBody('{"a":1}', 'application/json'), { a: 1 });
  });

  // parseLinkHeader
  test('parseLinkHeader returns object with next key', () => {
    const result = parseLinkHeader('<https://example.com?page=2>; rel="next"');
    assert.ok('next' in result, `Expected 'next' key in result: ${JSON.stringify(result)}`);
    assert.strictEqual(result.next, 'https://example.com?page=2');
  });

  // getNestedValue
  test("getNestedValue({ a: { b: 1 } }, 'a.b') returns 1", () => {
    assert.strictEqual(getNestedValue({ a: { b: 1 } }, 'a.b'), 1);
  });

  // normalizeSecretRef
  test("normalizeSecretRef('MY_VAR') returns { type: 'env', value: 'MY_VAR' }", () => {
    assert.deepStrictEqual(normalizeSecretRef('MY_VAR'), { type: 'env', value: 'MY_VAR' });
  });

  // addEntity
  test('addEntity called with valid args does not throw', () => {
    const target = [];
    assert.doesNotThrow(() => {
      addEntity(target, 'test-connector', 'ip_address', '1.2.3.4', {});
    });
    assert.strictEqual(target.length, 1);
  });

  // normalizeEvent
  test('normalizeEvent called with valid args returns object with connector_id field', () => {
    const result = normalizeEvent('test-connector', { title: 'Test', timestamp: '2024-01-01T00:00:00Z' });
    assert.strictEqual(typeof result, 'object');
    assert.strictEqual(result.connector_id, 'test-connector');
  });
});
