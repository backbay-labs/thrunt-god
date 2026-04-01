'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  skipIfNoDocker,
  ensureSplunkHostAccess,
  createSplunkBearerToken,
  SPLUNK_URL,
  SPLUNK_USER,
  SPLUNK_PASSWORD,
} = require('./helpers.cjs');
const { seedSplunk } = require('./fixtures/seed-data.cjs');
const SPLUNK_AUTH = 'Basic ' + Buffer.from(`${SPLUNK_USER}:${SPLUNK_PASSWORD}`).toString('base64');

describe('splunk integration', async (t) => {
  if (skipIfNoDocker(t)) return;

  let bearerToken;
  let queryResult;

  test('bootstraps bearer token from Splunk REST API', async () => {
    await ensureSplunkHostAccess({ timeout: 300000 });
    await seedSplunk(SPLUNK_URL, { user: SPLUNK_USER, password: SPLUNK_PASSWORD });
    bearerToken = await createSplunkBearerToken(SPLUNK_URL, { user: SPLUNK_USER, password: SPLUNK_PASSWORD });
    assert.ok(typeof bearerToken === 'string' && bearerToken.length > 0, 'Bearer token should be a non-empty string');
  });

  test('executes SPL query through adapter and extracts host/user entities', async (t) => {
    if (!bearerToken) {
      t.skip('Bearer token not available (previous test may have failed)');
      return;
    }

    const runtime = require('../../thrunt-god/bin/lib/runtime.cjs');
    process.env.SPLUNK_INTEG_TOKEN = bearerToken;

    try {
      queryResult = await runtime.executeQuerySpec({
        connector: { id: 'splunk', profile: 'integ' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-27T00:00:00.000Z',
          end: '2026-03-29T00:00:00.000Z',
        },
        query: { language: 'spl', statement: 'index=test_sysmon | head 10' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            splunk: {
              integ: {
                auth_type: 'bearer',
                base_url: SPLUNK_URL,
                secret_refs: {
                  access_token: { type: 'env', value: 'SPLUNK_INTEG_TOKEN' },
                },
              },
            },
          },
        },
      });

      // Envelope assertions
      assert.strictEqual(queryResult.envelope.status, 'ok');
      assert.ok(queryResult.envelope.counts.events >= 1, 'Should have at least 1 event from seed data');

      // Entity extraction assertions
      assert.ok(queryResult.envelope.entities.some(e => e.kind === 'host'), 'Should extract at least one host entity');
      assert.ok(queryResult.envelope.entities.some(e => e.kind === 'user'), 'Should extract at least one user entity');

      // Verify seeded entity values
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'host' && ['ws-01', 'ws-02', 'dc-01'].includes(e.value)),
        'Host entity should match seeded data'
      );
      assert.ok(
        queryResult.envelope.entities.some(e => e.kind === 'user' && ['alice', 'bob', 'svc-admin'].includes(e.value)),
        'User entity should match seeded data'
      );

      // Metadata assertions
      assert.strictEqual(queryResult.envelope.metadata.backend, 'splunk');
      assert.strictEqual(queryResult.envelope.metadata.output_mode, 'json_rows');
      assert.ok(
        queryResult.envelope.metadata.endpoint.includes('export') || queryResult.envelope.metadata.endpoint.includes('jobs'),
        'Endpoint should reference export or jobs'
      );
    } finally {
      delete process.env.SPLUNK_INTEG_TOKEN;
    }
  });
});
