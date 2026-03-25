/**
 * Built-in cloud connector tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
const { startJsonServer } = require('./runtime-fixtures.cjs');

describe('built-in cloud connectors', () => {
  test('aws cloudtrail signs requests and paginates lookup events', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-key-example';
    let page = 0;
    const fixture = await startJsonServer(async ({ req, body }) => {
      page += 1;
      assert.strictEqual(req.method, 'POST');
      assert.ok(req.headers.authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/'));
      assert.strictEqual(req.headers['x-amz-target'], 'com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.LookupEvents');
      const parsed = JSON.parse(body);
      if (page === 1) {
        assert.strictEqual(parsed.NextToken, undefined);
        return {
          json: {
            Events: [
              {
                EventId: 'ct-1',
                EventName: 'AssumeRole',
                EventSource: 'sts.amazonaws.com',
                EventTime: '2026-03-24T06:00:00.000Z',
                Username: 'analyst',
                CloudTrailEvent: JSON.stringify({ sourceIPAddress: '9.9.9.9' }),
              },
            ],
            NextToken: 'page-2',
          },
        };
      }

      assert.strictEqual(parsed.NextToken, 'page-2');
      return {
        json: {
          Events: [
            {
              EventId: 'ct-2',
              EventName: 'CreateAccessKey',
              EventSource: 'iam.amazonaws.com',
              EventTime: '2026-03-24T07:00:00.000Z',
              Username: 'analyst',
              CloudTrailEvent: JSON.stringify({ sourceIPAddress: '9.9.9.9' }),
            },
          ],
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'aws', profile: 'prod', region: 'us-east-1' },
        dataset: { kind: 'cloud' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        pagination: { mode: 'token', max_pages: 2, limit: 50 },
        query: { language: 'api', statement: 'LookupEvents' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            aws: {
              prod: {
                auth_type: 'sigv4',
                base_url: fixture.baseUrl,
                region: 'us-east-1',
                secret_refs: {
                  access_key_id: { type: 'env', value: 'AWS_ACCESS_KEY_ID' },
                  secret_access_key: { type: 'env', value: 'AWS_SECRET_ACCESS_KEY' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 2);
      assert.ok(result.envelope.entities.some(item => item.kind === 'user' && item.value === 'analyst'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'ip' && item.value === '9.9.9.9'));
    } finally {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      await fixture.close();
    }
  });

  test('gcp cloud logging uses service-account OAuth and nextPageToken pagination', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    process.env.GCP_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'svc-test@example.iam.gserviceaccount.com',
      private_key: pem,
    });

    let page = 0;
    const fixture = await startJsonServer(async ({ req, body }) => {
      if (req.url === '/oauth2/token') {
        const parsed = new URLSearchParams(body);
        assert.strictEqual(parsed.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        assert.ok(parsed.get('assertion'));
        return { json: { access_token: 'gcp-token', expires_in: 3600 } };
      }

      page += 1;
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/v2/entries:list');
      assert.strictEqual(req.headers.authorization, 'Bearer gcp-token');
      const parsed = JSON.parse(body);
      assert.deepStrictEqual(parsed.resourceNames, ['projects/demo-project']);
      if (page === 1) {
        assert.strictEqual(parsed.pageToken, undefined);
        return {
          json: {
            entries: [
              {
                insertId: 'gcp-1',
                timestamp: '2026-03-24T05:00:00.000Z',
                logName: 'projects/demo-project/logs/cloudaudit.googleapis.com%2Factivity',
                protoPayload: {
                  methodName: 'google.iam.admin.v1.CreateServiceAccountKey',
                  authenticationInfo: { principalEmail: 'svc@example.com' },
                },
                httpRequest: { remoteIp: '8.8.8.8' },
                resource: { labels: { project_id: 'demo-project' } },
              },
            ],
            nextPageToken: 'page-2',
          },
        };
      }

      assert.strictEqual(parsed.pageToken, 'page-2');
      return {
        json: {
          entries: [
            {
              insertId: 'gcp-2',
              timestamp: '2026-03-24T05:10:00.000Z',
              logName: 'projects/demo-project/logs/cloudaudit.googleapis.com%2Factivity',
              protoPayload: {
                methodName: 'google.iam.admin.v1.DeleteServiceAccountKey',
                authenticationInfo: { principalEmail: 'svc@example.com' },
              },
              httpRequest: { remoteIp: '8.8.8.8' },
              resource: { labels: { project_id: 'demo-project' } },
            },
          ],
        },
      };
    });

    try {
      const result = await runtime.executeQuerySpec({
        connector: { id: 'gcp', profile: 'prod' },
        dataset: { kind: 'cloud' },
        time_window: {
          start: '2026-03-24T00:00:00.000Z',
          end: '2026-03-25T00:00:00.000Z',
        },
        pagination: { mode: 'token', max_pages: 2, limit: 100 },
        query: { language: 'logging-filter', statement: 'protoPayload.methodName:*' },
      }, runtime.createBuiltInConnectorRegistry(), {
        config: {
          connector_profiles: {
            gcp: {
              prod: {
                auth_type: 'service_account',
                base_url: fixture.baseUrl,
                token_url: `${fixture.baseUrl}/oauth2/token`,
                default_parameters: {
                  resource_names: ['projects/demo-project'],
                },
                secret_refs: {
                  service_account_json: { type: 'env', value: 'GCP_SERVICE_ACCOUNT_JSON' },
                },
              },
            },
          },
        },
      });

      assert.strictEqual(result.envelope.counts.events, 2);
      assert.ok(result.envelope.entities.some(item => item.kind === 'principal' && item.value === 'svc@example.com'));
      assert.ok(result.envelope.entities.some(item => item.kind === 'gcp-resource' && item.value === 'demo-project'));
    } finally {
      delete process.env.GCP_SERVICE_ACCOUNT_JSON;
      await fixture.close();
    }
  });
});
