/**
 * Connector SDK tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');

describe('connector SDK primitives', () => {
  test('createAuthProfile accepts local-first auth references', () => {
    const profile = runtime.createAuthProfile({
      name: 'default',
      connector_id: 'splunk',
      auth_type: 'api_key',
      base_url: 'https://splunk.example.com',
      tenant: 'prod',
      secret_refs: {
        api_key: { type: 'env', value: 'SPLUNK_TOKEN' },
      },
    });

    assert.strictEqual(profile.connector_id, 'splunk');
    assert.strictEqual(profile.auth_type, 'api_key');
    assert.strictEqual(profile.secret_refs.api_key.type, 'env');
  });

  test('resolveConnectorProfile reads canonical connector profile config', () => {
    const profile = runtime.resolveConnectorProfile({
      connector_profiles: {
        sentinel: {
          prod: {
            auth_type: 'oauth_client_credentials',
            tenant: 'contoso',
            secret_refs: {
              client_id: { type: 'env', value: 'AZURE_CLIENT_ID' },
              client_secret: { type: 'env', value: 'AZURE_CLIENT_SECRET' },
            },
          },
        },
      },
    }, 'sentinel', 'prod');

    assert.strictEqual(profile.name, 'prod');
    assert.strictEqual(profile.connector_id, 'sentinel');
    assert.strictEqual(profile.auth_type, 'oauth_client_credentials');
  });

  test('pagination and backoff helpers are shared SDK surfaces', () => {
    const state = runtime.createPaginationState({ mode: 'cursor', limit: 200, max_pages: 3 });
    const page1 = runtime.advancePaginationState(state, { cursor: 'next-1' });
    const page2 = runtime.advancePaginationState(page1, { cursor: 'next-2' });
    const delay = runtime.computeBackoffDelayMs(2, 500, 10_000);

    assert.strictEqual(page1.pages_fetched, 1);
    assert.strictEqual(page1.cursor, 'next-1');
    assert.strictEqual(page2.pages_fetched, 2);
    assert.strictEqual(delay, 2000);
  });

  test('connector registry exposes capability discovery through one surface', () => {
    const registry = runtime.createConnectorRegistry([
      {
        capabilities: runtime.createConnectorCapabilities({
          id: 'okta',
          auth_types: ['oauth_client_credentials'],
          dataset_kinds: ['identity'],
          languages: ['api'],
          pagination_modes: ['page'],
        }),
        prepareQuery() {},
        executeRequest() {},
        normalizeResponse() {},
      },
    ]);

    assert.strictEqual(registry.has('okta'), true);
    assert.strictEqual(registry.get('okta').capabilities.id, 'okta');
    assert.deepStrictEqual(registry.list().map(item => item.id), ['okta']);
  });
});
