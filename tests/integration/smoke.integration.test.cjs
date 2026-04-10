'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  skipIfNoDocker,
  waitForHealthy,
  ensureSplunkHostAccess,
  SPLUNK_URL,
  ELASTIC_URL,
  OPENSEARCH_URL,
  SPLUNK_USER,
  SPLUNK_PASSWORD,
  SEARCH_BACKEND_READY_TIMEOUT_MS,
  SPLUNK_READY_TIMEOUT_MS,
} = require('./helpers.cjs');
const { seedSplunk, seedElastic, seedOpenSearch } = require('./fixtures/seed-data.cjs');
const SPLUNK_AUTH = 'Basic ' + Buffer.from(`${SPLUNK_USER}:${SPLUNK_PASSWORD}`).toString('base64');

async function runSplunkSearch(statement) {
  const createResp = await fetch(`${SPLUNK_URL}/services/search/jobs?output_mode=json`, {
    method: 'POST',
    headers: {
      Authorization: SPLUNK_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      search: statement.trim().startsWith('|') ? statement : `search ${statement}`,
      output_mode: 'json',
      earliest_time: '0',
      latest_time: 'now',
    }).toString(),
  });
  assert.strictEqual(createResp.status, 201, `Splunk async job creation returned ${createResp.status}`);
  const createData = await createResp.json();
  const sid = createData.sid;
  assert.ok(sid, 'Splunk async job should return a sid');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pollResp = await fetch(`${SPLUNK_URL}/services/search/jobs/${encodeURIComponent(sid)}?output_mode=json`, {
      headers: { Authorization: SPLUNK_AUTH },
    });
    assert.strictEqual(pollResp.status, 200, `Splunk async job poll returned ${pollResp.status}`);
    const pollData = await pollResp.json();
    const content = pollData?.entry?.[0]?.content || {};
    if (content.isDone === '1' || content.isDone === 1 || content.isDone === true) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const resultsResp = await fetch(`${SPLUNK_URL}/services/search/jobs/${encodeURIComponent(sid)}/results?output_mode=json&count=0`, {
    headers: { Authorization: SPLUNK_AUTH },
  });
  assert.strictEqual(resultsResp.status, 200, `Splunk async job results returned ${resultsResp.status}`);
  return resultsResp.text();
}

async function waitForSplunkSeedQuery(statement, {
  timeout = SPLUNK_READY_TIMEOUT_MS,
  interval = 1000,
  expectedSubstrings = ['ws-01', 'alice'],
} = {}) {
  const start = Date.now();

  while (true) {
    const text = await runSplunkSearch(statement);
    if (expectedSubstrings.some((value) => text.includes(value))) {
      return text;
    }

    if (Date.now() - start > timeout) {
      throw new Error(
        `Splunk search did not return seeded events within ${timeout}ms for query: ${statement}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

describe('docker infrastructure smoke test', async (t) => {
  if (skipIfNoDocker(t)) return;

  // The smoke test assumes containers are already running via test:integration:up.
  // It verifies health and seeds data, then asserts seed data is queryable.

  test('splunk container is healthy and accepts seed data', async () => {
    await ensureSplunkHostAccess({ timeout: SPLUNK_READY_TIMEOUT_MS });
    const result = await seedSplunk(SPLUNK_URL, { user: SPLUNK_USER, password: SPLUNK_PASSWORD });
    assert.ok(result.indexed >= 3, `Expected at least 3 indexed events, got ${result.indexed}`);
  });

  test('elasticsearch container is healthy and accepts seed data', async () => {
    await waitForHealthy(ELASTIC_URL, { timeout: SEARCH_BACKEND_READY_TIMEOUT_MS });
    const result = await seedElastic(ELASTIC_URL);
    assert.ok(result.indexed >= 3, `Expected at least 3 indexed events, got ${result.indexed}`);
  });

  test('opensearch container is healthy and accepts seed data', async () => {
    await waitForHealthy(OPENSEARCH_URL, { timeout: SEARCH_BACKEND_READY_TIMEOUT_MS });
    const result = await seedOpenSearch(OPENSEARCH_URL);
    assert.ok(result.indexed >= 3, `Expected at least 3 indexed events, got ${result.indexed}`);
  });

  test('splunk seed data is queryable via REST search', async () => {
    await ensureSplunkHostAccess({ timeout: SPLUNK_READY_TIMEOUT_MS });
    const text = await waitForSplunkSeedQuery('index=test_sysmon | head 10');
    assert.ok(
      text.includes('ws-01') || text.includes('alice'),
      'Splunk search should return seeded events with host/user fields'
    );
  });

  test('elasticsearch seed data is queryable', async () => {
    const resp = await fetch(`${ELASTIC_URL}/test-sysmon/_search?size=10`);
    assert.strictEqual(resp.status, 200);
    const data = await resp.json();
    assert.ok(data.hits.total.value >= 3, `Expected >= 3 hits, got ${data.hits.total.value}`);
    const source = data.hits.hits[0]._source;
    assert.ok(source['host.name'] || source.host, 'Seed data should contain host field');
  });

  test('opensearch seed data is queryable', async () => {
    const resp = await fetch(`${OPENSEARCH_URL}/test-sysmon/_search?size=10`);
    assert.strictEqual(resp.status, 200);
    const data = await resp.json();
    assert.ok(data.hits.total.value >= 3, `Expected >= 3 hits, got ${data.hits.total.value}`);
    const source = data.hits.hits[0]._source;
    assert.ok(source['host.name'] || source.host, 'Seed data should contain host field');
  });
});
