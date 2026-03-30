'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  skipIfNoDocker,
  waitForHealthy,
  SPLUNK_URL,
  ELASTIC_URL,
  OPENSEARCH_URL,
  SPLUNK_USER,
  SPLUNK_PASSWORD,
} = require('./helpers.cjs');
const { seedSplunk, seedElastic, seedOpenSearch } = require('./fixtures/seed-data.cjs');

describe('docker infrastructure smoke test', async (t) => {
  if (skipIfNoDocker(t)) return;

  // The smoke test assumes containers are already running via test:integration:up.
  // It verifies health and seeds data, then asserts seed data is queryable.

  test('splunk container is healthy and accepts seed data', async () => {
    await waitForHealthy(`${SPLUNK_URL}/services/server/info`, { timeout: 120000 });
    const result = await seedSplunk(SPLUNK_URL, { user: SPLUNK_USER, password: SPLUNK_PASSWORD });
    assert.ok(result.indexed >= 3, `Expected at least 3 indexed events, got ${result.indexed}`);
  });

  test('elasticsearch container is healthy and accepts seed data', async () => {
    await waitForHealthy(ELASTIC_URL, { timeout: 60000 });
    const result = await seedElastic(ELASTIC_URL);
    assert.ok(result.indexed >= 3, `Expected at least 3 indexed events, got ${result.indexed}`);
  });

  test('opensearch container is healthy and accepts seed data', async () => {
    await waitForHealthy(OPENSEARCH_URL, { timeout: 60000 });
    const result = await seedOpenSearch(OPENSEARCH_URL);
    assert.ok(result.indexed >= 3, `Expected at least 3 indexed events, got ${result.indexed}`);
  });

  test('splunk seed data is queryable via REST search', async () => {
    const auth = 'Basic ' + Buffer.from(`${SPLUNK_USER}:${SPLUNK_PASSWORD}`).toString('base64');
    const resp = await fetch(`${SPLUNK_URL}/services/search/v2/jobs/export`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'search=search index%3Dtest_sysmon | head 10&output_mode=json&earliest_time=-24h&latest_time=now',
    });
    assert.strictEqual(resp.status, 200, `Splunk search returned ${resp.status}`);
    const text = await resp.text();
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
