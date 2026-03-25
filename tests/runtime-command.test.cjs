/**
 * Runtime command tests
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const fs = require('fs');
const path = require('path');

const { createTempProject, cleanup, runThruntTools, TOOLS_PATH } = require('./helpers.cjs');
const { startJsonServer } = require('./runtime-fixtures.cjs');

describe('runtime command surface', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('thrunt-runtime-cmd-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('runtime list-connectors exposes the built-in registry', () => {
    const result = runThruntTools(['runtime', 'list-connectors'], tmpDir);
    assert.ok(result.success, result.error);
    const output = JSON.parse(result.output);
    const ids = output.connectors.map(item => item.id);
    assert.ok(ids.includes('splunk'));
    assert.ok(ids.includes('okta'));
    assert.ok(ids.includes('aws'));
    assert.ok(ids.includes('gcp'));
  });

  test('runtime execute drives the real runtime and emits query logs plus receipts', async () => {
    process.env.SPLUNK_TOKEN = 'splunk-command-token';
    const fixture = await startJsonServer(async ({ req }) => {
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/services/search/v2/jobs/export');
      assert.strictEqual(req.headers.authorization, 'Bearer splunk-command-token');
      return {
        json: {
          results: [
            {
              _cd: 'cmd:1',
              _time: '2026-03-24T12:00:00.000Z',
              host: 'cmd-host',
              sourcetype: 'sysmon',
            },
          ],
        },
      };
    });

    try {
      fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({
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
      }, null, 2));

      const output = JSON.parse(await new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [
            TOOLS_PATH,
            'runtime',
            'execute',
            '--connector', 'splunk',
            '--profile', 'prod',
            '--dataset', 'events',
            '--language', 'spl',
            '--query', 'index=sysmon | head 1',
            '--start', '2026-03-24T00:00:00.000Z',
            '--end', '2026-03-25T00:00:00.000Z',
          ],
          {
            cwd: tmpDir,
            env: { ...process.env, SPLUNK_TOKEN: 'splunk-command-token' },
          },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            resolve(stdout);
          }
        );
      }));

      assert.strictEqual(output.result.status, 'ok');
      assert.ok(output.artifacts.query_log.path.includes('.planning/QUERIES/'));
      assert.strictEqual(output.artifacts.receipts.length, 1);
      assert.ok(fs.existsSync(path.join(tmpDir, output.artifacts.query_log.path)));
      assert.ok(fs.existsSync(path.join(tmpDir, output.artifacts.receipts[0].path)));
    } finally {
      delete process.env.SPLUNK_TOKEN;
      await fixture.close();
    }
  });

  test('runtime execute can run a pack-backed target through the shared runtime', async () => {
    const fixture = await startJsonServer(async ({ req }) => {
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/services/search/v2/jobs/export');
      return {
        json: {
          results: [
            {
              _cd: 'pack:1',
              _time: '2026-03-24T12:00:00.000Z',
              host: 'pack-host',
              sourcetype: 'sysmon',
            },
          ],
        },
      };
    });

    try {
      fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({
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
      }, null, 2));

      fs.mkdirSync(path.join(tmpDir, '.planning', 'packs'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.planning', 'packs', 'pack-runtime.json'), JSON.stringify({
        version: '1.0',
        id: 'custom.pack-runtime',
        kind: 'custom',
        title: 'Pack Runtime',
        description: 'Local pack used to test runtime execute --pack.',
        stability: 'preview',
        hypothesis_ids: ['HYP-02'],
        required_connectors: ['splunk'],
        supported_datasets: ['events'],
        parameters: [
          {
            name: 'tenant',
            type: 'string',
            required: true,
            description: 'Tenant selector.',
          },
        ],
        execution_targets: [
          {
            name: 'Splunk pack target',
            description: 'Pack-backed Splunk query.',
            connector: 'splunk',
            dataset: 'events',
            language: 'spl',
            query_template: 'index=sysmon tenant={{tenant}} | head 1',
          },
        ],
        scope_defaults: {
          time_window: {
            lookback_minutes: 60,
          },
        },
        execution_defaults: {
          consistency: 'best_effort',
          receipt_policy: 'material',
        },
        publish: {
          finding_type: 'pack_runtime_test',
          expected_outcomes: ['runtime_story'],
          receipt_tags: ['pack:custom.pack-runtime'],
        },
      }, null, 2));

      const output = JSON.parse(await new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [
            TOOLS_PATH,
            'runtime',
            'execute',
            '--pack', 'custom.pack-runtime',
            '--target', 'Splunk pack target',
            '--profile', 'prod',
            '--param', 'tenant=acme',
          ],
          {
            cwd: tmpDir,
            env: { ...process.env, SPLUNK_TOKEN: 'splunk-command-token' },
          },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            resolve(stdout);
          }
        );
      }));

      assert.strictEqual(output.pack.id, 'custom.pack-runtime');
      assert.strictEqual(output.results.length, 1);
      assert.strictEqual(output.results[0].result.status, 'ok');
      assert.ok(output.results[0].artifacts.query_log.path.includes('.planning/QUERIES/'));
      assert.strictEqual(output.results[0].artifacts.receipts.length, 1);
    } finally {
      await fixture.close();
    }
  });
});
