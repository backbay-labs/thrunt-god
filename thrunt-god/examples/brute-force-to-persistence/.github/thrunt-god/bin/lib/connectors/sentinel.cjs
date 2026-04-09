'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  isPlainObject,
  toArray,
  createWarning,
  executeConnectorRequest,
  joinUrl,
  normalizeBaseUrl,
  addEntitiesFromRecord,
  normalizeEvent,
  createConnectorCapabilities,
} = sdk;

// --- Sentinel-specific parser ---

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

// --- Sentinel adapter factory ---

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

module.exports = { createSentinelAdapter, normalizeAzureTables };
