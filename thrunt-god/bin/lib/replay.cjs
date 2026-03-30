/**
 * THRUNT Replay Engine - Core Module
 *
 * Provides ReplaySpec Zod schema, source resolution from query artifacts,
 * time window mutation engine, and mutation application framework.
 *
 * Dependency chain (no circular imports):
 *   replay.cjs -> runtime.cjs (createQuerySpec, normalizeTimeWindow, isPlainObject, cloneObject)
 *   replay.cjs -> core.cjs (planningPaths, output, error)
 *   replay.cjs -> manifest.cjs (computeContentHash)
 *   replay.cjs -> frontmatter.cjs (extractFrontmatter)
 */

'use strict';

const { z } = require('zod');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createQuerySpec, normalizeTimeWindow, isPlainObject, cloneObject } = require('./runtime.cjs');
const { planningPaths, output, error } = require('./core.cjs');
const { computeContentHash } = require('./manifest.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// ─── ID Generation ───────────────────────────────────────────────────────────

function makeReplayId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `RPL-${stamp}-${suffix}`;
}

// ─── ReplaySpec Zod Schema ───────────────────────────────────────────────────

const ReplaySpecSchema = z.object({
  version: z.literal('1.0'),
  replay_id: z.string().regex(/^RPL-\d{14}-[A-Z0-9]{8}$/),
  source: z.object({
    type: z.enum(['query', 'receipt', 'pack_execution', 'hunt_phase']),
    ids: z.array(z.string().min(1)).min(1),
  }),
  mutations: z.object({
    time_window: z.object({
      mode: z.enum(['absolute', 'shift', 'lookback']),
      start: z.string().optional(),
      end: z.string().optional(),
      shift_ms: z.number().optional(),
      lookback_minutes: z.number().positive().optional(),
    }).optional(),
    connector: z.object({
      id: z.string().optional(),
      profile: z.string().optional(),
      language: z.string().optional(),
    }).optional(),
    ioc_injection: z.object({
      mode: z.enum(['append', 'replace']),
      iocs: z.array(z.object({
        type: z.enum(['ip', 'hash', 'domain', 'user', 'hostname', 'url', 'email', 'filename']),
        value: z.string().min(1),
      })).min(1),
    }).optional(),
    parameters: z.record(z.unknown()).optional(),
    execution: z.object({
      dry_run: z.boolean().optional(),
      timeout_ms: z.number().positive().optional(),
      max_retries: z.number().int().min(0).optional(),
    }).optional(),
  }).optional().default({}),
  diff: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(['full', 'counts_only', 'entities_only']).default('full'),
    baseline_ids: z.array(z.string()).optional(),
  }).optional(),
  evidence: z.object({
    receipt_policy: z.string().optional(),
    tags: z.array(z.string()).optional(),
    lineage: z.object({
      original_query_ids: z.array(z.string()).optional(),
      original_receipt_ids: z.array(z.string()).optional(),
      replay_reason: z.string().optional(),
    }).optional(),
  }).optional(),
});

// ─── createReplaySpec ────────────────────────────────────────────────────────

function createReplaySpec(input) {
  const merged = {
    version: '1.0',
    replay_id: (input && input.replay_id) ? input.replay_id : makeReplayId(),
    ...input,
  };
  // Always enforce version
  merged.version = '1.0';
  return ReplaySpecSchema.parse(merged);
}

// ─── parseShiftDuration ──────────────────────────────────────────────────────

const SHIFT_MULTIPLIERS = {
  d: 86400000,
  h: 3600000,
  m: 60000,
};

function parseShiftDuration(str) {
  const match = String(str).match(/^(-?)(\d+)(d|h|m)$/i);
  if (!match) {
    throw new Error(`Invalid shift duration format: "${str}". Expected [-]N[d|h|m] (e.g. "7d", "-24h", "30m").`);
  }
  const sign = match[1] === '-' ? -1 : 1;
  const value = parseInt(match[2], 10);
  const unit = match[3].toLowerCase();
  return sign * value * SHIFT_MULTIPLIERS[unit];
}

// ─── applyMutations ──────────────────────────────────────────────────────────

function applyMutations(originalSpec, mutations, now = new Date()) {
  // Deep clone to avoid mutating the original
  const spec = cloneObject(originalSpec);

  if (!mutations || !isPlainObject(mutations)) {
    return spec;
  }

  // Time window mutations
  if (mutations.time_window && isPlainObject(mutations.time_window)) {
    const tw = mutations.time_window;
    switch (tw.mode) {
      case 'absolute': {
        if (tw.start) spec.time_window.start = tw.start;
        if (tw.end) spec.time_window.end = tw.end;
        break;
      }
      case 'shift': {
        const shiftMs = tw.shift_ms || 0;
        const origStart = Date.parse(spec.time_window.start);
        const origEnd = Date.parse(spec.time_window.end);
        spec.time_window.start = new Date(origStart + shiftMs).toISOString();
        spec.time_window.end = new Date(origEnd + shiftMs).toISOString();
        break;
      }
      case 'lookback': {
        const lookbackMs = (tw.lookback_minutes || 0) * 60000;
        const endTime = now instanceof Date ? now : new Date(now);
        spec.time_window.end = endTime.toISOString();
        spec.time_window.start = new Date(endTime.getTime() - lookbackMs).toISOString();
        break;
      }
    }
  }

  // Connector mutations
  if (mutations.connector && isPlainObject(mutations.connector)) {
    if (mutations.connector.id) spec.connector.id = mutations.connector.id;
    if (mutations.connector.profile) spec.connector.profile = mutations.connector.profile;
  }

  // Parameters mutations (merge)
  if (mutations.parameters && isPlainObject(mutations.parameters)) {
    spec.parameters = { ...spec.parameters, ...mutations.parameters };
  }

  // Execution mutations (merge)
  if (mutations.execution && isPlainObject(mutations.execution)) {
    if (mutations.execution.dry_run !== undefined) spec.execution.dry_run = mutations.execution.dry_run;
    if (mutations.execution.timeout_ms !== undefined) spec.execution.timeout_ms = mutations.execution.timeout_ms;
    if (mutations.execution.max_retries !== undefined) spec.execution.max_retries = mutations.execution.max_retries;
  }

  // Validate the mutated spec through createQuerySpec to ensure correctness
  // This will throw if start >= end or other constraints are violated
  return createQuerySpec(spec);
}

// ─── parseQueryLogDocument ───────────────────────────────────────────────────

function parseQueryLogDocument(content) {
  const frontmatter = extractFrontmatter(content);

  // Extract statement from ## Query Or Procedure section
  let statement = '';
  const stmtMatch = content.match(/## Query Or Procedure\s*\n+~~~text\n([\s\S]*?)\n~~~/);
  if (stmtMatch) {
    statement = stmtMatch[1].trim();
  }

  // Extract time window from ## Parameters section
  let timeWindow = { start: null, end: null };
  const twMatch = content.match(/\*\*Time window:\*\*\s*(\S+)\s*->\s*(\S+)/);
  if (twMatch) {
    timeWindow = { start: twMatch[1], end: twMatch[2] };
  }

  return { frontmatter, statement, time_window: timeWindow };
}

// ─── findManifestForQueryId ──────────────────────────────────────────────────

function findManifestForQueryId(manifestsDir, queryId, cache) {
  // Check cache first
  if (cache && cache.has(queryId)) {
    return cache.get(queryId);
  }

  let manifest = null;

  if (fs.existsSync(manifestsDir)) {
    try {
      const files = fs.readdirSync(manifestsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(manifestsDir, file), 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed.execution && parsed.execution.query_id === queryId) {
            manifest = parsed;
            break;
          }
        } catch {
          // Skip malformed manifest files
        }
      }
    } catch {
      // Directory read error -- skip
    }
  }

  if (cache) {
    cache.set(queryId, manifest);
  }
  return manifest;
}

// ─── resolveReplaySource ─────────────────────────────────────────────────────

function resolveReplaySource(cwd, source) {
  const paths = planningPaths(cwd);
  const queriesDir = paths.queries;
  const receiptsDir = paths.receipts;
  const manifestsDir = paths.manifests;
  const metricsDir = path.join(planningPaths(cwd).planning, 'METRICS');

  const results = [];
  const manifestCache = new Map();

  if (!source || !source.type || !Array.isArray(source.ids)) {
    return results;
  }

  switch (source.type) {
    case 'query': {
      for (const id of source.ids) {
        const entry = resolveQueryId(id, queriesDir, manifestsDir, manifestCache);
        results.push(entry);
      }
      break;
    }
    case 'receipt': {
      for (const id of source.ids) {
        const entry = resolveReceiptId(id, receiptsDir, queriesDir, manifestsDir, manifestCache);
        results.push(entry);
      }
      break;
    }
    case 'pack_execution': {
      for (const id of source.ids) {
        const entry = resolveMetricsId(id, metricsDir, queriesDir, manifestsDir, manifestCache);
        results.push(entry);
      }
      break;
    }
    case 'hunt_phase': {
      // Stub -- not yet implemented
      for (const id of source.ids) {
        results.push({
          original_spec: null,
          original_envelope: null,
          source_path: null,
          warnings: [`hunt_phase source resolution not yet implemented (id: ${id})`],
        });
      }
      break;
    }
  }

  return results;
}

// ─── Resolution Helpers ──────────────────────────────────────────────────────

function resolveQueryId(queryId, queriesDir, manifestsDir, cache) {
  const warnings = [];
  const queryFile = path.join(queriesDir, `${queryId}.md`);

  // Manifest-first: check for manifest referencing this query
  const manifest = findManifestForQueryId(manifestsDir, queryId, cache);
  if (manifest) {
    // Find the query log artifact in the manifest
    const queryArtifact = (manifest.artifacts || []).find(a => a.type === 'query_log');
    if (queryArtifact && queryArtifact.content_hash && fs.existsSync(queryFile)) {
      // Verify integrity
      const content = fs.readFileSync(queryFile, 'utf-8');
      const currentHash = computeContentHash(content);
      if (currentHash !== queryArtifact.content_hash) {
        warnings.push(`Query log modified since manifest creation (${queryId})`);
      }
    }
  }

  // Resolve from QUERIES/*.md
  if (!fs.existsSync(queryFile)) {
    return {
      original_spec: null,
      original_envelope: null,
      source_path: queryFile,
      warnings: [`Query log not found: ${queryFile}`],
    };
  }

  const content = fs.readFileSync(queryFile, 'utf-8');
  const parsed = parseQueryLogDocument(content);

  const originalSpec = {
    query_id: parsed.frontmatter.query_id || queryId,
    connector: {
      id: parsed.frontmatter.connector_id || null,
    },
    dataset: {
      kind: parsed.frontmatter.dataset || parsed.frontmatter.source || 'events',
    },
    time_window: parsed.time_window,
    query: {
      statement: parsed.statement,
    },
  };

  return {
    original_spec: originalSpec,
    original_envelope: null,
    source_path: queryFile,
    warnings,
  };
}

function resolveReceiptId(receiptId, receiptsDir, queriesDir, manifestsDir, cache) {
  const receiptFile = path.join(receiptsDir, `${receiptId}.md`);

  if (!fs.existsSync(receiptFile)) {
    return {
      original_spec: null,
      original_envelope: null,
      source_path: receiptFile,
      warnings: [`Receipt not found: ${receiptFile}`],
    };
  }

  const content = fs.readFileSync(receiptFile, 'utf-8');
  const fm = extractFrontmatter(content);
  const warnings = [];

  // Cross-reference to queries
  const relatedQueries = Array.isArray(fm.related_queries) ? fm.related_queries : [];
  if (relatedQueries.length === 0) {
    return {
      original_spec: {
        query_id: null,
        connector: { id: fm.connector_id || null },
        dataset: { kind: fm.dataset || 'events' },
        time_window: { start: null, end: null },
        query: { statement: '' },
        receipt: {
          receipt_id: fm.receipt_id || receiptId,
          result_status: fm.result_status || null,
        },
      },
      original_envelope: null,
      source_path: receiptFile,
      warnings: ['No related_queries found in receipt frontmatter'],
    };
  }

  // Resolve the first related query
  const queryResult = resolveQueryId(relatedQueries[0], queriesDir, manifestsDir, cache);
  if (queryResult.original_spec) {
    queryResult.original_spec.receipt = {
      receipt_id: fm.receipt_id || receiptId,
      result_status: fm.result_status || null,
    };
  }
  queryResult.warnings.push(...warnings);
  queryResult.source_path = receiptFile;

  return queryResult;
}

function resolveMetricsId(metricsId, metricsDir, queriesDir, manifestsDir, cache) {
  const metricsFile = path.join(metricsDir, `${metricsId}.json`);

  if (!fs.existsSync(metricsFile)) {
    return {
      original_spec: null,
      original_envelope: null,
      source_path: metricsFile,
      warnings: [`Metrics record not found: ${metricsFile}`],
    };
  }

  try {
    const content = fs.readFileSync(metricsFile, 'utf-8');
    const record = JSON.parse(content);
    const queryId = record.query_id;

    if (!queryId) {
      return {
        original_spec: null,
        original_envelope: null,
        source_path: metricsFile,
        warnings: [`No query_id found in metrics record: ${metricsId}`],
      };
    }

    // Cross-reference to queries
    const queryResult = resolveQueryId(queryId, queriesDir, manifestsDir, cache);
    queryResult.source_path = metricsFile;
    return queryResult;
  } catch (err) {
    return {
      original_spec: null,
      original_envelope: null,
      source_path: metricsFile,
      warnings: [`Failed to parse metrics record ${metricsId}: ${err.message}`],
    };
  }
}

// ─── Per-Language Time Rewriters ─────────────────────────────────────────────

/**
 * SPL rewriter: replaces earliest=/latest= patterns with absolute ISO timestamps.
 * Handles relative times (-24h, -7d, now) and quoted ISO timestamps.
 */
function rewriteSplTime(statement, originalTW, newTW, options) {
  const modifications = [];
  const warnings = [];
  let rewritten = statement;

  rewritten = rewritten.replace(
    /(earliest)\s*=\s*(?:"([^"]+)"|(\S+))/gi,
    (match, key) => {
      const replaced = `${key}="${newTW.start}"`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  rewritten = rewritten.replace(
    /(latest)\s*=\s*(?:"([^"]+)"|(\S+))/gi,
    (match, key) => {
      const replaced = `${key}="${newTW.end}"`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  if (modifications.length === 0) {
    warnings.push({ code: 'STATEMENT_TIME_UNCHANGED', message: 'No inline time references found in SPL statement' });
  }

  if (/\|\s*eval\b[\s\S]*?\b(relative_time|now\(\)|strftime)\b/i.test(statement)) {
    warnings.push({ code: 'EVAL_TIME_REFERENCE', message: 'SPL statement contains eval block with time math -- verify manually' });
  }

  return { rewritten, modifications, warnings };
}

/**
 * ES|QL rewriter: replaces @timestamp comparisons with new timestamps.
 * Handles >=, >, <=, < operators and BETWEEN pattern.
 */
function rewriteEsqlTime(statement, originalTW, newTW, options) {
  const modifications = [];
  const warnings = [];
  let rewritten = statement;

  // Handle BETWEEN pattern first (more specific)
  rewritten = rewritten.replace(
    /@timestamp\s+BETWEEN\s+"([^"]+)"\s+AND\s+"([^"]+)"/gi,
    (match, startTs, endTs) => {
      const replaced = `@timestamp BETWEEN "${newTW.start}" AND "${newTW.end}"`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  // Handle individual comparisons
  rewritten = rewritten.replace(
    /@timestamp\s*(>=?|<=?)\s*"([^"]+)"/gi,
    (match, operator, ts) => {
      const isStart = operator === '>=' || operator === '>';
      const newTs = isStart ? newTW.start : newTW.end;
      const replaced = `@timestamp ${operator} "${newTs}"`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  if (modifications.length === 0) {
    warnings.push({ code: 'STATEMENT_TIME_UNCHANGED', message: 'No inline time references found in ES|QL statement' });
  }

  if (/DATE_FORMAT|NOW\(\)/i.test(statement)) {
    warnings.push({ code: 'COMPUTED_TIMESTAMP', message: 'ES|QL statement contains computed timestamps -- verify manually' });
  }

  return { rewritten, modifications, warnings };
}

/**
 * EQL rewriter: sets spec.parameters.filter with range filter instead of rewriting statement.
 * Merges with existing filter if options.existingFilter is provided.
 */
function rewriteEqlTime(statement, originalTW, newTW, options) {
  const modifications = [];
  const warnings = [];
  const opts = options || {};

  const rangeFilter = { range: { '@timestamp': { gte: newTW.start, lte: newTW.end } } };

  let filter;
  if (opts.existingFilter) {
    filter = { bool: { must: [opts.existingFilter, rangeFilter] } };
  } else {
    filter = rangeFilter;
  }

  modifications.push({ type: 'filter_param', original: 'none', replaced: JSON.stringify(filter) });

  return { rewritten: statement, modifications, warnings, filter };
}

/**
 * KQL rewriter: handles both TimeGenerated (Sentinel) and Timestamp (Defender XDR) fields.
 * Replaces ago() and datetime() with absolute datetime() timestamps.
 */
function rewriteKqlTime(statement, originalTW, newTW, options) {
  const modifications = [];
  const warnings = [];
  const opts = options || {};
  let rewritten = statement;

  rewritten = rewritten.replace(
    /(TimeGenerated|Timestamp)\s*(>=?)\s*(ago\([^)]+\)|datetime\([^)]+\))/gi,
    (match, field, operator, timeExpr) => {
      const replaced = `${field} >= datetime(${newTW.start})`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  if (modifications.length === 0) {
    warnings.push({ code: 'STATEMENT_TIME_UNCHANGED', message: 'No inline time references found in KQL statement' });
  }

  // Defender XDR retention check
  if (opts.connectorId === 'defender_xdr') {
    const startMs = Date.parse(newTW.start);
    const thirtyDaysAgo = Date.now() - (30 * 86400000);
    if (startMs < thirtyDaysAgo) {
      warnings.push({ code: 'RETENTION_EXCEEDED', message: 'Defender XDR retains only 30 days of data; new time window start exceeds retention' });
    }
  }

  return { rewritten, modifications, warnings };
}

/**
 * OpenSearch SQL rewriter: replaces WHERE timestamp clauses with single-quoted ISO timestamps.
 * Handles @timestamp and timestamp field names, plus BETWEEN pattern.
 */
function rewriteOpenSearchSqlTime(statement, originalTW, newTW, options) {
  const modifications = [];
  const warnings = [];
  let rewritten = statement;

  // Handle BETWEEN pattern first (more specific)
  rewritten = rewritten.replace(
    /(@?timestamp)\s+BETWEEN\s+'([^']+)'\s+AND\s+'([^']+)'/gi,
    (match, field, startTs, endTs) => {
      const replaced = `${field} BETWEEN '${newTW.start}' AND '${newTW.end}'`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  // Handle individual comparisons
  rewritten = rewritten.replace(
    /(@?timestamp)\s*(>=?|<=?)\s*'([^']+)'/gi,
    (match, field, operator, ts) => {
      const isStart = operator === '>=' || operator === '>';
      const newTs = isStart ? newTW.start : newTW.end;
      const replaced = `${field} ${operator} '${newTs}'`;
      modifications.push({ type: 'inline_time', original: match, replaced });
      return replaced;
    }
  );

  if (modifications.length === 0) {
    warnings.push({ code: 'STATEMENT_TIME_UNCHANGED', message: 'No inline time references found in OpenSearch SQL statement' });
  }

  return { rewritten, modifications, warnings };
}

/**
 * TIME_REWRITERS registry: maps language keys to rewriter functions.
 */
const TIME_REWRITERS = {
  spl: rewriteSplTime,
  esql: rewriteEsqlTime,
  eql: rewriteEqlTime,
  kql: rewriteKqlTime,
  sql: rewriteOpenSearchSqlTime,
};

/**
 * rewriteQueryTime: dispatches to the correct per-language rewriter.
 * Returns NO_TIME_REWRITER warning for unknown languages.
 */
function rewriteQueryTime(language, statement, originalTW, newTW, options) {
  const rewriter = TIME_REWRITERS[language];
  if (!rewriter) {
    return {
      rewritten: statement,
      modifications: [],
      warnings: [{ code: 'NO_TIME_REWRITER', message: `No time rewriter for language: ${language}` }],
    };
  }
  return rewriter(statement, originalTW, newTW, options);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createReplaySpec,
  ReplaySpecSchema,
  parseShiftDuration,
  applyMutations,
  makeReplayId,
  resolveReplaySource,
  rewriteSplTime,
  rewriteEsqlTime,
  rewriteEqlTime,
  rewriteKqlTime,
  rewriteOpenSearchSqlTime,
  rewriteQueryTime,
  TIME_REWRITERS,
};
