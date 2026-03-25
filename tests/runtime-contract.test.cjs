/**
 * Runtime contract tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');

describe('runtime contract', () => {
  test('createQuerySpec normalizes the canonical runtime contract', () => {
    const spec = runtime.createQuerySpec({
      connector: { id: 'splunk', profile: 'prod', tenant: 'tenant-a' },
      dataset: { kind: 'events', name: 'process_start' },
      time_window: { lookback_minutes: 60 },
      parameters: { host: 'ws-01' },
      pagination: { mode: 'cursor', limit: 250, max_pages: 4 },
      execution: { timeout_ms: 45_000, consistency: 'strict', dry_run: true },
      query: { language: 'spl', statement: 'index=sysmon host=$host$' },
      evidence: { hypothesis_ids: ['HYP-01'], tags: ['identity-pivot'] },
    }, new Date('2026-03-25T12:00:00.000Z'));

    assert.strictEqual(spec.version, '1.0');
    assert.strictEqual(spec.connector.id, 'splunk');
    assert.strictEqual(spec.execution.profile, 'prod');
    assert.strictEqual(spec.dataset.kind, 'events');
    assert.strictEqual(spec.time_window.start, '2026-03-25T11:00:00.000Z');
    assert.strictEqual(spec.time_window.end, '2026-03-25T12:00:00.000Z');
    assert.strictEqual(spec.pagination.mode, 'cursor');
    assert.strictEqual(spec.execution.request_id.startsWith('REQ-'), true);
    assert.deepStrictEqual(spec.evidence.hypothesis_ids, ['HYP-01']);
  });

  test('createQuerySpec rejects malformed query specs', () => {
    assert.throws(() => {
      runtime.createQuerySpec({
        connector: { id: '' },
        dataset: { kind: 'unknown' },
        time_window: { start: 'bad', end: 'also-bad' },
        query: { statement: '' },
      });
    }, /Invalid QuerySpec/);
  });

  test('validateConnectorAdapter enforces the supported SDK surface', () => {
    const adapter = {
      capabilities: runtime.createConnectorCapabilities({
        id: 'elastic',
        auth_types: ['api_key'],
        dataset_kinds: ['events', 'alerts'],
        languages: ['esql', 'dsl'],
        pagination_modes: ['cursor', 'none'],
      }),
      lifecycle: ['preflight', 'prepare', 'execute', 'normalize', 'emit', 'complete'],
      prepareQuery() {},
      executeRequest() {},
      normalizeResponse() {},
    };

    const valid = runtime.validateConnectorAdapter(adapter);
    assert.strictEqual(valid.valid, true);
    assert.deepStrictEqual(valid.errors, []);
  });

  test('createResultEnvelope preserves normalized data and runtime metadata', () => {
    const spec = runtime.createQuerySpec({
      connector: { id: 'sentinel' },
      dataset: { kind: 'alerts' },
      time_window: {
        start: '2026-03-24T00:00:00.000Z',
        end: '2026-03-25T00:00:00.000Z',
      },
      query: { language: 'kql', statement: 'SecurityAlert | take 5' },
    });

    const envelope = runtime.createResultEnvelope(spec, {
      started_at: '2026-03-25T00:00:00.000Z',
      completed_at: '2026-03-25T00:00:03.000Z',
      pages_fetched: 2,
      events: [{ id: 'evt-1' }],
      entities: [{ kind: 'host', value: 'dc-01' }],
      warnings: [runtime.createWarning('partial_fields', 'Some fields were omitted')],
      metadata: { backend_language: 'kql' },
    });

    assert.strictEqual(envelope.status, 'ok');
    assert.strictEqual(envelope.counts.events, 1);
    assert.strictEqual(envelope.counts.entities, 1);
    assert.strictEqual(envelope.pagination.pages_fetched, 2);
    assert.strictEqual(envelope.metadata.backend_language, 'kql');
  });

  test('pack bootstrap and execution-target helpers build workflow-ready artifacts', () => {
    const repoRoot = path.join(__dirname, '..');
    const packLib = require('../thrunt-god/bin/lib/pack.cjs');

    const bootstrap = packLib.buildPackBootstrap(repoRoot, 'domain.email-intrusion', {
      tenant: 'acme',
      focus_user: 'alice@example.com',
      focus_sender: 'evil.example',
    });
    assert.strictEqual(bootstrap.pack.id, 'domain.email-intrusion');
    assert.strictEqual(bootstrap.validation.valid, true);
    assert.ok(bootstrap.bootstrap.hypotheses.length > 0);
    assert.strictEqual(bootstrap.bootstrap.phase_seed.length, 3);

    const rendered = packLib.buildPackExecutionTargets(repoRoot, 'domain.email-intrusion', {
      tenant: 'acme',
      focus_user: 'alice@example.com',
      focus_sender: 'evil.example',
    }, {
      profile: 'default',
    });
    assert.ok(rendered.targets.length >= 1);
    assert.ok(rendered.targets[0].query_spec.query.statement.length > 0);
    assert.ok(!rendered.targets[0].query_spec.query.statement.includes('{{'));
  });

  test('connector smoke specs resolve from built-in and profile-defined sources', () => {
    const oktaSmoke = runtime.buildConnectorSmokeSpec('okta', {});
    assert.strictEqual(oktaSmoke.supported, true);
    assert.strictEqual(oktaSmoke.source, 'built_in');
    assert.strictEqual(oktaSmoke.spec.connector.id, 'okta');

    const elasticSmoke = runtime.buildConnectorSmokeSpec('elastic', {
      connector_profiles: {
        elastic: {
          prod: {
            auth_type: 'api_key',
            base_url: 'https://elastic.example.com',
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
    }, { profile: 'prod' });
    assert.strictEqual(elasticSmoke.supported, true);
    assert.strictEqual(elasticSmoke.source, 'profile');
    assert.strictEqual(elasticSmoke.spec.query.statement, 'FROM logs-* | LIMIT 1');

    const sentinelSmoke = runtime.buildConnectorSmokeSpec('sentinel', {
      connector_profiles: {
        sentinel: {
          prod: {
            auth_type: 'oauth_client_credentials',
            tenant: 'example.onmicrosoft.com',
            secret_refs: {
              client_id: { type: 'env', value: 'SENTINEL_CLIENT_ID' },
              client_secret: { type: 'env', value: 'SENTINEL_CLIENT_SECRET' },
            },
          },
        },
      },
    }, { profile: 'prod' });
    assert.strictEqual(sentinelSmoke.supported, false);
    assert.match(sentinelSmoke.reason, /No smoke spec available/);
  });
});

describe('runtime-facing docs and templates', () => {
  test('query log and receipt templates require runtime metadata', () => {
    const queryTemplate = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'templates', 'query-log.md'),
      'utf-8'
    );
    const receiptTemplate = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'templates', 'receipt.md'),
      'utf-8'
    );

    assert.match(queryTemplate, /query_spec_version/);
    assert.match(queryTemplate, /## Runtime Metadata/);
    assert.match(receiptTemplate, /result_status/);
    assert.match(receiptTemplate, /## Runtime Metadata/);
  });

  test('hunt run and architecture docs describe the shared runtime contract', () => {
    const commandDoc = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'hunt', 'run.md'),
      'utf-8'
    );
    const architectureDoc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'ARCHITECTURE.md'),
      'utf-8'
    );

    assert.match(commandDoc, /shared THRUNT runtime contract/);
    assert.match(commandDoc, /QuerySpec/);
    assert.match(commandDoc, /runtime execute --pack/);
    assert.match(commandDoc, /runtime doctor/);
    assert.match(architectureDoc, /## Runtime Abstraction/);
    assert.match(architectureDoc, /### Hunt Runtime Contract/);
    assert.match(architectureDoc, /normalized result envelope/);
    assert.match(architectureDoc, /Connector certification/);
  });
});
