/**
 * THRUNT Tools Tests - Cross-Tenant Aggregation
 *
 * Unit tests for event tagging, entity deduplication, finding correlation,
 * and multi-tenant evidence artifacts.
 *
 * Suites:
 *   1. tagEventsWithTenant — tenant provenance on events and entities
 *   2. deduplicateEntities — case-insensitive entity dedup across tenants
 *   3. aggregateResults — full aggregation orchestrator
 *   4. correlateFindings — multi-tenant entities, technique spread, temporal clusters
 *   5. writeMultiTenantArtifacts — evidence receipts for multi-tenant results
 *   6. Config keys — dispatch.cluster_window_minutes registration
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup } = require('./helpers.cjs');

// ─── Time helpers ───────────────────────────────────────────────────────────

const NOW = new Date();
const ONE_HOUR_AGO = new Date(NOW.getTime() - 3600_000).toISOString();
const NOW_ISO = NOW.toISOString();

// ─── Shared fixtures ────────────────────────────────────────────────────────

function makeEnvelope(events = [], entities = [], overrides = {}) {
  return {
    events,
    entities,
    connector: { id: overrides.connectorId || 'sentinel' },
    status: overrides.status || 'ok',
    counts: {
      events: events.length,
      entities: entities.length,
      warnings: 0,
      errors: 0,
    },
    timing: {
      started_at: ONE_HOUR_AGO,
      completed_at: NOW_ISO,
      duration_ms: 1200,
    },
    warnings: [],
    errors: [],
    pagination: { pages_fetched: 1 },
    ...(overrides.extra || {}),
  };
}

function makeTenantResult(tenantId, events = [], entities = [], overrides = {}) {
  return {
    tenant_id: tenantId,
    display_name: overrides.display_name || tenantId,
    status: overrides.status || 'ok',
    envelope: overrides.status === 'error' || overrides.nullEnvelope
      ? null
      : makeEnvelope(events, entities, overrides),
    artifacts: null,
    timing: {
      started_at: ONE_HOUR_AGO,
      completed_at: NOW_ISO,
      duration_ms: 1200,
    },
  };
}

function makeMultiTenantResult(tenantResults) {
  let totalEvents = 0;
  let totalEntities = 0;
  let succeeded = 0;
  let failed = 0;
  for (const tr of tenantResults) {
    if (tr.status === 'ok' || tr.status === 'partial') {
      succeeded++;
      if (tr.envelope) {
        totalEvents += (tr.envelope.events || []).length;
        totalEntities += (tr.envelope.entities || []).length;
      }
    } else {
      failed++;
    }
  }
  return {
    version: '1.0',
    dispatch_id: 'MTD-20260330120000-ABCD1234',
    summary: {
      tenants_targeted: tenantResults.length,
      tenants_succeeded: succeeded,
      tenants_partial: 0,
      tenants_failed: failed,
      tenants_timeout: 0,
      total_events: totalEvents,
      total_entities: totalEntities,
      wall_clock_ms: 5000,
    },
    tenant_results: tenantResults,
    errors: [],
  };
}

// ─── tagEventsWithTenant ────────────────────────────────────────────────────

describe('tagEventsWithTenant', () => {
  let tagEventsWithTenant;

  beforeEach(() => {
    tagEventsWithTenant = require('../thrunt-god/bin/lib/aggregation.cjs').tagEventsWithTenant;
  });

  test('adds tenant_id to each event', () => {
    const envelope = makeEnvelope(
      [{ id: 'e1', timestamp: NOW_ISO }, { id: 'e2', timestamp: NOW_ISO }],
      []
    );
    tagEventsWithTenant(envelope, 'acme');
    assert.strictEqual(envelope.events[0].tenant_id, 'acme');
    assert.strictEqual(envelope.events[1].tenant_id, 'acme');
  });

  test('adds tenant_connector_id from envelope.connector.id', () => {
    const envelope = makeEnvelope(
      [{ id: 'e1', timestamp: NOW_ISO }],
      [],
      { connectorId: 'splunk' }
    );
    tagEventsWithTenant(envelope, 'globex');
    assert.strictEqual(envelope.events[0].tenant_connector_id, 'splunk');
  });

  test('adds tenant_id to each entity', () => {
    const envelope = makeEnvelope(
      [],
      [{ kind: 'ip', value: '10.0.0.1' }, { kind: 'user', value: 'admin' }]
    );
    tagEventsWithTenant(envelope, 'acme');
    assert.strictEqual(envelope.entities[0].tenant_id, 'acme');
    assert.strictEqual(envelope.entities[1].tenant_id, 'acme');
  });

  test('handles null envelope without error', () => {
    assert.doesNotThrow(() => tagEventsWithTenant(null, 'acme'));
  });

  test('handles undefined envelope without error', () => {
    assert.doesNotThrow(() => tagEventsWithTenant(undefined, 'acme'));
  });

  test('mutates envelope in place', () => {
    const envelope = makeEnvelope([{ id: 'e1', timestamp: NOW_ISO }], []);
    const ref = envelope.events[0];
    tagEventsWithTenant(envelope, 'test');
    assert.strictEqual(ref.tenant_id, 'test', 'Should mutate the original event object');
  });

  test('sets tenant_connector_id to null when connector missing', () => {
    const envelope = { events: [{ id: 'e1' }], entities: [] };
    tagEventsWithTenant(envelope, 'acme');
    assert.strictEqual(envelope.events[0].tenant_connector_id, null);
  });
});

// ─── deduplicateEntities ────────────────────────────────────────────────────

describe('deduplicateEntities', () => {
  let deduplicateEntities;

  beforeEach(() => {
    deduplicateEntities = require('../thrunt-god/bin/lib/aggregation.cjs').deduplicateEntities;
  });

  test('deduplicates same entity across two tenants', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }]),
    ];
    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.deepStrictEqual(entities[0].tenant_ids, ['a', 'b']);
    assert.strictEqual(entities[0].occurrence_count, 2);
  });

  test('keeps distinct entities separate', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }, { kind: 'user', value: 'Admin' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }]),
    ];
    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 2);
    const ipEntity = entities.find(e => e.kind === 'ip');
    const userEntity = entities.find(e => e.kind === 'user');
    assert.deepStrictEqual(ipEntity.tenant_ids, ['a', 'b']);
    assert.strictEqual(ipEntity.occurrence_count, 2);
    assert.deepStrictEqual(userEntity.tenant_ids, ['a']);
    assert.strictEqual(userEntity.occurrence_count, 1);
  });

  test('normalizes value with toLowerCase', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'user', value: 'ADMIN' }]),
      makeTenantResult('b', [], [{ kind: 'user', value: 'admin' }]),
    ];
    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].occurrence_count, 2);
  });

  test('skips tenant_results with status error', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }], { status: 'error' }),
    ];
    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.deepStrictEqual(entities[0].tenant_ids, ['a']);
  });

  test('skips tenant_results with null envelope', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      { tenant_id: 'b', status: 'timeout', envelope: null },
    ];
    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.deepStrictEqual(entities[0].tenant_ids, ['a']);
  });

  test('does not duplicate tenant_id in tenant_ids for same tenant', () => {
    const results = [
      makeTenantResult('a', [], [
        { kind: 'ip', value: '10.0.0.1' },
        { kind: 'ip', value: '10.0.0.1' },
      ]),
    ];
    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.deepStrictEqual(entities[0].tenant_ids, ['a']);
    assert.strictEqual(entities[0].occurrence_count, 2);
  });

  test('coerces scalar entity values instead of throwing during deduplication', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'port', value: 443 }]),
      makeTenantResult('b', [], [{ kind: 'port', value: '443' }]),
    ];

    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.deepStrictEqual(entities[0].tenant_ids, ['a', 'b']);
    assert.strictEqual(entities[0].occurrence_count, 2);
  });

  test('skips malformed entities with missing values', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip' }, { kind: 'user', value: 'admin' }]),
    ];

    const entities = deduplicateEntities(results);
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].kind, 'user');
    assert.strictEqual(entities[0].value, 'admin');
  });
});

// ─── aggregateResults ───────────────────────────────────────────────────────

describe('aggregateResults', () => {
  let aggregateResults;

  beforeEach(() => {
    aggregateResults = require('../thrunt-god/bin/lib/aggregation.cjs').aggregateResults;
  });

  test('returns events, entities, entity_overlap, unique_entities', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('a', [{ id: 'e1', timestamp: NOW_ISO }], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('b', [{ id: 'e2', timestamp: NOW_ISO }], [{ kind: 'ip', value: '10.0.0.1' }]),
    ]);
    const result = aggregateResults(mtr);
    assert.ok(Array.isArray(result.events));
    assert.ok(Array.isArray(result.entities));
    assert.ok(typeof result.entity_overlap === 'object');
    assert.ok(typeof result.unique_entities === 'number');
  });

  test('tags all events with tenant_id before merging', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [{ id: 'e1', timestamp: NOW_ISO }], []),
      makeTenantResult('globex', [{ id: 'e2', timestamp: NOW_ISO }], []),
    ]);
    const result = aggregateResults(mtr);
    assert.strictEqual(result.events.length, 2);
    assert.strictEqual(result.events[0].tenant_id, 'acme');
    assert.strictEqual(result.events[1].tenant_id, 'globex');
  });

  test('deduplicates entities across tenants', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }]),
    ]);
    const result = aggregateResults(mtr);
    assert.strictEqual(result.unique_entities, 1);
  });

  test('builds entity_overlap for entities in 2+ tenants', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }, { kind: 'user', value: 'solo' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }]),
    ]);
    const result = aggregateResults(mtr);
    assert.ok('10.0.0.1' in result.entity_overlap);
    assert.deepStrictEqual(result.entity_overlap['10.0.0.1'], ['a', 'b']);
    assert.ok(!('solo' in result.entity_overlap));
  });
});

// ─── correlateFindings ──────────────────────────────────────────────────────

describe('correlateFindings', () => {
  let correlateFindings;

  beforeEach(() => {
    correlateFindings = require('../thrunt-god/bin/lib/aggregation.cjs').correlateFindings;
  });

  test('returns multi_tenant_entities, technique_spread, temporal_clusters', () => {
    const results = [makeTenantResult('a', [], [])];
    const corr = correlateFindings(results);
    assert.ok(Array.isArray(corr.multi_tenant_entities));
    assert.ok(Array.isArray(corr.technique_spread));
    assert.ok(Array.isArray(corr.temporal_clusters));
  });

  test('multi_tenant_entities includes entities in 3+ tenants by default', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('c', [], [{ kind: 'ip', value: '10.0.0.1' }]),
    ];
    const corr = correlateFindings(results);
    assert.strictEqual(corr.multi_tenant_entities.length, 1);
    assert.strictEqual(corr.multi_tenant_entities[0].kind, 'ip');
  });

  test('multi_tenant_entities respects entity_threshold option', () => {
    const results = [
      makeTenantResult('a', [], [{ kind: 'ip', value: '10.0.0.1' }]),
      makeTenantResult('b', [], [{ kind: 'ip', value: '10.0.0.1' }]),
    ];
    const corr = correlateFindings(results, { entity_threshold: 2 });
    assert.strictEqual(corr.multi_tenant_entities.length, 1);
  });

  test('technique_spread tracks same technique across tenants', () => {
    const results = [
      makeTenantResult('a', [
        { id: 'e1', timestamp: NOW_ISO, tags: ['technique:T1003'] },
      ], []),
      makeTenantResult('b', [
        { id: 'e2', timestamp: NOW_ISO, tags: ['technique:T1003'] },
        { id: 'e3', timestamp: NOW_ISO, tags: ['technique:T1003'] },
      ], []),
    ];
    const corr = correlateFindings(results);
    assert.strictEqual(corr.technique_spread.length, 1);
    assert.strictEqual(corr.technique_spread[0].technique_id, 'T1003');
    assert.deepStrictEqual(corr.technique_spread[0].tenant_ids.sort(), ['a', 'b']);
    assert.strictEqual(corr.technique_spread[0].event_counts['a'], 1);
    assert.strictEqual(corr.technique_spread[0].event_counts['b'], 2);
  });

  test('technique_spread uses pack_attack option', () => {
    const results = [
      makeTenantResult('a', [{ id: 'e1', timestamp: NOW_ISO }], []),
      makeTenantResult('b', [{ id: 'e2', timestamp: NOW_ISO }], []),
    ];
    const corr = correlateFindings(results, { pack_attack: ['T1059'] });
    assert.strictEqual(corr.technique_spread.length, 1);
    assert.strictEqual(corr.technique_spread[0].technique_id, 'T1059');
  });

  test('technique_spread excludes single-tenant techniques', () => {
    const results = [
      makeTenantResult('a', [{ id: 'e1', timestamp: NOW_ISO, tags: ['technique:T1003'] }], []),
    ];
    const corr = correlateFindings(results);
    assert.strictEqual(corr.technique_spread.length, 0);
  });

  test('temporal_clusters groups events within window', () => {
    const base = NOW.getTime();
    const results = [
      makeTenantResult('a', [
        { id: 'e1', timestamp: new Date(base).toISOString(), tenant_id: 'a' },
        { id: 'e2', timestamp: new Date(base + 60_000).toISOString(), tenant_id: 'a' },
      ], []),
      makeTenantResult('b', [
        { id: 'e3', timestamp: new Date(base + 120_000).toISOString(), tenant_id: 'b' },
      ], []),
    ];
    // Tag events before calling (aggregateResults does this normally)
    for (const r of results) {
      if (r.envelope) {
        for (const ev of r.envelope.events) ev.tenant_id = r.tenant_id;
      }
    }
    const corr = correlateFindings(results, { cluster_window_minutes: 15 });
    assert.ok(corr.temporal_clusters.length >= 1, 'Should find at least one cluster');
    const cluster = corr.temporal_clusters[0];
    assert.ok(cluster.tenant_ids.length >= 2, 'Cluster should span 2+ tenants');
    assert.ok(cluster.event_count >= 2);
  });

  test('temporal_clusters defaults to 15 minute window', () => {
    const base = NOW.getTime();
    const results = [
      makeTenantResult('a', [
        { id: 'e1', timestamp: new Date(base).toISOString(), tenant_id: 'a' },
      ], []),
      makeTenantResult('b', [
        // 20 minutes later -- outside 15 min window
        { id: 'e2', timestamp: new Date(base + 20 * 60_000).toISOString(), tenant_id: 'b' },
      ], []),
    ];
    for (const r of results) {
      if (r.envelope) {
        for (const ev of r.envelope.events) ev.tenant_id = r.tenant_id;
      }
    }
    const corr = correlateFindings(results);
    // No cluster should span 2+ tenants since events are 20 min apart
    const multiTenantClusters = corr.temporal_clusters.filter(c => c.tenant_ids.length >= 2);
    assert.strictEqual(multiTenantClusters.length, 0);
  });

  test('temporal_clusters caps events at 10 samples per cluster', () => {
    const base = NOW.getTime();
    const events = [];
    for (let i = 0; i < 15; i++) {
      events.push({
        id: `e${i}`,
        timestamp: new Date(base + i * 1000).toISOString(),
        tenant_id: i < 8 ? 'a' : 'b',
      });
    }
    const results = [
      makeTenantResult('a', events.filter(e => e.tenant_id === 'a'), []),
      makeTenantResult('b', events.filter(e => e.tenant_id === 'b'), []),
    ];
    for (const r of results) {
      if (r.envelope) {
        for (const ev of r.envelope.events) ev.tenant_id = r.tenant_id;
      }
    }
    const corr = correlateFindings(results, { cluster_window_minutes: 15 });
    if (corr.temporal_clusters.length > 0) {
      assert.ok(corr.temporal_clusters[0].events.length <= 10,
        'Should cap events at 10 samples');
    }
  });
});

// ─── writeMultiTenantArtifacts ──────────────────────────────────────────────

describe('writeMultiTenantArtifacts', () => {
  let writeMultiTenantArtifacts;
  let tmpDir;

  beforeEach(() => {
    writeMultiTenantArtifacts = require('../thrunt-god/bin/lib/evidence.cjs').writeMultiTenantArtifacts;
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('writes aggregate receipt file with dispatch_id in filename', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [{ id: 'e1', timestamp: NOW_ISO }], [{ kind: 'ip', value: '10.0.0.1' }]),
    ]);
    const result = writeMultiTenantArtifacts(tmpDir, mtr);
    assert.ok(result.aggregate_receipt_path.includes('RCP-aggregate-'));
    assert.ok(result.aggregate_receipt_path.includes(mtr.dispatch_id));
    const fullPath = path.join(tmpDir, result.aggregate_receipt_path);
    assert.ok(fs.existsSync(fullPath), `Aggregate receipt should exist at ${fullPath}`);
  });

  test('aggregate receipt contains summary table with tenant counts and no raw events', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [{ id: 'e1', timestamp: NOW_ISO }, { id: 'e2', timestamp: NOW_ISO }], []),
      makeTenantResult('globex', [{ id: 'e3', timestamp: NOW_ISO }], []),
    ]);
    const result = writeMultiTenantArtifacts(tmpDir, mtr);
    const fullPath = path.join(tmpDir, result.aggregate_receipt_path);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(content.includes('Multi-Tenant Aggregate Receipt'), 'Should have header');
    assert.ok(content.includes('Tenants Targeted'), 'Should have summary table');
    assert.ok(content.includes('Tenants Succeeded'), 'Should have success count');
    assert.ok(!content.includes('"id":"e1"'), 'Should not contain raw event data');
    assert.ok(content.includes('no raw event data'), 'Should state no raw data');
  });

  test('writes per-tenant receipts for each successful tenant', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [{ id: 'e1', timestamp: NOW_ISO }], []),
      makeTenantResult('globex', [{ id: 'e2', timestamp: NOW_ISO }], []),
      makeTenantResult('failed', [], [], { status: 'error' }),
    ]);
    const result = writeMultiTenantArtifacts(tmpDir, mtr);
    assert.strictEqual(result.tenant_receipt_paths.length, 2);
    for (const rp of result.tenant_receipt_paths) {
      const fullPath = path.join(tmpDir, rp);
      assert.ok(fs.existsSync(fullPath), `Receipt should exist: ${rp}`);
      const content = fs.readFileSync(fullPath, 'utf-8');
      assert.ok(content.includes('tenant:'), 'Receipt should have tenant tag');
    }
  });

  test('partitioned mode writes to RECEIPTS/{tenant_id}/ subdirectories', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [{ id: 'e1', timestamp: NOW_ISO }], []),
      makeTenantResult('globex', [{ id: 'e2', timestamp: NOW_ISO }], []),
    ]);
    const result = writeMultiTenantArtifacts(tmpDir, mtr, { tenant_isolation_mode: 'partitioned' });
    assert.strictEqual(result.tenant_isolation_mode, 'partitioned');
    // Check that tenant-specific subdirs were created
    const acmeReceipt = result.tenant_receipt_paths.find(p => p.includes('acme'));
    const globexReceipt = result.tenant_receipt_paths.find(p => p.includes('globex'));
    assert.ok(acmeReceipt.includes('RECEIPTS/acme/'), 'Acme receipt should be in acme subdir');
    assert.ok(globexReceipt.includes('RECEIPTS/globex/'), 'Globex receipt should be in globex subdir');
    // Verify files exist
    assert.ok(fs.existsSync(path.join(tmpDir, acmeReceipt)));
    assert.ok(fs.existsSync(path.join(tmpDir, globexReceipt)));
  });

  test('flat mode returns tenant_isolation_mode as flat', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [], []),
    ]);
    const result = writeMultiTenantArtifacts(tmpDir, mtr);
    assert.strictEqual(result.tenant_isolation_mode, 'flat');
  });
});

// ─── deduplicateEvents ─────────────────────────────────────────────────────

describe('deduplicateEvents', () => {
  let deduplicateEvents;

  beforeEach(() => {
    deduplicateEvents = require('../thrunt-god/bin/lib/aggregation.cjs').deduplicateEvents;
  });

  test('by_id: removes duplicate event.id, keeps first occurrence', () => {
    const events = [
      { id: 'a', title: 'first' },
      { id: 'b', title: 'second' },
      { id: 'a', title: 'third' },
    ];
    const result = deduplicateEvents(events, { strategy: 'by_id' });
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].title, 'first');
    assert.strictEqual(result[1].title, 'second');
  });

  test('by_id: filters out events with null/undefined id', () => {
    const events = [
      { id: null, title: 'null-id' },
      { id: 'a', title: 'valid' },
      { id: undefined, title: 'undef-id' },
    ];
    const result = deduplicateEvents(events, { strategy: 'by_id' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'a');
  });

  test('by_content_hash: deduplicates on SHA-256 of connector_id:title:summary:timestamp_minute', () => {
    const events = [
      { id: 'e1', connector_id: 'splunk', title: 'Failed login', summary: 'brute force', timestamp: '2024-01-15T10:30:45Z' },
      { id: 'e2', connector_id: 'splunk', title: 'Failed login', summary: 'brute force', timestamp: '2024-01-15T10:30:59Z' },
    ];
    const result = deduplicateEvents(events, { strategy: 'by_content_hash' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'e1');
  });

  test('by_content_hash: different timestamp minutes produce different hashes', () => {
    const events = [
      { id: 'e1', connector_id: 'splunk', title: 'Failed login', summary: 'brute force', timestamp: '2024-01-15T10:30:45Z' },
      { id: 'e2', connector_id: 'splunk', title: 'Failed login', summary: 'brute force', timestamp: '2024-01-15T10:31:45Z' },
    ];
    const result = deduplicateEvents(events, { strategy: 'by_content_hash' });
    assert.strictEqual(result.length, 2);
  });

  test('by_content_hash: missing fields default to empty string', () => {
    const events = [
      { connector_id: 's' },
      { connector_id: 's' },
    ];
    const result = deduplicateEvents(events, { strategy: 'by_content_hash' });
    assert.strictEqual(result.length, 1);
  });

  test('by_content_hash: preserves tenant provenance when event content matches', () => {
    const events = [
      {
        id: 'e1',
        tenant_id: 'tenant-a',
        tenant_connector_id: 'tenant-a:splunk',
        connector_id: 'splunk',
        title: 'Failed login',
        summary: 'brute force',
        timestamp: '2024-01-15T10:30:45Z',
      },
      {
        id: 'e2',
        tenant_id: 'tenant-b',
        tenant_connector_id: 'tenant-b:splunk',
        connector_id: 'splunk',
        title: 'Failed login',
        summary: 'brute force',
        timestamp: '2024-01-15T10:30:59Z',
      },
    ];
    const result = deduplicateEvents(events, { strategy: 'by_content_hash' });
    assert.strictEqual(result.length, 2);
  });

  test('by_content_hash: supports non-string timestamps without throwing', () => {
    const minute = Date.parse('2024-01-15T10:30:00Z');
    const events = [
      { id: 'e1', connector_id: 'splunk', title: 'Failed login', summary: 'brute force', timestamp: minute },
      { id: 'e2', connector_id: 'splunk', title: 'Failed login', summary: 'brute force', timestamp: minute + 30_000 },
    ];

    const result = deduplicateEvents(events, { strategy: 'by_content_hash' });
    assert.strictEqual(result.length, 1);
  });

  test('defaults to by_id when no strategy specified', () => {
    const events = [{ id: 'a' }, { id: 'a' }];
    const result = deduplicateEvents(events);
    assert.strictEqual(result.length, 1);
  });

  test('returns empty array for empty input', () => {
    const result = deduplicateEvents([]);
    assert.strictEqual(result.length, 0);
  });

  test('returns empty array for null/undefined input', () => {
    assert.deepStrictEqual(deduplicateEvents(null), []);
    assert.deepStrictEqual(deduplicateEvents(undefined), []);
  });

  test('skips null entries in events array', () => {
    const events = [null, { id: 'a' }, undefined, { id: 'b' }];
    const result = deduplicateEvents(events);
    assert.strictEqual(result.length, 2);
  });

  test('handles large sets with duplicates', () => {
    const events = [];
    for (let i = 0; i < 1000; i++) {
      events.push({ id: String(i % 500) });
    }
    const result = deduplicateEvents(events, { strategy: 'by_id' });
    assert.strictEqual(result.length, 500);
  });
});

// ─── Config key registration ────────────────────────────────────────────────

describe('config key registration', () => {
  test('dispatch.cluster_window_minutes is in VALID_CONFIG_KEYS', () => {
    // The isValidConfigKey function validates against the VALID_CONFIG_KEYS set
    // and also accepts dispatch.* pattern, but we want explicit registration
    const configSource = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'bin', 'lib', 'config.cjs'),
      'utf-8'
    );
    assert.ok(
      configSource.includes("'dispatch.cluster_window_minutes'"),
      'cluster_window_minutes should be explicitly registered in VALID_CONFIG_KEYS'
    );
  });
});
