/**
 * Integration tests for reduce stage in executeQuerySpec.
 *
 * Verifies that template metadata flows through the full executeQuerySpec
 * pipeline -- from mock adapter events through the drain reduce stage to
 * the ResultEnvelope metadata.templates field.
 *
 * Requirement: TEST-02
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
const { createTempProject, cleanup } = require('./helpers.cjs');

/**
 * Build a mock adapter returning the given events array from normalizeResponse.
 */
function makeMockAdapter(events) {
  return {
    capabilities: runtime.createConnectorCapabilities({
      id: 'test-connector',
      auth_types: ['api_key'],
      dataset_kinds: ['events'],
      languages: ['spl'],
      pagination_modes: ['none'],
    }),
    prepareQuery() { return {}; },
    executeRequest() { return { has_more: false }; },
    normalizeResponse() {
      return {
        events,
        entities: [],
        has_more: false,
      };
    },
  };
}

/**
 * Build a standard query spec for integration tests.
 */
function makeSpec() {
  return runtime.createQuerySpec({
    connector: { id: 'test-connector' },
    dataset: { kind: 'events' },
    time_window: {
      start: '2026-03-24T00:00:00.000Z',
      end: '2026-03-25T00:00:00.000Z',
    },
    query: { language: 'spl', statement: 'index=sysmon | head 10' },
  });
}

describe('reduce stage integration via executeQuerySpec', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('template metadata appears in envelope after executeQuerySpec with events', async () => {
    const events = [
      { id: 'e1', title: 'Failed login', summary: 'user admin from 10.0.0.1' },
      { id: 'e2', title: 'Failed login', summary: 'user root from 192.168.1.1' },
      { id: 'e3', title: 'Process created', summary: 'cmd.exe /c whoami' },
    ];
    const adapter = makeMockAdapter(events);
    const spec = makeSpec();

    const result = await runtime.executeQuerySpec(spec, adapter, { cwd: tmpDir });

    assert.ok(result.envelope.metadata.templates, 'metadata.templates should exist');
    assert.strictEqual(result.envelope.metadata.templates.algorithm, 'drain');
    assert.ok(result.envelope.metadata.templates.cluster_count >= 1, 'cluster_count >= 1');
    assert.ok(Array.isArray(result.envelope.metadata.templates.clusters), 'clusters is an array');

    for (const cluster of result.envelope.metadata.templates.clusters) {
      assert.strictEqual(typeof cluster.template_id, 'string', 'template_id is string');
      assert.strictEqual(typeof cluster.template, 'string', 'template is string');
      assert.strictEqual(typeof cluster.count, 'number', 'count is number');
      assert.ok(cluster.sample_event_id !== undefined, 'sample_event_id exists');
      assert.ok(Array.isArray(cluster.event_ids), 'event_ids is array');
    }
  });

  test('options.reduce=false skips template metadata entirely', async () => {
    const events = [
      { id: 'e1', title: 'Failed login', summary: 'user admin from 10.0.0.1' },
      { id: 'e2', title: 'Failed login', summary: 'user root from 192.168.1.1' },
    ];
    const adapter = makeMockAdapter(events);
    const spec = makeSpec();

    const result = await runtime.executeQuerySpec(spec, adapter, {
      cwd: tmpDir,
      reduce: false,
    });

    assert.strictEqual(
      result.envelope.metadata.templates,
      undefined,
      'metadata.templates should not be present when reduce=false'
    );
  });

  test('empty events array produces no template metadata', async () => {
    const adapter = makeMockAdapter([]);
    const spec = makeSpec();

    const result = await runtime.executeQuerySpec(spec, adapter, { cwd: tmpDir });

    assert.strictEqual(
      result.envelope.metadata.templates,
      undefined,
      'metadata.templates should not be present for empty events'
    );
  });

  test('successful reduce produces status ok with no REDUCE_FAILED warning', async () => {
    const events = [
      { id: 'e1', title: 'Failed login', summary: 'user admin from 10.0.0.1' },
      { id: 'e2', title: 'Failed login', summary: 'user root from 192.168.1.1' },
      { id: 'e3', title: 'Process created', summary: 'cmd.exe /c whoami' },
    ];
    const adapter = makeMockAdapter(events);
    const spec = makeSpec();

    const result = await runtime.executeQuerySpec(spec, adapter, { cwd: tmpDir });

    assert.strictEqual(result.envelope.status, 'ok');

    const reduceFailed = (result.envelope.warnings || []).find(
      w => w.code === 'REDUCE_FAILED'
    );
    assert.strictEqual(
      reduceFailed,
      undefined,
      'should not have REDUCE_FAILED warning on successful reduce'
    );
  });

  test('options.reduce={similarity_threshold: 0.8} passes config through', async () => {
    const events = [
      { id: 'e1', title: 'Failed login', summary: 'user admin from 10.0.0.1' },
      { id: 'e2', title: 'Process created', summary: 'cmd.exe /c ipconfig' },
    ];
    const adapter = makeMockAdapter(events);
    const spec = makeSpec();

    const result = await runtime.executeQuerySpec(spec, adapter, {
      cwd: tmpDir,
      reduce: { similarity_threshold: 0.8 },
    });

    assert.ok(result.envelope.metadata.templates, 'templates metadata should exist');
    assert.strictEqual(
      result.envelope.metadata.templates.config.similarity_threshold,
      0.8,
      'similarity_threshold should be passed through'
    );
  });

  test('cluster event_ids are capped at 100', async () => {
    const events = Array.from({ length: 150 }, (_, i) => ({
      id: `e${i}`,
      title: 'Same event type',
      summary: 'same detail content',
    }));
    const adapter = makeMockAdapter(events);
    const spec = makeSpec();

    const result = await runtime.executeQuerySpec(spec, adapter, { cwd: tmpDir });

    assert.ok(result.envelope.metadata.templates, 'templates metadata should exist');
    const maxIds = Math.max(
      ...result.envelope.metadata.templates.clusters.map(c => c.event_ids.length)
    );
    assert.ok(maxIds <= 100, `event_ids exceeded 100: got ${maxIds}`);
  });
});
