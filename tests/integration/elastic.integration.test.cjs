'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { skipIfNoDocker, waitForHealthy, ELASTIC_URL } = require('./helpers.cjs');
const { seedElastic } = require('./fixtures/seed-data.cjs');

// is_partial behavior validated in unit tests (connectors-siem.test.cjs);
// 3 seed rows cannot trigger the 10K ceiling that produces is_partial: true.

describe('elastic integration', async (t) => {
  if (skipIfNoDocker(t)) return;

  let seedResult;
  let queryResult;

  test('seeds Elasticsearch and confirms ES|QL readiness', async () => {
    await waitForHealthy(ELASTIC_URL, { timeout: 60000 });
    seedResult = await seedElastic(ELASTIC_URL);
    assert.ok(seedResult.indexed >= 3, `Expected at least 3 indexed documents, got ${seedResult.indexed}`);
  });

  test('executes ES|QL query through adapter and extracts host/user entities', async (t2) => {
    if (!seedResult || seedResult.indexed < 1) {
      t2.skip('Seed data not available (previous test may have failed)');
      return;
    }

    const runtime = require('../../thrunt-god/bin/lib/runtime.cjs');
    // ES 9.3.2 with xpack.security.enabled=false accepts any auth header.
    // Use api_key auth with a dummy base64 key — the container ignores it.
    process.env.ELASTIC_INTEG_KEY = 'dGVzdDp0ZXN0'; // base64 of test:test

    try {
      queryResult = await runtime.executeQuerySpec({
        connector: { id: 'elastic', profile: 'integ' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-27T00:00:00.000Z',
          end: '2026-03-29T00:00:00.000Z',
        },
        query: { language: 'esql', statement: 'FROM test-sysmon | LIMIT 10' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            elastic: {
              integ: {
                auth_type: 'api_key',
                base_url: ELASTIC_URL,
                secret_refs: {
                  api_key: { type: 'env', value: 'ELASTIC_INTEG_KEY' },
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

      // Entity extraction — dotted column names (host.name, user.name) are parsed correctly
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'host'),
        'Should extract at least one host entity from host.name dotted column'
      );
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'user'),
        'Should extract at least one user entity from user.name dotted column'
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
      assert.strictEqual(queryResult.envelope.metadata.backend, 'elastic');
      assert.strictEqual(queryResult.envelope.metadata.endpoint, '/_query');
      assert.ok(
        Array.isArray(queryResult.envelope.metadata.columns) && queryResult.envelope.metadata.columns.length > 0,
        'metadata.columns should be a non-empty array'
      );
    } finally {
      delete process.env.ELASTIC_INTEG_KEY;
    }
  });
});
