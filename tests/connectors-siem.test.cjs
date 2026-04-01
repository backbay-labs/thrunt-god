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
    assert.ok(ids.includes('opensearch'));
    assert.ok(ids.includes('defender_xdr'));

    for (const id of ['splunk', 'elastic', 'sentinel', 'opensearch', 'defender_xdr']) {
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
      assert.match(body, /search=search\+index%3Dsysmon/);
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

  test('splunk normalizes host and user fields from JSON _raw payloads', async () => {
    process.env.SPLUNK_TOKEN = 'splunk-token';
    const fixture = await startJsonServer(async () => {
      return {
        json: {
          results: [
            {
              _cd: '1:99',
              _time: '2026-03-24T12:00:00.000Z',
              host: 'splunk-indexer',
              sourcetype: 'sysmon',
              _raw: JSON.stringify({
                host: 'ws-01',
                user: 'alice',
                src_ip: '10.0.0.1',
              }),
            },
          ],
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
        query: { language: 'spl', statement: 'index=sysmon | head 1' },
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

      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'ws-01'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'alice'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'ip' && item.value === '10.0.0.1'));
      assert.strictEqual(result.envelope.events[0].raw.host, 'ws-01');
    } finally {
      delete process.env.SPLUNK_TOKEN;
      await fixture.close();
    }
  });

  test('splunk maps json_rows field arrays before extracting entities', async () => {
    process.env.SPLUNK_TOKEN = 'splunk-token';
    const fixture = await startJsonServer(async () => {
      return {
        json: {
          fields: [
            { name: '_time' },
            { name: 'host' },
            { name: 'user' },
            { name: 'src_ip' },
          ],
          rows: [
            ['2026-03-24T12:00:00.000Z', 'ws-02', 'bob', '10.0.0.2'],
          ],
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
        query: { language: 'spl', statement: 'index=sysmon | head 1' },
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

      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'ws-02'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'bob'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'ip' && item.value === '10.0.0.2'));
      assert.strictEqual(result.envelope.events[0].raw.host, 'ws-02');
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

  test('elastic reports status partial when ES|QL returns is_partial true', async () => {
    process.env.ELASTIC_API_KEY = 'elastic-key';
    const fixture = await startJsonServer(async () => {
      return {
        json: {
          columns: [
            { name: '@timestamp' },
            { name: 'host.name' },
          ],
          values: [
            ['2026-03-24T13:00:00.000Z', 'app-01'],
          ],
          is_partial: true,
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
        query: { language: 'esql', statement: 'FROM logs-* | LIMIT 10000' },
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

      assert.strictEqual(result.envelope.status, 'partial');
      assert.ok(result.envelope.warnings.some(w => w.code === 'elastic_partial'));
      assert.strictEqual(result.envelope.counts.events, 1);
    } finally {
      delete process.env.ELASTIC_API_KEY;
      await fixture.close();
    }
  });

  test('opensearch executes SQL and normalizes JDBC response with entities', async () => {
    process.env.OPENSEARCH_USER = 'admin';
    process.env.OPENSEARCH_PASS = 'admin';
    const fixture = await startJsonServer(async ({ req, body }) => {
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/_plugins/_sql');
      assert.ok(req.headers.authorization.startsWith('Basic '), 'should use basic auth');
      const parsed = JSON.parse(body);
      assert.ok(parsed.query, 'body should contain query field');
      return {
        json: {
          schema: [
            { name: '@timestamp', type: 'timestamp' },
            { name: 'host.name', type: 'keyword' },
            { name: 'user.name', type: 'keyword' },
          ],
          datarows: [
            ['2026-03-24T14:00:00.000Z', 'os-node-01', 'dave'],
          ],
          total: 1,
          size: 1,
          status: 200,
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'opensearch', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        query: { language: 'sql', statement: "SELECT * FROM logs WHERE @timestamp > '2026-03-24'" },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            opensearch: {
              prod: {
                auth_type: 'basic',
                base_url: fixture.baseUrl,
                secret_refs: {
                  username: { type: 'env', value: 'OPENSEARCH_USER' },
                  password: { type: 'env', value: 'OPENSEARCH_PASS' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(e => e.kind === 'host' && e.value === 'os-node-01'));
      assert.ok(result.envelope.entities.some(e => e.kind === 'user' && e.value === 'dave'));
      assert.strictEqual(result.envelope.metadata.endpoint, '/_plugins/_sql');
    } finally {
      delete process.env.OPENSEARCH_USER;
      delete process.env.OPENSEARCH_PASS;
      await fixture.close();
    }
  });

  test('defender xdr executes advanced hunting and normalizes Schema Results response', async () => {
    process.env.DEFENDER_CLIENT_ID = 'defender-client';
    process.env.DEFENDER_CLIENT_SECRET = 'defender-secret';
    const fixture = await startJsonServer(async ({ req, body }) => {
      if (req.url === '/oauth2/token') {
        assert.strictEqual(req.method, 'POST');
        assert.match(body, /grant_type=client_credentials/);
        assert.match(body, /scope=https%3A%2F%2Fapi\.security\.microsoft\.com%2F\.default/);
        return {
          json: {
            access_token: 'defender-token',
            expires_in: 3600,
          },
        };
      }

      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/advancedhunting/run');
      assert.strictEqual(req.headers.authorization, 'Bearer defender-token');
      const parsed = JSON.parse(body);
      assert.ok(parsed.Query, 'body should contain Query field');
      return {
        json: {
          Schema: [
            { Name: 'Timestamp', Type: 'DateTime' },
            { Name: 'DeviceName', Type: 'String' },
            { Name: 'AccountName', Type: 'String' },
            { Name: 'ActionType', Type: 'String' },
            { Name: 'RemoteIP', Type: 'String' },
          ],
          Results: [
            {
              Timestamp: '2026-03-24T15:00:00.000Z',
              DeviceName: 'xdr-host-01',
              AccountName: 'eve',
              ActionType: 'ConnectionSuccess',
              RemoteIP: '10.0.0.5',
            },
          ],
          Stats: { ExecutionTime: 1.234 },
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'defender_xdr', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        query: { language: 'kql', statement: 'DeviceNetworkEvents | take 5' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            defender_xdr: {
              prod: {
                auth_type: 'oauth_client_credentials',
                base_url: fixture.baseUrl,
                token_url: `${fixture.baseUrl}/oauth2/token`,
                secret_refs: {
                  client_id: { type: 'env', value: 'DEFENDER_CLIENT_ID' },
                  client_secret: { type: 'env', value: 'DEFENDER_CLIENT_SECRET' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(e => e.kind === 'host' && e.value === 'xdr-host-01'));
      assert.ok(result.envelope.entities.some(e => e.kind === 'user' && e.value === 'eve'));
      assert.ok(result.envelope.entities.some(e => e.kind === 'ip' && e.value === '10.0.0.5'));
      assert.strictEqual(result.envelope.metadata.endpoint, '/api/advancedhunting/run');
      assert.strictEqual(result.envelope.metadata.schema_columns, 5);
    } finally {
      delete process.env.DEFENDER_CLIENT_ID;
      delete process.env.DEFENDER_CLIENT_SECRET;
      await fixture.close();
    }
  });

  test('splunk falls back to async job mode when export endpoint returns 504', async () => {
    process.env.SPLUNK_TOKEN_ASYNC = 'splunk-async-token';
    let requestCount = 0;
    const fixture = await startJsonServer(async ({ req, body }) => {
      requestCount++;
      if (requestCount === 1) {
        // First request: POST to /services/search/v2/jobs/export -> 504
        assert.strictEqual(req.method, 'POST');
        assert.ok(req.url.startsWith('/services/search/v2/jobs/export'));
        return { status: 504 };
      }
      if (requestCount === 2) {
        // Second request: POST to /services/search/jobs -> create job
        assert.strictEqual(req.method, 'POST');
        assert.ok(req.url.startsWith('/services/search/jobs'));
        return { json: { sid: 'test_sid_123' } };
      }
      if (requestCount === 3) {
        // Third request: GET to /services/search/jobs/test_sid_123 -> poll status
        assert.strictEqual(req.method, 'GET');
        assert.ok(req.url.startsWith('/services/search/jobs/test_sid_123'));
        assert.ok(!req.url.includes('/results'));
        return { json: { entry: [{ content: { isDone: '1', resultCount: '1' } }] } };
      }
      if (requestCount === 4) {
        // Fourth request: GET to /services/search/jobs/test_sid_123/results -> fetch results
        assert.strictEqual(req.method, 'GET');
        assert.ok(req.url.includes('/services/search/jobs/test_sid_123/results'));
        return {
          json: {
            results: [
              {
                _cd: '2:99',
                _time: '2026-03-28T12:00:00.000Z',
                host: 'dc-01',
                user: 'svc-admin',
                sourcetype: 'sysmon',
              },
            ],
            messages: [],
          },
        };
      }
      return { status: 500 };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'splunk', profile: 'async' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-28T00:00:00.000Z',
          end: '2026-03-29T00:00:00.000Z',
        },
        query: { language: 'spl', statement: 'index=sysmon host=dc-01' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            splunk: {
              async: {
                auth_type: 'bearer',
                base_url: fixture.baseUrl,
                secret_refs: {
                  access_token: { type: 'env', value: 'SPLUNK_TOKEN_ASYNC' },
                },
              },
            },
          },
        },
        sleep: () => Promise.resolve(), // no-op sleep to avoid delays in tests
      });

      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'dc-01'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'svc-admin'));
      assert.strictEqual(result.envelope.metadata.endpoint, 'search/jobs');
      assert.strictEqual(requestCount, 4, 'Should have made exactly 4 requests (export, create, poll, results)');
    } finally {
      delete process.env.SPLUNK_TOKEN_ASYNC;
      await fixture.close();
    }
  });

  test('splunk falls back to async job mode when export transport fails', async () => {
    process.env.SPLUNK_TOKEN_ASYNC = 'splunk-async-token';
    let requestCount = 0;
    const fetch = async (url, init = {}) => {
      requestCount += 1;
      if (requestCount === 1) {
        throw new Error('terminated');
      }
      if (requestCount === 2) {
        assert.ok(String(url).includes('/services/search/jobs?output_mode=json'));
        return new Response(JSON.stringify({ sid: 'test_sid_transport' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (requestCount === 3) {
        assert.ok(String(url).includes('/services/search/jobs/test_sid_transport?output_mode=json'));
        return new Response(JSON.stringify({
          entry: [{ content: { isDone: '1', resultCount: '1' } }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (requestCount === 4) {
        assert.ok(String(url).includes('/services/search/jobs/test_sid_transport/results?output_mode=json&count=0'));
        return new Response(JSON.stringify({
          results: [
            {
              _cd: 'async:transport:1',
              _time: '2026-03-24T12:00:00.000Z',
              host: 'async-host',
              user: 'alice',
              sourcetype: 'sysmon',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch call #${requestCount}: ${url}`);
    };

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'splunk', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        query: { language: 'spl', statement: 'index=sysmon host=async-host' },
      }, runtime.createBuiltInConnectorRegistry(), {
        fetch,
        config: {
          connector_profiles: {
            splunk: {
              prod: {
                auth_type: 'bearer',
                base_url: 'http://splunk.example.local',
                secret_refs: {
                  access_token: { type: 'env', value: 'SPLUNK_TOKEN_ASYNC' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 1);
      assert.strictEqual(result.envelope.metadata.endpoint, 'search/jobs');
      assert.ok(result.envelope.entities.some(item => item.kind === 'host' && item.value === 'async-host'));
    } finally {
      delete process.env.SPLUNK_TOKEN_ASYNC;
    }
  });

  test('sentinel reports status partial when response contains PartialError', async () => {
    process.env.SENTINEL_CLIENT_ID = 'sentinel-client';
    process.env.SENTINEL_CLIENT_SECRET = 'sentinel-secret';
    const fixture = await startJsonServer(async ({ req }) => {
      if (req.url === '/oauth2/token') {
        return {
          json: {
            access_token: 'sentinel-token',
            expires_in: 3600,
          },
        };
      }

      return {
        json: {
          tables: [
            {
              columns: [
                { name: 'TimeGenerated' },
                { name: 'Computer' },
              ],
              rows: [
                ['2026-03-24T02:00:00.000Z', 'dc-01'],
              ],
            },
          ],
          error: {
            code: 'PartialError',
            message: 'Query execution ran into partial failure',
          },
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

      assert.strictEqual(result.envelope.status, 'partial');
      assert.ok(result.envelope.warnings.some(w => w.code === 'sentinel_partial_error'));
      assert.strictEqual(result.envelope.counts.events, 1);
    } finally {
      delete process.env.SENTINEL_CLIENT_ID;
      delete process.env.SENTINEL_CLIENT_SECRET;
      await fixture.close();
    }
  });

  test('elastic executes EQL sequence query and normalizes hits.sequences response', async () => {
    process.env.ELASTIC_API_KEY = 'elastic-key';
    let capturedReq = null;
    let capturedBody = null;
    const fixture = await startJsonServer(async ({ req, body }) => {
      capturedReq = req;
      capturedBody = body;
      return {
        json: {
          is_running: false,
          took: 42,
          timed_out: false,
          hits: {
            total: { value: 3, relation: 'eq' },
            sequences: [
              {
                join_keys: ['ws-01'],
                events: [
                  {
                    _index: 'test-sysmon',
                    _id: 'abc123',
                    _source: {
                      '@timestamp': '2026-03-28T12:00:00.000Z',
                      'host.name': 'ws-01',
                      'user.name': 'alice',
                      'source.ip': '10.0.0.1',
                      'event.action': 'process_create',
                      'event.code': '1',
                    },
                  },
                  {
                    _index: 'test-sysmon',
                    _id: 'def456',
                    _source: {
                      '@timestamp': '2026-03-28T12:01:00.000Z',
                      'host.name': 'ws-02',
                      'user.name': 'bob',
                      'source.ip': '10.0.0.2',
                      'event.action': 'network_connect',
                      'event.code': '3',
                    },
                  },
                ],
              },
            ],
          },
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'elastic', profile: 'prod' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-28T00:00:00.000Z',
          end: '2026-03-29T00:00:00.000Z',
        },
        query: {
          language: 'eql',
          statement: 'sequence [process where event.code == "1"] [network where event.code == "3"]',
        },
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

      // Request routed to /_eql/search
      assert.ok(capturedReq.url.endsWith('/_eql/search'), `Expected /_eql/search but got ${capturedReq.url}`);
      const parsedBody = JSON.parse(capturedBody);
      assert.strictEqual(parsedBody.query, 'sequence [process where event.code == "1"] [network where event.code == "3"]');

      // Envelope is correct
      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 2);

      // Entities extracted from _source fields
      assert.ok(result.envelope.entities.some(e => e.kind === 'host' && e.value === 'ws-01'));
      assert.ok(result.envelope.entities.some(e => e.kind === 'user' && e.value === 'alice'));

      // Metadata endpoint is /_eql/search
      assert.strictEqual(result.envelope.metadata.endpoint, '/_eql/search');

      // Capabilities include eql
      const connectors = runtime.createBuiltInConnectorRegistry().list();
      const elastic = connectors.find(c => c.id === 'elastic');
      assert.ok(elastic.languages.includes('eql'), 'elastic capabilities should include eql language');
      assert.ok(elastic.languages.includes('esql'), 'elastic capabilities should still include esql language');
    } finally {
      delete process.env.ELASTIC_API_KEY;
      await fixture.close();
    }
  });

  test('opensearch executes query with SigV4 authentication for AWS managed clusters', async () => {
    process.env.OPENSEARCH_AWS_KEY = 'test-access-key';
    process.env.OPENSEARCH_AWS_SECRET = 'test-secret-key';
    let capturedReq = null;
    const fixture = await startJsonServer(async ({ req, body }) => {
      capturedReq = req;
      return {
        json: {
          schema: [
            { name: '@timestamp', type: 'timestamp' },
            { name: 'host.name', type: 'keyword' },
            { name: 'user.name', type: 'keyword' },
          ],
          datarows: [
            ['2026-03-28T14:00:00.000Z', 'os-aws-01', 'frank'],
          ],
          total: 1,
          size: 1,
          status: 200,
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'opensearch', profile: 'aws' },
        dataset: { kind: 'events' },
        time_window: {
          start: '2026-03-28T00:00:00.000Z',
          end: '2026-03-29T00:00:00.000Z',
        },
        query: { language: 'sql', statement: "SELECT * FROM logs WHERE @timestamp > '2026-03-28'" },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            opensearch: {
              aws: {
                auth_type: 'sigv4',
                base_url: fixture.baseUrl,
                region: 'us-east-1',
                secret_refs: {
                  access_key_id: { type: 'env', value: 'OPENSEARCH_AWS_KEY' },
                  secret_access_key: { type: 'env', value: 'OPENSEARCH_AWS_SECRET' },
                },
              },
            },
          },
        },
      });

      // SigV4 signature in authorization header
      assert.ok(capturedReq.headers.authorization, 'Should have authorization header');
      assert.ok(capturedReq.headers.authorization.startsWith('AWS4-HMAC-SHA256'), `Expected AWS4-HMAC-SHA256 but got ${capturedReq.headers.authorization}`);
      assert.ok(capturedReq.headers['x-amz-date'], 'Should have x-amz-date header');

      // Envelope is correct
      assert.strictEqual(result.envelope.status, 'ok');
      assert.strictEqual(result.envelope.counts.events, 1);
      assert.ok(result.envelope.entities.some(e => e.kind === 'host' && e.value === 'os-aws-01'));
      assert.ok(result.envelope.entities.some(e => e.kind === 'user' && e.value === 'frank'));

      // Capabilities include sigv4
      const connectors = runtime.createBuiltInConnectorRegistry().list();
      const opensearch = connectors.find(c => c.id === 'opensearch');
      assert.ok(opensearch.auth_types.includes('sigv4'), 'opensearch capabilities should include sigv4 auth type');
    } finally {
      delete process.env.OPENSEARCH_AWS_KEY;
      delete process.env.OPENSEARCH_AWS_SECRET;
      await fixture.close();
    }
  });

  test('opensearch SigV4 preflight requires an explicit region', async () => {
    process.env.OPENSEARCH_AWS_KEY = 'test-access-key';
    process.env.OPENSEARCH_AWS_SECRET = 'test-secret-key';

    try {
      const result = await runtime.executeQuerySpec({
          connector: { id: 'opensearch', profile: 'aws' },
          dataset: { kind: 'events' },
          time_window: {
            start: '2026-03-28T00:00:00.000Z',
            end: '2026-03-29T00:00:00.000Z',
          },
          query: { language: 'sql', statement: "SELECT * FROM logs WHERE @timestamp > '2026-03-28'" },
        }, runtime.createBuiltInConnectorRegistry(), {
          config: {
            connector_profiles: {
              opensearch: {
                aws: {
                  auth_type: 'sigv4',
                  base_url: 'https://search.example.amazonaws.com',
                  secret_refs: {
                    access_key_id: { type: 'env', value: 'OPENSEARCH_AWS_KEY' },
                    secret_access_key: { type: 'env', value: 'OPENSEARCH_AWS_SECRET' },
                  },
                },
              },
            },
          },
        });
      assert.strictEqual(result.envelope.status, 'error');
      assert.strictEqual(result.envelope.metadata.last_stage, 'preflight');
      assert.strictEqual(result.envelope.errors[0].code, 'OPENSEARCH_SIGV4_REGION_REQUIRED');
    } finally {
      delete process.env.OPENSEARCH_AWS_KEY;
      delete process.env.OPENSEARCH_AWS_SECRET;
    }
  });
});
