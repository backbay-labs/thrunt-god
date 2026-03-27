/**
 * Recommend — Recommendation engine and adaptive planning hints.
 *
 * Uses scoring (Phase 21) and telemetry (Phase 20) outputs to recommend
 * which packs, connectors, and hypotheses to prioritize. Each recommendation
 * includes a reasoning array so operators can audit and override rankings.
 *
 * Provides:
 * - recommendPacks(cwd, options) — ranked pack recommendations with reasoning
 * - recommendConnectors(cwd, options) — ranked connector recommendations
 * - recommendHypotheses(cwd, options) — ranked hypothesis recommendations
 * - generatePlanningHints(cwd, options) — aggregate planning hints
 * - cmdRecommend(cwd, entityType, filterArgs, raw) — CLI: recommend
 * - cmdPlanningHints(cwd, raw) — CLI: planning-hints
 */

'use strict';

const { output, error } = require('./core.cjs');
const { computeEntityScores } = require('./scoring.cjs');
const { summarizeMetrics } = require('./telemetry.cjs');

// ---------------------------------------------------------------------------
// Recommendation builders
// ---------------------------------------------------------------------------

/**
 * Build reasoning array for a scored entity.
 * @param {object} score - entity score object from scoring.cjs
 * @param {object} [extra] - additional context { by_connector, by_pack, by_hypothesis }
 * @returns {string[]} reasoning lines
 */
function buildBaseReasoning(score) {
  const reasons = [];

  reasons.push(`Score ${score.composite_score}: yield=${score.yield_score}, success=${score.success_rate}`);

  if (score.noise_penalty > 0) {
    reasons.push(`Penalized by ${score.false_positive_count} false positive report(s)`);
  }
  if (score.analyst_adjustment !== 0) {
    const sign = score.analyst_adjustment >= 0 ? '+' : '';
    reasons.push(`Analyst adjusted by ${sign}${score.analyst_adjustment}`);
  }
  if (score.yield_score >= 0.8) {
    reasons.push('High yield in prior runs (>100 events avg)');
  }
  if (score.yield_score < 0.3 && score.execution_count > 2) {
    reasons.push('Low yield — consider alternatives');
  }
  if (score.execution_count === 0) {
    reasons.push('No execution data yet — untested');
  }

  return reasons;
}

/**
 * Apply filters (limit, min_score) and format results.
 */
function applyFilters(scores, options) {
  let filtered = scores;
  const filtersApplied = [];

  if (options.min_score !== undefined && options.min_score !== null) {
    const min = parseFloat(options.min_score);
    filtered = filtered.filter(s => s.composite_score >= min);
    filtersApplied.push(`min_score >= ${min}`);
  }

  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
    filtersApplied.push(`limit ${options.limit}`);
  }

  return { filtered, filtersApplied };
}

// ---------------------------------------------------------------------------
// Recommendation functions
// ---------------------------------------------------------------------------

/**
 * Recommend packs ranked by composite score with reasoning.
 */
function recommendPacks(cwd, options = {}) {
  const scores = computeEntityScores(cwd, 'pack');
  const summary = summarizeMetrics(cwd);

  const recommendations = scores.map((score, i) => {
    const reasoning = buildBaseReasoning(score);

    // Pack-specific reasoning from summary
    const packData = summary.by_pack[score.entity_id];
    if (packData) {
      if (packData.runs > 5) {
        reasoning.push(`Well-tested: ${packData.runs} runs`);
      }
    }

    return {
      entity_id: score.entity_id,
      entity_type: 'pack',
      composite_score: score.composite_score,
      rank: i + 1,
      reasoning,
      execution_count: score.execution_count,
    };
  });

  const { filtered, filtersApplied } = applyFilters(recommendations, options);

  return {
    recommendations: filtered,
    total: scores.length,
    filters_applied: filtersApplied,
  };
}

/**
 * Recommend connectors ranked by composite score with reasoning.
 */
function recommendConnectors(cwd, options = {}) {
  const scores = computeEntityScores(cwd, 'connector');
  const summary = summarizeMetrics(cwd);

  // Find fastest connector for comparison
  const connectorData = summary.by_connector;
  let fastestId = null;
  let fastestDuration = Infinity;
  for (const [cid, data] of Object.entries(connectorData)) {
    if (data.avg_duration_ms < fastestDuration && data.executions > 0) {
      fastestDuration = data.avg_duration_ms;
      fastestId = cid;
    }
  }

  const recommendations = scores.map((score, i) => {
    const reasoning = buildBaseReasoning(score);

    // Connector-specific reasoning
    const data = connectorData[score.entity_id];
    if (data) {
      if (score.entity_id === fastestId) {
        reasoning.push(`Fastest avg response: ${data.avg_duration_ms}ms`);
      }
      if (score.success_rate < 0.5 && score.execution_count > 3) {
        reasoning.push('High error rate — check configuration');
      }
    }

    return {
      entity_id: score.entity_id,
      entity_type: 'connector',
      composite_score: score.composite_score,
      rank: i + 1,
      reasoning,
      execution_count: score.execution_count,
    };
  });

  const { filtered, filtersApplied } = applyFilters(recommendations, options);

  return {
    recommendations: filtered,
    total: scores.length,
    filters_applied: filtersApplied,
  };
}

/**
 * Recommend hypotheses ranked by composite score with reasoning.
 */
function recommendHypotheses(cwd, options = {}) {
  const scores = computeEntityScores(cwd, 'hypothesis');
  const summary = summarizeMetrics(cwd);

  const recommendations = scores.map((score, i) => {
    const reasoning = buildBaseReasoning(score);

    // Hypothesis-specific reasoning
    const data = summary.by_hypothesis[score.entity_id];
    if (data) {
      if (data.connectors_used.length > 1) {
        reasoning.push(`Evidence from ${data.connectors_used.length} connectors`);
      }
      if (data.total_evidence === 0 && data.executions > 0) {
        reasoning.push('No evidence collected — needs investigation');
      }
    }

    return {
      entity_id: score.entity_id,
      entity_type: 'hypothesis',
      composite_score: score.composite_score,
      rank: i + 1,
      reasoning,
      execution_count: score.execution_count,
    };
  });

  const { filtered, filtersApplied } = applyFilters(recommendations, options);

  return {
    recommendations: filtered,
    total: scores.length,
    filters_applied: filtersApplied,
  };
}

// ---------------------------------------------------------------------------
// Planning hints
// ---------------------------------------------------------------------------

/**
 * Generate aggregate planning hints from scores and metrics.
 */
function generatePlanningHints(cwd, options = {}) {
  const packScores = computeEntityScores(cwd, 'pack');
  const connectorScores = computeEntityScores(cwd, 'connector');
  const hypothesisScores = computeEntityScores(cwd, 'hypothesis');

  const hints = [];
  let totalScored = 0;
  let totalScore = 0;
  let coverageGaps = 0;

  // Top-scoring packs
  for (const s of packScores) {
    totalScored++;
    totalScore += s.composite_score;
    if (s.execution_count === 0) { coverageGaps++; continue; }
    if (s.composite_score >= 0.7) {
      hints.push(`Prefer pack '${s.entity_id}' (score: ${s.composite_score}) — high yield and success rate`);
    }
    if (s.composite_score < 0.3 && s.execution_count > 2) {
      hints.push(`Avoid pack '${s.entity_id}' (score: ${s.composite_score}) — low yield in prior runs`);
    }
    if (s.false_positive_count > 0) {
      hints.push(`False positive rate elevated for pack '${s.entity_id}' — review analyst feedback`);
    }
  }

  // Low-scoring connectors
  for (const s of connectorScores) {
    totalScored++;
    totalScore += s.composite_score;
    if (s.execution_count === 0) { coverageGaps++; continue; }
    if (s.success_rate < 0.5 && s.execution_count > 3) {
      hints.push(`Avoid connector '${s.entity_id}' — high error rate (success: ${(s.success_rate * 100).toFixed(0)}%)`);
    }
    if (s.composite_score >= 0.8) {
      hints.push(`Connector '${s.entity_id}' is reliable (score: ${s.composite_score})`);
    }
  }

  // Hypothesis insights
  for (const s of hypothesisScores) {
    totalScored++;
    totalScore += s.composite_score;
    if (s.execution_count === 0) { coverageGaps++; continue; }
    if (s.composite_score >= 0.7) {
      hints.push(`Hypothesis '${s.entity_id}' has strong evidence support (score: ${s.composite_score})`);
    }
    if (s.composite_score < 0.2 && s.execution_count > 2) {
      hints.push(`Hypothesis '${s.entity_id}' underperforming — consider reformulation`);
    }
  }

  // Coverage gaps
  if (coverageGaps > 0) {
    hints.push(`Coverage gap: no execution data for ${coverageGaps} entities — untested packs/connectors need runs`);
  }

  // No data at all
  if (totalScored === 0) {
    hints.push('No scoring data available yet. Run hunts to generate recommendations.');
  }

  const avgScore = totalScored > 0 ? +(totalScore / totalScored).toFixed(4) : 0;

  return {
    hints,
    summary: {
      total_entities_scored: totalScored,
      avg_score: avgScore,
      coverage_gaps: coverageGaps,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI handlers
// ---------------------------------------------------------------------------

/**
 * CLI: recommend packs|connectors|hypotheses
 */
function cmdRecommend(cwd, entityType, filterArgs, raw) {
  const args = filterArgs || [];
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i], 10);
    else if (args[i] === '--min-score' && args[i + 1]) options.min_score = parseFloat(args[++i]);
  }

  let result;
  if (entityType === 'packs') {
    result = recommendPacks(cwd, options);
  } else if (entityType === 'connectors') {
    result = recommendConnectors(cwd, options);
  } else if (entityType === 'hypotheses') {
    result = recommendHypotheses(cwd, options);
  } else {
    error(`Unknown entity type: ${entityType}. Available: packs, connectors, hypotheses`);
    return;
  }

  const lines = [];
  const label = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  lines.push(`# ${label} Recommendations\n`);

  if (result.recommendations.length === 0) {
    lines.push(`No ${entityType} to recommend. Run hunts to generate data.`);
  } else {
    lines.push(`Showing ${result.recommendations.length} of ${result.total} ${entityType}:`);
    if (result.filters_applied.length) {
      lines.push(`Filters: ${result.filters_applied.join(', ')}`);
    }
    lines.push('');

    for (const rec of result.recommendations) {
      lines.push(`${rec.rank}. **${rec.entity_id}** — Score: ${rec.composite_score} (${rec.execution_count} executions)`);
      for (const reason of rec.reasoning) {
        lines.push(`   - ${reason}`);
      }
      lines.push('');
    }
  }

  output(result, raw, lines.join('\n'));
}

/**
 * CLI: planning-hints
 */
function cmdPlanningHints(cwd, raw) {
  const result = generatePlanningHints(cwd);

  const lines = [];
  lines.push('# Planning Hints\n');

  if (result.hints.length === 0) {
    lines.push('No hints to offer. Run hunts to generate recommendation data.');
  } else {
    for (let i = 0; i < result.hints.length; i++) {
      lines.push(`${i + 1}. ${result.hints[i]}`);
    }
  }

  lines.push('');
  lines.push(`Entities scored: ${result.summary.total_entities_scored}`);
  lines.push(`Average score: ${result.summary.avg_score}`);
  lines.push(`Coverage gaps: ${result.summary.coverage_gaps}`);

  output(result, raw, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  recommendPacks,
  recommendConnectors,
  recommendHypotheses,
  generatePlanningHints,
  cmdRecommend,
  cmdPlanningHints,
};
