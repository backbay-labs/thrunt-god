'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  toArray,
  isPlainObject,
  buildUrl,
  normalizeBaseUrl,
  executeConnectorRequest,
  addEntitiesFromRecord,
  addEntity,
  normalizeEvent,
  createConnectorCapabilities,
  parseLinkHeader,
} = sdk;

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

module.exports = { createOktaAdapter };
