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

module.exports = { createCrowdStrikeAdapter };
