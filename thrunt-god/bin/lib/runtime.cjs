/**
 * Runtime — Adapter factories, connector-specific parsers, and SDK re-exports.
 *
 * SDK primitives (constants, validators, auth utilities, HTTP helpers, normalization,
 * execution engine, readiness assessment) live in connector-sdk.cjs. This module
 * re-exports them via spread for backward compatibility.
 *
 * SIEM connectors (splunk, elastic, sentinel, opensearch, defender-xdr) have been
 * extracted to individual files under connectors/ (Phase 48, Plan 01).
 */

'use strict';

// --- SDK re-export (all SDK primitives now live in connector-sdk.cjs) ---
const sdk = require('./connector-sdk.cjs');

// --- Plugin registry re-export (manifest validation, discovery, registry) ---
const pluginRegistry = require('./plugin-registry.cjs');

// --- SIEM connectors (extracted to connectors/) ---
const {
  createSplunkAdapter,
  createElasticAdapter,
  createSentinelAdapter,
  createOpenSearchAdapter,
  createDefenderXDRAdapter,
} = require('./connectors/index.cjs');

// Destructure SDK functions needed by adapter code below.
// Adapters reference these via closure scope, so they must be in local scope.
const {
  isPlainObject,
  toArray,
  executeConnectorRequest,
  buildUrl,
  joinUrl,
  normalizeBaseUrl,
  addEntity,
  addEntitiesFromRecord,
  normalizeEvent,
  toUnixSeconds,
  parseLinkHeader,
  createConnectorCapabilities,
  createConnectorRegistry,
} = sdk;

// --- Internal SDK helper needed by AWS adapter (decodeMaybeJson) ---
// sleep was only used by executeSplunkAsyncJob, now in connectors/splunk.cjs.
// decodeMaybeJson is still needed by the AWS adapter below.
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

// --- 5 remaining adapter factories (identity, endpoint, cloud -- Plan 02 will extract these) ---

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

  // Contract tests (Phase 47) -- explicit re-exports because ...sdk spread
  // evaluates before connector-sdk.cjs's deferred Object.assign runs
  runContractTests: require('./contract-tests.cjs').runContractTests,
  createTestQuerySpec: require('./contract-tests.cjs').createTestQuerySpec,
  createTestProfile: require('./contract-tests.cjs').createTestProfile,
  createTestSecrets: require('./contract-tests.cjs').createTestSecrets,
};
