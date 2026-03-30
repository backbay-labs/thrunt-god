'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { skipIfNoDocker, waitForHealthy, OPENSEARCH_URL } = require('./helpers.cjs');
const { seedOpenSearch } = require('./fixtures/seed-data.cjs');

// This integration test validates the JDBC shim path: OpenSearch returns {schema, datarows}
// which the adapter maps to {columns, values} before passing through normalizeElasticRows.
// The core purpose is proving normalizeElasticRows produces correct row objects from live data.

describe('opensearch integration', async (t) => {
  if (skipIfNoDocker(t)) return;

  let seedResult;
  let queryResult;

  test('seeds OpenSearch and confirms SQL plugin readiness', async () => {
    await waitForHealthy(OPENSEARCH_URL, { timeout: 60000 });
    seedResult = await seedOpenSearch(OPENSEARCH_URL);
    assert.ok(seedResult.indexed >= 3, `Expected at least 3 indexed documents, got ${seedResult.indexed}`);
  });

  test('executes SQL query through adapter and validates normalizeElasticRows against live response', async (t2) => {
    if (!seedResult || seedResult.indexed < 1) {
      t2.skip('Seed data not available (previous test may have failed)');
      return;
    }

    const runtime = require('../../thrunt-god/bin/lib/runtime.cjs');
    // OpenSearch 2.19.1 with DISABLE_SECURITY_PLUGIN=true requires no auth.
    // Use basic auth with dummy credentials — the container ignores auth entirely.
    process.env.OPENSEARCH_INTEG_USER = 'admin';
    process.env.OPENSEARCH_INTEG_PASS = 'admin';

    try {
      queryResult = await runtime.executeQuerySpec({
        connector: { id: 'opensearch', profile: 'integ' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-27T00:00:00.000Z',
          end: '2026-03-29T00:00:00.000Z',
        },
        // OpenSearch SQL requires backticks around index names containing hyphens
        query: { language: 'sql', statement: 'SELECT * FROM `test-sysmon` LIMIT 10' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            opensearch: {
              integ: {
                auth_type: 'basic',
                base_url: OPENSEARCH_URL,
                secret_refs: {
                  username: { type: 'env', value: 'OPENSEARCH_INTEG_USER' },
                  password: { type: 'env', value: 'OPENSEARCH_INTEG_PASS' },
                },
              },
            },
          },
        },
      });

      // Envelope status
      assert.strictEqual(queryResult.envelope.status, 'ok');

      // Event count from seed data
      assert.ok(queryResult.envelope.counts.events >= 1, 'Should have at least 1 event from seed data');

      // Entity extraction — dotted column names from JDBC response mapped through normalizeElasticRows
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'host'),
        'Should extract at least one host entity from host.name field'
      );
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'user'),
        'Should extract at least one user entity from user.name field'
      );

      // Verify seeded entity values match expected hosts
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'host' && ['ws-01', 'ws-02', 'dc-01'].includes(e.value)),
        'Host entity should match seeded data (ws-01, ws-02, or dc-01)'
      );

      // Verify seeded entity values match expected users
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'user' && ['alice', 'bob', 'svc-admin'].includes(e.value)),
        'User entity should match seeded data (alice, bob, or svc-admin)'
      );

      // Metadata assertions
      assert.strictEqual(queryResult.envelope.metadata.backend, 'opensearch');
      assert.strictEqual(queryResult.envelope.metadata.endpoint, '/_plugins/_sql');
    } finally {
      delete process.env.OPENSEARCH_INTEG_USER;
      delete process.env.OPENSEARCH_INTEG_PASS;
    }
  });
});
