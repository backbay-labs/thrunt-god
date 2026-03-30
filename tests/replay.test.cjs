/**
 * THRUNT Tools Tests - Replay Engine
 *
 * Tests for ReplaySpec schema, createReplaySpec, parseShiftDuration,
 * applyMutations, and resolveReplaySource.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ─── 1. ReplaySpec Schema & createReplaySpec ─────────────────────────────────

describe('createReplaySpec', () => {
  const { createReplaySpec, ReplaySpecSchema } = require('../thrunt-god/bin/lib/replay.cjs');

  test('throws Zod validation error when source is missing', () => {
    assert.throws(() => createReplaySpec({}), (err) => {
      // Zod errors have an issues array
      return err.issues !== undefined || err.message.includes('source');
    });
  });

  test('returns valid spec with auto-generated replay_id matching RPL pattern', () => {
    const spec = createReplaySpec({
      source: { type: 'query', ids: ['QRY-123'] },
    });
    assert.strictEqual(spec.version, '1.0');
    assert.match(spec.replay_id, /^RPL-\d{14}-[A-Z0-9]{8}$/);
    assert.strictEqual(spec.source.type, 'query');
    assert.deepStrictEqual(spec.source.ids, ['QRY-123']);
  });

  test('preserves explicit replay_id', () => {
    const spec = createReplaySpec({
      replay_id: 'RPL-20260330000000-ABCD1234',
      source: { type: 'query', ids: ['QRY-123'] },
    });
    assert.strictEqual(spec.replay_id, 'RPL-20260330000000-ABCD1234');
  });

  test('rejects unknown source.type', () => {
    assert.throws(() => createReplaySpec({
      source: { type: 'invalid', ids: ['QRY-123'] },
    }));
  });

  test('rejects empty ids array', () => {
    assert.throws(() => createReplaySpec({
      source: { type: 'query', ids: [] },
    }));
  });

  test('creates valid spec with all mutation fields', () => {
    const spec = createReplaySpec({
      source: { type: 'query', ids: ['QRY-123'] },
      mutations: {
        time_window: {
          mode: 'absolute',
          start: '2026-03-01T00:00:00Z',
          end: '2026-03-08T00:00:00Z',
        },
        connector: { id: 'elastic', profile: 'production' },
        ioc_injection: {
          mode: 'append',
          iocs: [{ type: 'ip', value: '10.0.0.1' }],
        },
        parameters: { tenant: 'prod' },
        execution: { dry_run: true, timeout_ms: 30000 },
      },
      diff: { enabled: true, mode: 'full' },
      evidence: {
        tags: ['replay:test'],
        lineage: {
          original_query_ids: ['QRY-123'],
          replay_reason: 'Testing',
        },
      },
    });
    assert.strictEqual(spec.version, '1.0');
    assert.strictEqual(spec.mutations.time_window.mode, 'absolute');
    assert.strictEqual(spec.mutations.connector.id, 'elastic');
    assert.strictEqual(spec.mutations.execution.dry_run, true);
    assert.strictEqual(spec.diff.enabled, true);
    assert.strictEqual(spec.evidence.lineage.replay_reason, 'Testing');
  });
});

// ─── 2. parseShiftDuration ───────────────────────────────────────────────────

describe('parseShiftDuration', () => {
  const { parseShiftDuration } = require('../thrunt-god/bin/lib/replay.cjs');

  test('parses 7d to 604800000', () => {
    assert.strictEqual(parseShiftDuration('7d'), 604800000);
  });

  test('parses -24h to -86400000', () => {
    assert.strictEqual(parseShiftDuration('-24h'), -86400000);
  });

  test('parses 30m to 1800000', () => {
    assert.strictEqual(parseShiftDuration('30m'), 1800000);
  });

  test('parses -2d to -172800000', () => {
    assert.strictEqual(parseShiftDuration('-2d'), -172800000);
  });

  test('throws on invalid input', () => {
    assert.throws(() => parseShiftDuration('invalid'), /Invalid shift duration/);
  });
});

// ─── 3. applyMutations ──────────────────────────────────────────────────────

describe('applyMutations', () => {
  const { applyMutations } = require('../thrunt-god/bin/lib/replay.cjs');
  const { createQuerySpec } = require('../thrunt-god/bin/lib/runtime.cjs');

  function makeTestSpec(overrides = {}) {
    return createQuerySpec({
      connector: { id: 'splunk', profile: 'default' },
      dataset: { kind: 'events' },
      time_window: {
        start: '2026-03-01T00:00:00.000Z',
        end: '2026-03-02T00:00:00.000Z',
      },
      query: { statement: 'index=main | head 10' },
      ...overrides,
    });
  }

  test('absolute mode sets new start/end', () => {
    const original = makeTestSpec();
    const result = applyMutations(original, {
      time_window: {
        mode: 'absolute',
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-04-02T00:00:00.000Z',
      },
    });
    assert.strictEqual(result.time_window.start, '2026-04-01T00:00:00.000Z');
    assert.strictEqual(result.time_window.end, '2026-04-02T00:00:00.000Z');
  });

  test('shift mode applies shift_ms delta to original time_window', () => {
    const original = makeTestSpec();
    const shiftMs = 86400000; // +1 day
    const result = applyMutations(original, {
      time_window: { mode: 'shift', shift_ms: shiftMs },
    });
    assert.strictEqual(result.time_window.start, '2026-03-02T00:00:00.000Z');
    assert.strictEqual(result.time_window.end, '2026-03-03T00:00:00.000Z');
  });

  test('lookback mode computes start from lookback_minutes relative to now', () => {
    const original = makeTestSpec();
    const now = new Date('2026-03-30T12:00:00.000Z');
    const result = applyMutations(original, {
      time_window: { mode: 'lookback', lookback_minutes: 60 },
    }, now);
    assert.strictEqual(result.time_window.end, '2026-03-30T12:00:00.000Z');
    assert.strictEqual(result.time_window.start, '2026-03-30T11:00:00.000Z');
  });

  test('preserves all non-mutated QuerySpec fields', () => {
    const original = makeTestSpec();
    const result = applyMutations(original, {
      time_window: {
        mode: 'absolute',
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-04-02T00:00:00.000Z',
      },
    });
    assert.strictEqual(result.connector.id, 'splunk');
    assert.strictEqual(result.dataset.kind, 'events');
    assert.strictEqual(result.query.statement, 'index=main | head 10');
  });

  test('connector mutation changes connector.id and connector.profile', () => {
    const original = makeTestSpec();
    const result = applyMutations(original, {
      connector: { id: 'elastic', profile: 'production' },
    });
    assert.strictEqual(result.connector.id, 'elastic');
    assert.strictEqual(result.connector.profile, 'production');
  });

  test('parameters mutation merges into spec.parameters', () => {
    const original = makeTestSpec({ parameters: { existing: 'value' } });
    const result = applyMutations(original, {
      parameters: { tenant: 'prod-us' },
    });
    assert.strictEqual(result.parameters.existing, 'value');
    assert.strictEqual(result.parameters.tenant, 'prod-us');
  });

  test('execution mutation merges into spec.execution', () => {
    const original = makeTestSpec();
    const result = applyMutations(original, {
      execution: { dry_run: true, timeout_ms: 5000 },
    });
    assert.strictEqual(result.execution.dry_run, true);
    assert.strictEqual(result.execution.timeout_ms, 5000);
  });

  test('result passes createQuerySpec() validation', () => {
    const original = makeTestSpec();
    const result = applyMutations(original, {
      time_window: {
        mode: 'absolute',
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-04-02T00:00:00.000Z',
      },
    });
    // Should not throw -- result is a valid QuerySpec
    const validated = createQuerySpec(result);
    assert.ok(validated.query_id);
  });

  test('throws when absolute mutation makes start >= end', () => {
    const original = makeTestSpec();
    // Absolute mutation with start after end
    assert.throws(() => applyMutations(original, {
      time_window: {
        mode: 'absolute',
        start: '2026-04-02T00:00:00.000Z',
        end: '2026-04-01T00:00:00.000Z',
      },
    }), /time_window\.start must be earlier|Invalid QuerySpec|start/i);
  });
});

// ─── 4. resolveReplaySource ──────────────────────────────────────────────────

describe('resolveReplaySource', () => {
  const { resolveReplaySource } = require('../thrunt-god/bin/lib/replay.cjs');
  const { createTempProject, cleanup } = require('./helpers.cjs');

  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create artifact directories
    fs.mkdirSync(path.join(tmpDir, '.planning', 'QUERIES'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'RECEIPTS'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'MANIFESTS'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'METRICS'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  function writeQueryLog(id, opts = {}) {
    const connector = opts.connector || 'splunk';
    const dataset = opts.dataset || 'events';
    const statement = opts.statement || 'index=main | head 10';
    const start = opts.start || '2026-03-01T00:00:00Z';
    const end = opts.end || '2026-03-02T00:00:00Z';

    const content = `---
query_id: ${id}
query_spec_version: "1.0"
source: ${dataset}
connector_id: ${connector}
dataset: ${dataset}
executed_at: 2026-03-30T00:00:00Z
author: thrunt-runtime
related_hypotheses:
  -
---

# Query Log: ${connector} ${dataset} query

## Intent

Execute ${connector} ${dataset} query through the shared THRUNT runtime.

## Query Or Procedure

~~~text
${statement}
~~~

## Parameters

- **Time window:** ${start} -> ${end}
- **Entities:** none
- **Filters:** none

## Runtime Metadata

- **Profile:** default
- **Pagination:** auto (limit=100, pages=1)
- **Execution hints:** timeout=30000ms, consistency=best_effort, dry_run=false
- **Result status:** complete
- **Warnings:** none
- **Errors:** none

## Result Summary

events=10, entities=0, evidence=0, status=complete

## Related Receipts

- [RCT-...]

## Notes

Generated by the shared THRUNT runtime.
`;
    fs.writeFileSync(path.join(tmpDir, '.planning', 'QUERIES', `${id}.md`), content);
    return content;
  }

  function writeReceipt(id, queryIds, opts = {}) {
    const connector = opts.connector || 'splunk';
    const dataset = opts.dataset || 'events';
    const resultStatus = opts.result_status || 'complete';

    const content = `---
receipt_id: ${id}
query_spec_version: "1.0"
created_at: 2026-03-30T00:00:00Z
source: ${connector}
connector_id: ${connector}
dataset: ${dataset}
result_status: ${resultStatus}
claim_status: context
related_hypotheses:
  -
related_queries:
${queryIds.map(qid => `  - ${qid}`).join('\n')}
---

# Receipt: ${connector} ${dataset} execution receipt

## Claim

Execution completed.

## Evidence

- events=10
- entities=0
`;
    fs.writeFileSync(path.join(tmpDir, '.planning', 'RECEIPTS', `${id}.md`), content);
    return content;
  }

  function writeManifest(manifestId, queryId) {
    // First write the query log so we can compute its hash
    const queryFile = path.join(tmpDir, '.planning', 'QUERIES', `${queryId}.md`);
    let contentHash = 'sha256:fakehash';
    if (fs.existsSync(queryFile)) {
      const { computeContentHash } = require('../thrunt-god/bin/lib/manifest.cjs');
      const content = fs.readFileSync(queryFile, 'utf-8');
      contentHash = computeContentHash(content);
    }

    const manifest = {
      manifest_id: manifestId,
      manifest_version: '1.1',
      execution: {
        query_id: queryId,
        status: 'complete',
        started_at: '2026-03-30T00:00:00Z',
        completed_at: '2026-03-30T00:01:00Z',
      },
      artifacts: [
        {
          id: queryId,
          type: 'query_log',
          path: `.planning/QUERIES/${queryId}.md`,
          content_hash: contentHash,
        },
      ],
    };

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MANIFESTS', `${manifestId}.json`),
      JSON.stringify(manifest, null, 2),
    );
    return manifest;
  }

  function writeMetrics(metricsId, queryId) {
    const record = {
      hunt_execution_id: metricsId,
      query_id: queryId,
      connector_id: 'splunk',
      dataset_kind: 'events',
      related_artifacts: { receipt_ids: [], manifest_ids: [] },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'METRICS', `${metricsId}.json`),
      JSON.stringify(record, null, 2),
    );
    return record;
  }

  // --- Tests ---

  test('resolves query source with statement and time_window from QUERIES/*.md', () => {
    writeQueryLog('QRY-20260330000000-AAAAAAAA', {
      statement: 'search index=firewall action=blocked',
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-02T00:00:00Z',
    });

    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-20260330000000-AAAAAAAA'],
    });

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].original_spec);
    assert.strictEqual(results[0].original_spec.connector.id, 'splunk');
    assert.strictEqual(results[0].original_spec.dataset.kind, 'events');
    assert.strictEqual(results[0].original_spec.query.statement, 'search index=firewall action=blocked');
    assert.strictEqual(results[0].original_spec.time_window.start, '2026-03-01T00:00:00Z');
    assert.strictEqual(results[0].original_spec.time_window.end, '2026-03-02T00:00:00Z');
  });

  test('resolves receipt source by cross-referencing to QUERIES/', () => {
    writeQueryLog('QRY-20260330000000-BBBBBBBB', {
      statement: 'index=main source=syslog',
      connector: 'splunk',
    });
    writeReceipt('RCT-20260330000000-BBBBBBBB', ['QRY-20260330000000-BBBBBBBB'], {
      connector: 'splunk',
      result_status: 'complete',
    });

    const results = resolveReplaySource(tmpDir, {
      type: 'receipt',
      ids: ['RCT-20260330000000-BBBBBBBB'],
    });

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].original_spec);
    assert.strictEqual(results[0].original_spec.query.statement, 'index=main source=syslog');
    assert.strictEqual(results[0].original_spec.receipt.receipt_id, 'RCT-20260330000000-BBBBBBBB');
    assert.strictEqual(results[0].original_spec.receipt.result_status, 'complete');
  });

  test('returns empty spec with warning for non-existent query ID', () => {
    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-NONEXISTENT-00000000'],
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].original_spec, null);
    assert.ok(results[0].warnings.length > 0);
    assert.ok(results[0].warnings[0].includes('not found'));
  });

  test('resolves from MANIFESTS/*.json with manifest-first priority', () => {
    writeQueryLog('QRY-20260330000000-CCCCCCCC', {
      statement: 'index=proxy action=allowed',
    });
    writeManifest('MAN-20260330000000-CCCCCCCC', 'QRY-20260330000000-CCCCCCCC');

    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-20260330000000-CCCCCCCC'],
    });

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].original_spec);
    assert.strictEqual(results[0].original_spec.query.statement, 'index=proxy action=allowed');
    // No integrity warnings since hash matches
    const integrityWarnings = results[0].warnings.filter(w => w.includes('modified since'));
    assert.strictEqual(integrityWarnings.length, 0);
  });

  test('resolves from METRICS/HE-*.json by cross-referencing query_id', () => {
    writeQueryLog('QRY-20260330000000-DDDDDDDD', {
      statement: 'index=dns query_type=A',
    });
    writeMetrics('HE-20260330000000-DDDDDDDD', 'QRY-20260330000000-DDDDDDDD');

    const results = resolveReplaySource(tmpDir, {
      type: 'pack_execution',
      ids: ['HE-20260330000000-DDDDDDDD'],
    });

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].original_spec);
    assert.strictEqual(results[0].original_spec.query.statement, 'index=dns query_type=A');
    assert.strictEqual(results[0].source_path, path.join(tmpDir, '.planning', 'METRICS', 'HE-20260330000000-DDDDDDDD.json'));
  });

  test('resolves multiple IDs with one entry per resolved ID', () => {
    writeQueryLog('QRY-20260330000000-EEEEEEEE', { statement: 'search 1' });
    writeQueryLog('QRY-20260330000000-FFFFFFFF', { statement: 'search 2' });

    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-20260330000000-EEEEEEEE', 'QRY-20260330000000-FFFFFFFF'],
    });

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].original_spec.query.statement, 'search 1');
    assert.strictEqual(results[1].original_spec.query.statement, 'search 2');
  });

  test('extracts statement from Query Or Procedure section', () => {
    writeQueryLog('QRY-20260330000000-GGGGGGGG', {
      statement: 'DeviceEvents | where Timestamp > ago(7d)',
    });

    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-20260330000000-GGGGGGGG'],
    });

    assert.strictEqual(results[0].original_spec.query.statement, 'DeviceEvents | where Timestamp > ago(7d)');
  });

  test('extracts time_window from Parameters section', () => {
    writeQueryLog('QRY-20260330000000-HHHHHHHH', {
      start: '2026-01-15T08:00:00Z',
      end: '2026-01-15T20:00:00Z',
    });

    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-20260330000000-HHHHHHHH'],
    });

    assert.strictEqual(results[0].original_spec.time_window.start, '2026-01-15T08:00:00Z');
    assert.strictEqual(results[0].original_spec.time_window.end, '2026-01-15T20:00:00Z');
  });

  test('emits integrity warning when manifest hash mismatches query log', () => {
    writeQueryLog('QRY-20260330000000-IIIIIIII', { statement: 'original query' });
    // Write manifest first (captures the original hash)
    writeManifest('MAN-20260330000000-IIIIIIII', 'QRY-20260330000000-IIIIIIII');
    // Modify the query log after manifest was created
    writeQueryLog('QRY-20260330000000-IIIIIIII', { statement: 'modified query after manifest' });

    const results = resolveReplaySource(tmpDir, {
      type: 'query',
      ids: ['QRY-20260330000000-IIIIIIII'],
    });

    assert.strictEqual(results.length, 1);
    assert.ok(results[0].original_spec);
    const integrityWarnings = results[0].warnings.filter(w => w.includes('modified since manifest'));
    assert.strictEqual(integrityWarnings.length, 1);
  });

  test('hunt_phase source returns empty with warning (stub)', () => {
    const results = resolveReplaySource(tmpDir, {
      type: 'hunt_phase',
      ids: ['PHASE-01'],
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].original_spec, null);
    assert.ok(results[0].warnings[0].includes('not yet implemented'));
  });
});
