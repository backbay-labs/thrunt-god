/**
 * Scoring — Outcome scoring model and analyst feedback capture.
 *
 * Computes quality scores for packs, hypotheses, and connectors using
 * objective telemetry data (Phase 20) plus explicit analyst feedback.
 * Scores are computed on-the-fly, not pre-materialized.
 *
 * Storage: Feedback records in `.planning/FEEDBACK/` (JSON, atomic writes).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { planningDir, output, error } = require('./core.cjs');
const { sortKeysDeep, canonicalSerialize } = require('./manifest.cjs');
const { listMetrics, nowUtc, hash5, dateStamp, atomicWrite, safeReadJson } = require('./telemetry.cjs');

function feedbackDir(cwd) {
  return path.join(planningDir(cwd), 'FEEDBACK');
}

function ensureFeedbackDir(cwd) {
  const dir = feedbackDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const VALID_FEEDBACK_TYPES = ['false_positive', 'low_yield', 'high_quality', 'correction', 'note'];

function submitFeedback(cwd, feedbackInput) {
  const ts = nowUtc();
  const id = `FB-${dateStamp()}-${hash5((feedbackInput.entity_id || '') + ts)}`;

  const entityType = feedbackInput.entity_type;
  if (!['pack', 'hypothesis', 'connector'].includes(entityType)) {
    throw new Error(`Invalid entity_type: ${entityType}. Must be pack, hypothesis, or connector.`);
  }

  const feedbackType = feedbackInput.feedback_type;
  if (!VALID_FEEDBACK_TYPES.includes(feedbackType)) {
    throw new Error(`Invalid feedback_type: ${feedbackType}. Must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}`);
  }

  let adjustment = feedbackInput.score_adjustment || 0;
  if (typeof adjustment === 'string') adjustment = parseFloat(adjustment);
  adjustment = Math.max(-0.5, Math.min(0.5, adjustment || 0));

  const record = {
    feedback_id: id,
    record_type: 'analyst_feedback',
    timestamp: ts,
    entity_type: entityType,
    entity_id: feedbackInput.entity_id || null,
    feedback_type: feedbackType,
    annotation: feedbackInput.annotation || null,
    score_adjustment: adjustment,
    analyst: feedbackInput.analyst || 'unknown',
  };

  const dir = ensureFeedbackDir(cwd);
  atomicWrite(path.join(dir, `${id}.json`), canonicalSerialize(record));
  return record;
}

function listFeedback(cwd, options = {}) {
  const dir = feedbackDir(cwd);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'));

  let records = [];
  for (const file of files) {
    const record = safeReadJson(path.join(dir, file));
    if (!record) continue;

    if (options.entity_type && record.entity_type !== options.entity_type) continue;
    if (options.entity_id && record.entity_id !== options.entity_id) continue;
    if (options.feedback_type && record.feedback_type !== options.feedback_type) continue;

    records.push(record);
  }

  records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  if (options.limit && options.limit > 0) {
    records = records.slice(0, options.limit);
  }

  return records;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const YIELD_BASELINES = { connector: 50, pack: 20, hypothesis: 30 };

function isSuccessfulPackExecution(record) {
  const targetCount = Math.max(
    0,
    Math.trunc(
      record.target_count ||
      (Array.isArray(record.per_target) ? record.per_target.length : 0)
    )
  );
  if (targetCount === 0) return false;

  const successfulTargets = Number.isFinite(record.successful_targets)
    ? Math.max(0, Math.trunc(record.successful_targets))
    : Array.isArray(record.per_target)
      ? record.per_target.filter(target => target.status === 'ok').length
      : 0;

  return successfulTargets === targetCount;
}

function computePackExecutionStats(huntMetrics, packMetrics) {
  const hunts = huntMetrics.map((record, index) => ({
    index,
    record,
    hunt_execution_id: record.hunt_execution_id || null,
    timestamp_ms: Date.parse(record.timestamp || ''),
  }));
  const packs = packMetrics.map(record => ({
    record,
    timestamp_ms: Date.parse(record.timestamp || ''),
  }));
  const matchedHuntIndexes = new Set();
  const huntIndexById = new Map();

  for (const hunt of hunts) {
    if (hunt.hunt_execution_id) {
      huntIndexById.set(hunt.hunt_execution_id, hunt.index);
    }
  }

  hunts.sort((a, b) => {
    if (Number.isFinite(a.timestamp_ms) && Number.isFinite(b.timestamp_ms)) {
      return a.timestamp_ms - b.timestamp_ms;
    }
    if (Number.isFinite(a.timestamp_ms)) return -1;
    if (Number.isFinite(b.timestamp_ms)) return 1;
    return a.index - b.index;
  });
  packs.sort((a, b) => {
    if (Number.isFinite(a.timestamp_ms) && Number.isFinite(b.timestamp_ms)) {
      return a.timestamp_ms - b.timestamp_ms;
    }
    if (Number.isFinite(a.timestamp_ms)) return -1;
    if (Number.isFinite(b.timestamp_ms)) return 1;
    return 0;
  });

  let totalEvents = 0;
  let okCount = 0;
  let executionCount = 0;

  for (const pack of packs) {
    executionCount++;
    totalEvents += pack.record.total_events || 0;
    if (isSuccessfulPackExecution(pack.record)) okCount++;

    const targetCount = Math.max(0, Math.trunc(pack.record.target_count || 0));
    const explicitHuntIds = Array.isArray(pack.record.hunt_execution_ids)
      ? pack.record.hunt_execution_ids.filter(Boolean)
      : [];

    let matched = 0;
    for (const huntExecutionId of explicitHuntIds) {
      const huntIndex = huntIndexById.get(huntExecutionId);
      if (huntIndex === undefined || matchedHuntIndexes.has(huntIndex)) continue;
      matchedHuntIndexes.add(huntIndex);
      matched++;
    }

    if (!Number.isFinite(pack.timestamp_ms) || targetCount === 0 || matched >= targetCount) continue;

    for (let i = hunts.length - 1; i >= 0 && matched < targetCount; i--) {
      const hunt = hunts[i];
      if (matchedHuntIndexes.has(hunt.index)) continue;
      if (!Number.isFinite(hunt.timestamp_ms)) continue;
      if (hunt.timestamp_ms <= pack.timestamp_ms) {
        matchedHuntIndexes.add(hunt.index);
        matched++;
      }
    }
  }

  for (const hunt of hunts) {
    if (matchedHuntIndexes.has(hunt.index)) continue;
    executionCount++;
    totalEvents += (hunt.record.evidence_yield && hunt.record.evidence_yield.events) || 0;
    if (hunt.record.outcome === 'ok') okCount++;
  }

  return { totalEvents, okCount, executionCount };
}

function scoreEntity(cwd, entityType, entityId) {
  const filterKey = entityType === 'connector' ? 'connector_id'
    : entityType === 'pack' ? 'pack_id'
    : 'hypothesis_id';

  const huntMetrics = listMetrics(cwd, { type: 'hunt', [filterKey]: entityId });
  const packMetrics = entityType === 'pack' ? listMetrics(cwd, { type: 'pack', pack_id: entityId }) : [];
  const feedback = listFeedback(cwd, { entity_type: entityType, entity_id: entityId });

  const baseline = YIELD_BASELINES[entityType] || 30;
  let totalEvents = 0;
  let okCount = 0;
  let executionCount = 0;

  if (entityType === 'pack') {
    ({ totalEvents, okCount, executionCount } = computePackExecutionStats(huntMetrics, packMetrics));
  } else {
    executionCount = huntMetrics.length;
    for (const r of huntMetrics) {
      totalEvents += (r.evidence_yield && r.evidence_yield.events) || 0;
      if (r.outcome === 'ok') okCount++;
    }
  }

  const avgEvents = executionCount > 0 ? totalEvents / executionCount : 0;
  const yieldScore = Math.min(1.0, avgEvents / baseline);
  const successRate = executionCount > 0 ? okCount / executionCount : 0;

  const falsePositives = feedback.filter(f => f.feedback_type === 'false_positive').length;
  const lowYieldCount = feedback.filter(f => f.feedback_type === 'low_yield').length;
  const highQualityCount = feedback.filter(f => f.feedback_type === 'high_quality').length;
  const noisePenalty = (falsePositives * 0.1) + (lowYieldCount * 0.05);

  let analystAdjustment = highQualityCount * 0.05;
  for (const f of feedback) {
    if (f.feedback_type === 'correction' && f.score_adjustment) {
      analystAdjustment += f.score_adjustment;
    }
  }
  analystAdjustment = Math.max(-0.5, Math.min(0.5, analystAdjustment));

  const rawScore = executionCount > 0
    ? (yieldScore + successRate) / 2
    : 0;
  const compositeScore = Math.max(0.0, Math.min(1.0, rawScore + analystAdjustment - noisePenalty));

  return {
    entity_type: entityType,
    entity_id: entityId,
    composite_score: +compositeScore.toFixed(4),
    yield_score: +yieldScore.toFixed(4),
    success_rate: +successRate.toFixed(4),
    noise_penalty: +noisePenalty.toFixed(4),
    analyst_adjustment: +analystAdjustment.toFixed(4),
    execution_count: executionCount,
    feedback_count: feedback.length,
    false_positive_count: falsePositives,
    low_yield_count: lowYieldCount,
    high_quality_count: highQualityCount,
    last_scored: nowUtc(),
  };
}

function computeEntityScores(cwd, entityType) {
  const allMetrics = listMetrics(cwd, {});
  const ids = new Set();

  if (entityType === 'connector') {
    for (const r of allMetrics) {
      if (r.record_type === 'hunt_execution' && r.connector_id) {
        ids.add(r.connector_id);
      }
    }
  } else if (entityType === 'pack') {
    for (const r of allMetrics) {
      if (r.record_type === 'pack_execution' && r.pack_id) {
        ids.add(r.pack_id);
      }
      if (r.record_type === 'hunt_execution' && r.pack_id) {
        ids.add(r.pack_id);
      }
    }
  } else if (entityType === 'hypothesis') {
    for (const r of allMetrics) {
      if (r.record_type === 'hunt_execution' && r.hypothesis_ids) {
        for (const hid of r.hypothesis_ids) ids.add(hid);
      }
    }
  }

  // Include entities with feedback but no metrics
  const allFeedback = listFeedback(cwd, { entity_type: entityType });
  for (const f of allFeedback) {
    if (f.entity_id) ids.add(f.entity_id);
  }

  const scores = [];
  for (const id of ids) {
    scores.push(scoreEntity(cwd, entityType, id));
  }

  scores.sort((a, b) => b.composite_score - a.composite_score);
  return scores;
}

// ---------------------------------------------------------------------------
// CLI handlers
// ---------------------------------------------------------------------------

function cmdScoreSummary(cwd, raw) {
  const connectorScores = computeEntityScores(cwd, 'connector');
  const packScores = computeEntityScores(cwd, 'pack');
  const hypothesisScores = computeEntityScores(cwd, 'hypothesis');

  const result = {
    connectors: connectorScores,
    packs: packScores,
    hypotheses: hypothesisScores,
  };

  const lines = [];
  lines.push('# Outcome Score Summary\n');

  const renderTable = (title, scores) => {
    if (scores.length === 0) {
      lines.push(`## ${title}\nNo data yet.\n`);
      return;
    }
    lines.push(`## ${title}`);
    lines.push('| Entity | Score | Yield | Success | Noise | Adj | Execs | Feedback |');
    lines.push('|--------|-------|-------|---------|-------|-----|-------|----------|');
    for (const s of scores) {
      lines.push(`| ${s.entity_id} | ${s.composite_score} | ${s.yield_score} | ${s.success_rate} | -${s.noise_penalty} | ${s.analyst_adjustment >= 0 ? '+' : ''}${s.analyst_adjustment} | ${s.execution_count} | ${s.feedback_count} |`);
    }
    lines.push('');
  };

  renderTable('Connectors', connectorScores);
  renderTable('Packs', packScores);
  renderTable('Hypotheses', hypothesisScores);

  if (connectorScores.length === 0 && packScores.length === 0 && hypothesisScores.length === 0) {
    lines.push('No metrics or feedback recorded yet. Run hunts to generate scoring data.');
  }

  if (raw) {
    output(result, raw);
    return;
  }

  output(result, true, lines.join('\n'));
}

function cmdScoreEntity(cwd, entityType, entityId, raw) {
  if (!entityType || !entityId) {
    error('Usage: score entity <type> <id>  (type: connector|pack|hypothesis)');
  }
  if (!['pack', 'hypothesis', 'connector'].includes(entityType)) {
    error(`Invalid entity type: ${entityType}. Must be connector, pack, or hypothesis.`);
  }

  const score = scoreEntity(cwd, entityType, entityId);

  const lines = [];
  lines.push(`# Score: ${entityType} "${entityId}"\n`);
  lines.push(`Composite Score: ${score.composite_score}`);
  lines.push(`  Yield Score:      ${score.yield_score}`);
  lines.push(`  Success Rate:     ${score.success_rate}`);
  lines.push(`  Noise Penalty:    -${score.noise_penalty} (${score.false_positive_count} false positives)`);
  lines.push(`  Analyst Adjust:   ${score.analyst_adjustment >= 0 ? '+' : ''}${score.analyst_adjustment}`);
  lines.push(`  Executions:       ${score.execution_count}`);
  lines.push(`  Feedback Records: ${score.feedback_count}`);

  if (raw) {
    output(score, raw);
    return;
  }

  output(score, true, lines.join('\n'));
}

function cmdFeedbackSubmit(cwd, feedbackArgs, raw) {
  const args = feedbackArgs || [];
  const input = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--entity-type' && args[i + 1]) input.entity_type = args[++i];
    else if (args[i] === '--entity-id' && args[i + 1]) input.entity_id = args[++i];
    else if (args[i] === '--type' && args[i + 1]) input.feedback_type = args[++i];
    else if (args[i] === '--annotation' && args[i + 1]) input.annotation = args[++i];
    else if (args[i] === '--adjustment' && args[i + 1]) input.score_adjustment = parseFloat(args[++i]);
    else if (args[i] === '--analyst' && args[i + 1]) input.analyst = args[++i];
  }

  if (!input.entity_type || !input.entity_id || !input.feedback_type) {
    error('Required: --entity-type, --entity-id, --type. Types: false_positive, low_yield, high_quality, correction, note');
  }

  try {
    const record = submitFeedback(cwd, input);
    if (raw) {
      output(record, raw);
      return;
    }

    output(record, true, `Feedback recorded: ${record.feedback_id} (${record.feedback_type} for ${record.entity_type}:${record.entity_id})`);
  } catch (e) {
    error(e.message);
  }
}

function cmdFeedbackList(cwd, filterArgs, raw) {
  const args = filterArgs || [];
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--entity-type' && args[i + 1]) options.entity_type = args[++i];
    else if (args[i] === '--entity-id' && args[i + 1]) options.entity_id = args[++i];
    else if (args[i] === '--type' && args[i + 1]) options.feedback_type = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i], 10);
  }

  const records = listFeedback(cwd, options);

  const lines = [];
  if (records.length === 0) {
    lines.push('No feedback records found.');
  } else {
    lines.push(`Found ${records.length} feedback record(s):\n`);
    for (const r of records) {
      const adj = r.score_adjustment ? ` adj=${r.score_adjustment}` : '';
      const note = r.annotation ? ` "${r.annotation}"` : '';
      lines.push(`  ${r.feedback_id}  ${r.timestamp}  ${r.entity_type}:${r.entity_id}  type=${r.feedback_type}${adj}${note}  by=${r.analyst}`);
    }
  }

  if (raw) {
    output(records, raw);
    return;
  }

  output(records, true, lines.join('\n'));
}

module.exports = {
  scoreEntity,
  submitFeedback,
  listFeedback,
  computeEntityScores,
  cmdScoreSummary,
  cmdScoreEntity,
  cmdFeedbackSubmit,
  cmdFeedbackList,
};
