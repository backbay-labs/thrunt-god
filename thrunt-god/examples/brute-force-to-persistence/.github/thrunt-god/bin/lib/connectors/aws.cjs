'use strict';

const sdk = require('../connector-sdk.cjs');
const {
  toArray,
  isPlainObject,
  executeConnectorRequest,
  addEntity,
  normalizeEvent,
  createConnectorCapabilities,
  toUnixSeconds,
} = sdk;

// --- Internal helper: parse embedded JSON strings (used by CloudTrailEvent) ---
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

module.exports = { createAwsAdapter };
