'use strict';

const packLib = require('./pack.cjs');

// ---------------------------------------------------------------------------
// Query starter templates -- one per built-in connector
// ---------------------------------------------------------------------------

const QUERY_STARTERS = {
  splunk: {
    language: 'spl',
    template: 'index=<index> tenant={{tenant}} earliest=-{{lookback_hours}}h\n| <your_search_logic>\n| stats count by <fields>',
    description: 'SPL search with tenant and time filter',
  },
  elastic: {
    language: 'esql',
    template: 'FROM <index-pattern> | WHERE tenant == "{{tenant}}" AND @timestamp >= NOW() - {{lookback_hours}}h',
    description: 'ES|QL query with tenant and time filter',
  },
  sentinel: {
    language: 'kql',
    template: '<Table>\n| where TimeGenerated > ago({{lookback_hours}}h)\n| where <filter>',
    description: 'KQL query against Log Analytics',
  },
  opensearch: {
    language: 'sql',
    template: "SELECT * FROM <index> WHERE tenant = '{{tenant}}' AND @timestamp >= NOW() - INTERVAL {{lookback_hours}} HOUR",
    description: 'SQL query with tenant and time filter',
  },
  defender_xdr: {
    language: 'kql',
    template: '<Table>\n| where Timestamp > ago({{lookback_hours}}h)\n| where <filter>',
    description: 'Advanced Hunting KQL query',
  },
  crowdstrike: {
    language: 'fql',
    template: 'event_simpleName=<EventType> aid:* <filter>',
    description: 'Falcon Query Language filter',
  },
  okta: {
    language: 'api',
    template: 'eventType eq "<event_type>" and <filter>',
    description: 'Okta System Log API filter',
  },
  m365: {
    language: 'odata',
    template: "/<endpoint>?$filter=<field> eq '{{value}}'",
    description: 'Microsoft Graph API OData filter',
  },
  aws: {
    language: 'api',
    template: 'eventSource=* userIdentity.arn=*{{focus_principal}}*',
    description: 'AWS CloudTrail event filter',
  },
  gcp: {
    language: 'logging-filter',
    template: 'protoPayload.authenticationInfo.principalEmail:{{focus_principal}}',
    description: 'Cloud Logging filter expression',
  },
};

// ---------------------------------------------------------------------------
// Entity scope types -- runtime extraction kinds + proposed scope types
// ---------------------------------------------------------------------------

const ENTITY_SCOPE_TYPES = [
  // 13 runtime extraction kinds (observed in connector adapters)
  { kind: 'user', source: 'runtime', description: 'User account identity' },
  { kind: 'host', source: 'runtime', description: 'Hostname or server name' },
  { kind: 'ip', source: 'runtime', description: 'IP address (v4 or v6)' },
  { kind: 'device', source: 'runtime', description: 'Endpoint device identifier' },
  { kind: 'cloud-account', source: 'runtime', description: 'Cloud provider account or subscription' },
  { kind: 'azure-resource', source: 'runtime', description: 'Azure resource identifier' },
  { kind: 'cloud-resource', source: 'runtime', description: 'Generic cloud resource' },
  { kind: 'gcp-resource', source: 'runtime', description: 'GCP resource identifier' },
  { kind: 'principal', source: 'runtime', description: 'Security principal or service account' },
  { kind: 'resource', source: 'runtime', description: 'Generic resource identifier' },
  { kind: 'alert', source: 'runtime', description: 'Security alert or detection' },
  { kind: 'file', source: 'runtime', description: 'File path or hash' },
  { kind: 'artifact', source: 'runtime', description: 'Evidence artifact or IOC' },

  // 7 proposed scope types (not yet in runtime extraction)
  { kind: 'process', source: 'proposed', description: 'Process name or identifier' },
  { kind: 'session', source: 'proposed', description: 'Authentication or network session' },
  { kind: 'sender', source: 'proposed', description: 'Email or message sender' },
  { kind: 'domain', source: 'proposed', description: 'DNS domain name' },
  { kind: 'mailbox', source: 'proposed', description: 'Email mailbox address' },
  { kind: 'url', source: 'proposed', description: 'URL or URI' },
  { kind: 'geo', source: 'proposed', description: 'Geographic location' },
];

// ---------------------------------------------------------------------------
// getQueryStarter -- lookup a starter template by connector ID
// ---------------------------------------------------------------------------

function getQueryStarter(connectorId) {
  return QUERY_STARTERS[connectorId] || null;
}

// ---------------------------------------------------------------------------
// runIncrementalValidation -- validate a partial pack at a named checkpoint
// ---------------------------------------------------------------------------

function runIncrementalValidation(partialPack, checkpoint, options = {}) {
  const results = [];
  const validCheckpoints = ['identity', 'attack', 'query', 'final'];

  if (!validCheckpoints.includes(checkpoint)) {
    return { checkpoint, passed: false, results: [{ status: 'FAIL', message: `Unknown checkpoint: ${checkpoint}` }] };
  }

  // Normalize through createPackDefinition with allowPartial
  let normalized;
  try {
    normalized = packLib.createPackDefinition(partialPack, { allowPartial: true });
  } catch (err) {
    // createPackDefinition throws on validation failure even with allowPartial
    // Extract errors from the validation object attached to the error
    if (err.validation) {
      for (const msg of err.validation.errors || []) {
        results.push({ status: 'FAIL', message: msg });
      }
      for (const msg of err.validation.warnings || []) {
        results.push({ status: 'WARN', message: msg });
      }
    } else {
      results.push({ status: 'FAIL', message: err.message });
    }

    // Add checkpoint-specific pass messages for things that did not fail
    addCheckpointPassMessages(checkpoint, partialPack, results);

    const hasFail = results.some(r => r.status === 'FAIL');
    return { checkpoint, passed: !hasFail, results };
  }

  // Run validation on normalized pack
  const validation = packLib.validatePackDefinition(normalized, {
    requireComplete: checkpoint === 'final',
  });

  for (const msg of validation.errors || []) {
    results.push({ status: 'FAIL', message: msg });
  }
  for (const msg of validation.warnings || []) {
    results.push({ status: 'WARN', message: msg });
  }

  // For 'query' checkpoint: also check template parameter usage
  if (checkpoint === 'query') {
    const usage = packLib.getPackTemplateUsage(normalized);
    if (usage.undeclared.length > 0) {
      results.push({ status: 'FAIL', message: `Undeclared template parameters: ${usage.undeclared.join(', ')}` });
    }
  }

  // Add checkpoint-specific PASS messages
  addCheckpointPassMessages(checkpoint, normalized, results);

  const hasFail = results.some(r => r.status === 'FAIL');
  return { checkpoint, passed: !hasFail, results };
}

function addCheckpointPassMessages(checkpoint, pack, results) {
  const hasError = (pattern) => results.some(r => r.status === 'FAIL' && r.message.toLowerCase().includes(pattern));

  switch (checkpoint) {
    case 'identity':
      if (!hasError('id ')) {
        results.push({ status: 'PASS', message: 'Pack ID format valid' });
      }
      if (!hasError('kind')) {
        results.push({ status: 'PASS', message: 'Kind-specific requirements met' });
      }
      break;

    case 'attack':
      if (!hasError('attack')) {
        results.push({ status: 'PASS', message: 'ATT&CK technique IDs valid' });
      }
      break;

    case 'query':
      if (!hasError('undeclared') && !hasError('template param')) {
        results.push({ status: 'PASS', message: 'All template parameters declared' });
      }
      if (!hasError('connector')) {
        results.push({ status: 'PASS', message: 'Execution targets reference valid connectors' });
      }
      break;

    case 'final':
      if (!results.some(r => r.status === 'FAIL')) {
        results.push({ status: 'PASS', message: 'Full schema validation passed' });
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// formatValidationResults -- human-readable output with status markers
// ---------------------------------------------------------------------------

function formatValidationResults(validationResult) {
  const { checkpoint, results } = validationResult;
  const lines = [`  Validation (${checkpoint}):`];

  for (const r of results) {
    lines.push(`  [${r.status}] ${r.message}`);
  }

  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const verdict = failCount > 0 ? 'INVALID' : 'VALID';
  const warnNote = warnCount > 0 ? ` (${warnCount} warning${warnCount !== 1 ? 's' : ''})` : '';

  lines.push(`  Result: ${verdict}${warnNote}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = { QUERY_STARTERS, ENTITY_SCOPE_TYPES, getQueryStarter, runIncrementalValidation, formatValidationResults };
