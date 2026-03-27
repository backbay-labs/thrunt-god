/**
 * Scoring — Outcome scoring model and analyst feedback capture.
 *
 * Computes quality scores for packs, hypotheses, and connectors using
 * objective telemetry data (Phase 20) plus explicit analyst feedback.
 * Scores are computed on-the-fly, not pre-materialized.
 *
 * Storage: Feedback records in `.planning/FEEDBACK/` (JSON, atomic writes).
 *
 * Provides:
 * - scoreEntity(cwd, entityType, entityId) — composite score for one entity
 * - submitFeedback(cwd, feedbackInput) — record analyst feedback
 * - listFeedback(cwd, options) — read/filter feedback records
 * - computeEntityScores(cwd, entityType) — score all entities of a type
 * - cmdScoreSummary(cwd, raw) — CLI: score summary
 * - cmdScoreEntity(cwd, entityType, entityId, raw) — CLI: score entity
 * - cmdFeedbackSubmit(cwd, feedbackArgs, raw) — CLI: feedback submit
 * - cmdFeedbackList(cwd, filterArgs, raw) — CLI: feedback list
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { planningDir, output, error } = require('./core.cjs');
const { listMetrics } = require('./telemetry.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowUtc() {
  return new Date().toISOString();
}

function feedbackDir(cwd) {
  return path.join(planningDir(cwd), 'FEEDBACK');
}

function ensureFeedbackDir(cwd) {
  const dir = feedbackDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hash5(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 5);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function canonicalSerialize(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2);
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

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const VALID_FEEDBACK_TYPES = ['false_positive', 'low_yield', 'high_quality', 'correction', 'note'];

/**
 * Record analyst feedback for an entity.
 *
 * @param {string} cwd - project root
 * @param {object} feedbackInput - { entity_type, entity_id, feedback_type, annotation, score_adjustment, analyst }
 * @returns {object} the written feedback record
 */
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

/**
 * Read and filter feedback records.
 *
 * @param {string} cwd - project root
 * @param {object} [options] - { entity_type, entity_id, feedback_type, limit }
 * @returns {Array} filtered feedback records sorted by timestamp descending
 */
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

/** Yield baseline by entity type. */
const YIELD_BASELINES = { connector: 50, pack: 20, hypothesis: 30 };

/**
 * Compute a composite score for a single entity.
 *
 * @param {string} cwd - project root
 * @param {string} entityType - 'pack' | 'hypothesis' | 'connector'
 * @param {string} entityId - the entity identifier
 * @returns {object} score breakdown
 */
function scoreEntity(cwd, entityType, entityId) {
  // Get relevant metrics
  const filterKey = entityType === 'connector' ? 'connector_id'
    : entityType === 'pack' ? 'pack_id'
    : 'hypothesis_id';

  const huntMetrics = listMetrics(cwd, { type: 'hunt', [filterKey]: entityId });
  const packMetrics = entityType === 'pack' ? listMetrics(cwd, { type: 'pack', pack_id: entityId }) : [];

  // Get feedback for this entity
  const feedback = listFeedback(cwd, { entity_type: entityType, entity_id: entityId });

  // Compute yield score
  const baseline = YIELD_BASELINES[entityType] || 30;
  let totalEvents = 0;
  let okCount = 0;
  const executionCount = huntMetrics.length + packMetrics.length;

  for (const r of huntMetrics) {
    totalEvents += (r.evidence_yield && r.evidence_yield.events) || 0;
    if (r.outcome === 'ok') okCount++;
  }
  for (const r of packMetrics) {
    totalEvents += r.total_events || 0;
    if (r.failed_targets === 0) okCount++;
  }

  const avgEvents = executionCount > 0 ? totalEvents / executionCount : 0;
  const yieldScore = Math.min(1.0, avgEvents / baseline);
  const successRate = executionCount > 0 ? okCount / executionCount : 0;

  // Feedback adjustments
  const falsePositives = feedback.filter(f => f.feedback_type === 'false_positive').length;
  const noisePenalty = falsePositives * 0.1;

  let analystAdjustment = 0;
  for (const f of feedback) {
    if (f.feedback_type === 'correction' && f.score_adjustment) {
      analystAdjustment += f.score_adjustment;
    }
  }
  analystAdjustment = Math.max(-0.5, Math.min(0.5, analystAdjustment));

  // Composite
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
    last_scored: nowUtc(),
  };
}

/**
 * Score all entities of a given type.
 *
 * @param {string} cwd - project root
 * @param {string} entityType - 'pack' | 'hypothesis' | 'connector'
 * @returns {Array} score objects sorted by composite_score descending
 */
function computeEntityScores(cwd, entityType) {
  const allMetrics = listMetrics(cwd, {});

  // Collect unique entity IDs
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

  // Also include entities with feedback but no metrics
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

/**
 * CLI: score summary — display scores for all entity types.
 */
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

  output(result, raw, lines.join('\n'));
}

/**
 * CLI: score entity — detailed score for one entity.
 */
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

  output(score, raw, lines.join('\n'));
}

/**
 * CLI: feedback submit — record analyst feedback.
 */
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
    output(record, raw, `Feedback recorded: ${record.feedback_id} (${record.feedback_type} for ${record.entity_type}:${record.entity_id})`);
  } catch (e) {
    error(e.message);
  }
}

/**
 * CLI: feedback list — list feedback records.
 */
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

  output(records, raw, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
