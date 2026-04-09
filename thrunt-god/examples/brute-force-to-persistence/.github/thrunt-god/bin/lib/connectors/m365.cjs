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
} = sdk;

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

module.exports = { createM365Adapter };
