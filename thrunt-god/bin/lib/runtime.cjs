/**
 * Runtime — Adapter factories, connector-specific parsers, and SDK re-exports.
 *
 * SDK primitives (constants, validators, auth utilities, HTTP helpers, normalization,
 * execution engine, readiness assessment) live in connector-sdk.cjs. This module
 * re-exports them via spread for backward compatibility.
 */

'use strict';

// --- SDK re-export (all SDK primitives now live in connector-sdk.cjs) ---
const sdk = require('./connector-sdk.cjs');

// --- Plugin registry re-export (manifest validation, discovery, registry) ---
const pluginRegistry = require('./plugin-registry.cjs');

// Destructure SDK functions needed by adapter code below.
// Adapters reference these via closure scope, so they must be in local scope.
const {
  isPlainObject,
  cloneObject,
  toArray,
  getNestedValue,
  createWarning,
  createRuntimeError,
  createResultEnvelope,
  executeConnectorRequest,
  authorizeRequest,
  performHttpRequest,
  buildUrl,
  joinUrl,
  normalizeBaseUrl,
  getSecret,
  addEntity,
  addEntitiesFromRecord,
  normalizeEvent,
  toIsoOrNull,
  toUnixSeconds,
  parseResponseBody,
  parseLinkHeader,
  normalizeSecretRef,
  createConnectorCapabilities,
  createConnectorRegistry,
  createPaginationState,
  advancePaginationState,
} = sdk;

// --- Internal SDK helpers needed by adapters (not exported from sdk, accessed via lazy require) ---
// sleep and decodeMaybeJson are internal helpers in connector-sdk.cjs that adapters need.
// Since they are not in sdk's module.exports, we access the connector-sdk module's internal
// scope by requiring them fresh. They are defined as local functions here instead.
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// --- Connector-specific parsers (internal to their respective adapter factories) ---

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
    if (Array.isArray(payload.rows)) {
      return { rows: payload.rows, messages: toArray(payload.messages) };
    }
  }
  return { rows: [], messages: [] };
}

function normalizeElasticRows(payload) {
  if (!payload) return { rows: [], warnings: [] };
  if (Array.isArray(payload.values) && Array.isArray(payload.columns)) {
    const columns = payload.columns.map(item => item.name || item);
    return {
      rows: payload.values.map(values => Object.fromEntries(columns.map((name, index) => [name, values[index]]))),
      warnings: payload.is_partial ? [createWarning('elastic_partial', 'Elastic returned a partial ES|QL response.')] : [],
    };
  }
  return { rows: [], warnings: [] };
}

function normalizeAzureTables(payload) {
  const tables = toArray(payload?.tables).filter(isPlainObject);
  const rows = [];
  for (const table of tables) {
    const columns = toArray(table.columns).map(column => column.name);
    for (const row of toArray(table.rows)) {
      if (!Array.isArray(row)) continue;
      rows.push(Object.fromEntries(columns.map((name, index) => [name, row[index]])));
    }
  }
  return rows;
}

function normalizeDefenderResults(payload) {
  // Defender XDR returns {Schema: [{Name, Type}], Results: [{key: value}], Stats: {...}}
  // Results are pre-formed objects -- no column mapping needed
  return toArray(payload?.Results);
}

// --- Splunk async job helper ---

async function executeSplunkAsyncJob({ spec, profile, secrets, auth, options }) {
  const baseUrl = normalizeBaseUrl(profile);
  const headers = await authorizeRequest({}, profile, secrets, auth, options);
  const fetchOptions = { fetch: options?.fetch };

  // Build search body for job creation
  const searchBody = new URLSearchParams();
  const statement = spec.query.statement;
  searchBody.set('search', statement.trim().startsWith('|') ? statement : `search ${statement}`);
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

// --- 10 adapter factories ---

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
      body.set('search', spec.query.statement);
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
        if (err.status === 504) {
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
        addEntitiesFromRecord(entities, 'splunk', row, [
          { kind: 'host', paths: ['host', 'Computer'] },
          { kind: 'user', paths: ['user', 'src_user', 'dest_user'] },
          { kind: 'ip', paths: ['src', 'dest', 'src_ip', 'dest_ip'] },
        ]);
        return normalizeEvent('splunk', row, {
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

function createElasticAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'elastic',
      display_name: 'Elastic ES|QL',
      auth_types: ['api_key', 'basic', 'bearer'],
      dataset_kinds: ['events', 'alerts', 'entities', 'cloud', 'endpoint'],
      languages: ['esql', 'eql'],
      pagination_modes: ['none'],
      docs_url: 'https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-esql-query',
      limitations: [
        'Initial runtime coverage is ES|QL-only. Query DSL and async ES|QL are out of scope for this tranche.',
      ],
      supported_parameters: ['filter', 'locale'],
    }),
    preflight({ profile }) {
      if (!normalizeBaseUrl(profile)) {
        throw Object.assign(new Error('Elastic connector requires profile.base_url'), { code: 'ELASTIC_BASE_URL_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile }) {
      if (spec.query.language === 'eql') {
        return {
          request: {
            method: 'POST',
            url: joinUrl(normalizeBaseUrl(profile), '_eql/search'),
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              query: spec.query.statement,
              filter: spec.parameters.filter || undefined,
              size: 100,
            }),
          },
        };
      }
      return {
        request: {
          method: 'POST',
          url: joinUrl(normalizeBaseUrl(profile), '_query'),
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: spec.query.statement,
            filter: spec.parameters.filter || undefined,
            locale: spec.parameters.locale || undefined,
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: profile?.auth_type || 'api_key',
          header: 'authorization',
          prefix: profile?.auth_type === 'api_key' ? 'ApiKey' : undefined,
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      // Helper to normalize a single EQL hit envelope into a row with _id merged
      const normalizeEqlHit = (hit) => {
        const row = { ...hit._source };
        if (hit._id && !row._id) row._id = hit._id;
        return row;
      };

      // EQL sequence response shape: { hits: { sequences: [{ join_keys, events: [{ _id, _source }] }] } }
      const eqlSequences = response.data?.hits?.sequences;
      if (Array.isArray(eqlSequences)) {
        const entities = [];
        const events = [];
        for (const seq of eqlSequences) {
          for (const hit of toArray(seq.events)) {
            const row = normalizeEqlHit(hit);
            addEntitiesFromRecord(entities, 'elastic', row, [
              { kind: 'host', paths: ['host.name', 'host'] },
              { kind: 'user', paths: ['user.name', 'user'] },
              { kind: 'ip', paths: ['source.ip', 'destination.ip', 'client.ip'] },
              { kind: 'cloud-account', paths: ['cloud.account.id'] },
            ]);
            events.push(normalizeEvent('elastic', row, {
              datasetKind: spec.dataset.kind,
              timestampPaths: ['@timestamp', 'timestamp'],
              idPaths: ['event.id', '_id'],
              titlePath: 'event.action',
            }));
          }
        }
        return {
          events,
          entities,
          warnings: [],
          metadata: {
            backend: 'elastic',
            endpoint: '/_eql/search',
          },
          has_more: false,
        };
      }

      // EQL non-sequence response shape: { hits: { events: [{ _id, _source: {...} }] } }
      const eqlEvents = response.data?.hits?.events;
      if (Array.isArray(eqlEvents)) {
        const entities = [];
        const events = eqlEvents.map(hit => {
          const row = normalizeEqlHit(hit);
          addEntitiesFromRecord(entities, 'elastic', row, [
            { kind: 'host', paths: ['host.name', 'host'] },
            { kind: 'user', paths: ['user.name', 'user'] },
            { kind: 'ip', paths: ['source.ip', 'destination.ip', 'client.ip'] },
            { kind: 'cloud-account', paths: ['cloud.account.id'] },
          ]);
          return normalizeEvent('elastic', row, {
            datasetKind: spec.dataset.kind,
            timestampPaths: ['@timestamp', 'timestamp'],
            idPaths: ['event.id', '_id'],
            titlePath: 'event.action',
          });
        });
        return {
          events,
          entities,
          warnings: [],
          metadata: {
            backend: 'elastic',
            endpoint: '/_eql/search',
          },
          has_more: false,
        };
      }

      // ES|QL response shape: { columns, values }
      const { rows, warnings } = normalizeElasticRows(response.data);
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'elastic', row, [
          { kind: 'host', paths: ['host.name', 'host'] },
          { kind: 'user', paths: ['user.name', 'user'] },
          { kind: 'ip', paths: ['source.ip', 'destination.ip', 'client.ip'] },
          { kind: 'cloud-account', paths: ['cloud.account.id'] },
        ]);
        return normalizeEvent('elastic', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['@timestamp', 'timestamp'],
          idPaths: ['event.id', '_id'],
          titlePath: 'event.action',
        });
      });
      return {
        events,
        entities,
        warnings,
        metadata: {
          backend: 'elastic',
          endpoint: '/_query',
          columns: toArray(response.data?.columns).map(column => column.name || column),
        },
        has_more: false,
        status_override: response.data?.is_partial ? 'partial' : undefined,
      };
    },
  };
}

function createSentinelAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'sentinel',
      display_name: 'Microsoft Sentinel / Log Analytics',
      auth_types: ['oauth_client_credentials', 'bearer'],
      dataset_kinds: ['events', 'alerts', 'identity'],
      languages: ['kql'],
      pagination_modes: ['none'],
      docs_url: 'https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/request-format',
      limitations: [
        'Initial coverage uses workspace query execution only. Management-plane incident APIs remain outside this runtime tranche.',
      ],
      supported_parameters: ['workspace_id', 'include_statistics', 'include_visualization'],
    }),
    preflight({ spec, profile }) {
      if (!(spec.parameters.workspace_id || profile?.default_parameters?.workspace_id)) {
        throw Object.assign(new Error('Sentinel connector requires workspace_id in parameters or profile defaults'), { code: 'SENTINEL_WORKSPACE_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile }) {
      const workspaceId = spec.parameters.workspace_id;
      const baseUrl = normalizeBaseUrl(profile, 'https://api.loganalytics.azure.com/v1');
      return {
        request: {
          method: 'POST',
          url: joinUrl(baseUrl, `workspaces/${workspaceId}/query`),
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: spec.query.statement,
            timespan: `${spec.time_window.start}/${spec.time_window.end}`,
            includeStatistics: spec.parameters.include_statistics === true || undefined,
            includeVisualization: spec.parameters.include_visualization === true || undefined,
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: profile?.auth_type || 'oauth_client_credentials',
          scope: (Array.isArray(profile?.scopes) && profile.scopes.length > 0)
            ? profile.scopes.join(' ')
            : 'https://api.loganalytics.azure.com/.default',
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const rows = normalizeAzureTables(response.data);
      const partialError = response.data?.error?.code === 'PartialError';
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'sentinel', row, [
          { kind: 'host', paths: ['Computer', 'HostName', 'DeviceName'] },
          { kind: 'user', paths: ['Account', 'AccountName', 'UserPrincipalName'] },
          { kind: 'ip', paths: ['IPAddress', 'IP', 'RemoteIP'] },
          { kind: 'azure-resource', paths: ['AzureResourceId'] },
        ]);
        return normalizeEvent('sentinel', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['TimeGenerated', 'Timestamp'],
          idPaths: ['EventId', 'SystemAlertId'],
          titlePath: 'AlertName',
          summaryPath: 'Description',
        });
      });
      const warnings = [];
      if (partialError) {
        warnings.push(createWarning('sentinel_partial_error',
          response.data.error.message || 'Sentinel returned a partial result (PartialError).',
          { code: response.data.error.code, details: response.data.error.details || null }
        ));
      }
      return {
        events,
        entities,
        warnings,
        metadata: {
          backend: 'sentinel',
          endpoint: '/query',
          tables: toArray(response.data?.tables).length,
        },
        has_more: false,
        status_override: partialError ? 'partial' : undefined,
      };
    },
  };
}

function createOpenSearchAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'opensearch',
      display_name: 'OpenSearch SQL',
      auth_types: ['basic', 'api_key', 'bearer', 'sigv4'],
      dataset_kinds: ['events', 'alerts', 'entities'],
      languages: ['sql'],
      pagination_modes: ['none'],
      docs_url: 'https://docs.opensearch.org/latest/sql-and-ppl/sql/index/',
      limitations: [
        'Uses /_plugins/_sql with JDBC response format. PPL surface not yet supported.',
        'Response format is {schema, datarows} -- different from Elastic ES|QL {columns, values}.',
        'SigV4 authentication supported for Amazon OpenSearch Service managed clusters (requires region and AWS credentials).',
      ],
      supported_parameters: ['format'],
    }),
    preflight({ profile }) {
      if (!normalizeBaseUrl(profile)) {
        throw Object.assign(new Error('OpenSearch connector requires profile.base_url'), { code: 'OPENSEARCH_BASE_URL_REQUIRED' });
      }
      if (profile?.auth_type === 'sigv4' && !profile?.region && !profile?.base_url) {
        throw Object.assign(new Error('OpenSearch SigV4 auth requires profile.region or profile.base_url'), { code: 'OPENSEARCH_SIGV4_REGION_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile }) {
      return {
        request: {
          method: 'POST',
          url: joinUrl(normalizeBaseUrl(profile), '_plugins/_sql'),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: spec.query.statement }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      const auth = profile?.auth_type === 'sigv4'
        ? { type: 'sigv4', service: 'es' }
        : { type: profile?.auth_type || 'basic' };
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth,
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const adapted = {
        columns: toArray(response.data?.schema).map(col => ({ name: col.name || col })),
        values: toArray(response.data?.datarows),
      };
      const { rows, warnings } = normalizeElasticRows(adapted);
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'opensearch', row, [
          { kind: 'host', paths: ['host.name', 'host', 'hostname'] },
          { kind: 'user', paths: ['user.name', 'user', 'username'] },
          { kind: 'ip', paths: ['source.ip', 'destination.ip', 'client.ip'] },
        ]);
        return normalizeEvent('opensearch', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['@timestamp', 'timestamp'],
          idPaths: ['_id'],
          titlePath: 'event.action',
        });
      });
      return {
        events,
        entities,
        warnings,
        metadata: {
          backend: 'opensearch',
          endpoint: '/_plugins/_sql',
          total: response.data?.total,
        },
        has_more: false,
      };
    },
  };
}

function createDefenderXDRAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'defender_xdr',
      display_name: 'Microsoft Defender XDR Advanced Hunting',
      auth_types: ['oauth_client_credentials', 'bearer'],
      dataset_kinds: ['events', 'alerts', 'endpoint'],
      languages: ['kql'],
      pagination_modes: ['none'],
      docs_url: 'https://learn.microsoft.com/en-us/defender-xdr/api-advanced-hunting',
      limitations: [
        'Results capped at 100,000 rows per query.',
        'Single request timeout of 3 minutes.',
        'Rate limit: minimum 45 calls per minute per tenant.',
        'Data retention: 30 days.',
        'Boolean fields return "True"/"False" strings (changed Feb 2026).',
      ],
      supported_parameters: [],
    }),
    prepareQuery({ spec, profile }) {
      const baseUrl = normalizeBaseUrl(profile, 'https://api.security.microsoft.com');
      return {
        request: {
          method: 'POST',
          url: joinUrl(baseUrl, 'api/advancedhunting/run'),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ Query: spec.query.statement }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: profile?.auth_type || 'oauth_client_credentials',
          scope: (Array.isArray(profile?.scopes) && profile.scopes.length > 0)
            ? profile.scopes.join(' ')
            : 'https://api.security.microsoft.com/.default',
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const results = normalizeDefenderResults(response.data);
      const entities = [];
      const events = results.map(row => {
        addEntitiesFromRecord(entities, 'defender_xdr', row, [
          { kind: 'host', paths: ['DeviceName', 'DeviceId'] },
          { kind: 'user', paths: ['AccountName', 'AccountUpn', 'InitiatingProcessAccountName'] },
          { kind: 'ip', paths: ['RemoteIP', 'LocalIP', 'IPAddress'] },
        ]);
        return normalizeEvent('defender_xdr', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['Timestamp'],
          idPaths: ['ReportId'],
          titlePath: 'ActionType',
        });
      });
      const warnings = [];
      if (response.data?.Stats?.dataset_statistics?.dataset_truncation) {
        warnings.push(createWarning('defender_xdr_truncation', 'Query results were truncated by Defender XDR due to dataset size limits'));
      }
      return {
        events,
        entities,
        warnings,
        metadata: {
          backend: 'defender_xdr',
          endpoint: '/api/advancedhunting/run',
          schema_columns: toArray(response.data?.Schema).length,
          stats: response.data?.Stats || null,
        },
        has_more: false,
      };
    },
  };
}

function createOktaAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'okta',
      display_name: 'Okta System Log',
      auth_types: ['api_key'],
      dataset_kinds: ['identity', 'events'],
      languages: ['api'],
      pagination_modes: ['token'],
      docs_url: 'https://developer.okta.com/docs/reference/system-log-query/',
      limitations: [
        'Initial coverage is the System Log API only.',
        'Pagination must follow the server-provided next link; manual after tokens are not supported.',
      ],
      supported_parameters: ['filter', 'q', 'sortOrder'],
    }),
    preflight({ profile }) {
      if (!normalizeBaseUrl(profile)) {
        throw Object.assign(new Error('Okta connector requires profile.base_url'), { code: 'OKTA_BASE_URL_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile, pagination }) {
      const nextUrl = pagination.cursor && /^https?:\/\//.test(pagination.cursor) ? pagination.cursor : null;
      return {
        request: {
          method: 'GET',
          url: nextUrl || buildUrl(normalizeBaseUrl(profile), 'api/v1/logs', {
            since: spec.time_window.start,
            until: spec.time_window.end,
            limit: Math.min(spec.pagination.limit, 1000),
            filter: spec.parameters.filter || null,
            q: spec.parameters.q || null,
            sortOrder: spec.parameters.sortOrder || 'DESCENDING',
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: 'api_key',
          header: 'authorization',
          prefix: 'SSWS',
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const rows = toArray(response.data).filter(isPlainObject);
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'okta', row, [
          { kind: 'user', paths: ['actor.alternateId'] },
          { kind: 'ip', paths: ['client.ipAddress'] },
          { kind: 'device', paths: ['client.device'] },
        ]);
        for (const target of toArray(row.target).filter(isPlainObject)) {
          addEntity(entities, 'okta', target.type === 'User' ? 'user' : 'resource', target.alternateId || target.displayName, {
            target_type: target.type,
          });
        }
        return normalizeEvent('okta', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['published'],
          idPaths: ['uuid', 'transaction.id'],
          titlePath: 'eventType',
          summaryPath: 'displayMessage',
        });
      });
      const links = parseLinkHeader(response.headers.link);
      return {
        events,
        entities,
        metadata: {
          backend: 'okta',
          endpoint: '/api/v1/logs',
        },
        next_cursor: links.next || null,
        has_more: !!links.next,
      };
    },
  };
}

function createM365Adapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'm365',
      display_name: 'Microsoft 365 / Graph Security',
      auth_types: ['oauth_client_credentials', 'bearer'],
      dataset_kinds: ['identity', 'alerts', 'email'],
      languages: ['odata'],
      pagination_modes: ['token'],
      docs_url: 'https://learn.microsoft.com/en-us/graph/api/signin-list?view=graph-rest-1.0',
      limitations: [
        'Identity coverage uses sign-in logs; email coverage is alert-centric through security alerts_v2, not full message trace search.',
      ],
      supported_parameters: ['filter', 'service_source', 'top'],
    }),
    prepareQuery({ spec, profile, pagination }) {
      const baseUrl = normalizeBaseUrl(profile, 'https://graph.microsoft.com/v1.0');
      const nextUrl = pagination.cursor && /^https?:\/\//.test(pagination.cursor) ? pagination.cursor : null;

      if (nextUrl) {
        return { request: { method: 'GET', url: nextUrl } };
      }

      if (spec.dataset.kind === 'identity') {
        const clauses = [
          `createdDateTime ge ${spec.time_window.start}`,
          `createdDateTime le ${spec.time_window.end}`,
        ];
        if (spec.parameters.filter) clauses.push(spec.parameters.filter);
        return {
          request: {
            method: 'GET',
            url: buildUrl(baseUrl, 'auditLogs/signIns', {
              '$top': Math.min(spec.pagination.limit, 1000),
              '$filter': clauses.join(' and '),
            }),
          },
        };
      }

      const alertClauses = [
        `createdDateTime ge ${spec.time_window.start}`,
        `createdDateTime le ${spec.time_window.end}`,
      ];
      if (spec.parameters.service_source) {
        alertClauses.push(`serviceSource eq '${spec.parameters.service_source}'`);
      } else if (spec.dataset.kind === 'email') {
        alertClauses.push(`serviceSource eq 'microsoftDefenderForOffice365'`);
      }
      if (spec.parameters.filter) alertClauses.push(spec.parameters.filter);
      return {
        request: {
          method: 'GET',
          url: buildUrl(baseUrl, 'security/alerts_v2', {
            '$top': Math.min(spec.pagination.limit, 1000),
            '$filter': alertClauses.join(' and '),
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: profile?.auth_type || 'oauth_client_credentials',
          scope: (Array.isArray(profile?.scopes) && profile.scopes.length > 0)
            ? profile.scopes.join(' ')
            : 'https://graph.microsoft.com/.default',
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const rows = toArray(response.data?.value).filter(isPlainObject);
      const entities = [];
      const events = rows.map(row => {
        if (spec.dataset.kind === 'identity') {
          addEntitiesFromRecord(entities, 'm365', row, [
            { kind: 'user', paths: ['userPrincipalName', 'userId'] },
            { kind: 'ip', paths: ['ipAddress'] },
            { kind: 'device', paths: ['deviceDetail.deviceId', 'deviceDetail.displayName'] },
          ]);
        } else {
          addEntitiesFromRecord(entities, 'm365', row, [
            { kind: 'alert', paths: ['id', 'providerAlertId'] },
            { kind: 'device', paths: ['evidence.0.deviceDnsName', 'evidence.0.hostName'] },
            { kind: 'file', paths: ['evidence.1.fileDetails.sha256', 'evidence.1.fileDetails.fileName'] },
          ]);
          for (const evidence of toArray(row.evidence).filter(isPlainObject)) {
            addEntity(entities, 'm365', evidence['@odata.type']?.includes('device') ? 'device' : 'artifact', evidence.hostName || evidence.deviceDnsName || evidence.fileDetails?.sha256 || evidence.fileDetails?.fileName, {
              evidence_type: evidence['@odata.type'],
            });
          }
        }
        return normalizeEvent('m365', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['createdDateTime', 'firstActivityDateTime'],
          idPaths: ['id', 'providerAlertId'],
          titlePath: spec.dataset.kind === 'identity' ? 'appDisplayName' : 'title',
          summaryPath: spec.dataset.kind === 'identity' ? 'status.failureReason' : 'description',
        });
      });
      return {
        events,
        entities,
        metadata: {
          backend: 'm365',
          endpoint: spec.dataset.kind === 'identity' ? '/auditLogs/signIns' : '/security/alerts_v2',
        },
        next_cursor: response.data?.['@odata.nextLink'] || null,
        has_more: !!response.data?.['@odata.nextLink'],
      };
    },
  };
}

function createCrowdStrikeAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'crowdstrike',
      display_name: 'CrowdStrike Falcon Alerts',
      auth_types: ['oauth_client_credentials', 'bearer'],
      dataset_kinds: ['alerts', 'endpoint'],
      languages: ['fql'],
      pagination_modes: ['token'],
      docs_url: 'https://docs.falconpy.io/Service-Collections/Alerts.html',
      limitations: [
        'Initial coverage uses the combined alerts surface for large alert retrieval, not the broader event stream products.',
      ],
      supported_parameters: ['filter', 'sort'],
    }),
    preflight({ profile }) {
      if (!normalizeBaseUrl(profile, 'https://api.crowdstrike.com')) {
        throw Object.assign(new Error('CrowdStrike connector requires profile.base_url'), { code: 'CROWDSTRIKE_BASE_URL_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile, pagination }) {
      return {
        request: {
          method: 'POST',
          url: joinUrl(normalizeBaseUrl(profile, 'https://api.crowdstrike.com'), 'alerts/combined/alerts/v1'),
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            after: pagination.cursor || undefined,
            filter: spec.parameters.filter || spec.query.statement,
            limit: Math.min(spec.pagination.limit, 1000),
            sort: spec.parameters.sort || 'created_timestamp.desc',
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: profile?.auth_type || 'oauth_client_credentials',
          token_url: joinUrl(normalizeBaseUrl(profile, 'https://api.crowdstrike.com'), 'oauth2/token'),
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const rows = toArray(response.data?.resources).filter(isPlainObject);
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'crowdstrike', row, [
          { kind: 'device', paths: ['device.device_id', 'device.hostname'] },
          { kind: 'user', paths: ['user_name'] },
          { kind: 'alert', paths: ['id'] },
        ]);
        return normalizeEvent('crowdstrike', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['created_timestamp', 'timestamp'],
          idPaths: ['id'],
          titlePath: 'name',
          summaryPath: 'description',
        });
      });
      return {
        events,
        entities,
        metadata: {
          backend: 'crowdstrike',
          endpoint: '/alerts/combined/alerts/v1',
        },
        next_cursor: response.data?.meta?.pagination?.after || null,
        has_more: !!response.data?.meta?.pagination?.after,
      };
    },
  };
}

function createAwsAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'aws',
      display_name: 'AWS CloudTrail LookupEvents',
      auth_types: ['sigv4'],
      dataset_kinds: ['cloud', 'events'],
      languages: ['api'],
      pagination_modes: ['token'],
      docs_url: 'https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_LookupEvents.html',
      limitations: [
        'Initial coverage uses CloudTrail LookupEvents only, which covers management and Insights events from the last 90 days.',
      ],
      supported_parameters: ['lookup_attribute_key', 'lookup_attribute_value', 'event_category'],
    }),
    preflight({ profile }) {
      if (!profile?.region && !profile?.base_url) {
        throw Object.assign(new Error('AWS connector requires profile.region for SigV4 signing'), { code: 'AWS_REGION_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile, pagination }) {
      const lookupKey = spec.parameters.lookup_attribute_key;
      const lookupValue = spec.parameters.lookup_attribute_value;
      return {
        request: {
          method: 'POST',
          url: profile?.base_url || `https://cloudtrail.${profile.region}.amazonaws.com/`,
          headers: {
            'content-type': 'application/x-amz-json-1.1',
            'x-amz-target': 'com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.LookupEvents',
          },
          body: JSON.stringify({
            StartTime: toUnixSeconds(spec.time_window.start),
            EndTime: toUnixSeconds(spec.time_window.end),
            MaxResults: Math.min(spec.pagination.limit, 50),
            NextToken: pagination.cursor || undefined,
            EventCategory: spec.parameters.event_category || undefined,
            LookupAttributes: lookupKey && lookupValue ? [{
              AttributeKey: lookupKey,
              AttributeValue: lookupValue,
            }] : undefined,
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: {
          type: 'sigv4',
          service: 'cloudtrail',
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const rows = toArray(response.data?.Events).filter(isPlainObject);
      const entities = [];
      const events = rows.map(row => {
        let parsedEvent = null;
        if (typeof row.CloudTrailEvent === 'string' && row.CloudTrailEvent.trim()) {
          parsedEvent = decodeMaybeJson(row.CloudTrailEvent);
        }
        addEntity(entities, 'aws', 'user', row.Username || parsedEvent?.userIdentity?.arn || parsedEvent?.userIdentity?.userName, {});
        addEntity(entities, 'aws', 'cloud-resource', row.Resources?.[0]?.ResourceName || parsedEvent?.resources?.[0]?.ARN || parsedEvent?.requestParameters?.bucketName, {});
        addEntity(entities, 'aws', 'ip', parsedEvent?.sourceIPAddress, {});
        return normalizeEvent('aws', { ...row, CloudTrailEvent: parsedEvent || row.CloudTrailEvent }, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['EventTime'],
          idPaths: ['EventId'],
          titlePath: 'EventName',
          summaryPath: 'EventSource',
        });
      });
      return {
        events,
        entities,
        metadata: {
          backend: 'aws',
          endpoint: 'LookupEvents',
        },
        next_cursor: response.data?.NextToken || null,
        has_more: !!response.data?.NextToken,
      };
    },
  };
}

function createGcpAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'gcp',
      display_name: 'Google Cloud Logging entries.list',
      auth_types: ['service_account', 'bearer'],
      dataset_kinds: ['cloud', 'events'],
      languages: ['logging-filter'],
      pagination_modes: ['token'],
      docs_url: 'https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list',
      limitations: [
        'Initial coverage is Cloud Logging entries.list only.',
      ],
      supported_parameters: ['resource_names', 'order_by', 'filter'],
    }),
    preflight({ spec, profile }) {
      if (!spec.parameters.resource_names && !profile?.default_parameters?.resource_names) {
        throw Object.assign(new Error('GCP connector requires resource_names in parameters or profile defaults'), { code: 'GCP_RESOURCE_NAMES_REQUIRED' });
      }
    },
    prepareQuery({ spec, profile, pagination }) {
      const filter = [spec.parameters.filter || spec.query.statement].filter(Boolean).join(' ');
      return {
        request: {
          method: 'POST',
          url: joinUrl(normalizeBaseUrl(profile, 'https://logging.googleapis.com'), 'v2/entries:list'),
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            resourceNames: toArray(spec.parameters.resource_names),
            filter,
            orderBy: spec.parameters.order_by || 'timestamp desc',
            pageSize: spec.pagination.limit,
            pageToken: pagination.cursor || undefined,
          }),
        },
      };
    },
    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: {
          ...prepared.request,
          url: prepared.request.url.startsWith('http')
            ? prepared.request.url
            : joinUrl(normalizeBaseUrl(profile, 'https://logging.googleapis.com'), 'v2/entries:list'),
        },
        profile,
        secrets,
        auth: {
          type: profile?.auth_type || 'service_account',
        },
        options,
      });
    },
    normalizeResponse({ response, spec }) {
      const rows = toArray(response.data?.entries).filter(isPlainObject);
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'gcp', row, [
          { kind: 'gcp-resource', paths: ['resource.labels.project_id', 'logName'] },
          { kind: 'principal', paths: ['protoPayload.authenticationInfo.principalEmail'] },
          { kind: 'ip', paths: ['httpRequest.remoteIp'] },
        ]);
        return normalizeEvent('gcp', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['timestamp', 'receiveTimestamp'],
          idPaths: ['insertId'],
          titlePath: 'protoPayload.methodName',
          summaryPath: 'textPayload',
        });
      });
      return {
        events,
        entities,
        metadata: {
          backend: 'gcp',
          endpoint: 'entries.list',
        },
        next_cursor: response.data?.nextPageToken || null,
        has_more: !!response.data?.nextPageToken,
      };
    },
  };
}

function createBuiltInConnectorRegistry() {
  return createConnectorRegistry([
    createSplunkAdapter(),
    createElasticAdapter(),
    createSentinelAdapter(),
    createOpenSearchAdapter(),
    createDefenderXDRAdapter(),
    createOktaAdapter(),
    createM365Adapter(),
    createCrowdStrikeAdapter(),
    createAwsAdapter(),
    createGcpAdapter(),
  ]);
}

// --- module.exports: spread SDK + plugin-registry + adapter-specific exports ---
module.exports = {
  ...sdk,
  ...pluginRegistry,

  // Adapter-specific (not in SDK):
  createBuiltInConnectorRegistry,

  // Dispatch coordinator (Phase 43):
  resolveTenantTargets: require('./dispatch.cjs').resolveTenantTargets,
  cloneTenantSpec: require('./dispatch.cjs').cloneTenantSpec,
  dispatchMultiTenant: require('./dispatch.cjs').dispatchMultiTenant,

  // Aggregation (Phase 44):
  tagEventsWithTenant: require('./aggregation.cjs').tagEventsWithTenant,
  deduplicateEntities: require('./aggregation.cjs').deduplicateEntities,
  correlateFindings: require('./aggregation.cjs').correlateFindings,
  aggregateResults: require('./aggregation.cjs').aggregateResults,

  // Heatmap (Phase 44):
  buildHeatmapFromResults: require('./heatmap.cjs').buildHeatmapFromResults,
  writeHeatmapArtifacts: require('./heatmap.cjs').writeHeatmapArtifacts,
  renderHeatmapTable: require('./heatmap.cjs').renderHeatmapTable,
  inferTechniques: require('./heatmap.cjs').inferTechniques,
};
