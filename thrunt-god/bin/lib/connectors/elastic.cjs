'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  toArray,
  createWarning,
  executeConnectorRequest,
  joinUrl,
  normalizeBaseUrl,
  addEntitiesFromRecord,
  normalizeEvent,
  createConnectorCapabilities,
} = sdk;

// --- Elastic-specific parser (also used by opensearch.cjs) ---

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

// --- Elastic adapter factory ---

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

module.exports = { createElasticAdapter, normalizeElasticRows };
