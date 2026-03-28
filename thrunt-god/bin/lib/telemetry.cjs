/**
 * Telemetry — Hunt execution metrics recording, aggregation, and query.
 *
 * Leaf module: evidence.cjs and detection.cjs import from telemetry.cjs,
 * never the other way around. No other lib module imports from this file.
 *
 * Storage: JSON files in `.planning/METRICS/` (flat directory, matching
 * QUERIES/, RECEIPTS/, MANIFESTS/ pattern). Atomic writes via tmp+rename.
 *
 * Provides:
 * - recordHuntExecution(cwd, spec, envelope, options) — emit hunt execution metric
 * - recordPackExecution(cwd, packId, packVersion, targets, results) — emit pack metric
 * - recordPromotionOutcome(cwd, candidate, promotionReceipt) — emit promotion metric
 * - listMetrics(cwd, options) — read and filter metric records
 * - summarizeMetrics(cwd, options) — aggregate metrics into summary
 * - cmdMetricsSummary(cwd, raw) — CLI handler for metrics summary
 * - cmdMetricsList(cwd, filterArgs, raw) — CLI handler for metrics list
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { planningDir, output, error } = require('./core.cjs');
const { sortKeysDeep, canonicalSerialize } = require('./manifest.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** 5-character hash from input string. */
function hash5(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 5);
}

/** Date-stamp for metric IDs: YYYYMMDD. */
function dateStamp() {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Atomic write: tmp file then rename. */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = path.join(dir, `.tmp-${path.basename(filePath)}`);
  fs.writeFileSync(tmpFile, content, 'utf-8');
  fs.renameSync(tmpFile, filePath);
}

/** Safely read and parse a JSON file, returning null on failure. */
function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Compute time window in minutes from a spec time_window. */
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
// Recording functions
// ---------------------------------------------------------------------------

/**
 * Record a hunt execution metric after writeRuntimeArtifacts.
 *
 * @param {string} cwd - project root
 * @param {object} spec - QuerySpec used for execution
 * @param {object} envelope - ResultEnvelope from execution
 * @param {object} [options] - { pack_id, receipt_ids, manifest_ids }
 */
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
  };

  const dir = ensureMetricsDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

/**
 * Record a pack execution metric.
 *
 * @param {string} cwd - project root
 * @param {string} packId - pack identifier
 * @param {string} packVersion - pack version
 * @param {Array} targets - array of execution targets
 * @param {Array} results - array of result envelopes per target
 */
function recordPackExecution(cwd, packId, packVersion, targets, results) {
  const ts = nowUtc();
  const stamp = dateStamp();
  const id = `PE-${stamp}-${hash5(packId + ts)}`;

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
    total_events: perTarget.reduce((sum, t) => sum + t.events, 0),
    total_duration_ms: perTarget.reduce((sum, t) => sum + t.duration_ms, 0),
    per_target: perTarget,
  };

  const dir = ensureMetricsDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

/**
 * Record a detection promotion outcome metric.
 *
 * @param {string} cwd - project root
 * @param {object} candidate - detection candidate object
 * @param {object} promotionReceipt - promotion or rejection receipt
 */
function recordPromotionOutcome(cwd, candidate, promotionReceipt) {
  const ts = nowUtc();
  const stamp = dateStamp();
  const candId = (candidate && candidate.candidate_id) || 'unknown';
  const id = `PO-${stamp}-${hash5(candId + ts)}`;

  // Determine status from receipt shape
  const isPromotion = !!(promotionReceipt && promotionReceipt.promotion_id);
  const isRejection = !!(promotionReceipt && promotionReceipt.rejection_id);

  // Extract hypothesis IDs from evidence links if available
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
    finding_id: (candidate && candidate.finding_id) || null,
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

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

/**
 * Classify a hunt execution record by outcome quality.
 *
 * @param {object} record - a hunt execution metric record
 * @returns {string} classification: high_yield|productive|noisy|inconclusive|failed|low_yield
 */
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

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Read and filter metric records from METRICS/.
 *
 * @param {string} cwd - project root
 * @param {object} [options] - { type, connector_id, pack_id, hypothesis_id, limit }
 * @returns {Array} filtered metric records sorted by timestamp descending
 */
function listMetrics(cwd, options = {}) {
  const dir = metricsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  // Map filter type to file prefix
  const prefixMap = { hunt: 'HE-', pack: 'PE-', promotion: 'PO-' };
  const prefix = options.type ? prefixMap[options.type] : null;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .filter(f => !prefix || f.startsWith(prefix));

  let records = [];
  for (const file of files) {
    const record = safeReadJson(path.join(dir, file));
    if (!record) continue;

    // Apply field filters
    if (options.connector_id && record.connector_id !== options.connector_id) continue;
    if (options.pack_id && record.pack_id !== options.pack_id) continue;
    if (options.hypothesis_id) {
      const ids = record.hypothesis_ids || [];
      if (!ids.includes(options.hypothesis_id)) continue;
    }

    records.push(record);
  }

  // Sort by timestamp descending
  records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  // Apply limit
  if (options.limit && options.limit > 0) {
    records = records.slice(0, options.limit);
  }

  return records;
}

/**
 * Aggregate metrics into a summary.
 *
 * @param {string} cwd - project root
 * @param {object} [options] - filter options passed to listMetrics
 * @returns {object} aggregated summary
 */
function summarizeMetrics(cwd, options = {}) {
  const all = listMetrics(cwd, options);

  const huntRecords = all.filter(r => r.record_type === 'hunt_execution');
  const packRecords = all.filter(r => r.record_type === 'pack_execution');
  const promoRecords = all.filter(r => r.record_type === 'promotion_outcome');

  // By connector
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

  // By pack
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

  // By hypothesis
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

  // By outcome
  const byOutcome = { ok: 0, partial: 0, error: 0, empty: 0 };
  for (const r of huntRecords) {
    const o = r.outcome || 'unknown';
    if (o in byOutcome) byOutcome[o]++;
  }

  // Yield summary
  const yieldSummary = {
    high_yield: huntRecords.filter(r =>
      (r.evidence_yield && r.evidence_yield.events) > 100
    ).length,
    noisy: huntRecords.filter(r =>
      r.evidence_yield &&
      r.evidence_yield.warnings > r.evidence_yield.errors
    ).length,
    inconclusive: huntRecords.filter(r =>
      r.outcome === 'empty' ||
      (r.outcome === 'partial' && r.evidence_yield && r.evidence_yield.events === 0)
    ).length,
  };

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

/**
 * CLI handler: metrics summary
 */
function cmdMetricsSummary(cwd, raw) {
  const summary = summarizeMetrics(cwd);

  const lines = [];
  lines.push('# Hunt Metrics Summary\n');
  lines.push(`Total executions: ${summary.total_executions}`);
  lines.push(`Total pack runs:  ${summary.total_pack_runs}`);
  lines.push(`Promotions:       ${summary.total_promotions.promoted} promoted, ${summary.total_promotions.rejected} rejected`);
  lines.push('');

  // Outcome breakdown
  lines.push('## Outcomes');
  lines.push(`  ok: ${summary.by_outcome.ok}  partial: ${summary.by_outcome.partial}  error: ${summary.by_outcome.error}  empty: ${summary.by_outcome.empty}`);
  lines.push('');

  // Yield
  lines.push('## Yield');
  lines.push(`  High-yield (>100 events): ${summary.yield_summary.high_yield}`);
  lines.push(`  Noisy (warnings > errors): ${summary.yield_summary.noisy}`);
  lines.push(`  Inconclusive: ${summary.yield_summary.inconclusive}`);
  lines.push('');

  // By connector
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

  // By pack
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

  // By hypothesis
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

  output(summary, raw, lines.join('\n'));
}

/**
 * CLI handler: metrics list
 *
 * @param {string} cwd - project root
 * @param {Array} filterArgs - CLI args: --type, --connector, --pack, --hypothesis, --limit
 * @param {boolean} raw - output mode
 */
function cmdMetricsList(cwd, filterArgs, raw) {
  const args = filterArgs || [];
  const options = {};

  // Parse filter flags
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

  output(records, raw, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  recordHuntExecution,
  recordPackExecution,
  recordPromotionOutcome,
  classifyOutcome,
  listMetrics,
  summarizeMetrics,
  cmdMetricsSummary,
  cmdMetricsList,
};
