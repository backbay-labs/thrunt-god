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

// ─── 5. rewriteSplTime ─────────────────────────────────────────────────────────

describe('rewriteSplTime', () => {
  const { rewriteSplTime } = require('../thrunt-god/bin/lib/replay.cjs');

  const originalTW = { start: '2026-03-01T00:00:00.000Z', end: '2026-03-08T00:00:00.000Z' };
  const newTW = { start: '2026-04-01T00:00:00.000Z', end: '2026-04-08T00:00:00.000Z' };

  test('replaces earliest=-24h and latest=now with absolute ISO timestamps', () => {
    const result = rewriteSplTime('earliest=-24h latest=now', originalTW, newTW);
    assert.strictEqual(result.rewritten, 'earliest="2026-04-01T00:00:00.000Z" latest="2026-04-08T00:00:00.000Z"');
    assert.strictEqual(result.modifications.length, 2);
    assert.strictEqual(result.modifications[0].type, 'inline_time');
    assert.strictEqual(result.modifications[0].original, 'earliest=-24h');
    assert.strictEqual(result.modifications[1].original, 'latest=now');
  });

  test('replaces quoted ISO timestamps in earliest/latest', () => {
    const result = rewriteSplTime('earliest="2026-03-01T00:00:00Z" latest="2026-03-08T00:00:00Z"', originalTW, newTW);
    assert.strictEqual(result.rewritten, 'earliest="2026-04-01T00:00:00.000Z" latest="2026-04-08T00:00:00.000Z"');
    assert.strictEqual(result.modifications.length, 2);
  });

  test('returns unchanged statement with STATEMENT_TIME_UNCHANGED warning when no time refs', () => {
    const result = rewriteSplTime('index=main | head 10', originalTW, newTW);
    assert.strictEqual(result.rewritten, 'index=main | head 10');
    assert.strictEqual(result.modifications.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'STATEMENT_TIME_UNCHANGED'));
  });

  test('replaces earliest and emits EVAL_TIME_REFERENCE warning for eval block', () => {
    const result = rewriteSplTime('earliest=-7d | eval t=relative_time(now(),"-1h")', originalTW, newTW);
    assert.ok(result.rewritten.startsWith('earliest="2026-04-01T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'EVAL_TIME_REFERENCE'));
  });

  test('replaces multiple earliest/latest in one statement', () => {
    const stmt = 'earliest=-7d latest=now | append [search earliest=-24h latest=now]';
    const result = rewriteSplTime(stmt, originalTW, newTW);
    assert.strictEqual(result.modifications.length, 4);
    // All earliest should be replaced
    assert.ok(!result.rewritten.includes('-7d'));
    assert.ok(!result.rewritten.includes('-24h'));
  });

  test('replaces rendered template variable earliest=-{{lookback_hours}}h', () => {
    const result = rewriteSplTime('earliest=-4h latest=now | stats count', originalTW, newTW);
    assert.ok(result.rewritten.includes('earliest="2026-04-01T00:00:00.000Z"'));
    assert.ok(result.rewritten.includes('latest="2026-04-08T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 2);
  });
});

// ─── 6. rewriteEsqlTime ────────────────────────────────────────────────────────

describe('rewriteEsqlTime', () => {
  const { rewriteEsqlTime } = require('../thrunt-god/bin/lib/replay.cjs');

  const originalTW = { start: '2026-03-01T00:00:00.000Z', end: '2026-03-08T00:00:00.000Z' };
  const newTW = { start: '2026-04-01T00:00:00.000Z', end: '2026-04-08T00:00:00.000Z' };

  test('replaces both >= and <= @timestamp comparisons', () => {
    const stmt = 'FROM logs | WHERE @timestamp >= "2026-03-01" AND @timestamp <= "2026-03-08"';
    const result = rewriteEsqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('@timestamp >= "2026-04-01T00:00:00.000Z"'));
    assert.ok(result.rewritten.includes('@timestamp <= "2026-04-08T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 2);
  });

  test('replaces single > @timestamp comparison', () => {
    const stmt = 'FROM logs | WHERE @timestamp > "2026-03-01"';
    const result = rewriteEsqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('@timestamp > "2026-04-01T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('returns unchanged with STATEMENT_TIME_UNCHANGED warning when no @timestamp', () => {
    const stmt = 'FROM logs | LIMIT 100';
    const result = rewriteEsqlTime(stmt, originalTW, newTW);
    assert.strictEqual(result.rewritten, stmt);
    assert.strictEqual(result.modifications.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'STATEMENT_TIME_UNCHANGED'));
  });

  test('emits COMPUTED_TIMESTAMP warning for DATE_FORMAT/NOW()', () => {
    const stmt = 'FROM logs | WHERE @timestamp >= DATE_FORMAT(NOW())';
    const result = rewriteEsqlTime(stmt, originalTW, newTW);
    assert.ok(result.warnings.some(w => w.code === 'COMPUTED_TIMESTAMP'));
  });

  test('replaces BETWEEN pattern with both timestamps', () => {
    const stmt = 'FROM logs | WHERE @timestamp BETWEEN "2026-03-01" AND "2026-03-08"';
    const result = rewriteEsqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('"2026-04-01T00:00:00.000Z"'));
    assert.ok(result.rewritten.includes('"2026-04-08T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 1);
  });
});

// ─── 7. rewriteEqlTime ─────────────────────────────────────────────────────────

describe('rewriteEqlTime', () => {
  const { rewriteEqlTime } = require('../thrunt-god/bin/lib/replay.cjs');

  const originalTW = { start: '2026-03-01T00:00:00.000Z', end: '2026-03-08T00:00:00.000Z' };
  const newTW = { start: '2026-04-01T00:00:00.000Z', end: '2026-04-08T00:00:00.000Z' };

  test('does NOT modify statement, returns filter object with range on @timestamp', () => {
    const stmt = 'process where process.name == "cmd.exe"';
    const result = rewriteEqlTime(stmt, originalTW, newTW);
    assert.strictEqual(result.rewritten, stmt);
    assert.ok(result.filter);
    assert.strictEqual(result.filter.range['@timestamp'].gte, '2026-04-01T00:00:00.000Z');
    assert.strictEqual(result.filter.range['@timestamp'].lte, '2026-04-08T00:00:00.000Z');
    assert.strictEqual(result.modifications.length, 1);
    assert.strictEqual(result.modifications[0].type, 'filter_param');
  });

  test('merges with existing filter when options.existingFilter provided', () => {
    const stmt = 'process where process.name == "cmd.exe"';
    const existingFilter = { term: { 'host.name': 'server01' } };
    const result = rewriteEqlTime(stmt, originalTW, newTW, { existingFilter });
    assert.strictEqual(result.rewritten, stmt);
    assert.ok(result.filter.bool);
    assert.ok(result.filter.bool.must);
    assert.strictEqual(result.filter.bool.must.length, 2);
    assert.deepStrictEqual(result.filter.bool.must[0], existingFilter);
    assert.ok(result.filter.bool.must[1].range);
  });

  test('returns modifications array documenting the filter injection', () => {
    const stmt = 'any where true';
    const result = rewriteEqlTime(stmt, originalTW, newTW);
    assert.strictEqual(result.modifications.length, 1);
    assert.strictEqual(result.modifications[0].type, 'filter_param');
    assert.strictEqual(result.modifications[0].original, 'none');
    assert.ok(result.modifications[0].replaced.includes('@timestamp'));
    assert.deepStrictEqual(result.warnings, []);
  });
});

// ─── 8. rewriteKqlTime ─────────────────────────────────────────────────────────

describe('rewriteKqlTime', () => {
  const { rewriteKqlTime } = require('../thrunt-god/bin/lib/replay.cjs');

  const originalTW = { start: '2026-03-01T00:00:00.000Z', end: '2026-03-08T00:00:00.000Z' };
  const newTW = { start: '2026-04-01T00:00:00.000Z', end: '2026-04-08T00:00:00.000Z' };

  test('replaces TimeGenerated > ago(24h) with datetime()', () => {
    const stmt = 'SigninLogs | where TimeGenerated > ago(24h)';
    const result = rewriteKqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('TimeGenerated >= datetime(2026-04-01T00:00:00.000Z)'));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('replaces Timestamp > ago(7d) for Defender XDR', () => {
    const stmt = 'DeviceEvents | where Timestamp > ago(7d)';
    const result = rewriteKqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('Timestamp >= datetime(2026-04-01T00:00:00.000Z)'));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('replaces TimeGenerated >= datetime(2026-03-01)', () => {
    const stmt = 'SecurityAlert | where TimeGenerated >= datetime(2026-03-01)';
    const result = rewriteKqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('TimeGenerated >= datetime(2026-04-01T00:00:00.000Z)'));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('replaces both TimeGenerated and Timestamp in one statement', () => {
    const stmt = 'union SigninLogs, DeviceEvents | where TimeGenerated > ago(24h) or Timestamp > ago(24h)';
    const result = rewriteKqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes('TimeGenerated >= datetime(2026-04-01T00:00:00.000Z)'));
    assert.ok(result.rewritten.includes('Timestamp >= datetime(2026-04-01T00:00:00.000Z)'));
    assert.strictEqual(result.modifications.length, 2);
  });

  test('returns STATEMENT_TIME_UNCHANGED warning when no time refs', () => {
    const stmt = 'SecurityAlert | take 10';
    const result = rewriteKqlTime(stmt, originalTW, newTW);
    assert.strictEqual(result.rewritten, stmt);
    assert.strictEqual(result.modifications.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'STATEMENT_TIME_UNCHANGED'));
  });

  test('emits RETENTION_EXCEEDED warning for Defender XDR when start exceeds 30 days', () => {
    const oldStart = new Date(Date.now() - 45 * 86400000).toISOString();
    const farBackTW = { start: oldStart, end: new Date().toISOString() };
    const stmt = 'DeviceEvents | where Timestamp > ago(7d)';
    const result = rewriteKqlTime(stmt, originalTW, farBackTW, { connectorId: 'defender_xdr' });
    assert.ok(result.warnings.some(w => w.code === 'RETENTION_EXCEEDED'));
  });
});

// ─── 9. rewriteOpenSearchSqlTime ────────────────────────────────────────────────

describe('rewriteOpenSearchSqlTime', () => {
  const { rewriteOpenSearchSqlTime } = require('../thrunt-god/bin/lib/replay.cjs');

  const originalTW = { start: '2026-03-01T00:00:00.000Z', end: '2026-03-08T00:00:00.000Z' };
  const newTW = { start: '2026-04-01T00:00:00.000Z', end: '2026-04-08T00:00:00.000Z' };

  test('replaces >= and <= @timestamp comparisons with single-quoted ISO timestamps', () => {
    const stmt = "SELECT * FROM logs WHERE @timestamp >= '2026-03-01' AND @timestamp <= '2026-03-08'";
    const result = rewriteOpenSearchSqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes("@timestamp >= '2026-04-01T00:00:00.000Z'"));
    assert.ok(result.rewritten.includes("@timestamp <= '2026-04-08T00:00:00.000Z'"));
    assert.strictEqual(result.modifications.length, 2);
  });

  test('handles timestamp field without @ prefix', () => {
    const stmt = "SELECT * FROM logs WHERE timestamp >= '2026-03-01'";
    const result = rewriteOpenSearchSqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes("timestamp >= '2026-04-01T00:00:00.000Z'"));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('replaces BETWEEN pattern with both timestamps', () => {
    const stmt = "SELECT * FROM logs WHERE @timestamp BETWEEN '2026-03-01' AND '2026-03-08'";
    const result = rewriteOpenSearchSqlTime(stmt, originalTW, newTW);
    assert.ok(result.rewritten.includes("'2026-04-01T00:00:00.000Z'"));
    assert.ok(result.rewritten.includes("'2026-04-08T00:00:00.000Z'"));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('returns STATEMENT_TIME_UNCHANGED warning when no WHERE timestamp', () => {
    const stmt = 'SELECT * FROM logs LIMIT 100';
    const result = rewriteOpenSearchSqlTime(stmt, originalTW, newTW);
    assert.strictEqual(result.rewritten, stmt);
    assert.strictEqual(result.modifications.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'STATEMENT_TIME_UNCHANGED'));
  });
});

// ─── 10. TIME_REWRITERS registry ────────────────────────────────────────────────

describe('TIME_REWRITERS registry', () => {
  const { TIME_REWRITERS } = require('../thrunt-god/bin/lib/replay.cjs');

  test('maps spl, esql, eql, kql, sql to rewriter functions', () => {
    assert.strictEqual(typeof TIME_REWRITERS.spl, 'function');
    assert.strictEqual(typeof TIME_REWRITERS.esql, 'function');
    assert.strictEqual(typeof TIME_REWRITERS.eql, 'function');
    assert.strictEqual(typeof TIME_REWRITERS.kql, 'function');
    assert.strictEqual(typeof TIME_REWRITERS.sql, 'function');
  });

  test('all 5 keys present', () => {
    const keys = Object.keys(TIME_REWRITERS).sort();
    assert.deepStrictEqual(keys, ['eql', 'esql', 'kql', 'spl', 'sql']);
  });
});

// ─── 11. rewriteQueryTime ───────────────────────────────────────────────────────

describe('rewriteQueryTime', () => {
  const { rewriteQueryTime } = require('../thrunt-god/bin/lib/replay.cjs');

  const originalTW = { start: '2026-03-01T00:00:00.000Z', end: '2026-03-08T00:00:00.000Z' };
  const newTW = { start: '2026-04-01T00:00:00.000Z', end: '2026-04-08T00:00:00.000Z' };

  test('dispatches spl to rewriteSplTime', () => {
    const result = rewriteQueryTime('spl', 'earliest=-24h latest=now', originalTW, newTW);
    assert.ok(result.rewritten.includes('earliest="2026-04-01T00:00:00.000Z"'));
    assert.ok(result.rewritten.includes('latest="2026-04-08T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 2);
  });

  test('dispatches esql to rewriteEsqlTime', () => {
    const result = rewriteQueryTime('esql', 'FROM logs | WHERE @timestamp >= "2026-03-01"', originalTW, newTW);
    assert.ok(result.rewritten.includes('@timestamp >= "2026-04-01T00:00:00.000Z"'));
    assert.strictEqual(result.modifications.length, 1);
  });

  test('returns NO_TIME_REWRITER warning for unknown language', () => {
    const result = rewriteQueryTime('unknown', 'test query', originalTW, newTW);
    assert.strictEqual(result.rewritten, 'test query');
    assert.strictEqual(result.modifications.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'NO_TIME_REWRITER'));
  });

  test('passes options through to rewriter', () => {
    const oldStart = new Date(Date.now() - 45 * 86400000).toISOString();
    const farBackTW = { start: oldStart, end: new Date().toISOString() };
    const result = rewriteQueryTime('kql', 'DeviceEvents | where Timestamp > ago(7d)', originalTW, farBackTW, { connectorId: 'defender_xdr' });
    assert.ok(result.warnings.some(w => w.code === 'RETENTION_EXCEEDED'));
  });
});

// ─── 12. CONNECTOR_LANGUAGE_MAP ─────────────────────────────────────────────────

describe('CONNECTOR_LANGUAGE_MAP', () => {
  const { CONNECTOR_LANGUAGE_MAP } = require('../thrunt-god/bin/lib/replay.cjs');

  test('maps splunk to spl', () => {
    assert.strictEqual(CONNECTOR_LANGUAGE_MAP.splunk, 'spl');
  });

  test('maps elastic to esql', () => {
    assert.strictEqual(CONNECTOR_LANGUAGE_MAP.elastic, 'esql');
  });

  test('maps sentinel to kql', () => {
    assert.strictEqual(CONNECTOR_LANGUAGE_MAP.sentinel, 'kql');
  });

  test('maps defender_xdr to kql', () => {
    assert.strictEqual(CONNECTOR_LANGUAGE_MAP.defender_xdr, 'kql');
  });

  test('maps opensearch to sql', () => {
    assert.strictEqual(CONNECTOR_LANGUAGE_MAP.opensearch, 'sql');
  });
});

// ─── 13. validateSameLanguageRetarget ──────────────────────────────────────────

describe('validateSameLanguageRetarget', () => {
  const { validateSameLanguageRetarget } = require('../thrunt-god/bin/lib/replay.cjs');

  test('same connector (splunk->splunk) returns allowed:true with empty warnings', () => {
    const result = validateSameLanguageRetarget('splunk', 'splunk');
    assert.strictEqual(result.allowed, true);
    assert.deepStrictEqual(result.warnings, []);
  });

  test('same language different connector (sentinel->defender_xdr) returns allowed:true with FIELD_MAPPING_WARNING', () => {
    const result = validateSameLanguageRetarget('sentinel', 'defender_xdr');
    assert.strictEqual(result.allowed, true);
    assert.ok(result.warnings.length > 0);
    const warning = result.warnings[0];
    assert.ok(warning.includes('TimeGenerated') || warning.includes('Timestamp'), 'Warning should mention field mapping differences');
  });

  test('cross-language (splunk->elastic) returns allowed:false with CROSS_LANGUAGE_RETARGET error', () => {
    const result = validateSameLanguageRetarget('splunk', 'elastic');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.error);
    assert.ok(result.error.includes('pack') || result.error.includes('Cross-language'), 'Error should suggest pack creation');
  });

  test('defender_xdr->sentinel (reverse same-language) also allowed with warning', () => {
    const result = validateSameLanguageRetarget('defender_xdr', 'sentinel');
    assert.strictEqual(result.allowed, true);
    assert.ok(result.warnings.length > 0);
    const warning = result.warnings[0];
    assert.ok(warning.includes('Timestamp') || warning.includes('TimeGenerated'), 'Warning should mention field mapping differences');
  });
});

// ─── 14. retargetPackExecution ─────────────────────────────────────────────────

describe('retargetPackExecution', () => {
  const { retargetPackExecution } = require('../thrunt-god/bin/lib/replay.cjs');
  const os = require('os');

  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retarget-test-'));
    // Create local pack directory (.planning/packs/) for resolvePack
    fs.mkdirSync(path.join(tmpDir, '.planning', 'packs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTestPack(packId, targets, extraParams) {
    const pack = {
      id: packId,
      title: 'Test Pack',
      description: 'A test pack for retargeting',
      kind: 'custom',
      version: '1.0',
      hypothesis_ids: ['H-TEST-001'],
      hypothesis_templates: [],
      required_connectors: targets.map(t => t.connector),
      supported_datasets: ['events'],
      parameters: extraParams || [],
      execution_targets: targets.map(t => ({ ...t, description: t.description || `${t.name} target` })),
      publish: {
        finding_type: 'hunt_result',
        expected_outcomes: ['true_positive', 'false_positive'],
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'packs', `${packId}.json`),
      JSON.stringify(pack, null, 2),
    );
    return pack;
  }

  test('success: retargets to elastic target from multi-target pack', () => {
    writeTestPack('test.retarget', [
      { name: 'splunk-target', connector: 'splunk', dataset: 'events', language: 'spl', query_template: 'index=main src={{ip}}' },
      { name: 'elastic-target', connector: 'elastic', dataset: 'events', language: 'esql', query_template: 'FROM logs-* | WHERE source.ip == "{{ip}}"' },
    ], [{ name: 'ip', type: 'string', required: false }]);

    const result = retargetPackExecution(tmpDir, 'test.retarget', 'elastic', { ip: '10.0.0.1' }, { builtInDir: '/nonexistent', skipExtraRegistries: true });
    assert.ok(result.target);
    assert.strictEqual(result.target.connector, 'elastic');
    assert.ok(result.rendered.includes('10.0.0.1'));
  });

  test('CONNECTOR_NOT_IN_PACK: throws when pack has no target for connector', () => {
    writeTestPack('test.splunk-only', [
      { name: 'splunk-target', connector: 'splunk', dataset: 'events', language: 'spl', query_template: 'index=main' },
    ]);

    assert.throws(
      () => retargetPackExecution(tmpDir, 'test.splunk-only', 'elastic', {}, { builtInDir: '/nonexistent', skipExtraRegistries: true }),
      (err) => err.code === 'CONNECTOR_NOT_IN_PACK',
    );
  });

  test('PACK_NOT_FOUND: throws when packId is invalid', () => {
    assert.throws(
      () => retargetPackExecution(tmpDir, 'nonexistent.pack', 'splunk', {}, { builtInDir: '/nonexistent', skipExtraRegistries: true }),
      (err) => err.code === 'PACK_NOT_FOUND',
    );
  });

  test('same-language retarget includes field mapping warnings in result', () => {
    writeTestPack('test.kql-pack', [
      { name: 'sentinel-target', connector: 'sentinel', dataset: 'events', language: 'kql', query_template: 'SecurityEvent | where TimeGenerated > ago(24h)' },
      { name: 'xdr-target', connector: 'defender_xdr', dataset: 'events', language: 'kql', query_template: 'DeviceEvents | where Timestamp > ago(24h)' },
    ]);

    const result = retargetPackExecution(tmpDir, 'test.kql-pack', 'defender_xdr', {}, { originalConnectorId: 'sentinel', builtInDir: '/nonexistent', skipExtraRegistries: true });
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.some(w => w.includes('TimeGenerated') || w.includes('Timestamp')));
  });
});

// ─── 15. IOC_FIELD_MAP ──────────────────────────────────────────────────────────

describe('IOC_FIELD_MAP', () => {
  const { IOC_FIELD_MAP } = require('../thrunt-god/bin/lib/replay.cjs');

  test('has entry for splunk with ip, hash, domain, user arrays', () => {
    assert.ok(IOC_FIELD_MAP.splunk);
    assert.ok(Array.isArray(IOC_FIELD_MAP.splunk.ip));
    assert.ok(Array.isArray(IOC_FIELD_MAP.splunk.hash));
    assert.ok(Array.isArray(IOC_FIELD_MAP.splunk.domain));
    assert.ok(Array.isArray(IOC_FIELD_MAP.splunk.user));
  });

  test('has entry for elastic with ip, hash, domain, user arrays', () => {
    assert.ok(IOC_FIELD_MAP.elastic);
    assert.ok(Array.isArray(IOC_FIELD_MAP.elastic.ip));
    assert.ok(Array.isArray(IOC_FIELD_MAP.elastic.hash));
    assert.ok(Array.isArray(IOC_FIELD_MAP.elastic.domain));
    assert.ok(Array.isArray(IOC_FIELD_MAP.elastic.user));
  });

  test('has entry for sentinel with ip, hash, domain, user arrays', () => {
    assert.ok(IOC_FIELD_MAP.sentinel);
    assert.ok(Array.isArray(IOC_FIELD_MAP.sentinel.ip));
    assert.ok(Array.isArray(IOC_FIELD_MAP.sentinel.hash));
    assert.ok(Array.isArray(IOC_FIELD_MAP.sentinel.domain));
    assert.ok(Array.isArray(IOC_FIELD_MAP.sentinel.user));
  });

  test('has entry for defender_xdr with ip, hash, domain, user arrays', () => {
    assert.ok(IOC_FIELD_MAP.defender_xdr);
    assert.ok(Array.isArray(IOC_FIELD_MAP.defender_xdr.ip));
    assert.ok(Array.isArray(IOC_FIELD_MAP.defender_xdr.hash));
    assert.ok(Array.isArray(IOC_FIELD_MAP.defender_xdr.domain));
    assert.ok(Array.isArray(IOC_FIELD_MAP.defender_xdr.user));
  });

  test('has entry for opensearch with ip, hash, domain, user arrays', () => {
    assert.ok(IOC_FIELD_MAP.opensearch);
    assert.ok(Array.isArray(IOC_FIELD_MAP.opensearch.ip));
    assert.ok(Array.isArray(IOC_FIELD_MAP.opensearch.hash));
    assert.ok(Array.isArray(IOC_FIELD_MAP.opensearch.domain));
    assert.ok(Array.isArray(IOC_FIELD_MAP.opensearch.user));
  });
});

// ─── 16. validateIocValue ───────────────────────────────────────────────────────

describe('validateIocValue', () => {
  const { validateIocValue } = require('../thrunt-god/bin/lib/replay.cjs');

  test('valid IPv4 (10.0.0.1)', () => {
    const result = validateIocValue('ip', '10.0.0.1');
    assert.strictEqual(result.valid, true);
  });

  test('valid IPv6 (::1)', () => {
    const result = validateIocValue('ip', '::1');
    assert.strictEqual(result.valid, true);
  });

  test('valid IPv6 (2001:db8::1)', () => {
    const result = validateIocValue('ip', '2001:db8::1');
    assert.strictEqual(result.valid, true);
  });

  test('invalid IP (not-an-ip)', () => {
    const result = validateIocValue('ip', 'not-an-ip');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  test('valid hash MD5 (32 hex chars)', () => {
    const result = validateIocValue('hash', 'a'.repeat(32));
    assert.strictEqual(result.valid, true);
  });

  test('valid hash SHA1 (40 hex chars)', () => {
    const result = validateIocValue('hash', 'b'.repeat(40));
    assert.strictEqual(result.valid, true);
  });

  test('valid hash SHA256 (64 hex chars)', () => {
    const result = validateIocValue('hash', 'c'.repeat(64));
    assert.strictEqual(result.valid, true);
  });

  test('valid hash SHA512 (128 hex chars)', () => {
    const result = validateIocValue('hash', 'd'.repeat(128));
    assert.strictEqual(result.valid, true);
  });

  test('invalid hash (too short / non-hex)', () => {
    const result = validateIocValue('hash', 'xyz');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  test('valid domain (example.com)', () => {
    const result = validateIocValue('domain', 'example.com');
    assert.strictEqual(result.valid, true);
  });

  test('valid domain (sub.domain.co.uk)', () => {
    const result = validateIocValue('domain', 'sub.domain.co.uk');
    assert.strictEqual(result.valid, true);
  });

  test('invalid domain (..bad)', () => {
    const result = validateIocValue('domain', '..bad');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  test('valid user (admin) -- any non-empty string', () => {
    const result = validateIocValue('user', 'admin');
    assert.strictEqual(result.valid, true);
  });

  test('empty user returns invalid', () => {
    const result = validateIocValue('user', '');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });
});

// ─── 17. sanitizeIocForLanguage ─────────────────────────────────────────────────

describe('sanitizeIocForLanguage', () => {
  const { sanitizeIocForLanguage } = require('../thrunt-god/bin/lib/replay.cjs');

  test('SPL: strips pipe, backtick, bracket characters', () => {
    const result = sanitizeIocForLanguage('spl', '| delete index=main');
    assert.ok(!result.includes('|'));
    assert.ok(!result.includes('`'));
  });

  test('ES|QL: escapes double quotes', () => {
    const result = sanitizeIocForLanguage('esql', 'value"with"quotes');
    // Doubling: each " becomes "", so "with" becomes ""with""
    assert.strictEqual(result, 'value""with""quotes');
  });

  test('KQL: escapes double quotes and semicolons', () => {
    const result = sanitizeIocForLanguage('kql', 'value"test;drop');
    assert.ok(!result.includes(';'));
  });

  test('SQL: escapes single quotes by doubling', () => {
    const result = sanitizeIocForLanguage('sql', "value' OR 1=1--");
    assert.ok(result.includes("''"));
    assert.ok(!result.includes(";"));
  });

  test('SPL injection prevention: pipe delete command stripped', () => {
    const result = sanitizeIocForLanguage('spl', '| delete index=main');
    assert.ok(!result.includes('|'));
  });
});

// ─── 18. injectIoc ──────────────────────────────────────────────────────────────

describe('injectIoc', () => {
  const { injectIoc } = require('../thrunt-god/bin/lib/replay.cjs');

  test('SPL append ip: wraps in OR group', () => {
    const result = injectIoc('spl', 'index=main src=10.0.0.1', 'ip', '203.0.113.50', 'append', 'splunk');
    assert.ok(result.injected.includes('(src=10.0.0.1 OR src=203.0.113.50)'));
    assert.ok(result.modifications.length > 0);
  });

  test('SPL replace ip: substitutes value', () => {
    const result = injectIoc('spl', 'index=main src=10.0.0.1', 'ip', '203.0.113.50', 'replace', 'splunk');
    assert.ok(result.injected.includes('src=203.0.113.50'));
    assert.ok(!result.injected.includes('10.0.0.1'));
  });

  test('SPL append hash: wraps FileHash in OR group', () => {
    const hash1 = 'a'.repeat(64);
    const hash2 = 'b'.repeat(64);
    const result = injectIoc('spl', `index=main FileHash=${hash1}`, 'hash', hash2, 'append', 'splunk');
    assert.ok(result.injected.includes(`(FileHash=${hash1} OR FileHash=${hash2})`));
  });

  test('ES|QL append ip: produces IN clause', () => {
    const result = injectIoc('esql', 'FROM logs-* | WHERE source.ip == "10.0.0.1"', 'ip', '203.0.113.50', 'append', 'elastic');
    assert.ok(result.injected.includes('source.ip IN ("10.0.0.1", "203.0.113.50")'));
  });

  test('ES|QL replace ip: produces single value', () => {
    const result = injectIoc('esql', 'FROM logs-* | WHERE source.ip == "10.0.0.1"', 'ip', '203.0.113.50', 'replace', 'elastic');
    assert.ok(result.injected.includes('source.ip == "203.0.113.50"'));
    assert.ok(!result.injected.includes('10.0.0.1'));
  });

  test('KQL append ip: produces in clause', () => {
    const result = injectIoc('kql', 'SigninLogs | where IPAddress == "10.0.0.1"', 'ip', '203.0.113.50', 'append', 'sentinel');
    assert.ok(result.injected.includes('IPAddress in ("10.0.0.1", "203.0.113.50")'));
  });

  test('KQL replace ip: replaces value', () => {
    const result = injectIoc('kql', 'SigninLogs | where IPAddress == "10.0.0.1"', 'ip', '203.0.113.50', 'replace', 'sentinel');
    assert.ok(result.injected.includes('IPAddress == "203.0.113.50"'));
    assert.ok(!result.injected.includes('10.0.0.1'));
  });

  test('OpenSearch SQL append ip: produces IN clause with single quotes', () => {
    const result = injectIoc('sql', "SELECT * FROM logs WHERE source_ip = '10.0.0.1'", 'ip', '203.0.113.50', 'append', 'opensearch');
    assert.ok(result.injected.includes("source_ip IN ('10.0.0.1', '203.0.113.50')"));
  });

  test('IOC_FIELD_UNKNOWN warning when ioc type has no field mapping', () => {
    const result = injectIoc('spl', 'index=main', 'unknown_type', 'value', 'append', 'splunk');
    assert.ok(result.warnings.some(w => w.code === 'IOC_FIELD_UNKNOWN'));
  });

  test('COMPLEX_QUERY_WARNING for statement with lookup', () => {
    const result = injectIoc('spl', 'index=main src=10.0.0.1 | lookup threat_intel ip AS src', 'ip', '203.0.113.50', 'append', 'splunk');
    assert.ok(result.warnings.some(w => w.code === 'COMPLEX_QUERY_WARNING'));
  });

  test('no-field-found append: appends new filter clause', () => {
    const result = injectIoc('spl', 'index=main | head 10', 'ip', '10.0.0.1', 'append', 'splunk');
    assert.ok(result.injected.includes('src=10.0.0.1') || result.injected.includes('src="10.0.0.1"'));
  });

  test('injection prevention: sanitized IOC does not contain raw pipe', () => {
    // Use 'user' type since it has permissive validation -- IP would reject '| delete index=main'
    const result = injectIoc('spl', 'index=main user=admin', 'user', '| delete index=main', 'replace', 'splunk');
    // The injected statement should NOT contain the raw pipe command
    assert.ok(!result.injected.includes('| delete'));
  });
});
