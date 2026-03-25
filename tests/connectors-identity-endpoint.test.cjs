/**
 * Built-in identity and endpoint connector tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
const { startJsonServer } = require('./runtime-fixtures.cjs');

describe('built-in identity and endpoint connectors', () => {
  test('okta follows next-link pagination and normalizes actors plus targets', async () => {
    process.env.OKTA_TOKEN = 'okta-token';
    let page = 0;
    const fixture = await startJsonServer(async ({ req }) => {
      page += 1;
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.headers.authorization, 'SSWS okta-token');
      if (page === 1) {
        assert.match(req.url, /^\/api\/v1\/logs\?/);
        return {
          headers: {
            link: `<${fixture.baseUrl}/api/v1/logs?after=page-2>; rel="next"`,
          },
          json: [
            {
              uuid: 'evt-1',
              published: '2026-03-24T12:00:00.000Z',
              eventType: 'user.session.start',
              displayMessage: 'User session started',
              actor: { alternateId: 'alice@example.com' },
              client: { ipAddress: '1.2.3.4', device: 'Chrome' },
              target: [{ type: 'User', alternateId: 'alice@example.com' }],
            },
          ],
        };
      }

      assert.strictEqual(req.url, '/api/v1/logs?after=page-2');
      return {
        json: [
          {
            uuid: 'evt-2',
            published: '2026-03-24T12:05:00.000Z',
            eventType: 'user.session.end',
            displayMessage: 'User session ended',
            actor: { alternateId: 'alice@example.com' },
            client: { ipAddress: '1.2.3.4', device: 'Chrome' },
            target: [{ type: 'User', alternateId: 'alice@example.com' }],
          },
        ],
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'okta', profile: 'prod' },
        dataset: { kind: 'identity' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        pagination: { mode: 'token', max_pages: 2 },
        parameters: { filter: 'eventType sw "user.session"' },
        query: { language: 'api', statement: 'eventType sw "user.session"' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            okta: {
              prod: {
                auth_type: 'api_key',
                base_url: fixture.baseUrl,
                secret_refs: {
                  api_key: { type: 'env', value: 'OKTA_TOKEN' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 2);
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'alice@example.com'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'ip' && item.value === '1.2.3.4'));
    } finally {
      delete process.env.OKTA_TOKEN;
      await fixture.close();
    }
  });

  test('m365 sign-ins use Graph pagination and normalize user plus device entities', async () => {
    process.env.M365_CLIENT_ID = 'm365-client';
    process.env.M365_CLIENT_SECRET = 'm365-secret';
    let signInPage = 0;
    const fixture = await startJsonServer(async ({ req, body }) => {
      if (req.url === '/oauth2/token') {
        assert.strictEqual(req.method, 'POST');
        assert.match(body, /grant_type=client_credentials/);
        return { json: { access_token: 'graph-token', expires_in: 3600 } };
      }

      signInPage += 1;
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.headers.authorization, 'Bearer graph-token');
      if (signInPage === 1) {
        return {
          json: {
            '@odata.nextLink': `${fixture.baseUrl}/auditLogs/signIns?$skiptoken=page-2`,
            value: [
              {
                id: 'signin-1',
                createdDateTime: '2026-03-24T10:00:00.000Z',
                userPrincipalName: 'bob@example.com',
                userId: 'user-1',
                ipAddress: '5.6.7.8',
                appDisplayName: 'Graph explorer',
                deviceDetail: { deviceId: 'dev-1', displayName: 'bob-laptop' },
                status: { failureReason: null },
              },
            ],
          },
        };
      }

      assert.strictEqual(req.url, '/auditLogs/signIns?$skiptoken=page-2');
      return {
        json: {
          value: [
            {
              id: 'signin-2',
              createdDateTime: '2026-03-24T11:00:00.000Z',
              userPrincipalName: 'bob@example.com',
              userId: 'user-1',
              ipAddress: '5.6.7.8',
              appDisplayName: 'SharePoint',
              deviceDetail: { deviceId: 'dev-1', displayName: 'bob-laptop' },
              status: { failureReason: null },
            },
          ],
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'm365', profile: 'prod' },
        dataset: { kind: 'identity' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        pagination: { mode: 'token', max_pages: 2 },
        query: { language: 'odata', statement: 'signIns' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            m365: {
              prod: {
                auth_type: 'oauth_client_credentials',
                base_url: fixture.baseUrl,
                token_url: `${fixture.baseUrl}/oauth2/token`,
                secret_refs: {
                  client_id: { type: 'env', value: 'M365_CLIENT_ID' },
                  client_secret: { type: 'env', value: 'M365_CLIENT_SECRET' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 2);
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'bob@example.com'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'device' && item.value === 'dev-1'));
    } finally {
      delete process.env.M365_CLIENT_ID;
      delete process.env.M365_CLIENT_SECRET;
      await fixture.close();
    }
  });

  test('crowdstrike alerts use OAuth and preserve endpoint entities across pages', async () => {
    process.env.CROWDSTRIKE_CLIENT_ID = 'falcon-client';
    process.env.CROWDSTRIKE_CLIENT_SECRET = 'falcon-secret';
    let alertPage = 0;
    const fixture = await startJsonServer(async ({ req, body }) => {
      if (req.url === '/oauth2/token') {
        return { json: { access_token: 'falcon-token', expires_in: 3600 } };
      }

      alertPage += 1;
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/alerts/combined/alerts/v1');
      assert.strictEqual(req.headers.authorization, 'Bearer falcon-token');
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.limit, 1000);
      if (alertPage === 1) {
        assert.strictEqual(parsed.after, undefined);
        return {
          json: {
            resources: [
              {
                id: 'alert-1',
                created_timestamp: '2026-03-24T08:00:00.000Z',
                name: 'Suspicious process',
                description: 'PowerShell launched from Office',
                user_name: 'dana',
                device: { device_id: 'device-1', hostname: 'host-1' },
              },
            ],
            meta: { pagination: { after: 'page-2' } },
          },
        };
      }

      assert.strictEqual(parsed.after, 'page-2');
      return {
        json: {
          resources: [
            {
              id: 'alert-2',
              created_timestamp: '2026-03-24T09:00:00.000Z',
              name: 'Credential dumping',
              description: 'LSASS access observed',
              user_name: 'dana',
              device: { device_id: 'device-1', hostname: 'host-1' },
            },
          ],
          meta: { pagination: {} },
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'crowdstrike', profile: 'prod' },
        dataset: { kind: 'alerts' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        pagination: { mode: 'token', max_pages: 2, limit: 1000 },
        query: { language: 'fql', statement: "name:'*'" },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            crowdstrike: {
              prod: {
                auth_type: 'oauth_client_credentials',
                base_url: fixture.baseUrl,
                secret_refs: {
                  client_id: { type: 'env', value: 'CROWDSTRIKE_CLIENT_ID' },
                  client_secret: { type: 'env', value: 'CROWDSTRIKE_CLIENT_SECRET' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 2);
      assert.ok(result.envelope.entities.some(item => item.kind === 'device' && item.value === 'device-1'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'dana'));
    } finally {
      delete process.env.CROWDSTRIKE_CLIENT_ID;
      delete process.env.CROWDSTRIKE_CLIENT_SECRET;
      await fixture.close();
    }
  });
});
