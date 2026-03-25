/**
 * Runtime certification command tests
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const fs = require('fs');
const path = require('path');

const { createTempProject, cleanup, runThruntTools, TOOLS_PATH } = require('./helpers.cjs');
const { startJsonServer } = require('./runtime-fixtures.cjs');

function runThruntToolsAsync(args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [TOOLS_PATH, ...args],
      {
        cwd,
        env: { ...process.env, ...env },
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

describe('runtime doctor and smoke command surface', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('thrunt-runtime-doctor-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('runtime doctor reports per-connector readiness and built-in smoke support', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({
      connector_profiles: {
        okta: {
          prod: {
            auth_type: 'api_key',
            base_url: 'https://okta.example.com',
            secret_refs: {
              api_key: { type: 'env', value: 'OKTA_TOKEN' },
            },
          },
        },
      },
    }, null, 2));

    const result = runThruntTools(['runtime', 'doctor', '--profile', 'prod'], tmpDir, {
      OKTA_TOKEN: 'doctor-okta-token',
    });
    assert.ok(result.success, result.error);

    const output = JSON.parse(result.output);
    assert.ok(output.connectors.length >= 8);

    const okta = output.connectors.find(item => item.id === 'okta');
    assert.ok(okta);
    assert.strictEqual(okta.configured, true);
    assert.strictEqual(okta.readiness_status, 'ready');
    assert.ok(okta.readiness_score >= 80);
    assert.strictEqual(okta.smoke.supported, true);
    assert.strictEqual(okta.smoke.source, 'built_in');
    assert.deepStrictEqual(okta.profile_summary.missing_auth_material, []);

    const elastic = output.connectors.find(item => item.id === 'elastic');
    assert.ok(elastic);
    assert.strictEqual(elastic.configured, false);
    assert.strictEqual(elastic.readiness_status, 'unconfigured');
  });

  test('runtime doctor --live verifies a configured okta connector end-to-end', async () => {
    process.env.OKTA_TOKEN = 'live-okta-token';
    const fixture = await startJsonServer(async ({ req }) => {
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.headers.authorization, 'SSWS live-okta-token');
      return {
        json: [
          {
            uuid: 'evt-live-1',
            published: '2026-03-24T12:00:00.000Z',
            eventType: 'user.session.start',
            displayMessage: 'User session started',
            actor: { alternateId: 'alice@example.com' },
            client: { ipAddress: '1.2.3.4', device: 'Chrome' },
          },
        ],
      };
    });

    try {
      fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({
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
      }, null, 2));

      const output = JSON.parse(await runThruntToolsAsync([
        'runtime', 'doctor', 'okta', '--profile', 'prod', '--live',
      ], tmpDir, {
        OKTA_TOKEN: 'live-okta-token',
      }));

      assert.strictEqual(output.connectors.length, 1);
      const okta = output.connectors[0];
      assert.strictEqual(okta.id, 'okta');
      assert.strictEqual(okta.readiness_status, 'live_verified');
      assert.strictEqual(okta.checks.live_smoke.status, 'pass');
      assert.strictEqual(okta.checks.live_smoke.result.events, 1);
      assert.strictEqual(okta.checks.live_smoke.result.metadata.endpoint, '/api/v1/logs');
      assert.strictEqual(okta.readiness_score, 100);
    } finally {
      delete process.env.OKTA_TOKEN;
      await fixture.close();
    }
  });

  test('runtime smoke uses profile-defined smoke_test queries for elastic', async () => {
    process.env.ELASTIC_API_KEY = 'elastic-live-key';
    const fixture = await startJsonServer(async ({ req, body }) => {
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/_query');
      assert.strictEqual(req.headers.authorization, 'ApiKey elastic-live-key');
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.query, 'FROM logs-* | LIMIT 1');
      return {
        json: {
          columns: [
            { name: '@timestamp' },
            { name: 'host.name' },
          ],
          values: [
            ['2026-03-24T13:00:00.000Z', 'elastic-host-01'],
          ],
        },
      };
    });

    try {
      fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({
        connector_profiles: {
          elastic: {
            prod: {
              auth_type: 'api_key',
              base_url: fixture.baseUrl,
              secret_refs: {
                api_key: { type: 'env', value: 'ELASTIC_API_KEY' },
              },
              smoke_test: {
                dataset: 'events',
                language: 'esql',
                query: 'FROM logs-* | LIMIT 1',
              },
            },
          },
        },
      }, null, 2));

      const output = JSON.parse(await runThruntToolsAsync([
        'runtime', 'smoke', 'elastic', '--profile', 'prod',
      ], tmpDir, {
        ELASTIC_API_KEY: 'elastic-live-key',
      }));

      assert.strictEqual(output.connectors.length, 1);
      const elastic = output.connectors[0];
      assert.strictEqual(elastic.id, 'elastic');
      assert.strictEqual(elastic.smoke.source, 'profile');
      assert.strictEqual(elastic.checks.live_smoke.status, 'pass');
      assert.strictEqual(elastic.checks.live_smoke.result.events, 1);
      assert.strictEqual(elastic.readiness_status, 'live_verified');
    } finally {
      delete process.env.ELASTIC_API_KEY;
      await fixture.close();
    }
  });
});
