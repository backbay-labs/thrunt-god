/**
 * Runtime execution tests
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
const { createTempProject, cleanup } = require('./helpers.cjs');

describe('executeQuerySpec', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('executes a single-page adapter and emits query/receipt artifacts', async () => {
    const spec = runtime.createQuerySpec({
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      time_window: {
        start: '2026-03-24T00:00:00.000Z',
        end: '2026-03-25T00:00:00.000Z',
      },
      query: { language: 'spl', statement: 'index=sysmon | head 5' },
    });

    const adapter = {
      capabilities: runtime.createConnectorCapabilities({
        id: 'splunk',
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        languages: ['spl'],
        pagination_modes: ['none'],
      }),
      prepareQuery({ spec: querySpec }) {
        return { statement: querySpec.query.statement };
      },
      executeRequest() {
        return { rows: [{ id: 'evt-1' }], has_more: false };
      },
      normalizeResponse() {
        return {
          events: [{ id: 'evt-1', source: 'sysmon' }],
          entities: [{ kind: 'host', value: 'ws-01' }],
          has_more: false,
        };
      },
    };

    const result = await runtime.executeQuerySpec(spec, adapter, { cwd: tmpDir });

    assert.strictEqual(result.envelope.status, 'ok');
    assert.strictEqual(result.envelope.counts.events, 1);
    assert.ok(result.artifacts.query_log.path.includes('.planning/QUERIES/'));
    assert.strictEqual(result.artifacts.receipts.length, 1);
    assert.ok(fs.existsSync(path.join(tmpDir, result.artifacts.query_log.path)));
    assert.ok(fs.existsSync(path.join(tmpDir, result.artifacts.receipts[0].path)));
  });

  test('retries and paginates through the shared runtime loop', async () => {
    let attempts = 0;
    const retries = [];
    const spec = runtime.createQuerySpec({
      connector: { id: 'elastic' },
      dataset: { kind: 'events' },
      time_window: { lookback_minutes: 15 },
      pagination: { mode: 'cursor', limit: 100, max_pages: 3 },
      query: { language: 'esql', statement: 'from logs-* | limit 100' },
    });

    const adapter = {
      capabilities: runtime.createConnectorCapabilities({
        id: 'elastic',
        auth_types: ['api_key'],
        dataset_kinds: ['events'],
        languages: ['esql'],
        pagination_modes: ['cursor'],
      }),
      prepareQuery({ pagination }) {
        return { cursor: pagination.cursor };
      },
      executeRequest({ pagination }) {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error('temporary rate limit');
          err.code = 'RATE_LIMITED';
          err.retryable = true;
          throw err;
        }
        return { cursor: pagination.cursor, has_more: pagination.cursor !== 'page-2' };
      },
      normalizeResponse({ pagination }) {
        if (!pagination.cursor) {
          return { events: [{ id: 'page-1' }], next_cursor: 'page-2', has_more: true };
        }
        return { events: [{ id: 'page-2' }], has_more: false };
      },
    };

    const result = await runtime.executeQuerySpec(spec, adapter, {
      cwd: tmpDir,
      sleep: async () => {},
      onRetry(info) {
        retries.push(info);
      },
    });

    assert.strictEqual(retries.length, 1);
    assert.strictEqual(result.envelope.counts.events, 2);
    assert.strictEqual(result.pagination.pages_fetched, 2);
    assert.strictEqual(result.envelope.pagination.pages_fetched, 2);
  });

  test('returns structured partial failures with artifact ids preserved', async () => {
    const spec = runtime.createQuerySpec({
      connector: { id: 'sentinel' },
      dataset: { kind: 'alerts' },
      time_window: { lookback_minutes: 60 },
      pagination: { mode: 'page', limit: 50, max_pages: 3 },
      query: { language: 'kql', statement: 'SecurityAlert | take 50' },
    });

    const adapter = {
      capabilities: runtime.createConnectorCapabilities({
        id: 'sentinel',
        auth_types: ['oauth_client_credentials'],
        dataset_kinds: ['alerts'],
        languages: ['kql'],
        pagination_modes: ['page'],
      }),
      prepareQuery({ pagination }) {
        return { page: pagination.page };
      },
      executeRequest({ pagination }) {
        if (pagination.page === 2) {
          const err = new Error('backend unavailable');
          err.code = 'BACKEND_DOWN';
          err.retryable = false;
          throw err;
        }
        return { page: pagination.page };
      },
      normalizeResponse({ pagination }) {
        if (pagination.page === 1) {
          return { events: [{ id: 'alert-1' }], has_more: true };
        }
        return { events: [], has_more: false };
      },
    };

    const result = await runtime.executeQuerySpec(spec, adapter, { cwd: tmpDir });

    assert.strictEqual(result.envelope.status, 'partial');
    assert.strictEqual(result.envelope.counts.events, 1);
    assert.strictEqual(result.envelope.errors.length, 1);
    assert.strictEqual(result.envelope.errors[0].connector_id, 'sentinel');
    assert.strictEqual(result.envelope.errors[0].details.stage, 'execute');
    assert.ok(Array.isArray(result.envelope.errors[0].details.partial_artifact_ids));
    assert.ok(result.envelope.errors[0].details.partial_artifact_ids.length >= 1);
  });
});
