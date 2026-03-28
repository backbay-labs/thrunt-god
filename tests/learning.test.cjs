/**
 * Regression tests for telemetry, scoring, recommendation, and promotion flows
 * added in v1.4.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const commands = require('../thrunt-god/bin/lib/commands.cjs');
const detection = require('../thrunt-god/bin/lib/detection.cjs');
const packLib = require('../thrunt-god/bin/lib/pack.cjs');
const recommend = require('../thrunt-god/bin/lib/recommend.cjs');
const runtime = require('../thrunt-god/bin/lib/runtime.cjs');
const scoring = require('../thrunt-god/bin/lib/scoring.cjs');
const telemetry = require('../thrunt-god/bin/lib/telemetry.cjs');
const { createTempProject, cleanup, runThruntTools } = require('./helpers.cjs');

const tempDirs = new Set();

function makeTempProject() {
  const tmpDir = createTempProject();
  tempDirs.add(tmpDir);
  return tmpDir;
}

afterEach(() => {
  for (const tmpDir of tempDirs) {
    cleanup(tmpDir);
  }
  tempDirs.clear();
});

function buildPromotableCandidate(tmpDir) {
  const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
  const backtestsDir = path.join(detectionsDir, 'backtests');
  fs.mkdirSync(backtestsDir, { recursive: true });

  const candidate = detection.createDetectionCandidate({
    source_finding_id: 'F-PROM',
    source_phase: '19-promotion/FINDINGS.md',
    technique_ids: ['T1078'],
    detection_logic: {
      title: 'Promote test',
      description: 'Promotion test detection',
      logsource: { category: 'authentication', product: 'azure' },
      detection: { selection: { EventID: 4624 }, condition: 'selection' },
      false_positives: ['Unknown'],
    },
    confidence: 'high',
    evidence_links: [
      { type: 'receipt', id: 'RCT-001' },
      { type: 'receipt', id: 'RCT-002' },
      { type: 'receipt', id: 'RCT-003' },
    ],
    metadata: { author: 'test', status: 'draft', notes: '' },
  });
  candidate.promotion_readiness = 0.75;

  fs.writeFileSync(
    path.join(detectionsDir, `${candidate.candidate_id}.json`),
    JSON.stringify(candidate, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(backtestsDir, 'BT-PROMOTE.json'),
    JSON.stringify({
      backtest_id: 'BT-PROMOTE',
      candidate_id: candidate.candidate_id,
      validation: { passed: true, errors: [], warnings: [] },
      noise_score: { noise_risk: 'low', score: 0.1 },
    }, null, 2),
    'utf-8'
  );

  return candidate;
}

describe('pack telemetry attribution', () => {
  it('persists hunt telemetry with pack_id when runtime artifacts include pack metadata', async () => {
    const tmpDir = makeTempProject();
    const executionPlan = packLib.buildPackExecutionTargets(
      tmpDir,
      'technique.t1078-valid-accounts',
      {
        tenant: 'example-tenant',
        focus_user: 'alice@example.com',
        lookback_hours: 24,
      },
      { dry_run: true }
    );
    const spec = executionPlan.targets[0].query_spec;
    const adapter = {
      capabilities: runtime.createConnectorCapabilities({
        id: spec.connector.id,
        auth_types: ['api_key'],
        dataset_kinds: [spec.dataset.kind],
        languages: [spec.query.language],
        pagination_modes: ['auto', 'none'],
      }),
      prepareQuery() {
        return {};
      },
      executeRequest() {
        return {};
      },
      normalizeResponse() {
        return {
          events: [{ id: 'evt-1' }],
          warnings: [],
          errors: [],
          metadata: {},
          has_more: false,
        };
      },
    };

    await runtime.executeQuerySpec(spec, adapter, {
      cwd: tmpDir,
      artifacts: { pack_id: executionPlan.pack.id },
    });

    const metrics = telemetry.listMetrics(tmpDir, { type: 'hunt' });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].pack_id, executionPlan.pack.id);
  });

  it('cmdRuntimeExecute forwards pack_id into runtime artifacts and records aggregate pack execution', async () => {
    const tmpDir = makeTempProject();
    const originalWriteSync = fs.writeSync;
    const originalCreateRegistry = runtime.createBuiltInConnectorRegistry;
    const originalExecuteQuerySpec = runtime.executeQuerySpec;
    const originalRecordPackExecution = telemetry.recordPackExecution;

    const seenOptions = [];
    let recordedArgs = null;

    fs.writeSync = () => {};
    runtime.createBuiltInConnectorRegistry = () => ({});
    runtime.executeQuerySpec = async (_spec, _registry, options) => {
      seenOptions.push(options);
      return {
        envelope: {
          status: 'ok',
          counts: { events: 5 },
          timing: { duration_ms: 10 },
        },
        artifacts: { query_log: null, receipts: [], manifest: null },
        pagination: {},
      };
    };
    telemetry.recordPackExecution = (...args) => {
      recordedArgs = args;
      return { pack_execution_id: 'PE-TEST' };
    };

    try {
      await commands.cmdRuntimeExecute(tmpDir, [
        '--pack', 'technique.t1078-valid-accounts',
        '--param', 'tenant=example-tenant',
        '--param', 'focus_user=alice@example.com',
        '--param', 'lookback_hours=24',
      ], true);
    } finally {
      fs.writeSync = originalWriteSync;
      runtime.createBuiltInConnectorRegistry = originalCreateRegistry;
      runtime.executeQuerySpec = originalExecuteQuerySpec;
      telemetry.recordPackExecution = originalRecordPackExecution;
    }

    assert.ok(seenOptions.length > 0, 'pack execution should invoke runtime.executeQuerySpec');
    assert.ok(
      seenOptions.every(options => options.artifacts && options.artifacts.pack_id === 'technique.t1078-valid-accounts'),
      'each target should carry pack_id into runtime artifacts'
    );
    assert.ok(recordedArgs, 'aggregate pack execution telemetry should be recorded');
    assert.equal(recordedArgs[1], 'technique.t1078-valid-accounts');
  });
});

describe('human-readable command output', () => {
  it('renders text instead of JSON for non-raw metrics, scoring, feedback, and recommendation commands', () => {
    const tmpDir = makeTempProject();

    const feedbackSubmit = runThruntTools([
      'feedback', 'submit',
      '--entity-type', 'pack',
      '--entity-id', 'technique.t1078-valid-accounts',
      '--type', 'high_quality',
      '--analyst', 'tester',
    ], tmpDir);
    assert.ok(feedbackSubmit.success, feedbackSubmit.error);
    assert.ok(feedbackSubmit.output.startsWith('Feedback recorded:'), feedbackSubmit.output);

    const cases = [
      { args: ['metrics', 'summary'], marker: '# Hunt Metrics Summary' },
      { args: ['score', 'summary'], marker: '# Outcome Score Summary' },
      { args: ['feedback', 'list'], marker: 'Found 1 feedback record(s):' },
      { args: ['recommend', 'packs'], marker: '# Packs Recommendations' },
      { args: ['planning-hints'], marker: '# Planning Hints' },
    ];

    for (const testCase of cases) {
      const result = runThruntTools(testCase.args, tmpDir);
      assert.ok(result.success, result.error);
      assert.ok(result.output.includes(testCase.marker), `${testCase.args.join(' ')} output was: ${result.output}`);
      assert.ok(!result.output.trim().startsWith('{'), `${testCase.args.join(' ')} should not render JSON by default`);
    }
  });
});

describe('feedback semantics and detection filtering', () => {
  it('scores pack executions from aggregate pack metrics without double-counting target hunts', () => {
    const tmpDir = makeTempProject();

    telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-PACK-1',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: [] },
    }, {
      status: 'ok',
      timing: { duration_ms: 100 },
      counts: { events: 10 },
    }, { pack_id: 'pack.alpha' });

    telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-PACK-2',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: [] },
    }, {
      status: 'ok',
      timing: { duration_ms: 100 },
      counts: { events: 10 },
    }, { pack_id: 'pack.alpha' });

    telemetry.recordPackExecution(tmpDir, 'pack.alpha', '1.0.0', [
      { connector_id: 'splunk', dataset_kind: 'events' },
      { connector_id: 'splunk', dataset_kind: 'events' },
    ], [
      { status: 'ok', counts: { events: 10 }, timing: { duration_ms: 100 } },
      { status: 'ok', counts: { events: 10 }, timing: { duration_ms: 100 } },
    ]);

    const score = scoring.scoreEntity(tmpDir, 'pack', 'pack.alpha');
    assert.equal(score.execution_count, 1);
    assert.equal(score.yield_score, 1);
    assert.equal(score.success_rate, 1);
  });

  it('preserves legacy hunt-only pack runs alongside aggregate pack telemetry', () => {
    const tmpDir = makeTempProject();

    const legacy = telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-LEGACY',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: [] },
    }, {
      status: 'ok',
      timing: { duration_ms: 50 },
      counts: { events: 8 },
    }, { pack_id: 'pack.alpha' });

    const newRun1 = telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-NEW-1',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: [] },
    }, {
      status: 'ok',
      timing: { duration_ms: 50 },
      counts: { events: 6 },
    }, { pack_id: 'pack.alpha' });

    const newRun2 = telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-NEW-2',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: [] },
    }, {
      status: 'ok',
      timing: { duration_ms: 50 },
      counts: { events: 6 },
    }, { pack_id: 'pack.alpha' });

    telemetry.recordPackExecution(tmpDir, 'pack.alpha', '1.0.0', [
      { connector_id: 'splunk', dataset_kind: 'events' },
      { connector_id: 'splunk', dataset_kind: 'events' },
    ], [
      { status: 'ok', counts: { events: 6 }, timing: { duration_ms: 50 } },
      { status: 'ok', counts: { events: 6 }, timing: { duration_ms: 50 } },
    ], {
      hunt_execution_ids: [newRun1.hunt_execution_id, newRun2.hunt_execution_id],
    });

    const score = scoring.scoreEntity(tmpDir, 'pack', 'pack.alpha');
    assert.equal(score.execution_count, 2);
    assert.equal(score.yield_score, 0.5);
    assert.equal(score.success_rate, 1);
    assert.ok(legacy.hunt_execution_id);
  });

  it('applies low_yield and high_quality feedback to composite scoring', () => {
    const tmpDir = makeTempProject();

    telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-1',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: ['HYP-1'] },
      time_window: { lookback_minutes: 60 },
    }, {
      status: 'ok',
      timing: { duration_ms: 1000 },
      counts: { events: 30 },
    });

    const base = scoring.scoreEntity(tmpDir, 'hypothesis', 'HYP-1');
    scoring.submitFeedback(tmpDir, {
      entity_type: 'hypothesis',
      entity_id: 'HYP-1',
      feedback_type: 'low_yield',
      analyst: 'tester',
    });
    const lowYield = scoring.scoreEntity(tmpDir, 'hypothesis', 'HYP-1');
    scoring.submitFeedback(tmpDir, {
      entity_type: 'hypothesis',
      entity_id: 'HYP-1',
      feedback_type: 'high_quality',
      analyst: 'tester',
    });
    const highQuality = scoring.scoreEntity(tmpDir, 'hypothesis', 'HYP-1');

    assert.ok(lowYield.composite_score < base.composite_score);
    assert.equal(lowYield.low_yield_count, 1);
    assert.ok(highQuality.composite_score > lowYield.composite_score);
    assert.equal(highQuality.high_quality_count, 1);
  });

  it('keeps noisy summary aligned with classifyOutcome and filtered summaries', () => {
    const tmpDir = makeTempProject();

    telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-NOISY',
      connector: { id: 'splunk' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: ['HYP-1'] },
    }, {
      status: 'ok',
      timing: { duration_ms: 100 },
      counts: { events: 1, warnings: 6, errors: 0 },
    });
    telemetry.recordHuntExecution(tmpDir, {
      query_id: 'QRY-NOT-NOISY',
      connector: { id: 'sentinel' },
      dataset: { kind: 'events' },
      evidence: { hypothesis_ids: ['HYP-2'] },
    }, {
      status: 'ok',
      timing: { duration_ms: 100 },
      counts: { events: 1, warnings: 1, errors: 0 },
    });
    telemetry.recordPackExecution(tmpDir, 'pack.reasoning', '1.0.0', [
      { connector_id: 'splunk', dataset_kind: 'events' },
    ], [
      { status: 'ok', counts: { events: 16 }, timing: { duration_ms: 100 } },
    ]);

    const allSummary = telemetry.summarizeMetrics(tmpDir);
    const filteredSummary = telemetry.summarizeMetrics(tmpDir, { connector_id: 'splunk' });
    const recommendations = recommend.recommendPacks(tmpDir, {});
    const packRecommendation = recommendations.recommendations.find(rec => rec.entity_id === 'pack.reasoning');

    assert.equal(allSummary.yield_summary.noisy, 1);
    assert.equal(filteredSummary.total_executions, 1);
    assert.equal(filteredSummary.yield_summary.noisy, 1);
    assert.ok(packRecommendation, 'expected recommendation for pack.reasoning');
    assert.ok(
      packRecommendation.reasoning.includes('High yield in prior runs relative to the entity baseline')
    );
    assert.ok(
      packRecommendation.reasoning.every(reason => !reason.includes('>100 events avg'))
    );
  });

  it('fires promotion hooks once in the correct sequence during promotion', () => {
    const tmpDir = makeTempProject();
    const candidate = buildPromotableCandidate(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ promotion_hooks_enabled: true }, null, 2),
      'utf-8'
    );

    const calls = [];
    const result = detection.promoteDetection(tmpDir, candidate, {
      approve: true,
      hooks: {
        beforePromote(updatedCandidate) {
          calls.push({ hook: 'before', receipt: null, candidate_id: updatedCandidate.candidate_id });
          return updatedCandidate;
        },
        afterPromote(updatedCandidate, receipt) {
          calls.push({ hook: 'after', receipt: receipt.promotion_id, candidate_id: updatedCandidate.candidate_id });
        },
      },
    });

    assert.equal(result.promoted, true);
    assert.deepEqual(calls.map(call => call.hook), ['before', 'after']);
    assert.equal(calls[0].receipt, null);
    assert.equal(calls[1].receipt, result.receipt.promotion_id);
  });

  it('filters detection status by phase through the CLI', () => {
    const tmpDir = makeTempProject();
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    fs.writeFileSync(
      path.join(detectionsDir, 'DET-19.json'),
      JSON.stringify({
        candidate_id: 'DET-19',
        source_phase: '19-promotion/FINDINGS.md',
        metadata: { status: 'draft' },
        promotion_readiness: 0.5,
      }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20.json'),
      JSON.stringify({
        candidate_id: 'DET-20',
        source_phase: '20-learning/FINDINGS.md',
        metadata: { status: 'promoted' },
        promotion_readiness: 0.9,
      }),
      'utf-8'
    );

    const result = runThruntTools(['detection', 'status', '--phase', '19', '--raw'], tmpDir);
    assert.ok(result.success, result.error);

    const parsed = JSON.parse(result.output);
    assert.equal(parsed.counts.total, 1);
    assert.equal(parsed.counts.draft, 1);
    assert.equal(parsed.counts.promoted, 0);
    assert.equal(parsed.by_status.draft[0].candidate_id, 'DET-19');
  });
});
