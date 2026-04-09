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

// --- Defender XDR-specific parser ---

function normalizeDefenderResults(payload) {
  // Defender XDR returns {Schema: [{Name, Type}], Results: [{key: value}], Stats: {...}}
  // Results are pre-formed objects -- no column mapping needed
  return toArray(payload?.Results);
}

// --- Defender XDR adapter factory ---

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

module.exports = { createDefenderXDRAdapter, normalizeDefenderResults };
