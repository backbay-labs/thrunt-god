'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  toArray,
  executeConnectorRequest,
  joinUrl,
  normalizeBaseUrl,
  addEntitiesFromRecord,
  normalizeEvent,
  createConnectorCapabilities,
} = sdk;

// Cross-connector import: opensearch adapts elastic's column/value format
const { normalizeElasticRows } = require('./elastic.cjs');

// --- OpenSearch adapter factory ---

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
      if (profile?.auth_type === 'sigv4' && !profile?.region) {
        throw Object.assign(new Error('OpenSearch SigV4 auth requires profile.region'), { code: 'OPENSEARCH_SIGV4_REGION_REQUIRED' });
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

module.exports = { createOpenSearchAdapter };
