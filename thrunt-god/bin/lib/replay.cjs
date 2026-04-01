'use strict';

const { z } = require('zod');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createQuerySpec, normalizeTimeWindow, isPlainObject, cloneObject } = require('./runtime.cjs');
const { planningPaths, output, error } = require('./core.cjs');
const { computeContentHash } = require('./manifest.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { resolvePack, renderPackTemplate } = require('./pack.cjs');

function makeReplayId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `RPL-${stamp}-${suffix}`;
}

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

function createReplaySpec(input) {
  return ReplaySpecSchema.parse({
    ...input,
    version: '1.0',
    replay_id: input && input.replay_id ? input.replay_id : makeReplayId(),
  });
}

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

function applyMutations(originalSpec, mutations, now = new Date()) {
  const spec = cloneObject(originalSpec);

  if (!mutations || !isPlainObject(mutations)) {
    return spec;
  }

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

  if (mutations.connector && isPlainObject(mutations.connector)) {
    if (mutations.connector.id) spec.connector.id = mutations.connector.id;
    if (mutations.connector.profile) spec.connector.profile = mutations.connector.profile;
  }

  if (mutations.ioc_injection && isPlainObject(mutations.ioc_injection)) {
    const language = spec.query?.language
      || mutations.connector?.language
      || CONNECTOR_LANGUAGE_MAP[spec.connector?.id]
      || 'native';
    const { statement, modifications, warnings } = applyIocInjection(
      spec.query.statement,
      language,
      spec.connector.id,
      mutations.ioc_injection
    );
    spec.query.statement = statement;
    if (modifications.length > 0 || warnings.length > 0) {
      spec.query.hints = {
        ...(spec.query.hints || {}),
        replay_ioc_injection: {
          mode: mutations.ioc_injection.mode,
          modifications,
          warnings,
        },
      };
    }
  }

  if (mutations.parameters && isPlainObject(mutations.parameters)) {
    spec.parameters = { ...spec.parameters, ...mutations.parameters };
  }

  if (mutations.execution && isPlainObject(mutations.execution)) {
    if (mutations.execution.dry_run !== undefined) spec.execution.dry_run = mutations.execution.dry_run;
    if (mutations.execution.timeout_ms !== undefined) spec.execution.timeout_ms = mutations.execution.timeout_ms;
    if (mutations.execution.max_retries !== undefined) spec.execution.max_retries = mutations.execution.max_retries;
  }

  return createQuerySpec(spec);
}

function parseQueryLogDocument(content) {
  const frontmatter = extractFrontmatter(content);

  let statement = '';
  const stmtMatch = content.match(/## Query Or Procedure\s*\n+~~~text\n([\s\S]*?)\n~~~/);
  if (stmtMatch) {
    statement = stmtMatch[1].trim();
  }

  let timeWindow = { start: null, end: null };
  const twMatch = content.match(/\*\*Time window:\*\*\s*(\S+)\s*->\s*(\S+)/);
  if (twMatch) {
    timeWindow = { start: twMatch[1], end: twMatch[2] };
  }

  return { frontmatter, statement, time_window: timeWindow };
}

function extractMarkdownSection(content, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`## ${escapedHeading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|\\n#\\s|$)`));
  return match ? match[1].trim() : '';
}

function parseResultSummaryPairs(summaryText) {
  const pairs = {};
  const pairPattern = /([a-z_]+)\s*=\s*([^,\n]+)/gi;
  let match;

  while ((match = pairPattern.exec(summaryText)) !== null) {
    pairs[match[1].toLowerCase()] = match[2].trim();
  }

  return pairs;
}

function parseCountValue(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQueryLogEnvelope(content, parsed) {
  const summaryPairs = parseResultSummaryPairs(extractMarkdownSection(content, 'Result Summary'));
  const statusMatch = content.match(/- \*\*Result status:\*\*\s*(.+)$/m);
  const status = summaryPairs.status || (statusMatch ? statusMatch[1].trim() : null);
  const countKeys = ['events', 'entities', 'relationships', 'evidence', 'warnings', 'errors', 'raw_records'];
  const hasSummaryCounts = countKeys.some(key => Object.prototype.hasOwnProperty.call(summaryPairs, key));

  if (!hasSummaryCounts && !status) {
    return { envelope: null, detailLevel: null };
  }

  const counts = {};
  for (const key of countKeys) {
    counts[key] = parseCountValue(summaryPairs[key]);
  }

  return {
    envelope: {
      query_id: parsed.frontmatter.query_id || null,
      connector: {
        id: parsed.frontmatter.connector_id || null,
      },
      dataset: {
        kind: parsed.frontmatter.dataset || parsed.frontmatter.source || 'events',
      },
      time_window: parsed.time_window,
      counts,
      entities: [],
      evidence: [],
      status: status || 'unknown',
    },
    detailLevel: 'summary',
  };
}

function findManifestForQueryId(manifestsDir, queryId, cache) {
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
        }
      }
    } catch {
    }
  }

  if (cache) {
    cache.set(queryId, manifest);
  }
  return manifest;
}

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
          baseline_detail_level: null,
          source_path: null,
          warnings: [`hunt_phase source resolution not yet implemented (id: ${id})`],
        });
      }
      break;
    }
  }

  return results;
}

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
      baseline_detail_level: null,
      source_path: queryFile,
      warnings: [`Query log not found: ${queryFile}`],
    };
  }

  const content = fs.readFileSync(queryFile, 'utf-8');
  const parsed = parseQueryLogDocument(content);
  const envelopeResolution = parseQueryLogEnvelope(content, parsed);

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
    original_envelope: envelopeResolution.envelope,
    baseline_detail_level: envelopeResolution.detailLevel,
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
      baseline_detail_level: null,
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
      baseline_detail_level: null,
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
      baseline_detail_level: null,
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
        baseline_detail_level: null,
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
      baseline_detail_level: null,
      source_path: metricsFile,
      warnings: [`Failed to parse metrics record ${metricsId}: ${err.message}`],
    };
  }
}

function appendSqlFilter(statement, clause) {
  const trimmed = statement.trimEnd();
  const hasSemicolon = trimmed.endsWith(';');
  const base = hasSemicolon ? trimmed.slice(0, -1) : trimmed;
  const joiner = /\bwhere\b/i.test(base) ? ' AND ' : ' WHERE ';
  return `${base}${joiner}${clause}${hasSemicolon ? ';' : ''}`;
}

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

const CONNECTOR_LANGUAGE_MAP = {
  splunk: 'spl',
  elastic: 'esql',
  sentinel: 'kql',
  defender_xdr: 'kql',
  opensearch: 'sql',
};

const FIELD_MAPPING_WARNINGS = {
  'sentinel:defender_xdr': [
    'TimeGenerated -> Timestamp',
    'Computer -> DeviceName',
    'Account -> AccountName',
    'HostName -> DeviceName',
  ],
  'defender_xdr:sentinel': [
    'Timestamp -> TimeGenerated',
    'DeviceName -> Computer',
    'AccountName -> Account',
  ],
};

function validateSameLanguageRetarget(sourceConnectorId, targetConnectorId) {
  if (sourceConnectorId === targetConnectorId) {
    return { allowed: true, warnings: [] };
  }

  const sourceLang = CONNECTOR_LANGUAGE_MAP[sourceConnectorId];
  const targetLang = CONNECTOR_LANGUAGE_MAP[targetConnectorId];

  if (!sourceLang) {
    return { allowed: false, error: `Unknown connector: ${sourceConnectorId}` };
  }
  if (!targetLang) {
    return { allowed: false, error: `Unknown connector: ${targetConnectorId}` };
  }

  if (sourceLang === targetLang) {
    const pairKey = `${sourceConnectorId}:${targetConnectorId}`;
    const fieldWarnings = FIELD_MAPPING_WARNINGS[pairKey] || [];
    const warnings = [];
    if (fieldWarnings.length > 0) {
      warnings.push(`FIELD_MAPPING_WARNING: Same language (${sourceLang}) but field names differ between ${sourceConnectorId} and ${targetConnectorId}: ${fieldWarnings.join(', ')}`);
    }
    return { allowed: true, warnings };
  }

  return {
    allowed: false,
    error: 'Cross-language retargeting requires a pack with execution targets for both connectors. Consider creating a custom pack or manually writing the equivalent query.',
  };
}

function retargetPackExecution(cwd, packId, targetConnectorId, parameters, options) {
  const opts = options || {};
  const params = parameters || {};

  // Resolve the pack -- propagates PACK_NOT_FOUND
  const resolved = resolvePack(cwd, packId, opts);
  if (!resolved.pack) {
    const err = new Error(`Pack ${packId} not found`);
    err.code = 'PACK_NOT_FOUND';
    throw err;
  }

  const executionTargets = resolved.pack.execution_targets || [];

  // Find target matching the desired connector
  const target = executionTargets.find(t => t.connector === targetConnectorId);
  if (!target) {
    const available = executionTargets.map(t => t.connector).join(', ');
    const err = new Error(`Connector "${targetConnectorId}" not found in pack "${packId}". Available connectors: ${available}`);
    err.code = 'CONNECTOR_NOT_IN_PACK';
    throw err;
  }

  // Render the query template
  const renderedQuery = renderPackTemplate(target.query_template, params, { strict: false });

  // Check for same-language retarget warnings
  const warnings = [];
  const originalConnectorId = opts.originalConnectorId || (executionTargets[0] ? executionTargets[0].connector : null);
  if (originalConnectorId && originalConnectorId !== targetConnectorId) {
    const retargetResult = validateSameLanguageRetarget(originalConnectorId, targetConnectorId);
    if (retargetResult.warnings) {
      warnings.push(...retargetResult.warnings);
    }
  }

  return { target, rendered: renderedQuery.rendered, warnings };
}

const IOC_FIELD_MAP = {
  splunk: {
    ip: ['src', 'dest', 'src_ip', 'dest_ip', 'IPAddress'],
    hash: ['FileHash', 'file_hash', 'SHA256', 'MD5'],
    domain: ['dest_host', 'query', 'url_domain'],
    user: ['user', 'src_user', 'dest_user', 'Account'],
  },
  elastic: {
    ip: ['source.ip', 'destination.ip', 'client.ip'],
    hash: ['file.hash.sha256', 'process.hash.sha256'],
    domain: ['dns.question.name', 'url.domain'],
    user: ['user.name'],
  },
  sentinel: {
    ip: ['IPAddress', 'IP', 'RemoteIP'],
    hash: ['FileHash', 'SHA256', 'MD5'],
    domain: ['DomainName', 'DestinationHostName'],
    user: ['Account', 'AccountName', 'UserPrincipalName'],
  },
  defender_xdr: {
    ip: ['RemoteIP', 'LocalIP', 'IPAddress'],
    hash: ['SHA256', 'MD5', 'SHA1'],
    domain: ['RemoteUrl', 'FileName'],
    user: ['AccountName', 'AccountUpn', 'InitiatingProcessAccountName'],
  },
  opensearch: {
    ip: ['source.ip', 'destination.ip', 'client.ip', 'source_ip'],
    hash: ['file.hash.sha256'],
    domain: ['dns.question.name', 'url.domain'],
    user: ['user.name', 'user', 'username'],
  },
};

function validateIocValue(type, value) {
  if (typeof value !== 'string') {
    return { valid: false, error: `IOC value must be a string, got ${typeof value}` };
  }

  switch (type) {
    case 'ip': {
      // IPv4
      const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const m4 = value.match(ipv4);
      if (m4) {
        const valid = [m4[1], m4[2], m4[3], m4[4]].every(o => {
          const n = parseInt(o, 10);
          return n >= 0 && n <= 255;
        });
        return valid
          ? { valid: true }
          : { valid: false, error: `Invalid IPv4 address: octets must be 0-255 (got ${value})` };
      }
      // IPv6: simplified check -- allow hex groups separated by colons, with :: shorthand
      const ipv6 = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$|^::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{0,4}$|^([0-9a-fA-F]{1,4}:){1,6}:$|^::1?$|^[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}$/;
      if (ipv6.test(value)) {
        return { valid: true };
      }
      return { valid: false, error: `Invalid IP address: ${value}` };
    }

    case 'hash': {
      const hashPattern = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$|^[a-fA-F0-9]{128}$/;
      if (hashPattern.test(value)) {
        return { valid: true };
      }
      return { valid: false, error: `Invalid hash: must be 32 (MD5), 40 (SHA1), 64 (SHA256), or 128 (SHA512) hex characters (got ${value.length} chars)` };
    }

    case 'domain': {
      const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
      if (domainPattern.test(value)) {
        return { valid: true };
      }
      return { valid: false, error: `Invalid domain: ${value}` };
    }

    case 'user': {
      if (value.trim().length > 0) {
        return { valid: true };
      }
      return { valid: false, error: 'User IOC value must be non-empty' };
    }

    default: {
      // Permissive fallback for other types (hostname, url, email, filename)
      if (value.trim().length > 0) {
        return { valid: true };
      }
      return { valid: false, error: `IOC value for type "${type}" must be non-empty` };
    }
  }
}

function sanitizeIocForLanguage(language, value) {
  // Universal pre-sanitization: strip control characters (ASCII 0-31 except tab \x09)
  let presanitized = value.replace(/[\x00-\x08\x0a-\x1f]/g, '');

  switch (language) {
    case 'spl': {
      // Remove pipe, backtick, brackets -- these can alter SPL pipeline
      let sanitized = presanitized.replace(/[|`\[\]]/g, '');
      // Strip $ to prevent Splunk $token$ field substitution
      sanitized = sanitized.replace(/\$/g, '');
      // Escape double quotes
      sanitized = sanitized.replace(/"/g, '\\"');
      return sanitized;
    }

    case 'esql': {
      // Escape double quotes by doubling, remove semicolons
      let sanitized = presanitized.replace(/"/g, '""');
      sanitized = sanitized.replace(/;/g, '');
      return sanitized;
    }

    case 'kql': {
      // Escape backslashes first (before other escaping that introduces backslashes)
      let sanitized = presanitized.replace(/\\/g, '\\\\');
      // Escape double quotes by doubling, remove semicolons
      sanitized = sanitized.replace(/"/g, '""');
      sanitized = sanitized.replace(/;/g, '');
      return sanitized;
    }

    case 'sql': {
      // Escape single quotes by doubling, remove semicolons
      let sanitized = presanitized.replace(/'/g, "''");
      sanitized = sanitized.replace(/;/g, '');
      return sanitized;
    }

    default: {
      // Strip all dangerous characters
      return presanitized.replace(/[|`\[\];"']/g, '');
    }
  }
}

function injectIoc(language, statement, iocType, iocValue, mode, connectorId) {
  const warnings = [];
  const modifications = [];

  // Validate the IOC value
  const validation = validateIocValue(iocType, iocValue);
  if (!validation.valid) {
    const err = new Error(`Invalid IOC value: ${validation.error}`);
    err.code = 'INVALID_IOC_VALUE';
    throw err;
  }

  // Sanitize the IOC value for the target language
  const sanitized = sanitizeIocForLanguage(language, iocValue);

  // Look up fields from IOC_FIELD_MAP
  const connectorMap = IOC_FIELD_MAP[connectorId];
  const fields = connectorMap ? connectorMap[iocType] : undefined;

  if (!fields) {
    return {
      injected: statement,
      warnings: [{ code: 'IOC_FIELD_UNKNOWN', message: `No field mapping for IOC type "${iocType}" on connector "${connectorId}"` }],
      modifications: [],
    };
  }

  // Check for complex query patterns
  if (/\|\s*lookup\b|\|\s*join\b|subquery|INNER JOIN|LEFT JOIN/i.test(statement)) {
    warnings.push({ code: 'COMPLEX_QUERY_WARNING', message: 'Statement contains subqueries, joins, or lookups -- IOC injection may produce unexpected results' });
  }

  // Scan statement for any known field names
  let matchedField = null;
  let matchedPattern = null;

  for (const field of fields) {
    // Escape dots in field name for regex
    const escapedField = field.replace(/\./g, '\\.');

    // Try to find the field in the statement with different assignment patterns depending on language
    let pattern;
    switch (language) {
      case 'spl':
        // SPL: field=value or field="value"
        pattern = new RegExp(`(${escapedField})\\s*=\\s*(?:"([^"]+)"|(\\S+))`, 'i');
        break;
      case 'esql':
        // ES|QL: field == "value"
        pattern = new RegExp(`(${escapedField})\\s*==\\s*"([^"]+)"`, 'i');
        break;
      case 'kql':
        // KQL: field == "value"
        pattern = new RegExp(`(${escapedField})\\s*==\\s*"([^"]+)"`, 'i');
        break;
      case 'sql':
        // SQL: field = 'value'
        pattern = new RegExp(`(${escapedField})\\s*=\\s*'([^']+)'`, 'i');
        break;
      default:
        pattern = new RegExp(`(${escapedField})\\s*=\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'i');
    }

    if (pattern.test(statement)) {
      matchedField = field;
      matchedPattern = pattern;
      break;
    }
  }

  if (matchedField) {
    // Field found in statement -- perform injection
    const escapedField = matchedField.replace(/\./g, '\\.');
    let injected = statement;

    switch (language) {
      case 'spl': {
        const splPattern = new RegExp(`(${escapedField})\\s*=\\s*(?:"([^"]+)"|(\\S+))`, 'i');
        const splMatch = statement.match(splPattern);
        if (splMatch) {
          const fullMatch = splMatch[0];
          const fname = splMatch[1];
          const originalValue = splMatch[2] || splMatch[3];

          if (mode === 'append') {
            const replacement = `(${fname}=${originalValue} OR ${fname}=${sanitized})`;
            injected = statement.replace(fullMatch, replacement);
          } else {
            // replace mode
            const replacement = `${fname}=${sanitized}`;
            injected = statement.replace(fullMatch, replacement);
          }

          modifications.push({ type: mode, original: fullMatch, replaced: mode === 'append' ? `(${fname}=${originalValue} OR ${fname}=${sanitized})` : `${fname}=${sanitized}` });
        }
        break;
      }

      case 'esql': {
        const esqlPattern = new RegExp(`(${escapedField})\\s*==\\s*"([^"]+)"`, 'i');
        const esqlMatch = statement.match(esqlPattern);
        if (esqlMatch) {
          const fullMatch = esqlMatch[0];
          const fname = esqlMatch[1];
          const originalValue = esqlMatch[2];

          if (mode === 'append') {
            const replacement = `${fname} IN ("${originalValue}", "${sanitized}")`;
            injected = statement.replace(fullMatch, replacement);
          } else {
            const replacement = `${fname} == "${sanitized}"`;
            injected = statement.replace(fullMatch, replacement);
          }

          modifications.push({ type: mode, original: fullMatch, replaced: injected.includes('IN') ? `${fname} IN (...)` : `${fname} == "${sanitized}"` });
        }
        break;
      }

      case 'kql': {
        const kqlPattern = new RegExp(`(${escapedField})\\s*==\\s*"([^"]+)"`, 'i');
        const kqlMatch = statement.match(kqlPattern);
        if (kqlMatch) {
          const fullMatch = kqlMatch[0];
          const fname = kqlMatch[1];
          const originalValue = kqlMatch[2];

          if (mode === 'append') {
            const replacement = `${fname} in ("${originalValue}", "${sanitized}")`;
            injected = statement.replace(fullMatch, replacement);
          } else {
            const replacement = `${fname} == "${sanitized}"`;
            injected = statement.replace(fullMatch, replacement);
          }

          modifications.push({ type: mode, original: fullMatch, replaced: injected.includes('in (') ? `${fname} in (...)` : `${fname} == "${sanitized}"` });
        }
        break;
      }

      case 'sql': {
        const sqlPattern = new RegExp(`(${escapedField})\\s*=\\s*'([^']+)'`, 'i');
        const sqlMatch = statement.match(sqlPattern);
        if (sqlMatch) {
          const fullMatch = sqlMatch[0];
          const fname = sqlMatch[1];
          const originalValue = sqlMatch[2];

          if (mode === 'append') {
            const replacement = `${fname} IN ('${originalValue}', '${sanitized}')`;
            injected = statement.replace(fullMatch, replacement);
          } else {
            const replacement = `${fname} = '${sanitized}'`;
            injected = statement.replace(fullMatch, replacement);
          }

          modifications.push({ type: mode, original: fullMatch, replaced: injected.includes('IN (') ? `${fname} IN (...)` : `${fname} = '${sanitized}'` });
        }
        break;
      }
    }

    return { injected, modifications, warnings };
  }

  // No field found -- append new filter clause using first field from map
  const defaultField = fields[0];
  let injected = statement;

  switch (language) {
    case 'spl':
      injected = `${statement} ${defaultField}=${sanitized}`;
      break;
    case 'esql':
      injected = `${statement} | WHERE ${defaultField} == "${sanitized}"`;
      break;
    case 'kql':
      injected = `${statement} | where ${defaultField} == "${sanitized}"`;
      break;
    case 'sql':
      injected = appendSqlFilter(statement, `${defaultField} = '${sanitized}'`);
      break;
    default:
      injected = `${statement} ${defaultField}=${sanitized}`;
  }

  modifications.push({ type: 'appended_filter', original: '', replaced: `${defaultField}=${sanitized}` });

  return { injected, modifications, warnings };
}

function applyIocInjection(statement, language, connectorId, iocInjection) {
  const allModifications = [];
  const allWarnings = [];
  let currentStatement = statement;

  if (!iocInjection || !Array.isArray(iocInjection.iocs)) {
    return { statement: currentStatement, modifications: allModifications, warnings: allWarnings };
  }

  for (const ioc of iocInjection.iocs) {
    const result = injectIoc(language, currentStatement, ioc.type, ioc.value, iocInjection.mode, connectorId);
    currentStatement = result.injected;
    allModifications.push(...result.modifications);
    allWarnings.push(...result.warnings);
  }

  return { statement: currentStatement, modifications: allModifications, warnings: allWarnings };
}

const VALID_DIFF_MODES = ['full', 'counts_only', 'entities_only'];

/**
 * Compute entity-level delta between two result envelopes.
 *
 * @param {object} originalEnvelope - baseline result envelope
 * @param {object} replayEnvelope - replay result envelope
 * @param {string} [mode='full'] - one of 'full', 'counts_only', 'entities_only'
 * @returns {object} DiffResult with baseline, replay, delta, summary, mode
 */
function buildDiff(originalEnvelope, replayEnvelope, mode = 'full') {
  if (!VALID_DIFF_MODES.includes(mode)) {
    throw new Error(`Invalid diff mode: "${mode}". Must be one of: ${VALID_DIFF_MODES.join(', ')}`);
  }

  // Build baseline summary
  const baseline = {
    query_id: originalEnvelope.query_id,
    connector_id: originalEnvelope.connector && originalEnvelope.connector.id,
    time_window: {
      start: originalEnvelope.time_window && originalEnvelope.time_window.start,
      end: originalEnvelope.time_window && originalEnvelope.time_window.end,
    },
    counts: { ...originalEnvelope.counts },
    status: originalEnvelope.status,
  };

  // Build replay summary
  const replay = {
    query_id: replayEnvelope.query_id,
    connector_id: replayEnvelope.connector && replayEnvelope.connector.id,
    time_window: {
      start: replayEnvelope.time_window && replayEnvelope.time_window.start,
      end: replayEnvelope.time_window && replayEnvelope.time_window.end,
    },
    counts: { ...replayEnvelope.counts },
    status: replayEnvelope.status,
  };

  const delta = {
    events: { added: 0, removed: 0, unchanged: 0 },
    entities: { added: [], removed: [], unchanged: 0 },
    new_findings: [],
    missing_findings: [],
  };

  // Event count delta (used in full and counts_only modes)
  if (mode === 'full' || mode === 'counts_only') {
    const baseEvents = baseline.counts.events || 0;
    const replayEvents = replay.counts.events || 0;
    delta.events.added = Math.max(0, replayEvents - baseEvents);
    delta.events.removed = Math.max(0, baseEvents - replayEvents);
    delta.events.unchanged = Math.min(baseEvents, replayEvents);
  }

  // Entity set diff (used in full and entities_only modes)
  if (mode === 'full' || mode === 'entities_only') {
    const originalEntities = originalEnvelope.entities || [];
    const replayEntities = replayEnvelope.entities || [];

    const originalSet = new Set(originalEntities.map(e => `${e.kind}:${e.value}`));
    const replaySet = new Set(replayEntities.map(e => `${e.kind}:${e.value}`));

    // Added: in replay but not in original
    for (const e of replayEntities) {
      const key = `${e.kind}:${e.value}`;
      if (!originalSet.has(key)) {
        delta.entities.added.push({ kind: e.kind, value: e.value });
      }
    }
    // Deduplicate added entities (in case of duplicates within replay)
    const seenAdded = new Set();
    delta.entities.added = delta.entities.added.filter(e => {
      const key = `${e.kind}:${e.value}`;
      if (seenAdded.has(key)) return false;
      seenAdded.add(key);
      return true;
    });

    // Removed: in original but not in replay
    for (const e of originalEntities) {
      const key = `${e.kind}:${e.value}`;
      if (!replaySet.has(key)) {
        delta.entities.removed.push({ kind: e.kind, value: e.value });
      }
    }
    // Deduplicate removed entities
    const seenRemoved = new Set();
    delta.entities.removed = delta.entities.removed.filter(e => {
      const key = `${e.kind}:${e.value}`;
      if (seenRemoved.has(key)) return false;
      seenRemoved.add(key);
      return true;
    });

    // Unchanged: count of keys in both sets
    let unchangedCount = 0;
    for (const key of originalSet) {
      if (replaySet.has(key)) unchangedCount++;
    }
    delta.entities.unchanged = unchangedCount;
  }

  // Findings diff (full mode only)
  if (mode === 'full') {
    const originalEvidence = originalEnvelope.evidence || [];
    const replayEvidence = replayEnvelope.evidence || [];

    const originalKeys = new Set(originalEvidence.map(e => JSON.stringify(e)));
    const replayKeys = new Set(replayEvidence.map(e => JSON.stringify(e)));

    delta.new_findings = replayEvidence.filter(e => !originalKeys.has(JSON.stringify(e)));
    delta.missing_findings = originalEvidence.filter(e => !replayKeys.has(JSON.stringify(e)));
  }

  // Generate summary string
  let summary;
  const addedEvents = delta.events.added;
  const addedEntities = delta.entities.added.length;
  const removedEvents = delta.events.removed;
  const removedEntities = delta.entities.removed.length;

  if (addedEvents === 0 && removedEvents === 0 && addedEntities === 0 && removedEntities === 0) {
    summary = 'No changes detected between original and replay.';
  } else {
    const parts = [];
    if (addedEvents > 0) parts.push(`${addedEvents} new event(s)`);
    if (removedEvents > 0) parts.push(`${removedEvents} removed event(s)`);
    if (addedEntities > 0) parts.push(`${addedEntities} new entity/entities`);
    if (removedEntities > 0) parts.push(`${removedEntities} removed entity/entities`);
    summary = `Replay found ${parts.join(' and ')} compared to original.`;
  }

  return {
    replay_id: replayEnvelope.query_id,
    baseline,
    replay,
    delta,
    summary,
    mode,
  };
}

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
  CONNECTOR_LANGUAGE_MAP,
  FIELD_MAPPING_WARNINGS,
  validateSameLanguageRetarget,
  retargetPackExecution,
  IOC_FIELD_MAP,
  validateIocValue,
  sanitizeIocForLanguage,
  injectIoc,
  applyIocInjection,
  buildDiff,
};
