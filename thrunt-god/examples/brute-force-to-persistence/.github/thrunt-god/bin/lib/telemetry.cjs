/**
 * Telemetry — Hunt execution metrics recording, aggregation, and query.
 *
 * Leaf module: evidence.cjs and detection.cjs import from telemetry.cjs,
 * never the other way around. No other lib module imports from this file.
 *
 * Storage: JSON files in `.planning/METRICS/` (flat directory, matching
 * QUERIES/, RECEIPTS/, MANIFESTS/ pattern). Atomic writes via tmp+rename.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { planningDir, output, error } = require('./core.cjs');
const { canonicalSerialize } = require('./manifest.cjs');

function nowUtc() {
  return new Date().toISOString();
}

function metricsDir(cwd) {
  return path.join(planningDir(cwd), 'METRICS');
}

function ensureMetricsDir(cwd) {
  const dir = metricsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hash5(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 5);
}

function dateStamp() {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = path.join(dir, `.tmp-${path.basename(filePath)}`);
  fs.writeFileSync(tmpFile, content, 'utf-8');
  fs.renameSync(tmpFile, filePath);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function timeWindowMinutes(tw) {
  if (!tw) return null;
  if (tw.lookback_minutes) return tw.lookback_minutes;
  if (tw.start && tw.end) {
    const ms = Date.parse(tw.end) - Date.parse(tw.start);
    return ms > 0 ? Math.round(ms / 60000) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function recordHuntExecution(cwd, spec, envelope, options = {}) {
  const ts = nowUtc();
  const stamp = dateStamp();
  const queryId = (spec && spec.query_id) || 'unknown';
  const id = `HE-${stamp}-${hash5(queryId + ts)}`;

  const record = {
    hunt_execution_id: id,
    record_type: 'hunt_execution',
    timestamp: ts,
    query_id: queryId,
    connector_id: (spec.connector && spec.connector.id) || null,
    dataset_kind: (spec.dataset && spec.dataset.kind) || null,
    hypothesis_ids: (spec.evidence && spec.evidence.hypothesis_ids) || [],
    pack_id: options.pack_id || null,
    execution_metrics: {
      started_at: (envelope.timing && envelope.timing.started_at) || null,
      completed_at: (envelope.timing && envelope.timing.completed_at) || null,
      duration_ms: (envelope.timing && envelope.timing.duration_ms) || 0,
      pages_fetched: (envelope.pagination && envelope.pagination.pages_fetched) || 0,
      status: envelope.status || 'unknown',
    },
    evidence_yield: {
      events: (envelope.counts && envelope.counts.events) || 0,
      entities: (envelope.counts && envelope.counts.entities) || 0,
      relationships: (envelope.counts && envelope.counts.relationships) || 0,
      evidence: (envelope.counts && envelope.counts.evidence) || 0,
      warnings: (envelope.counts && envelope.counts.warnings) || 0,
      errors: (envelope.counts && envelope.counts.errors) || 0,
    },
    connector_metrics: {
      auth_profile: (spec.connector && spec.connector.profile) || null,
      pagination_mode: (spec.pagination && spec.pagination.mode) || null,
      time_window_minutes: timeWindowMinutes(spec.time_window),
    },
    outcome: envelope.status || 'unknown',
    related_artifacts: {
      receipt_ids: options.receipt_ids || [],
      manifest_ids: options.manifest_ids || [],
    },
    replay_context: options.replay_context || null,
  };

  const dir = ensureMetricsDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

function recordPackExecution(cwd, packId, packVersion, targets, results, options = {}) {
  const ts = nowUtc();
  const stamp = dateStamp();
  const id = `PE-${stamp}-${hash5(packId + ts)}`;
  const huntExecutionIds = Array.isArray(options.hunt_execution_ids)
    ? Array.from(new Set(options.hunt_execution_ids.filter(Boolean)))
    : [];

  const perTarget = (targets || []).map((t, i) => {
    const r = (results && results[i]) || {};
    return {
      connector_id: (t.connector_id) || null,
      dataset_kind: (t.dataset_kind) || null,
      status: (r.status) || 'unknown',
      events: (r.counts && r.counts.events) || 0,
      duration_ms: (r.timing && r.timing.duration_ms) || 0,
    };
  });

  const record = {
    pack_execution_id: id,
    record_type: 'pack_execution',
    timestamp: ts,
    pack_id: packId,
    pack_version: packVersion || null,
    target_count: (targets || []).length,
    successful_targets: perTarget.filter(t => t.status === 'ok').length,
    failed_targets: perTarget.filter(t => t.status === 'error').length,
    hunt_execution_ids: huntExecutionIds,
    total_events: perTarget.reduce((sum, t) => sum + t.events, 0),
    total_duration_ms: perTarget.reduce((sum, t) => sum + t.duration_ms, 0),
    per_target: perTarget,
  };

  const dir = ensureMetricsDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

function recordPromotionOutcome(cwd, candidate, promotionReceipt) {
  const ts = nowUtc();
  const stamp = dateStamp();
  const candId = (candidate && candidate.candidate_id) || 'unknown';
  const id = `PO-${stamp}-${hash5(candId + ts)}`;

  const isPromotion = !!(promotionReceipt && promotionReceipt.promotion_id);
  const isRejection = !!(promotionReceipt && promotionReceipt.rejection_id);

  const evidenceLinks = (candidate && candidate.evidence_links) || [];
  const hypothesisIds = [];
  for (const link of evidenceLinks) {
    if (link.hypothesis_ids) {
      for (const hid of link.hypothesis_ids) {
        if (!hypothesisIds.includes(hid)) hypothesisIds.push(hid);
      }
    }
  }

  const record = {
    promotion_outcome_id: id,
    record_type: 'promotion_outcome',
    timestamp: ts,
    candidate_id: candId,
    finding_id: (candidate && candidate.source_finding_id) || null,
    technique_ids: (candidate && candidate.technique_ids) || [],
    promotion_status: isPromotion ? 'promoted' : isRejection ? 'rejected' : 'unknown',
    readiness_score: (candidate && candidate.promotion_readiness) || 0,
    quality_score: (candidate && candidate.quality_score) || 0,
    evidence_chain_length: evidenceLinks.length,
    hypothesis_ids: hypothesisIds,
  };

  const dir = ensureMetricsDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

function recordReplayExecution(cwd, replaySpec, results) {
  const ts = nowUtc();
  const stamp = dateStamp();
  const replayId = (replaySpec && replaySpec.replay_id) || 'unknown';
  const id = `RE-${stamp}-${hash5(replayId + ts)}`;

  const mutations = (replaySpec && replaySpec.mutations) || {};
  const mutationTypes = Object.keys(mutations).filter(k => mutations[k]);

  const record = {
    replay_execution_id: id,
    record_type: 'replay_execution',
    timestamp: ts,
    replay_id: replayId,
    source: (replaySpec && replaySpec.source) || null,
    mutation_types: mutationTypes,
    original_query_ids: (replaySpec && replaySpec.evidence && replaySpec.evidence.lineage && replaySpec.evidence.lineage.original_query_ids) || [],
    diff_mode: (replaySpec && replaySpec.diff && replaySpec.diff.mode) || null,
    results_summary: {
      events: (results && results.events) || 0,
      entities: (results && results.entities) || 0,
      status: (results && results.status) || 'unknown',
    },
  };

  const dir = ensureMetricsDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Returns: high_yield | productive | noisy | inconclusive | failed | low_yield */
function classifyOutcome(record) {
  const events = (record.evidence_yield && record.evidence_yield.events) || 0;
  const warnings = (record.evidence_yield && record.evidence_yield.warnings) || 0;
  const errors = (record.evidence_yield && record.evidence_yield.errors) || 0;
  const status = record.outcome || (record.execution_metrics && record.execution_metrics.status) || 'unknown';

  if (status === 'error') return 'failed';
  if (status === 'empty' || (status === 'partial' && events === 0)) return 'inconclusive';
  if (events > 100) return 'high_yield';
  if (warnings > errors && warnings > 5) return 'noisy';
  if (events > 0 && events <= 10) return 'low_yield';
  if (events > 0 && status === 'ok') return 'productive';
  return 'inconclusive';
}

const YIELD_SUMMARY_BUCKETS = ['high_yield', 'productive', 'low_yield', 'noisy', 'inconclusive', 'failed'];

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function listMetrics(cwd, options = {}) {
  const dir = metricsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  const prefixMap = { hunt: 'HE-', pack: 'PE-', promotion: 'PO-' };
  const prefix = options.type ? prefixMap[options.type] : null;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .filter(f => !prefix || f.startsWith(prefix));

  let records = [];
  for (const file of files) {
    const record = safeReadJson(path.join(dir, file));
    if (!record) continue;

    if (options.connector_id && record.connector_id !== options.connector_id) continue;
    if (options.pack_id && record.pack_id !== options.pack_id) continue;
    if (options.hypothesis_id) {
      const ids = record.hypothesis_ids || [];
      if (!ids.includes(options.hypothesis_id)) continue;
    }

    records.push(record);
  }

  records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  if (options.limit && options.limit > 0) {
    records = records.slice(0, options.limit);
  }

  return records;
}

function summarizeMetrics(cwd, options = {}) {
  const all = listMetrics(cwd, options);

  const huntRecords = all.filter(r => r.record_type === 'hunt_execution');
  const packRecords = all.filter(r => r.record_type === 'pack_execution');
  const promoRecords = all.filter(r => r.record_type === 'promotion_outcome');

  const byConnector = {};
  for (const r of huntRecords) {
    const cid = r.connector_id || 'unknown';
    if (!byConnector[cid]) {
      byConnector[cid] = { executions: 0, events_total: 0, duration_total_ms: 0, success_count: 0 };
    }
    byConnector[cid].executions++;
    byConnector[cid].events_total += (r.evidence_yield && r.evidence_yield.events) || 0;
    byConnector[cid].duration_total_ms += (r.execution_metrics && r.execution_metrics.duration_ms) || 0;
    if (r.outcome === 'ok') byConnector[cid].success_count++;
  }
  for (const cid of Object.keys(byConnector)) {
    const c = byConnector[cid];
    c.avg_duration_ms = c.executions > 0 ? Math.round(c.duration_total_ms / c.executions) : 0;
    c.success_rate = c.executions > 0 ? +(c.success_count / c.executions).toFixed(4) : 0;
    delete c.duration_total_ms;
    delete c.success_count;
  }

  const byPack = {};
  for (const r of packRecords) {
    const pid = r.pack_id || 'unknown';
    if (!byPack[pid]) {
      byPack[pid] = { runs: 0, total_events: 0, duration_total_ms: 0, success_count: 0 };
    }
    byPack[pid].runs++;
    byPack[pid].total_events += r.total_events || 0;
    byPack[pid].duration_total_ms += r.total_duration_ms || 0;
    if (r.failed_targets === 0) byPack[pid].success_count++;
  }
  for (const pid of Object.keys(byPack)) {
    const p = byPack[pid];
    p.avg_duration_ms = p.runs > 0 ? Math.round(p.duration_total_ms / p.runs) : 0;
    p.success_rate = p.runs > 0 ? +(p.success_count / p.runs).toFixed(4) : 0;
    delete p.duration_total_ms;
    delete p.success_count;
  }

  const byHypothesis = {};
  for (const r of huntRecords) {
    const hids = r.hypothesis_ids || [];
    for (const hid of hids) {
      if (!byHypothesis[hid]) {
        byHypothesis[hid] = { executions: 0, total_evidence: 0, connectors_used: [], packs_used: [] };
      }
      byHypothesis[hid].executions++;
      byHypothesis[hid].total_evidence += (r.evidence_yield && r.evidence_yield.events) || 0;
      if (r.connector_id && !byHypothesis[hid].connectors_used.includes(r.connector_id)) {
        byHypothesis[hid].connectors_used.push(r.connector_id);
      }
      if (r.pack_id && !byHypothesis[hid].packs_used.includes(r.pack_id)) {
        byHypothesis[hid].packs_used.push(r.pack_id);
      }
    }
  }

  const byOutcome = { ok: 0, partial: 0, error: 0, empty: 0 };
  for (const r of huntRecords) {
    const o = r.outcome || 'unknown';
    if (o in byOutcome) byOutcome[o]++;
  }

  const yieldSummary = Object.fromEntries(YIELD_SUMMARY_BUCKETS.map(outcome => [outcome, 0]));
  for (const outcome of huntRecords.map(r => classifyOutcome(r))) {
    if (outcome in yieldSummary) {
      yieldSummary[outcome]++;
    }
  }

  return {
    total_executions: huntRecords.length,
    total_pack_runs: packRecords.length,
    total_promotions: {
      promoted: promoRecords.filter(r => r.promotion_status === 'promoted').length,
      rejected: promoRecords.filter(r => r.promotion_status === 'rejected').length,
    },
    by_connector: byConnector,
    by_pack: byPack,
    by_hypothesis: byHypothesis,
    by_outcome: byOutcome,
    yield_summary: yieldSummary,
  };
}

// ---------------------------------------------------------------------------
// CLI handlers
// ---------------------------------------------------------------------------

function cmdMetricsSummary(cwd, raw) {
  const summary = summarizeMetrics(cwd);

  const lines = [];
  lines.push('# Hunt Metrics Summary\n');
  lines.push(`Total executions: ${summary.total_executions}`);
  lines.push(`Total pack runs:  ${summary.total_pack_runs}`);
  lines.push(`Promotions:       ${summary.total_promotions.promoted} promoted, ${summary.total_promotions.rejected} rejected`);
  lines.push('');

  lines.push('## Outcomes');
  lines.push(`  ok: ${summary.by_outcome.ok}  partial: ${summary.by_outcome.partial}  error: ${summary.by_outcome.error}  empty: ${summary.by_outcome.empty}`);
  lines.push('');

  lines.push('## Yield');
  lines.push(`  High-yield (>100 events): ${summary.yield_summary.high_yield}`);
  lines.push(`  Productive (ok with >10 and <=100 events): ${summary.yield_summary.productive}`);
  lines.push(`  Low-yield (1-10 events): ${summary.yield_summary.low_yield}`);
  lines.push(`  Noisy (warnings > errors and >5 warnings): ${summary.yield_summary.noisy}`);
  lines.push(`  Inconclusive: ${summary.yield_summary.inconclusive}`);
  lines.push(`  Failed: ${summary.yield_summary.failed}`);
  lines.push('');

  const connectors = Object.keys(summary.by_connector);
  if (connectors.length) {
    lines.push('## By Connector');
    lines.push('| Connector | Executions | Events | Avg Duration | Success Rate |');
    lines.push('|-----------|------------|--------|--------------|--------------|');
    for (const c of connectors) {
      const s = summary.by_connector[c];
      lines.push(`| ${c} | ${s.executions} | ${s.events_total} | ${s.avg_duration_ms}ms | ${(s.success_rate * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }

  const packs = Object.keys(summary.by_pack);
  if (packs.length) {
    lines.push('## By Pack');
    lines.push('| Pack | Runs | Events | Avg Duration | Success Rate |');
    lines.push('|------|------|--------|--------------|--------------|');
    for (const p of packs) {
      const s = summary.by_pack[p];
      lines.push(`| ${p} | ${s.runs} | ${s.total_events} | ${s.avg_duration_ms}ms | ${(s.success_rate * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }

  const hyps = Object.keys(summary.by_hypothesis);
  if (hyps.length) {
    lines.push('## By Hypothesis');
    lines.push('| Hypothesis | Executions | Evidence | Connectors | Packs |');
    lines.push('|------------|------------|----------|------------|-------|');
    for (const h of hyps) {
      const s = summary.by_hypothesis[h];
      lines.push(`| ${h} | ${s.executions} | ${s.total_evidence} | ${s.connectors_used.join(', ')} | ${s.packs_used.join(', ') || '-'} |`);
    }
    lines.push('');
  }

  if (summary.total_executions === 0 && summary.total_pack_runs === 0) {
    lines.push('No metrics recorded yet. Run hunts to generate telemetry data.');
  }

  if (raw) {
    output(summary, raw);
    return;
  }

  output(summary, true, lines.join('\n'));
}

function cmdMetricsList(cwd, filterArgs, raw) {
  const args = filterArgs || [];
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) options.type = args[++i];
    else if (args[i] === '--connector' && args[i + 1]) options.connector_id = args[++i];
    else if (args[i] === '--pack' && args[i + 1]) options.pack_id = args[++i];
    else if (args[i] === '--hypothesis' && args[i + 1]) options.hypothesis_id = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i], 10);
  }

  const records = listMetrics(cwd, options);

  const lines = [];
  if (records.length === 0) {
    lines.push('No metrics found matching filters.');
  } else {
    lines.push(`Found ${records.length} metric record(s):\n`);
    for (const r of records) {
      const type = r.record_type || 'unknown';
      const id = r.hunt_execution_id || r.pack_execution_id || r.promotion_outcome_id || '?';
      const ts = r.timestamp || '';

      if (type === 'hunt_execution') {
        const ev = (r.evidence_yield && r.evidence_yield.events) || 0;
        const dur = (r.execution_metrics && r.execution_metrics.duration_ms) || 0;
        lines.push(`  ${id}  ${ts}  connector=${r.connector_id || '-'}  events=${ev}  duration=${dur}ms  outcome=${r.outcome || '-'}  hyps=${(r.hypothesis_ids || []).join(',') || '-'}`);
      } else if (type === 'pack_execution') {
        lines.push(`  ${id}  ${ts}  pack=${r.pack_id || '-'}  targets=${r.target_count || 0}  events=${r.total_events || 0}  duration=${r.total_duration_ms || 0}ms`);
      } else if (type === 'promotion_outcome') {
        lines.push(`  ${id}  ${ts}  candidate=${r.candidate_id || '-'}  status=${r.promotion_status || '-'}  readiness=${r.readiness_score || 0}  quality=${r.quality_score || 0}`);
      } else {
        lines.push(`  ${id}  ${ts}  type=${type}`);
      }
    }
  }

  if (raw) {
    output(records, raw);
    return;
  }

  output(records, true, lines.join('\n'));
}

module.exports = {
  recordHuntExecution,
  recordPackExecution,
  recordPromotionOutcome,
  recordReplayExecution,
  classifyOutcome,
  listMetrics,
  summarizeMetrics,
  cmdMetricsSummary,
  cmdMetricsList,
  // Shared helpers re-exported for scoring.cjs
  nowUtc,
  hash5,
  dateStamp,
  atomicWrite,
  safeReadJson,
};
