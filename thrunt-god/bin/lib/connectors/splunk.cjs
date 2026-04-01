'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  isPlainObject,
  toArray,
  createWarning,
  executeConnectorRequest,
  authorizeRequest,
  performHttpRequest,
  buildUrl,
  joinUrl,
  normalizeBaseUrl,
  addEntitiesFromRecord,
  normalizeEvent,
  createConnectorCapabilities,
} = sdk;

// --- Internal helper (only used by executeSplunkAsyncJob) ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeSplunkSearchStatement(statement) {
  const trimmed = String(statement || '').trim();
  if (!trimmed || trimmed.startsWith('|') || /^search\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `search ${trimmed}`;
}

function normalizeSplunkResultRow(row) {
  if (!isPlainObject(row) || typeof row._raw !== 'string') return row;
  const trimmed = row._raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return row;
  try {
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) return row;
    return { ...row, ...parsed };
  } catch {
    return row;
  }
}

// --- Splunk-specific parsers ---

function parseSplunkResultsPayload(payload) {
  if (!payload) return { rows: [], messages: [] };
  if (Array.isArray(payload)) {
    const rows = payload.filter(item => isPlainObject(item) && !item.preview);
    const messages = payload
      .filter(item => isPlainObject(item) && item.messages)
      .flatMap(item => toArray(item.messages));
    return { rows, messages };
  }
  if (isPlainObject(payload)) {
    if (Array.isArray(payload.results)) {
      return { rows: payload.results, messages: toArray(payload.messages) };
    }
    if (Array.isArray(payload.fields) && Array.isArray(payload.rows)) {
      const fieldNames = payload.fields.map(field => {
        if (isPlainObject(field) && typeof field.name === 'string') return field.name;
        return typeof field === 'string' ? field : null;
      });
      const rows = payload.rows.map(row => {
        if (!Array.isArray(row)) return row;
        const mapped = {};
        for (let index = 0; index < fieldNames.length; index += 1) {
          const fieldName = fieldNames[index];
          if (!fieldName) continue;
          mapped[fieldName] = row[index];
        }
        return mapped;
      });
      return { rows, messages: toArray(payload.messages) };
    }
    if (Array.isArray(payload.rows)) {
      return { rows: payload.rows, messages: toArray(payload.messages) };
    }
  }
  return { rows: [], messages: [] };
}

// --- Splunk async job helper ---

async function executeSplunkAsyncJob({ spec, profile, secrets, auth, options }) {
  const baseUrl = normalizeBaseUrl(profile);
  const headers = await authorizeRequest({}, profile, secrets, auth, options);
  const fetchOptions = { fetch: options?.fetch };

  // Build search body for job creation
  const searchBody = new URLSearchParams();
  searchBody.set('search', normalizeSplunkSearchStatement(spec.query.statement));
  if (spec.time_window.start) searchBody.set('earliest_time', spec.time_window.start);
  if (spec.time_window.end) searchBody.set('latest_time', spec.time_window.end);
  searchBody.set('output_mode', 'json');

  // Step 1: Create search job
  const createUrl = buildUrl(baseUrl, 'services/search/jobs', { output_mode: 'json' });
  const createResponse = await performHttpRequest({
    method: 'POST',
    url: createUrl,
    headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: searchBody.toString(),
  }, fetchOptions);

  const sid = createResponse.data?.sid;
  if (!sid || typeof sid !== 'string') {
    const err = new Error(`Splunk async job creation did not return a valid sid (got ${typeof sid}: ${JSON.stringify(sid)})`);
    err.code = 'SPLUNK_ASYNC_JOB_NO_SID';
    throw err;
  }

  // Step 2: Poll until isDone
  // Compute timeout budget from spec or use a reasonable default (120s).
  // The outer withTimeout uses spec.execution.timeout_ms (default 30s) which is
  // too short for async jobs, so callers should set a higher timeout. We cap
  // the poll loop to avoid dangling promises beyond the timeout budget.
  const pollIntervalMs = 2000;
  const timeoutBudgetMs = Number.isFinite(spec.execution?.timeout_ms) && spec.execution.timeout_ms > 0
    ? spec.execution.timeout_ms
    : 120_000;
  const maxAttempts = Math.max(1, Math.floor(timeoutBudgetMs / pollIntervalMs));
  const pollUrl = buildUrl(baseUrl, `services/search/jobs/${encodeURIComponent(sid)}`, { output_mode: 'json' });
  const waitFn = typeof options?.sleep === 'function' ? options.sleep : sleep;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pollResponse = await performHttpRequest({
      method: 'GET',
      url: pollUrl,
      headers,
    }, fetchOptions);

    const isDone = pollResponse.data?.entry?.[0]?.content?.isDone;
    if (isDone === '1' || isDone === 1 || isDone === true) {
      break;
    }

    if (attempt === maxAttempts - 1) {
      const err = new Error(`Splunk async job ${sid} did not complete within ${maxAttempts * pollIntervalMs / 1000} seconds (${maxAttempts} attempts)`);
      err.code = 'SPLUNK_ASYNC_JOB_TIMEOUT';
      throw err;
    }

    await waitFn(pollIntervalMs);
  }

  // Step 3: Fetch results
  const resultsUrl = buildUrl(baseUrl, `services/search/jobs/${encodeURIComponent(sid)}/results`, { output_mode: 'json', count: '0' });
  return performHttpRequest({
    method: 'GET',
    url: resultsUrl,
    headers,
  }, fetchOptions);
}

// --- Splunk adapter factory ---

function createSplunkAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'splunk',
      display_name: 'Splunk Enterprise Search',
      auth_types: ['basic', 'bearer'],
      dataset_kinds: ['events', 'alerts', 'entities'],
      languages: ['spl'],
      pagination_modes: ['none'],
      supports_dry_run: false,
      docs_url: 'https://help.splunk.com/en/splunk-enterprise/rest-api-reference/9.1/search-endpoints/search-endpoint-descriptions',
      limitations: [
        'Uses search/v2/jobs/export for small and medium streaming result sets.',
        'Large result sets should be split by time window or moved to search/jobs blocking mode later.',
      ],
      supported_parameters: ['required_field_list', 'search_mode', 'namespace'],
    }),
    preflight({ profile }) {
      if (!normalizeBaseUrl(profile)) {
        throw Object.assign(new Error('Splunk connector requires profile.base_url'), { code: 'SPLUNK_BASE_URL_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile }) {
      const body = new URLSearchParams();
      body.set('search', normalizeSplunkSearchStatement(spec.query.statement));
      body.set('output_mode', 'json_rows');
      body.set('earliest_time', spec.time_window.start);
      body.set('latest_time', spec.time_window.end);
      if (spec.parameters.required_field_list) body.set('required_field_list', spec.parameters.required_field_list);
      if (spec.parameters.search_mode) body.set('search_mode', spec.parameters.search_mode);
      if (spec.parameters.namespace) body.set('namespace', spec.parameters.namespace);

      return {
        request: {
          method: 'POST',
          url: joinUrl(normalizeBaseUrl(profile), 'services/search/v2/jobs/export'),
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      };
    },
    async executeRequest({ prepared, profile, secrets, spec, options }) {
      const auth = { type: profile?.auth_type || 'bearer' };
      try {
        return await executeConnectorRequest({
          request: prepared.request,
          profile,
          secrets,
          auth,
          options,
        });
      } catch (err) {
        const isTransportFailure = !err.status && (
          err.name === 'TypeError'
          || /fetch failed|socket|empty reply|terminated/i.test(String(err.message || ''))
        );
        if (err.status === 504 || err.retryable === true || isTransportFailure) {
          const response = await executeSplunkAsyncJob({ spec, profile, secrets, auth, options });
          response.__splunk_async = true;
          return response;
        }
        throw err;
      }
    },
    normalizeResponse({ response, spec }) {
      const { rows, messages } = parseSplunkResultsPayload(response.data);
      const entities = [];
      const events = rows.map(row => {
        const normalizedRow = normalizeSplunkResultRow(row);
        addEntitiesFromRecord(entities, 'splunk', normalizedRow, [
          { kind: 'host', paths: ['host.name', 'host', 'hostname', 'Computer'] },
          { kind: 'user', paths: ['user.name', 'user', 'username', 'src_user', 'dest_user'] },
          { kind: 'ip', paths: ['src', 'dest', 'src_ip', 'dest_ip'] },
        ]);
        return normalizeEvent('splunk', normalizedRow, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['_time', '_indextime'],
          idPaths: ['_cd', '_serial'],
          titlePath: 'sourcetype',
        });
      });
      return {
        events,
        entities,
        warnings: messages.map(message => createWarning('splunk_message', message.text || String(message))),
        metadata: {
          backend: 'splunk',
          endpoint: response.__splunk_async ? 'search/jobs' : 'search/v2/jobs/export',
          output_mode: 'json_rows',
        },
        has_more: false,
      };
    },
  };
}

module.exports = {
  createSplunkAdapter,
  parseSplunkResultsPayload,
  executeSplunkAsyncJob,
  normalizeSplunkSearchStatement,
  normalizeSplunkResultRow,
};
