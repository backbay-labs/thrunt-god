/**
 * Built-in SIEM connector tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
const { startJsonServer } = require('./runtime-fixtures.cjs');

describe('built-in SIEM connectors', () => {
  test('registry lists the core SIEM connector tranche with docs and limitations', () => {
    const connectors = runtime.createBuiltInConnectorRegistry().list();
    const ids = connectors.map(item => item.id);

    assert.ok(ids.includes('splunk'));
    assert.ok(ids.includes('elastic'));
    assert.ok(ids.includes('sentinel'));

    for (const id of ['splunk', 'elastic', 'sentinel']) {
      const connector = connectors.find(item => item.id === id);
      assert.ok(connector.docs_url, `${id} should publish docs_url`);
      assert.ok(Array.isArray(connector.limitations), `${id} should publish limitations`);
      assert.ok(connector.limitations.length > 0, `${id} should publish at least one limitation`);
    }
  });

  test('splunk executes through the shared runtime and normalizes host/user entities', async () => {
    process.env.SPLUNK_TOKEN = 'splunk-token';
    const fixture = await startJsonServer(async ({ req, body }) => {
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/services/search/v2/jobs/export');
      assert.strictEqual(req.headers.authorization, 'Bearer splunk-token');
      assert.match(body, /search=index%3Dsysmon/);
      return {
        json: {
          results: [
            {
              _cd: '1:42',
              _time: '2026-03-24T12:00:00.000Z',
              host: 'ws-01',
              user: 'alice',
              sourcetype: 'sysmon',
            },
          ],
          messages: [{ text: 'streamed export complete' }],
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'splunk', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        query: { language: 'spl', statement: 'index=sysmon host=ws-01' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            splunk: {
              prod: {
                auth_type: 'bearer',
                base_url: fixture.baseUrl,
                secret_refs: {
                  access_token: { type: 'env', value: 'SPLUNK_TOKEN' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'ws-01'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'alice'));
      assert.strictEqual(result.envelope.metadata.endpoint, 'search/v2/jobs/export');
    } finally {
      delete process.env.SPLUNK_TOKEN;
      await fixture.close();
    }
  });

  test('elastic executes ES|QL and normalizes dotted column names', async () => {
    process.env.ELASTIC_API_KEY = 'elastic-key';
    const fixture = await startJsonServer(async ({ req, body }) => {
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/_query');
      assert.strictEqual(req.headers.authorization, 'ApiKey elastic-key');
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.query, 'FROM logs-* | LIMIT 5');
      return {
        json: {
          columns: [
            { name: '@timestamp' },
            { name: 'host.name' },
            { name: 'user.name' },
          ],
          values: [
            ['2026-03-24T13:00:00.000Z', 'app-01', 'bob'],
          ],
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'elastic', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-24T12:00:00.000Z',
          end: '2026-03-25T12:00:00.000Z',
        },
        query: { language: 'esql', statement: 'FROM logs-* | LIMIT 5' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            elastic: {
              prod: {
                auth_type: 'api_key',
                base_url: fixture.baseUrl,
                secret_refs: {
                  api_key: { type: 'env', value: 'ELASTIC_API_KEY' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'app-01'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'bob'));
    } finally {
      delete process.env.ELASTIC_API_KEY;
      await fixture.close();
    }
  });

  test('sentinel executes workspace queries through OAuth client credentials', async () => {
    process.env.SENTINEL_CLIENT_ID = 'sentinel-client';
    process.env.SENTINEL_CLIENT_SECRET = 'sentinel-secret';
    const fixture = await startJsonServer(async ({ req, body }) => {
      if (req.url === '/oauth2/token') {
        assert.strictEqual(req.method, 'POST');
        assert.match(body, /grant_type=client_credentials/);
        return {
          json: {
            access_token: 'sentinel-token',
            expires_in: 3600,
          },
        };
      }

      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/v1/workspaces/ws-123/query');
      assert.strictEqual(req.headers.authorization, 'Bearer sentinel-token');
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.query, 'SecurityEvent | take 5');
      assert.match(parsed.timespan, /2026-03-24T00:00:00.000Z/);
      return {
        json: {
          tables: [
            {
              columns: [
                { name: 'TimeGenerated' },
                { name: 'Computer' },
                { name: 'Account' },
              ],
              rows: [
                ['2026-03-24T02:00:00.000Z', 'dc-01', 'carol'],
              ],
            },
          ],
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'sentinel', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        query: { language: 'kql', statement: 'SecurityEvent | take 5' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            sentinel: {
              prod: {
                auth_type: 'oauth_client_credentials',
                base_url: `${fixture.baseUrl}/v1`,
                token_url: `${fixture.baseUrl}/oauth2/token`,
                default_parameters: { workspace_id: 'ws-123' },
                secret_refs: {
                  client_id: { type: 'env', value: 'SENTINEL_CLIENT_ID' },
                  client_secret: { type: 'env', value: 'SENTINEL_CLIENT_SECRET' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'dc-01'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'carol'));
    } finally {
      delete process.env.SENTINEL_CLIENT_ID;
      delete process.env.SENTINEL_CLIENT_SECRET;
      await fixture.close();
    }
  });
});
