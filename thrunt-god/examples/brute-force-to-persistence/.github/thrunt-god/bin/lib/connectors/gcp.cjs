'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  toArray,
  isPlainObject,
  executeConnectorRequest,
  joinUrl,
  normalizeBaseUrl,
  addEntitiesFromRecord,
  normalizeEvent,
  createConnectorCapabilities,
} = sdk;

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

module.exports = { createGcpAdapter };
