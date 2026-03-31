'use strict';

/**
 * Seed security event data into Splunk, Elasticsearch, and OpenSearch containers.
 * Each function inserts 3 sysmon-like events with entity-extraction fields
 * (host, user, IP) matching the adapter normalizer expectations.
 */

const SEED_EVENTS = [
  {
    timestamp: '2026-03-28T12:00:00.000Z',
    host: 'ws-01',
    user: 'alice',
    ip: '10.0.0.1',
    eventCode: '1',
    commandLine: 'cmd.exe /c whoami',
  },
  {
    timestamp: '2026-03-28T12:01:00.000Z',
    host: 'ws-02',
    user: 'bob',
    ip: '10.0.0.2',
    eventCode: '3',
    commandLine: 'powershell.exe -enc ZQBjaG8AIABoZWxsbw==',
  },
  {
    timestamp: '2026-03-28T12:02:00.000Z',
    host: 'dc-01',
    user: 'svc-admin',
    ip: '10.0.0.100',
    eventCode: '10',
    commandLine: 'mimikatz.exe sekurlsa::logonpasswords',
  },
];

/**
 * Seed Splunk with security events via REST API.
 * Creates a test_sysmon index, then inserts events via /services/receivers/simple.
 *
 * @param {string} baseUrl - Splunk management URL (e.g. http://127.0.0.1:18089)
 * @param {object} opts
 * @param {string} opts.user - Splunk admin username
 * @param {string} opts.password - Splunk admin password
 * @returns {Promise<{indexed: number}>}
 */
async function seedSplunk(baseUrl, { user, password }) {
  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');

  // Create index (ignore 409 if already exists)
  const createResp = await fetch(`${baseUrl}/services/data/indexes`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'name=test_sysmon',
  });
  if (createResp.status !== 201 && createResp.status !== 409) {
    const text = await createResp.text();
    throw new Error(`Failed to create Splunk index test_sysmon: HTTP ${createResp.status} — ${text}`);
  }

  let indexed = 0;
  for (const evt of SEED_EVENTS) {
    const eventBody = JSON.stringify({
      _time: evt.timestamp,
      host: evt.host,
      user: evt.user,
      src_ip: evt.ip,
      EventCode: evt.eventCode,
      CommandLine: evt.commandLine,
    });

    const resp = await fetch(
      `${baseUrl}/services/receivers/simple?index=test_sysmon&sourcetype=sysmon`,
      {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: eventBody,
      }
    );
    if (resp.ok) indexed++;
    else {
      const text = await resp.text();
      throw new Error(`Splunk seed event failed: HTTP ${resp.status} — ${text}`);
    }
  }

  return { indexed };
}

function buildSearchSeedBody() {
  const lines = [];
  for (const evt of SEED_EVENTS) {
    lines.push(JSON.stringify({ index: { _index: 'test-sysmon' } }));
    lines.push(JSON.stringify({
      '@timestamp': evt.timestamp,
      'host.name': evt.host,
      'user.name': evt.user,
      'source.ip': evt.ip,
      'event.code': evt.eventCode,
      'process.command_line': evt.commandLine,
    }));
  }
  return lines.join('\n') + '\n';
}

async function seedSearchBackend(baseUrl, backendLabel) {
  const resp = await fetch(`${baseUrl}/_bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: buildSearchSeedBody(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${backendLabel} bulk insert failed: HTTP ${resp.status} — ${text}`);
  }

  const result = await resp.json();
  if (result.errors) {
    const firstError = result.items.find(i => i.index?.error);
    throw new Error(`${backendLabel} bulk insert had errors: ${JSON.stringify(firstError?.index?.error)}`);
  }

  const refreshResp = await fetch(`${baseUrl}/test-sysmon/_refresh`, { method: 'POST' });
  if (!refreshResp.ok) {
    const text = await refreshResp.text();
    throw new Error(`${backendLabel} refresh failed: HTTP ${refreshResp.status} — ${text}`);
  }

  return { indexed: result.items.length };
}

/**
 * Seed Elasticsearch with security events via bulk API.
 *
 * @param {string} baseUrl - Elasticsearch URL (e.g. http://127.0.0.1:19200)
 * @returns {Promise<{indexed: number}>}
 */
async function seedElastic(baseUrl) {
  return seedSearchBackend(baseUrl, 'Elasticsearch');
}

/**
 * Seed OpenSearch with security events via bulk API.
 * Identical pattern to seedElastic but targets the OpenSearch URL.
 *
 * @param {string} baseUrl - OpenSearch URL (e.g. http://127.0.0.1:19201)
 * @returns {Promise<{indexed: number}>}
 */
async function seedOpenSearch(baseUrl) {
  return seedSearchBackend(baseUrl, 'OpenSearch');
}

module.exports = { seedSplunk, seedElastic, seedOpenSearch };
