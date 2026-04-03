/**
 * Connector SDK — Self-contained SDK primitives for the thrunt-god connector ecosystem.
 *
 * Extracted from runtime.cjs (Phase 45). Contains all constants, factories, validators,
 * auth utilities, HTTP helpers, normalization, execution engine, and readiness assessment.
 *
 * This module has zero require() calls to runtime.cjs. Adapter factories and
 * connector-specific parsers remain in runtime.cjs.
 */

'use strict';

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');

const QUERY_SPEC_VERSION = '1.0';
const RESULT_ENVELOPE_VERSION = '1.0';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1_000;

const DATASET_KINDS = [
  'events',
  'alerts',
  'entities',
  'identity',
  'endpoint',
  'cloud',
  'email',
  'other',
];

const DATASET_DEFAULTS = {
  identity:  { pagination: { limit: 200, max_pages: 10 }, execution: { timeout_ms: 30_000 } },
  endpoint:  { pagination: { limit: 1000, max_pages: 5 }, execution: { timeout_ms: 60_000 } },
  alerts:    { pagination: { limit: 100, max_pages: 10 }, execution: { timeout_ms: 30_000 } },
  cloud:     { pagination: { limit: 500, max_pages: 10 }, execution: { timeout_ms: 45_000 } },
  email:     { pagination: { limit: 200, max_pages: 10 }, execution: { timeout_ms: 30_000 } },
  entities:  { pagination: { limit: 100, max_pages: 5 },  execution: { timeout_ms: 20_000 } },
  events:    { pagination: { limit: 500, max_pages: 10 }, execution: { timeout_ms: 30_000 } },
  other:     { pagination: { limit: 500, max_pages: 10 }, execution: { timeout_ms: 30_000 } },
};

function getDatasetDefaults(kind) {
  const entry = DATASET_DEFAULTS[kind] || DATASET_DEFAULTS.events;
  return {
    pagination: { ...entry.pagination },
    execution: { ...entry.execution },
  };
}

const PAGINATION_MODES = ['auto', 'none', 'cursor', 'offset', 'page', 'token'];
const CONSISTENCY_MODES = ['best_effort', 'strict'];
const RESULT_STATUSES = ['ok', 'partial', 'error', 'empty'];
const EVIDENCE_POLICIES = ['all', 'material', 'none'];
const LIFECYCLE_STAGES = ['preflight', 'prepare', 'execute', 'paginate', 'normalize', 'reduce', 'emit', 'complete'];
const AUTH_TYPES = [
  'api_key',
  'basic',
  'bearer',
  'oauth_client_credentials',
  'oauth_refresh',
  'sigv4',
  'service_account',
  'session',
];
const SECRET_REF_TYPES = ['env', 'file', 'command'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneObject(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.slice() : [value];
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

function makeId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

function normalizeTimeWindow(input = {}, now = new Date()) {
  const window = isPlainObject(input) ? { ...input } : {};
  const timezone = typeof window.timezone === 'string' && window.timezone.trim()
    ? window.timezone.trim()
    : 'UTC';
  const lookbackMinutes = Number.isFinite(window.lookback_minutes)
    ? Math.max(1, Math.trunc(window.lookback_minutes))
    : null;
  let start = window.start || null;
  let end = window.end || null;

  if (!end) {
    end = nowIso(now);
  }

  if (!start && lookbackMinutes !== null) {
    start = new Date(new Date(end).getTime() - (lookbackMinutes * 60 * 1000)).toISOString();
  }

  return {
    start,
    end,
    timezone,
    preset: typeof window.preset === 'string' ? window.preset : null,
    lookback_minutes: lookbackMinutes,
    cursor: window.cursor || null,
    alignment: typeof window.alignment === 'string' ? window.alignment : 'exact',
  };
}

function normalizePagination(input = {}) {
  const pagination = isPlainObject(input) ? { ...input } : {};
  const limit = Number.isFinite(pagination.limit)
    ? Math.max(1, Math.trunc(pagination.limit))
    : DEFAULT_PAGE_SIZE;
  const maxPages = Number.isFinite(pagination.max_pages)
    ? Math.max(1, Math.trunc(pagination.max_pages))
    : DEFAULT_MAX_PAGES;
  return {
    mode: typeof pagination.mode === 'string' ? pagination.mode : 'auto',
    limit,
    max_pages: maxPages,
    cursor: pagination.cursor || null,
    page: Number.isFinite(pagination.page) ? Math.max(1, Math.trunc(pagination.page)) : 1,
    offset: Number.isFinite(pagination.offset) ? Math.max(0, Math.trunc(pagination.offset)) : 0,
  };
}

function normalizeExecution(input = {}) {
  const execution = isPlainObject(input) ? { ...input } : {};
  return {
    profile: typeof execution.profile === 'string' ? execution.profile : 'default',
    timeout_ms: Number.isFinite(execution.timeout_ms)
      ? Math.max(1_000, Math.trunc(execution.timeout_ms))
      : DEFAULT_TIMEOUT_MS,
    max_retries: Number.isFinite(execution.max_retries)
      ? Math.max(0, Math.trunc(execution.max_retries))
      : DEFAULT_MAX_RETRIES,
    backoff_ms: Number.isFinite(execution.backoff_ms)
      ? Math.max(0, Math.trunc(execution.backoff_ms))
      : DEFAULT_BACKOFF_MS,
    consistency: typeof execution.consistency === 'string' ? execution.consistency : 'best_effort',
    dry_run: execution.dry_run === true,
    priority: typeof execution.priority === 'string' ? execution.priority : 'normal',
    request_id: execution.request_id || makeId('REQ'),
  };
}

function normalizeQuery(input = {}) {
  const query = isPlainObject(input) ? { ...input } : {};
  return {
    language: typeof query.language === 'string' ? query.language : 'native',
    statement: typeof query.statement === 'string' ? query.statement : '',
    parameters: isPlainObject(query.parameters) ? cloneObject(query.parameters) : {},
    hints: isPlainObject(query.hints) ? cloneObject(query.hints) : {},
  };
}

function normalizeEvidence(input = {}) {
  const evidence = isPlainObject(input) ? { ...input } : {};
  return {
    hypothesis_ids: toArray(evidence.hypothesis_ids).filter(Boolean),
    query_log: evidence.query_log !== false,
    receipt_policy: typeof evidence.receipt_policy === 'string' ? evidence.receipt_policy : 'material',
    chain_of_custody: isPlainObject(evidence.chain_of_custody) ? cloneObject(evidence.chain_of_custody) : {},
    tags: toArray(evidence.tags).filter(Boolean),
  };
}

function createQuerySpec(input = {}, now = new Date()) {
  const datasetKind = input.dataset?.kind || 'events';
  const dsDefaults = DATASET_DEFAULTS[datasetKind] || DATASET_DEFAULTS.events;

  const paginationInput = { ...dsDefaults.pagination, ...(input.pagination || {}) };
  const executionInput = { ...dsDefaults.execution, ...(input.execution || {}) };

  const normalizedExecution = normalizeExecution(executionInput);
  if ((!input.execution || input.execution.profile === undefined) && input.connector?.profile) {
    normalizedExecution.profile = input.connector.profile;
  }
  const spec = {
    version: QUERY_SPEC_VERSION,
    query_id: input.query_id || makeId('QRY'),
    connector: {
      id: input.connector?.id || null,
      profile: input.connector?.profile || normalizedExecution.profile,
      tenant: input.connector?.tenant || null,
      region: input.connector?.region || null,
    },
    dataset: {
      kind: input.dataset?.kind || 'events',
      name: input.dataset?.name || null,
      version: input.dataset?.version || null,
    },
    time_window: normalizeTimeWindow(input.time_window, now),
    parameters: isPlainObject(input.parameters) ? cloneObject(input.parameters) : {},
    pagination: normalizePagination(paginationInput),
    execution: normalizedExecution,
    query: normalizeQuery(input.query),
    evidence: normalizeEvidence(input.evidence),
  };

  const validation = validateQuerySpec(spec);
  if (!validation.valid) {
    const err = new Error(`Invalid QuerySpec: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_QUERY_SPEC';
    err.validation = validation;
    throw err;
  }

  return spec;
}

function validateQuerySpec(spec) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(spec)) {
    return { valid: false, errors: ['QuerySpec must be an object'], warnings };
  }

  if (!spec.connector || typeof spec.connector.id !== 'string' || !spec.connector.id.trim()) {
    errors.push('connector.id is required');
  }

  if (!spec.dataset || !DATASET_KINDS.includes(spec.dataset.kind)) {
    errors.push(`dataset.kind must be one of: ${DATASET_KINDS.join(', ')}`);
  }

  if (!spec.time_window || !isIsoDate(spec.time_window.start) || !isIsoDate(spec.time_window.end)) {
    errors.push('time_window.start and time_window.end must be valid ISO timestamps');
  } else if (Date.parse(spec.time_window.start) >= Date.parse(spec.time_window.end)) {
    errors.push('time_window.start must be earlier than time_window.end');
  }

  if (!spec.query || typeof spec.query.statement !== 'string' || !spec.query.statement.trim()) {
    errors.push('query.statement is required');
  }

  if (!PAGINATION_MODES.includes(spec.pagination?.mode)) {
    errors.push(`pagination.mode must be one of: ${PAGINATION_MODES.join(', ')}`);
  }

  if (!CONSISTENCY_MODES.includes(spec.execution?.consistency)) {
    errors.push(`execution.consistency must be one of: ${CONSISTENCY_MODES.join(', ')}`);
  }

  if (!EVIDENCE_POLICIES.includes(spec.evidence?.receipt_policy)) {
    errors.push(`evidence.receipt_policy must be one of: ${EVIDENCE_POLICIES.join(', ')}`);
  }

  if (spec.pagination?.mode === 'none' && spec.pagination?.max_pages > 1) {
    warnings.push('pagination.max_pages is ignored when pagination.mode is none');
  }

  if (spec.execution?.dry_run && spec.evidence?.receipt_policy === 'all') {
    warnings.push('dry-run queries usually should not emit receipts for every result');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function createConnectorCapabilities(input = {}) {
  const capabilities = {
    id: input.id || null,
    display_name: input.display_name || input.id || null,
    auth_types: toArray(input.auth_types).filter(Boolean),
    dataset_kinds: toArray(input.dataset_kinds).filter(Boolean),
    languages: toArray(input.languages).filter(Boolean),
    pagination_modes: toArray(input.pagination_modes).filter(Boolean),
    supports_entities: input.supports_entities !== false,
    supports_relationships: input.supports_relationships === true,
    supports_receipts: input.supports_receipts !== false,
    supports_dry_run: input.supports_dry_run !== false,
    docs_url: input.docs_url || null,
    limitations: toArray(input.limitations).filter(Boolean),
    supported_parameters: toArray(input.supported_parameters).filter(Boolean),
  };

  const validation = validateConnectorCapabilities(capabilities);
  if (!validation.valid) {
    const err = new Error(`Invalid connector capabilities: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_CONNECTOR_CAPABILITIES';
    err.validation = validation;
    throw err;
  }

  return capabilities;
}

function normalizeSecretRef(input) {
  if (typeof input === 'string') {
    return { type: 'env', value: input };
  }
  if (!isPlainObject(input)) {
    return null;
  }
  return {
    type: input.type || null,
    value: input.value || null,
  };
}

function createAuthProfile(input = {}) {
  const secretRefs = {};
  const rawRefs = isPlainObject(input.secret_refs) ? input.secret_refs : {};
  for (const [name, ref] of Object.entries(rawRefs)) {
    secretRefs[name] = normalizeSecretRef(ref);
  }

  const profile = {
    name: input.name || 'default',
    connector_id: input.connector_id || null,
    auth_type: input.auth_type || null,
    // Accept legacy `endpoint` and normalize it into the canonical runtime field.
    base_url: input.base_url || input.endpoint || null,
    token_url: input.token_url || null,
    tenant: input.tenant || null,
    region: input.region || null,
    audience: input.audience || null,
    scopes: toArray(input.scopes).filter(Boolean),
    secret_refs: secretRefs,
    default_parameters: isPlainObject(input.default_parameters) ? cloneObject(input.default_parameters) : {},
    headers: isPlainObject(input.headers) ? cloneObject(input.headers) : {},
    smoke_test: isPlainObject(input.smoke_test) ? cloneObject(input.smoke_test) : null,
  };

  const validation = validateAuthProfile(profile);
  if (!validation.valid) {
    const err = new Error(`Invalid auth profile: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_AUTH_PROFILE';
    err.validation = validation;
    throw err;
  }

  return profile;
}

function validateAuthProfile(profile) {
  const errors = [];

  if (!isPlainObject(profile)) {
    return { valid: false, errors: ['auth profile must be an object'] };
  }

  if (typeof profile.name !== 'string' || !profile.name.trim()) {
    errors.push('profile.name is required');
  }

  if (typeof profile.connector_id !== 'string' || !profile.connector_id.trim()) {
    errors.push('profile.connector_id is required');
  }

  if (!AUTH_TYPES.includes(profile.auth_type)) {
    errors.push(`profile.auth_type must be one of: ${AUTH_TYPES.join(', ')}`);
  }

  if (profile.base_url != null && (typeof profile.base_url !== 'string' || !profile.base_url.trim())) {
    errors.push('profile.base_url must be a non-empty string when provided');
  }

  if (profile.token_url != null && (typeof profile.token_url !== 'string' || !profile.token_url.trim())) {
    errors.push('profile.token_url must be a non-empty string when provided');
  }

  if (!isPlainObject(profile.secret_refs)) {
    errors.push('profile.secret_refs must be an object');
  } else {
    for (const [name, ref] of Object.entries(profile.secret_refs)) {
      if (!ref || !SECRET_REF_TYPES.includes(ref.type) || typeof ref.value !== 'string' || !ref.value.trim()) {
        errors.push(`profile.secret_refs.${name} must be { type, value } with supported local-first reference types`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function resolveConnectorProfile(config = {}, connectorId, profileName = 'default') {
  const profile = config?.connector_profiles?.[connectorId]?.[profileName];
  if (!profile) {
    const err = new Error(`No connector profile found for ${connectorId}.${profileName}`);
    err.code = 'CONNECTOR_PROFILE_NOT_FOUND';
    throw err;
  }
  return createAuthProfile({
    name: profileName,
    connector_id: connectorId,
    ...profile,
  });
}

function resolveSecretRefs(profile, options = {}) {
  const env = options.env || process.env;
  const refs = profile?.secret_refs || {};
  const resolved = {};

  for (const [name, ref] of Object.entries(refs)) {
    if (!ref) continue;
    if (ref.type === 'env') {
      resolved[name] = env[ref.value] || null;
      continue;
    }
    if (ref.type === 'file') {
      try {
        resolved[name] = fs.readFileSync(ref.value, 'utf-8').trim();
      } catch {
        resolved[name] = null;
      }
      continue;
    }
    if (ref.type === 'command') {
      try {
        resolved[name] = execSync(ref.value, {
          cwd: options.cwd || process.cwd(),
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: Number.isFinite(options.secret_command_timeout_ms)
            ? options.secret_command_timeout_ms
            : 5_000,
        }).trim();
      } catch {
        resolved[name] = null;
      }
      continue;
    }
    resolved[name] = null;
  }

  return resolved;
}

function mergeProfileDefaults(spec, profile) {
  if (!profile || !isPlainObject(profile.default_parameters) || Object.keys(profile.default_parameters).length === 0) {
    return spec;
  }

  return {
    ...spec,
    parameters: {
      ...cloneObject(profile.default_parameters),
      ...cloneObject(spec.parameters || {}),
    },
  };
}

function createPaginationState(input = {}) {
  const pagination = normalizePagination(input);
  return {
    mode: pagination.mode,
    limit: pagination.limit,
    max_pages: pagination.max_pages,
    page: pagination.page,
    offset: pagination.offset,
    cursor: pagination.cursor,
    pages_fetched: 0,
    exhausted: false,
  };
}

function advancePaginationState(state, next = {}) {
  const current = { ...state };
  current.pages_fetched += 1;
  if (current.mode === 'cursor' || current.mode === 'token') {
    current.cursor = next.cursor || null;
    current.exhausted = !current.cursor || current.pages_fetched >= current.max_pages;
  } else if (current.mode === 'page') {
    current.page += 1;
    current.exhausted = next.has_more === false || current.pages_fetched >= current.max_pages;
  } else if (current.mode === 'offset') {
    current.offset += current.limit;
    current.exhausted = next.has_more === false || current.pages_fetched >= current.max_pages;
  } else {
    current.exhausted = true;
  }
  return current;
}

function computeBackoffDelayMs(attempt, baseDelayMs = DEFAULT_BACKOFF_MS, maxDelayMs = 30_000) {
  const safeAttempt = Math.max(0, Math.trunc(attempt));
  return Math.min(maxDelayMs, baseDelayMs * (2 ** safeAttempt));
}

function createConnectorRegistry(adapters = []) {
  const registry = new Map();

  for (const adapter of adapters) {
    const validation = validateConnectorAdapter(adapter);
    if (!validation.valid) {
      const err = new Error(`Invalid connector adapter: ${validation.errors.join('; ')}`);
      err.code = 'INVALID_CONNECTOR_ADAPTER';
      err.validation = validation;
      throw err;
    }
    registry.set(adapter.capabilities.id, adapter);
  }

  return {
    get(id) {
      return registry.get(id) || null;
    },
    has(id) {
      return registry.has(id);
    },
    list() {
      return Array.from(registry.values()).map(adapter => cloneObject(adapter.capabilities));
    },
  };
}

function validateConnectorCapabilities(capabilities) {
  const errors = [];

  if (!isPlainObject(capabilities)) {
    return { valid: false, errors: ['capabilities must be an object'] };
  }

  if (typeof capabilities.id !== 'string' || !capabilities.id.trim()) {
    errors.push('capabilities.id is required');
  }

  for (const kind of capabilities.dataset_kinds || []) {
    if (!DATASET_KINDS.includes(kind)) {
      errors.push(`Unsupported dataset kind: ${kind}`);
    }
  }

  for (const mode of capabilities.pagination_modes || []) {
    if (!PAGINATION_MODES.includes(mode)) {
      errors.push(`Unsupported pagination mode: ${mode}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateConnectorAdapter(adapter = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(adapter)) {
    return { valid: false, errors: ['adapter must be an object'], warnings };
  }

  const capabilities = adapter.capabilities || {};
  const capValidation = validateConnectorCapabilities(capabilities);
  if (!capValidation.valid) {
    errors.push(...capValidation.errors);
  }

  const requiredFns = ['prepareQuery', 'executeRequest', 'normalizeResponse'];
  for (const fn of requiredFns) {
    if (typeof adapter[fn] !== 'function') {
      errors.push(`adapter.${fn} must be a function`);
    }
  }

  const optionalFns = ['preflight', 'emitArtifacts', 'onError'];
  for (const fn of optionalFns) {
    if (adapter[fn] !== undefined && typeof adapter[fn] !== 'function') {
      errors.push(`adapter.${fn} must be a function when provided`);
    }
  }

  if (!adapter.lifecycle) {
    warnings.push('adapter.lifecycle not provided; default lifecycle stages will be used');
  } else {
    for (const stage of adapter.lifecycle) {
      if (!LIFECYCLE_STAGES.includes(stage)) {
        errors.push(`Unsupported lifecycle stage: ${stage}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function createWarning(code, message, details = null) {
  return {
    code,
    message,
    details,
  };
}

function createRuntimeError(code, message, details = null) {
  return {
    code,
    message,
    retryable: details?.retryable === true,
    stage: details?.stage || null,
    connector_id: details?.connector_id || null,
    details: isPlainObject(details) ? cloneObject(details) : details,
  };
}

function createResultEnvelope(spec, input = {}) {
  const events = toArray(input.events).filter(isPlainObject);
  const entities = toArray(input.entities).filter(isPlainObject);
  const relationships = toArray(input.relationships).filter(isPlainObject);
  const evidence = toArray(input.evidence).filter(isPlainObject);
  const warnings = toArray(input.warnings).filter(Boolean);
  const errors = toArray(input.errors).filter(Boolean);
  const startedAt = input.started_at || nowIso();
  const completedAt = input.completed_at || nowIso();
  const duration = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
  const status = input.status || inferStatus({ events, entities, evidence, errors, warnings });

  if (!RESULT_STATUSES.includes(status)) {
    throw new Error(`Invalid result status: ${status}`);
  }

  return {
    version: RESULT_ENVELOPE_VERSION,
    query_id: spec.query_id,
    connector: cloneObject(spec.connector),
    dataset: cloneObject(spec.dataset),
    status,
    time_window: cloneObject(spec.time_window),
    pagination: {
      mode: spec.pagination.mode,
      requested_limit: spec.pagination.limit,
      max_pages: spec.pagination.max_pages,
      pages_fetched: Number.isFinite(input.pages_fetched) ? input.pages_fetched : 1,
      next_cursor: input.next_cursor || null,
      exhausted: input.exhausted !== false,
    },
    execution: {
      request_id: spec.execution.request_id,
      profile: spec.execution.profile,
      timeout_ms: spec.execution.timeout_ms,
      consistency: spec.execution.consistency,
      dry_run: spec.execution.dry_run,
    },
    timing: {
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: duration,
    },
    counts: {
      events: events.length,
      entities: entities.length,
      relationships: relationships.length,
      evidence: evidence.length,
      warnings: warnings.length,
      errors: errors.length,
      raw_records: Number.isFinite(input.raw_records) ? input.raw_records : events.length + entities.length,
    },
    events,
    entities,
    relationships,
    evidence,
    warnings: warnings.map(item => typeof item === 'string' ? createWarning('runtime_warning', item) : item),
    errors: errors.map(item => typeof item === 'string' ? createRuntimeError('runtime_error', item) : item),
    metadata: isPlainObject(input.metadata) ? cloneObject(input.metadata) : {},
  };
}

function inferStatus({ events, entities, evidence, errors }) {
  if (errors.length > 0 && (events.length > 0 || entities.length > 0 || evidence.length > 0)) {
    return 'partial';
  }
  if (errors.length > 0) {
    return 'error';
  }
  if (events.length === 0 && entities.length === 0 && evidence.length === 0) {
    return 'empty';
  }
  return 'ok';
}

function isRetryableError(err) {
  return err?.retryable === true || err?.code === 'ETIMEDOUT' || err?.code === 'RATE_LIMITED';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(timeoutMessage || `Timed out after ${timeoutMs}ms`);
      err.code = 'ETIMEDOUT';
      err.retryable = true;
      reject(err);
    }, timeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function mergePage(accumulator, normalized) {
  accumulator.events.push(...toArray(normalized.events).filter(isPlainObject));
  accumulator.entities.push(...toArray(normalized.entities).filter(isPlainObject));
  accumulator.relationships.push(...toArray(normalized.relationships).filter(isPlainObject));
  accumulator.evidence.push(...toArray(normalized.evidence).filter(isPlainObject));
  accumulator.warnings.push(...toArray(normalized.warnings).filter(Boolean));
  accumulator.errors.push(...toArray(normalized.errors).filter(Boolean));
  accumulator.metadata.push(isPlainObject(normalized.metadata) ? cloneObject(normalized.metadata) : {});
}

async function executeQuerySpec(specInput, adapterOrRegistry, options = {}) {
  const inputSpec = specInput?.version ? specInput : createQuerySpec(specInput);
  const adapter = typeof adapterOrRegistry?.get === 'function'
    ? adapterOrRegistry.get(inputSpec.connector.id)
    : adapterOrRegistry;

  if (!adapter) {
    throw new Error(`No adapter available for connector ${inputSpec.connector.id}`);
  }

  const adapterValidation = validateConnectorAdapter(adapter);
  if (!adapterValidation.valid) {
    throw new Error(`Invalid connector adapter: ${adapterValidation.errors.join('; ')}`);
  }

  const accumulator = {
    events: [],
    entities: [],
    relationships: [],
    evidence: [],
    warnings: [],
    errors: [],
    metadata: [],
    status_override: null,
  };
  const startedAt = nowIso();
  let stage = 'preflight';
  let paginationState = createPaginationState(inputSpec.pagination);
  let profile = options.profile || null;
  let secrets = {};
  let artifacts = { query_log: null, receipts: [] };

  if (!profile && options.config?.connector_profiles?.[inputSpec.connector.id]) {
    try {
      profile = resolveConnectorProfile(options.config, inputSpec.connector.id, inputSpec.connector.profile);
    } catch {
      profile = null;
    }
  }

  if (profile) {
    secrets = resolveSecretRefs(profile, options);
  }

  const spec = mergeProfileDefaults(inputSpec, profile);

  try {
    if (typeof adapter.preflight === 'function') {
      const preflightResult = await Promise.resolve(adapter.preflight({ spec, profile, secrets, options }));
      if (preflightResult?.warnings) {
        accumulator.warnings.push(...toArray(preflightResult.warnings));
      }
    }

    while (!paginationState.exhausted && paginationState.pages_fetched < paginationState.max_pages) {
      stage = 'prepare';
      const prepared = await Promise.resolve(adapter.prepareQuery({
        spec,
        profile,
        secrets,
        pagination: paginationState,
        options,
      }));

      let response;
      let attempt = 0;
      while (true) {
        try {
          stage = 'execute';
          response = await withTimeout(
            Promise.resolve(adapter.executeRequest({
              spec,
              profile,
              secrets,
              pagination: paginationState,
              prepared,
              options,
            })),
            spec.execution.timeout_ms,
            `Connector ${spec.connector.id} timed out during execution`
          );
          break;
        } catch (err) {
          if (attempt >= spec.execution.max_retries || !isRetryableError(err)) {
            throw createRuntimeError(err.code || 'EXECUTION_FAILED', err.message, {
              retryable: err.retryable === true,
              stage,
              connector_id: spec.connector.id,
              attempt,
            });
          }

          if (typeof options.onRetry === 'function') {
            options.onRetry({ attempt, error: err, stage, connector_id: spec.connector.id });
          }

          const delay = computeBackoffDelayMs(attempt, spec.execution.backoff_ms);
          const wait = typeof options.sleep === 'function' ? options.sleep : sleep;
          await wait(delay);
          attempt += 1;
        }
      }

      stage = 'normalize';
      const normalized = await Promise.resolve(adapter.normalizeResponse({
        spec,
        profile,
        secrets,
        pagination: paginationState,
        prepared,
        response,
        options,
      })) || {};

      mergePage(accumulator, normalized);

      // Capture status_override from normalizer (first non-null wins)
      if (normalized.status_override && !accumulator.status_override) {
        accumulator.status_override = normalized.status_override;
      }

      paginationState = advancePaginationState(paginationState, {
        cursor: normalized.next_cursor || null,
        has_more: normalized.has_more,
      });

      if (spec.pagination.mode === 'none' || normalized.has_more === false) {
        paginationState.exhausted = true;
      }
    }
  } catch (err) {
    const runtimeError = err.code && err.message ? err : createRuntimeError(
      err.code || 'RUNTIME_FAILURE',
      err.message || String(err),
      { stage, connector_id: spec.connector.id, retryable: err.retryable === true }
    );
    accumulator.errors.push(runtimeError);
  }

  // ── REDUCE stage: template-based event grouping ──
  let templateMetadata = null;
  if (accumulator.events.length > 0 && options.reduce !== false) {
    try {
      stage = 'reduce';
      const { reduceEvents } = require('./drain.cjs');
      templateMetadata = reduceEvents(accumulator.events, typeof options.reduce === 'object' ? options.reduce : {});
    } catch (reduceErr) {
      accumulator.warnings.push(createWarning('REDUCE_FAILED', `Template reduction failed: ${reduceErr.message}`));
    }
  }

  const envelope = createResultEnvelope(spec, {
    started_at: startedAt,
    completed_at: nowIso(),
    pages_fetched: paginationState.pages_fetched,
    status: accumulator.status_override || undefined,
    events: accumulator.events,
    entities: accumulator.entities,
    relationships: accumulator.relationships,
    evidence: accumulator.evidence,
    warnings: accumulator.warnings,
    errors: accumulator.errors,
    metadata: {
      ...(accumulator.metadata[accumulator.metadata.length - 1] || {}),
      pages: accumulator.metadata,
      connector_id: spec.connector.id,
      artifact_ids: [],
      last_stage: stage,
      ...(templateMetadata ? { templates: templateMetadata } : {}),
    },
  });

  if (options.cwd) {
    const { writeRuntimeArtifacts } = require('./evidence.cjs');
    artifacts = writeRuntimeArtifacts(options.cwd, spec, envelope, options.artifacts || {});
    envelope.metadata.artifact_ids = [
      artifacts.query_log?.id,
      ...artifacts.receipts.map(item => item.id),
      artifacts.manifest?.id,
    ].filter(Boolean);

    if (envelope.errors.length > 0) {
      envelope.errors = envelope.errors.map(item => ({
        ...item,
        details: {
          ...(isPlainObject(item.details) ? item.details : {}),
          partial_artifact_ids: envelope.metadata.artifact_ids,
        },
      }));
    }
  }

  return {
    envelope,
    artifacts,
    pagination: paginationState,
  };
}

function trimTrailingSlash(value = '') {
  return String(value).replace(/\/+$/, '');
}

function trimLeadingSlash(value = '') {
  return String(value).replace(/^\/+/, '');
}

function joinUrl(baseUrl, pathSuffix = '') {
  return `${trimTrailingSlash(baseUrl)}/${trimLeadingSlash(pathSuffix)}`;
}

function buildUrl(baseUrl, pathSuffix, query = {}) {
  const url = new URL(joinUrl(baseUrl, pathSuffix));
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function headersToObject(headers) {
  if (!headers) return {};
  if (typeof headers.entries === 'function') {
    return Object.fromEntries(Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), value]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function getSecret(secrets = {}, ...names) {
  for (const name of names) {
    if (typeof secrets?.[name] === 'string' && secrets[name].trim()) {
      return secrets[name].trim();
    }
  }
  return null;
}

function normalizeBaseUrl(profile, fallback) {
  return trimTrailingSlash(profile?.base_url || fallback || '');
}

function base64UrlEncode(input) {
  const value = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(String(input)).toString('base64');
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function toUnixSeconds(iso) {
  return Math.floor(Date.parse(iso) / 1000);
}

function toIsoOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return null;
}

function makeStableId(connectorId, seed) {
  const digest = crypto.createHash('sha1').update(`${connectorId}:${seed}`).digest('hex').slice(0, 16);
  return `${connectorId}-${digest}`;
}

function addEntity(target, connectorId, kind, value, attributes = {}) {
  if (value === undefined || value === null || value === '') return;
  const normalizedValue = String(value);
  const existing = target.find(item => item.kind === kind && item.value === normalizedValue);
  if (existing) return;
  target.push({
    id: makeStableId(connectorId, `${kind}:${normalizedValue}`),
    kind,
    value: normalizedValue,
    connector_id: connectorId,
    attributes: cloneObject(attributes),
  });
}

function getNestedValue(obj, pathSpec) {
  if (!obj || typeof obj !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(obj, pathSpec)) {
    return obj[pathSpec];
  }
  const segments = pathSpec.split('.');
  let cursor = obj;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return null;
    cursor = cursor[segment];
  }
  return cursor === undefined ? null : cursor;
}

function addEntitiesFromRecord(target, connectorId, record, mappings = []) {
  for (const mapping of mappings) {
    const value = Array.isArray(mapping.paths)
      ? mapping.paths.map(item => getNestedValue(record, item)).find(item => item !== null && item !== undefined && item !== '')
      : getNestedValue(record, mapping.path);
    if (value === null || value === undefined || value === '') continue;
    addEntity(target, connectorId, mapping.kind, value, {
      path: mapping.path || mapping.paths?.join(','),
      source: mapping.source || 'record',
    });
  }
}

function inferPrimaryTimestamp(record, keys = []) {
  for (const key of keys) {
    const value = getNestedValue(record, key);
    const iso = toIsoOrNull(value);
    if (iso) return iso;
  }
  return null;
}

function inferPrimaryId(connectorId, record, keys = [], fallbackSeed = null) {
  for (const key of keys) {
    const value = getNestedValue(record, key);
    if (value !== null && value !== undefined && value !== '') {
      return String(value);
    }
  }
  return makeStableId(connectorId, fallbackSeed || JSON.stringify(record));
}

function normalizeEvent(connectorId, record, options = {}) {
  const timestamp = inferPrimaryTimestamp(record, options.timestampPaths || ['timestamp', 'createdDateTime', 'published', 'EventTime']);
  const id = inferPrimaryId(connectorId, record, options.idPaths || ['id', 'EventId', 'uuid'], timestamp || JSON.stringify(record));
  return {
    id,
    connector_id: connectorId,
    dataset_kind: options.datasetKind || 'events',
    timestamp,
    title: options.title || getNestedValue(record, options.titlePath || 'title') || getNestedValue(record, 'eventType') || getNestedValue(record, 'EventName') || null,
    summary: options.summary || getNestedValue(record, options.summaryPath || 'description') || null,
    raw: cloneObject(record),
  };
}

function parseResponseBody(text, contentType) {
  if (!text) return null;
  if (contentType?.includes('application/json') || contentType?.includes('+json')) {
    return JSON.parse(text);
  }
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  if (trimmed.includes('\n')) {
    const lines = trimmed
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const objects = [];
    for (const line of lines) {
      try {
        objects.push(JSON.parse(line));
      } catch {
        return text;
      }
    }
    return objects;
  }
  return text;
}

async function getOauthClientCredentialsToken(profile, secrets, requestAuth = {}, options = {}) {
  const directToken = getSecret(secrets, 'access_token', 'token');
  if (directToken) {
    return directToken;
  }

  const tokenUrl = requestAuth.token_url
    || profile?.token_url
    || (profile?.tenant
      ? `https://login.microsoftonline.com/${profile.tenant}/oauth2/v2.0/token`
      : null);
  const clientId = getSecret(secrets, 'client_id');
  const clientSecret = getSecret(secrets, 'client_secret');
  if (!tokenUrl || !clientId || !clientSecret) {
    const err = new Error('oauth_client_credentials requires token_url (or tenant), client_id, and client_secret');
    err.code = 'OAUTH_PROFILE_INCOMPLETE';
    throw err;
  }

  const cache = options.token_cache || (options.token_cache = new Map());
  const cacheKey = JSON.stringify([tokenUrl, clientId, profile?.scopes || [], requestAuth.scope, requestAuth.resource]);
  const cached = cache.get(cacheKey);
  if (cached && cached.expires_at > Date.now() + 30_000) {
    return cached.access_token;
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  const scope = requestAuth.scope || (Array.isArray(profile?.scopes) && profile.scopes.length > 0 ? profile.scopes.join(' ') : null);
  if (scope) {
    body.set('scope', scope);
  }
  if (requestAuth.resource || profile?.audience) {
    body.set(requestAuth.resource_param || 'resource', requestAuth.resource || profile.audience);
  }

  const response = await performHttpRequest({
    method: 'POST',
    url: tokenUrl,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  }, options);

  const token = response.data?.access_token;
  if (!token) {
    const err = new Error('OAuth token response did not include access_token');
    err.code = 'OAUTH_TOKEN_MISSING';
    throw err;
  }

  cache.set(cacheKey, {
    access_token: token,
    expires_at: Date.now() + ((response.data.expires_in || 3600) * 1000),
  });
  return token;
}

async function getGoogleServiceAccountToken(profile, secrets, requestAuth = {}, options = {}) {
  const directToken = getSecret(secrets, 'access_token', 'token');
  if (directToken) {
    return directToken;
  }

  const rawJson = decodeMaybeJson(getSecret(secrets, 'service_account_json', 'credentials_json'));
  const credentials = isPlainObject(rawJson) ? rawJson : {};
  const clientEmail = getSecret(secrets, 'client_email') || credentials.client_email;
  const privateKey = getSecret(secrets, 'private_key') || credentials.private_key;
  const tokenUrl = requestAuth.token_url || profile?.token_url || credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const scope = requestAuth.scope || (Array.isArray(profile?.scopes) && profile.scopes.length > 0
    ? profile.scopes.join(' ')
    : 'https://www.googleapis.com/auth/logging.read');
  if (!clientEmail || !privateKey) {
    const err = new Error('service_account requires client_email and private_key or service_account_json');
    err.code = 'SERVICE_ACCOUNT_INCOMPLETE';
    throw err;
  }

  const cache = options.token_cache || (options.token_cache = new Map());
  const cacheKey = JSON.stringify([tokenUrl, clientEmail, scope]);
  const cached = cache.get(cacheKey);
  if (cached && cached.expires_at > Date.now() + 30_000) {
    return cached.access_token;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: tokenUrl,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsigned}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams();
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  body.set('assertion', assertion);

  const response = await performHttpRequest({
    method: 'POST',
    url: tokenUrl,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  }, options);

  const token = response.data?.access_token;
  if (!token) {
    const err = new Error('Service-account token response did not include access_token');
    err.code = 'SERVICE_ACCOUNT_TOKEN_MISSING';
    throw err;
  }

  cache.set(cacheKey, {
    access_token: token,
    expires_at: Date.now() + ((response.data.expires_in || 3600) * 1000),
  });
  return token;
}

function signAwsRequest(request, profile, secrets, requestAuth = {}) {
  const accessKeyId = getSecret(secrets, 'access_key_id', 'aws_access_key_id');
  const secretAccessKey = getSecret(secrets, 'secret_access_key', 'aws_secret_access_key');
  const sessionToken = getSecret(secrets, 'session_token', 'aws_session_token');
  const region = profile?.region || requestAuth.region;
  const service = requestAuth.service || 'cloudtrail';
  if (!accessKeyId || !secretAccessKey || !region) {
    const err = new Error('sigv4 requires access_key_id, secret_access_key, and region');
    err.code = 'SIGV4_PROFILE_INCOMPLETE';
    throw err;
  }

  const url = new URL(request.url);
  const method = (request.method || 'GET').toUpperCase();
  const body = request.body || '';
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const headers = {
    ...normalizeHeaders(request.headers),
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': bodyHash,
  };
  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken;
  }

  const signedHeaderNames = Object.keys(headers).map(key => key.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames.map(key => `${key}:${String(headers[key]).trim()}\n`).join('');
  const canonicalQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalRequest = [
    method,
    url.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames.join(';'),
    bodyHash,
  ].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  headers.authorization = [
    'AWS4-HMAC-SHA256 Credential=' + `${accessKeyId}/${scope}`,
    'SignedHeaders=' + signedHeaderNames.join(';'),
    'Signature=' + signature,
  ].join(', ');
  return headers;
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key.toLowerCase(), value])
  );
}

async function authorizeRequest(request, profile, secrets, requestAuth = {}, options = {}) {
  const headers = {
    ...normalizeHeaders(profile?.headers || {}),
    ...normalizeHeaders(request.headers || {}),
  };
  const authType = requestAuth.type || profile?.auth_type || null;

  if (authType === 'basic') {
    const username = getSecret(secrets, 'username');
    const password = getSecret(secrets, 'password');
    if (!username || !password) {
      const err = new Error('basic auth requires username and password');
      err.code = 'BASIC_AUTH_INCOMPLETE';
      throw err;
    }
    headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (authType === 'bearer') {
    const token = getSecret(secrets, 'access_token', 'token');
    if (!token) {
      const err = new Error('bearer auth requires access_token or token');
      err.code = 'BEARER_AUTH_INCOMPLETE';
      throw err;
    }
    headers.authorization = `Bearer ${token}`;
  } else if (authType === 'api_key') {
    const apiKey = getSecret(secrets, 'api_key', 'token', 'access_token');
    if (!apiKey) {
      const err = new Error('api_key auth requires api_key');
      err.code = 'API_KEY_AUTH_INCOMPLETE';
      throw err;
    }
    const headerName = (requestAuth.header || 'authorization').toLowerCase();
    const prefix = requestAuth.prefix || 'ApiKey';
    headers[headerName] = headerName === 'authorization' ? `${prefix} ${apiKey}` : apiKey;
  } else if (authType === 'oauth_client_credentials') {
    const token = await getOauthClientCredentialsToken(profile, secrets, requestAuth, options);
    headers.authorization = `Bearer ${token}`;
  } else if (authType === 'service_account') {
    const token = await getGoogleServiceAccountToken(profile, secrets, requestAuth, options);
    headers.authorization = `Bearer ${token}`;
  } else if (authType === 'session') {
    const sessionValue = getSecret(secrets, 'session', 'cookie');
    if (!sessionValue) {
      const err = new Error('session auth requires session or cookie');
      err.code = 'SESSION_AUTH_INCOMPLETE';
      throw err;
    }
    headers.cookie = sessionValue;
  } else if (authType === 'sigv4') {
    return signAwsRequest({ ...request, headers }, profile, secrets, requestAuth);
  }

  return headers;
}

async function performHttpRequest(request, options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  if (typeof fetchImpl !== 'function') {
    const err = new Error('No fetch implementation available for runtime HTTP execution');
    err.code = 'FETCH_UNAVAILABLE';
    throw err;
  }

  const response = await fetchImpl(request.url, {
    method: request.method || 'GET',
    headers: request.headers,
    body: request.body,
  });
  const text = await response.text();
  const headers = headersToObject(response.headers);
  const contentType = headers['content-type'] || '';
  const data = parseResponseBody(text, contentType);

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} from ${request.url}`);
    err.code = `HTTP_${response.status}`;
    err.status = response.status;
    err.retryable = response.status === 429 || response.status >= 500;
    err.response = { status: response.status, headers, data, text };
    throw err;
  }

  return {
    status: response.status,
    headers,
    data,
    text,
  };
}

async function executeConnectorRequest({ request, profile, secrets, auth, options }) {
  const headers = await authorizeRequest(request, profile, secrets, auth, options);
  return performHttpRequest({
    ...request,
    headers,
  }, options);
}

const CONNECTOR_READINESS_WEIGHTS = Object.freeze({
  adapter_registered: 10,
  profile_found: 15,
  profile_valid: 15,
  auth_material: 20,
  preflight_ready: 20,
  smoke_spec: 10,
  live_smoke: 10,
});

const BUILT_IN_SMOKE_SPECS = Object.freeze({
  okta: Object.freeze({
    dataset: 'identity',
    language: 'api',
    query: 'okta system log smoke',
    pagination_mode: 'token',
    limit: 1,
    max_pages: 1,
    lookback_minutes: 60,
    parameters: {
      sortOrder: 'DESCENDING',
    },
  }),
  m365: Object.freeze({
    dataset: 'identity',
    language: 'odata',
    query: 'signIns',
    pagination_mode: 'token',
    limit: 1,
    max_pages: 1,
    lookback_minutes: 60,
  }),
  crowdstrike: Object.freeze({
    dataset: 'alerts',
    language: 'fql',
    query: "name:'*'",
    pagination_mode: 'token',
    limit: 1,
    max_pages: 1,
    lookback_minutes: 60,
  }),
  aws: Object.freeze({
    dataset: 'cloud',
    language: 'api',
    query: 'LookupEvents',
    pagination_mode: 'token',
    limit: 1,
    max_pages: 1,
    lookback_minutes: 60,
  }),
  gcp: Object.freeze({
    dataset: 'cloud',
    language: 'logging-filter',
    query: 'timestamp >= "1970-01-01T00:00:00Z"',
    pagination_mode: 'token',
    limit: 1,
    max_pages: 1,
    lookback_minutes: 60,
  }),
});

function selectConnectorProfileName(config = {}, connectorId, requestedProfileName = null) {
  if (requestedProfileName) return requestedProfileName;
  const availableProfiles = Object.keys(config?.connector_profiles?.[connectorId] || {});
  if (availableProfiles.includes('default')) return 'default';
  return availableProfiles[0] || 'default';
}

function getRequiredSecretGroupsForAuthType(authType) {
  switch (authType) {
    case 'basic':
      return [
        { label: 'username', names: ['username'] },
        { label: 'password', names: ['password'] },
      ];
    case 'bearer':
      return [
        { label: 'access_token', names: ['access_token', 'token'] },
      ];
    case 'api_key':
      return [
        { label: 'api_key', names: ['api_key', 'token', 'access_token'] },
      ];
    case 'oauth_client_credentials':
      return [
        { label: 'access_token', names: ['access_token', 'token'], optional: true },
        { label: 'client_id', names: ['client_id'] },
        { label: 'client_secret', names: ['client_secret'] },
      ];
    case 'service_account':
      return [
        { label: 'access_token', names: ['access_token', 'token'], optional: true },
        { label: 'service_account_json', names: ['service_account_json', 'credentials_json'], optional: true },
        { label: 'client_email', names: ['client_email'], optional: true },
        { label: 'private_key', names: ['private_key'], optional: true },
      ];
    case 'session':
      return [
        { label: 'session', names: ['session', 'cookie'] },
      ];
    case 'sigv4':
      return [
        { label: 'access_key_id', names: ['access_key_id', 'aws_access_key_id'] },
        { label: 'secret_access_key', names: ['secret_access_key', 'aws_secret_access_key'] },
        { label: 'session_token', names: ['session_token', 'aws_session_token'], optional: true },
      ];
    default:
      return [];
  }
}

function evaluateAuthReadiness(profile, secrets = {}) {
  const authType = profile?.auth_type || null;
  const checks = [];
  const missing = [];
  const resolvedSecretNames = [];

  const recordGroup = (group) => {
    const satisfiedBy = group.names.find(name => getSecret(secrets, name));
    if (satisfiedBy) {
      resolvedSecretNames.push(satisfiedBy);
    } else if (!group.optional) {
      missing.push(group.label);
    }
    checks.push({
      label: group.label,
      any_of: group.names.slice(),
      optional: group.optional === true,
      satisfied_by: satisfiedBy || null,
      status: satisfiedBy ? 'pass' : (group.optional === true ? 'skip' : 'fail'),
    });
    return satisfiedBy || null;
  };

  const directToken = ['oauth_client_credentials', 'service_account'].includes(authType)
    ? recordGroup({ label: 'access_token', names: ['access_token', 'token'], optional: true })
    : null;

  if (authType === 'oauth_client_credentials') {
    if (!directToken) {
      recordGroup({ label: 'client_id', names: ['client_id'] });
      recordGroup({ label: 'client_secret', names: ['client_secret'] });
      if (!profile?.token_url && !profile?.tenant) {
        missing.push('token_url_or_tenant');
      }
    }
  } else if (authType === 'service_account') {
    if (!directToken) {
      const serviceAccountJson = recordGroup({ label: 'service_account_json', names: ['service_account_json', 'credentials_json'], optional: true });
      if (!serviceAccountJson) {
        const clientEmail = recordGroup({ label: 'client_email', names: ['client_email'], optional: true });
        const privateKey = recordGroup({ label: 'private_key', names: ['private_key'], optional: true });
        if (!clientEmail || !privateKey) {
          missing.push('client_email_or_service_account_json');
          missing.push('private_key_or_service_account_json');
        }
      }
    }
  } else {
    for (const group of getRequiredSecretGroupsForAuthType(authType)) {
      recordGroup(group);
    }
  }

  if (authType === 'sigv4' && !profile?.region) {
    missing.push('region');
  }

  return {
    ready: missing.length === 0,
    auth_type: authType,
    checks,
    missing: Array.from(new Set(missing)),
    resolved_secret_names: Array.from(new Set(resolvedSecretNames)),
  };
}

function getBuiltInSmokeDefinition(connectorId) {
  return BUILT_IN_SMOKE_SPECS[connectorId]
    ? cloneObject(BUILT_IN_SMOKE_SPECS[connectorId])
    : null;
}

function createReadinessSpec(connectorId, profileName, capabilities, profile, definition = {}) {
  const mergedParameters = {
    ...(isPlainObject(profile?.default_parameters) ? cloneObject(profile.default_parameters) : {}),
    ...(isPlainObject(definition.parameters) ? cloneObject(definition.parameters) : {}),
  };
  const paginationMode = definition.pagination_mode
    || capabilities?.pagination_modes?.[0]
    || 'none';
  const limit = Number.isFinite(definition.limit) ? definition.limit : 1;
  const maxPages = Number.isFinite(definition.max_pages) ? definition.max_pages : 1;

  const timeWindow = (definition.start && definition.end)
    ? { start: definition.start, end: definition.end }
    : { lookback_minutes: Number.isFinite(definition.lookback_minutes) ? definition.lookback_minutes : 60 };

  return createQuerySpec({
    connector: {
      id: connectorId,
      profile: profileName,
      tenant: definition.tenant || profile?.tenant || null,
      region: definition.region || profile?.region || null,
    },
    dataset: {
      kind: definition.dataset || capabilities?.dataset_kinds?.[0] || 'events',
      name: definition.dataset_name || null,
    },
    time_window: timeWindow,
    parameters: mergedParameters,
    pagination: {
      mode: paginationMode,
      limit,
      max_pages: maxPages,
    },
    execution: {
      profile: profileName,
      dry_run: definition.dry_run === true,
      consistency: definition.consistency || 'best_effort',
    },
    query: {
      language: definition.language || capabilities?.languages?.[0] || 'native',
      statement: definition.query || 'connector readiness preflight',
    },
    evidence: {
      receipt_policy: 'none',
      tags: ['smoke_test', `connector:${connectorId}`],
    },
  });
}

// --- Default registry accessor ---
// assessConnectorReadiness, assessRuntimeReadiness, and buildConnectorSmokeSpec
// accept options.registry for the connector registry. When no registry is provided
// they fall back to createBuiltInConnectorRegistry() from runtime.cjs.
// This lazy require avoids a circular dependency at module load time (connector-sdk.cjs
// is loaded first, runtime.cjs imports from it). The lazy require is only invoked at
// function call time, when both modules are fully loaded.
function _getDefaultRegistry() {
  return require('./runtime.cjs').createBuiltInConnectorRegistry();
}

function buildConnectorSmokeSpec(connectorId, config = {}, options = {}) {
  const registry = options.registry || _getDefaultRegistry();
  const adapter = registry.get(connectorId);
  if (!adapter) {
    return {
      supported: false,
      connector_id: connectorId,
      reason: `No adapter available for connector ${connectorId}`,
    };
  }

  const profileName = selectConnectorProfileName(config, connectorId, options.profile || null);
  let profile = null;
  try {
    profile = resolveConnectorProfile(config, connectorId, profileName);
  } catch { /* intentionally empty */ }

  const hasCliDefinition = Boolean(
    options.query
      || options.dataset
      || options.language
      || options.start
      || options.end
      || Number.isFinite(options.lookback_minutes)
      || Number.isFinite(options.lookback_hours)
      || (isPlainObject(options.parameters) && Object.keys(options.parameters).length > 0)
  );

  const cliDefinition = hasCliDefinition
    ? {
        dataset: options.dataset || null,
        language: options.language || null,
        query: options.query || null,
        parameters: isPlainObject(options.parameters) ? cloneObject(options.parameters) : {},
        pagination_mode: options.pagination_mode || null,
        limit: Number.isFinite(options.limit) ? options.limit : undefined,
        max_pages: Number.isFinite(options.max_pages) ? options.max_pages : undefined,
        start: options.start || null,
        end: options.end || null,
        lookback_minutes: Number.isFinite(options.lookback_minutes)
          ? options.lookback_minutes
          : (Number.isFinite(options.lookback_hours) ? options.lookback_hours * 60 : undefined),
      }
    : null;
  const profileDefinition = isPlainObject(profile?.smoke_test) ? cloneObject(profile.smoke_test) : null;
  const builtInDefinition = getBuiltInSmokeDefinition(connectorId);

  let source = null;
  let definition = null;
  if (cliDefinition) {
    source = 'cli';
    definition = cliDefinition;
  } else if (profileDefinition) {
    source = 'profile';
    definition = profileDefinition;
  } else if (builtInDefinition) {
    source = 'built_in';
    definition = builtInDefinition;
  }

  if (!definition) {
    return {
      supported: false,
      connector_id: connectorId,
      profile: profileName,
      reason: 'No smoke spec available. Provide connector_profiles.<connector>.<profile>.smoke_test or pass --query/--dataset/--language.',
    };
  }

  if (typeof definition.query !== 'string' || !definition.query.trim()) {
    return {
      supported: false,
      connector_id: connectorId,
      profile: profileName,
      source,
      reason: 'Smoke spec requires a non-empty query',
    };
  }

  try {
    const spec = createReadinessSpec(connectorId, profileName, adapter.capabilities, profile, definition);
    return {
      supported: true,
      connector_id: connectorId,
      profile: profileName,
      source,
      definition: {
        dataset: spec.dataset.kind,
        language: spec.query.language,
        query: spec.query.statement,
        pagination_mode: spec.pagination.mode,
        limit: spec.pagination.limit,
        max_pages: spec.pagination.max_pages,
        lookback_minutes: spec.time_window.lookback_minutes,
      },
      spec,
    };
  } catch (err) {
    return {
      supported: false,
      connector_id: connectorId,
      profile: profileName,
      source,
      reason: err.message,
      validation: err.validation || null,
    };
  }
}

function createConnectorReadinessStatus(report) {
  if (report.checks.live_smoke?.status === 'pass') return 'live_verified';
  if (report.checks.preflight_ready?.status === 'pass' && report.checks.auth_material?.status === 'pass' && report.checks.smoke_spec?.status === 'pass') {
    return 'ready';
  }
  if (report.checks.profile_found?.status === 'fail') return 'unconfigured';
  if (report.checks.profile_valid?.status === 'fail') return 'invalid_config';
  return 'partial';
}

async function assessConnectorReadiness(connectorId, config = {}, options = {}) {
  const registry = options.registry || _getDefaultRegistry();
  const adapter = registry.get(connectorId);
  const profileName = selectConnectorProfileName(config, connectorId, options.profile || null);
  const availableProfiles = Object.keys(config?.connector_profiles?.[connectorId] || {});
  const checks = {};

  checks.adapter_registered = {
    status: adapter ? 'pass' : 'fail',
    message: adapter ? 'Connector adapter is registered' : `No adapter available for connector ${connectorId}`,
  };

  if (!adapter) {
    const report = {
      id: connectorId,
      display_name: connectorId,
      profile: profileName,
      available_profiles: availableProfiles,
      configured: availableProfiles.length > 0,
      readiness_score: CONNECTOR_READINESS_WEIGHTS.adapter_registered * 0,
      readiness_status: 'unconfigured',
      checks,
      smoke: { supported: false, reason: checks.adapter_registered.message },
      limitations: [],
      capabilities: null,
    };
    return report;
  }

  let profile = null;
  let profileError = null;
  try {
    profile = resolveConnectorProfile(config, connectorId, profileName);
  } catch (err) {
    profileError = err;
  }

  checks.profile_found = {
    status: profile ? 'pass' : 'fail',
    message: profile ? `Resolved profile ${connectorId}.${profileName}` : (profileError?.message || `No connector profile found for ${connectorId}.${profileName}`),
  };

  checks.profile_valid = {
    status: profile ? 'pass' : 'fail',
    message: profile ? 'Connector auth profile is valid' : 'Connector auth profile could not be validated',
  };

  const secrets = profile ? resolveSecretRefs(profile, options) : {};
  const authReadiness = profile ? evaluateAuthReadiness(profile, secrets) : {
    ready: false,
    auth_type: null,
    checks: [],
    missing: ['profile'],
    resolved_secret_names: [],
  };

  checks.auth_material = {
    status: profile && authReadiness.ready ? 'pass' : (profile ? 'fail' : 'skip'),
    message: profile
      ? (authReadiness.ready ? 'Required auth material is available' : `Missing auth material: ${authReadiness.missing.join(', ')}`)
      : 'Skipped because connector profile is unavailable',
    details: authReadiness,
  };

  let preflightSpec = null;
  let preflightError = null;
  if (profile) {
    try {
      preflightSpec = createReadinessSpec(
        connectorId,
        profileName,
        adapter.capabilities,
        profile,
        {
          dataset: adapter.capabilities.dataset_kinds[0],
          language: adapter.capabilities.languages[0],
          query: 'connector readiness preflight',
          lookback_minutes: 60,
          pagination_mode: adapter.capabilities.pagination_modes[0] || 'none',
          limit: 1,
          max_pages: 1,
        }
      );

      if (typeof adapter.preflight === 'function') {
        await Promise.resolve(adapter.preflight({ spec: preflightSpec, profile, secrets, options }));
      }
    } catch (err) {
      preflightError = err;
    }
  }

  checks.preflight_ready = {
    status: profile ? (preflightError ? 'fail' : 'pass') : 'skip',
    message: profile
      ? (preflightError ? preflightError.message : 'Connector preflight requirements are satisfied')
      : 'Skipped because connector profile is unavailable',
  };

  const smoke = buildConnectorSmokeSpec(connectorId, config, {
    ...options,
    registry,
    profile: profileName,
    parameters: isPlainObject(options.parameters) ? cloneObject(options.parameters) : {},
  });

  checks.smoke_spec = {
    status: smoke.supported ? 'pass' : 'fail',
    message: smoke.supported
      ? `Smoke spec resolved from ${smoke.source}`
      : smoke.reason,
  };

  let liveSmoke = null;
  if (options.live === true) {
    if (!profile) {
      liveSmoke = {
        status: 'fail',
        message: 'Live smoke test requires a configured connector profile',
      };
    } else if (!smoke.supported) {
      liveSmoke = {
        status: 'fail',
        message: smoke.reason,
      };
    } else {
      try {
        const liveResult = await executeQuerySpec(smoke.spec, adapter, {
          config,
          env: options.env,
          fetch: options.fetch,
          sleep: options.sleep,
          token_cache: options.token_cache,
          secret_command_timeout_ms: options.secret_command_timeout_ms,
        });
        liveSmoke = {
          status: liveResult.envelope.status === 'error' ? 'fail' : 'pass',
          message: liveResult.envelope.status === 'error'
            ? 'Live smoke test completed with connector errors'
            : 'Live smoke test completed successfully',
          result: {
            status: liveResult.envelope.status,
            events: liveResult.envelope.counts.events,
            entities: liveResult.envelope.counts.entities,
            pages_fetched: liveResult.pagination.pages_fetched,
            warnings: liveResult.envelope.warnings.length,
            errors: liveResult.envelope.errors,
            metadata: {
              backend: liveResult.envelope.metadata.backend || null,
              endpoint: liveResult.envelope.metadata.endpoint || null,
            },
          },
        };
      } catch (err) {
        liveSmoke = {
          status: 'fail',
          message: err.message || String(err),
        };
      }
    }
  } else {
    liveSmoke = {
      status: 'skip',
      message: 'Live smoke test not requested',
    };
  }
  checks.live_smoke = liveSmoke;

  const readinessScore = Object.entries(CONNECTOR_READINESS_WEIGHTS).reduce((total, [key, weight]) => {
    return total + (checks[key]?.status === 'pass' ? weight : 0);
  }, 0);

  const report = {
    id: connectorId,
    display_name: adapter.capabilities.display_name,
    profile: profile ? profileName : null,
    available_profiles: availableProfiles,
    configured: availableProfiles.length > 0,
    readiness_score: readinessScore,
    readiness_status: 'partial',
    checks,
    smoke: smoke.supported
      ? {
          supported: true,
          source: smoke.source,
          definition: smoke.definition,
        }
      : {
          supported: false,
          source: smoke.source || null,
          reason: smoke.reason,
        },
    capabilities: cloneObject(adapter.capabilities),
    limitations: cloneObject(adapter.capabilities.limitations || []),
    profile_summary: profile
      ? {
          auth_type: profile.auth_type,
          base_url_present: typeof profile.base_url === 'string' && profile.base_url.trim().length > 0,
          token_url_present: typeof profile.token_url === 'string' && profile.token_url.trim().length > 0,
          tenant: profile.tenant || null,
          region: profile.region || null,
          default_parameter_keys: Object.keys(profile.default_parameters || {}),
          declared_secret_names: Object.keys(profile.secret_refs || {}),
          resolved_secret_names: authReadiness.resolved_secret_names,
          missing_auth_material: authReadiness.missing,
        }
      : null,
  };
  report.readiness_status = createConnectorReadinessStatus(report);
  return report;
}

async function assessRuntimeReadiness(config = {}, options = {}) {
  const registry = options.registry || _getDefaultRegistry();
  let connectorIds = [];

  if (Array.isArray(options.connector_ids) && options.connector_ids.length > 0) {
    connectorIds = options.connector_ids.slice();
  } else if (options.configured_only === true) {
    connectorIds = Object.keys(config?.connector_profiles || {});
  } else {
    connectorIds = registry.list().map(item => item.id);
  }

  connectorIds = Array.from(new Set(connectorIds)).sort();
  const connectors = [];
  for (const connectorId of connectorIds) {
    connectors.push(await assessConnectorReadiness(connectorId, config, options));
  }

  const overallScore = connectors.length > 0
    ? Math.round(connectors.reduce((sum, item) => sum + item.readiness_score, 0) / connectors.length)
    : 0;
  const allReady = connectors.length > 0 && connectors.every(item => ['ready', 'live_verified'].includes(item.readiness_status));
  const anyLiveVerified = connectors.some(item => item.readiness_status === 'live_verified');

  return {
    generated_at: nowIso(),
    live: options.live === true,
    configured_only: options.configured_only === true,
    overall_score: overallScore,
    overall_status: anyLiveVerified
      ? 'live_verified'
      : (allReady ? 'ready' : (connectors.some(item => item.readiness_status !== 'unconfigured') ? 'partial' : 'unconfigured')),
    connectors,
  };
}

function parseLinkHeader(linkValue) {
  const result = {};
  if (!linkValue) return result;
  for (const part of String(linkValue).split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/i);
    if (match) {
      result[match[2]] = match[1];
    }
  }
  return result;
}

module.exports = {
  // 15 constants
  QUERY_SPEC_VERSION,
  RESULT_ENVELOPE_VERSION,
  DATASET_KINDS,
  DATASET_DEFAULTS,
  PAGINATION_MODES,
  CONSISTENCY_MODES,
  RESULT_STATUSES,
  EVIDENCE_POLICIES,
  LIFECYCLE_STAGES,
  AUTH_TYPES,
  SECRET_REF_TYPES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_MS,

  // 47 functions
  getDatasetDefaults,
  createQuerySpec,
  validateQuerySpec,
  normalizeTimeWindow,
  normalizePagination,
  normalizeExecution,
  normalizeEvidence,
  createConnectorCapabilities,
  createAuthProfile,
  validateAuthProfile,
  resolveConnectorProfile,
  resolveSecretRefs,
  selectConnectorProfileName,
  createPaginationState,
  advancePaginationState,
  computeBackoffDelayMs,
  createConnectorRegistry,
  validateConnectorCapabilities,
  validateConnectorAdapter,
  createWarning,
  createRuntimeError,
  createResultEnvelope,
  performHttpRequest,
  executeQuerySpec,
  normalizeBaseUrl,
  joinUrl,
  buildUrl,
  executeConnectorRequest,
  authorizeRequest,
  toArray,
  isPlainObject,
  cloneObject,
  getSecret,
  normalizeSecretRef,
  getNestedValue,
  addEntitiesFromRecord,
  addEntity,
  normalizeEvent,
  toIsoOrNull,
  toUnixSeconds,
  parseResponseBody,
  parseLinkHeader,
  getBuiltInSmokeDefinition,
  buildConnectorSmokeSpec,
  assessConnectorReadiness,
  assessRuntimeReadiness,
};

// Contract test re-exports (Phase 47) -- deferred to break circular require
// contract-tests.cjs requires connector-sdk.cjs, so we cannot require it at
// module load scope. By the time this runs, module.exports is already cached
// and all consumers holding the reference see the added properties.
const _ct = require('./contract-tests.cjs');
module.exports.runContractTests = _ct.runContractTests;
module.exports.createTestQuerySpec = _ct.createTestQuerySpec;
module.exports.createTestProfile = _ct.createTestProfile;
module.exports.createTestSecrets = _ct.createTestSecrets;
