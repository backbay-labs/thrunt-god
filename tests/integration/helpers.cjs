'use strict';

const { execSync } = require('child_process');

// Container URL constants matching docker-compose port mappings
const SPLUNK_URL = 'http://127.0.0.1:18089';
const SPLUNK_HEC_URL = 'http://127.0.0.1:18088';
const ELASTIC_URL = 'http://127.0.0.1:19200';
const OPENSEARCH_URL = 'http://127.0.0.1:19201';
const SPLUNK_USER = 'admin';
const SPLUNK_PASSWORD = 'TestPass123!';

/**
 * Skip the current test/describe block if Docker is not available.
 * Call at the top of every integration test describe block.
 *
 * @param {import('node:test').TestContext} t - node:test context
 * @returns {boolean} true if Docker is unavailable (test was skipped), false otherwise
 */
function skipIfNoDocker(t) {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return false;
  } catch {
    t.skip('Docker not available');
    return true;
  }
}

/**
 * Poll a URL until it returns HTTP 200. Rejects after timeout.
 *
 * @param {string} url - URL to poll
 * @param {object} [opts]
 * @param {number} [opts.timeout=120000] - Max wait in ms
 * @param {number} [opts.interval=3000] - Delay between attempts in ms
 * @param {RequestInit} [opts.requestInit] - Request options passed to fetch
 * @param {(response: Response) => boolean} [opts.isHealthy] - Optional custom readiness predicate
 * @returns {Promise<void>}
 */
async function waitForHealthy(
  url,
  { timeout = 120000, interval = 3000, requestInit, isHealthy = (response) => response.status === 200 } = {}
) {
  const start = Date.now();
  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > timeout) {
      throw new Error(`waitForHealthy: ${url} did not return HTTP 200 within ${timeout}ms (elapsed: ${elapsed}ms)`);
    }
    try {
      const resp = await fetch(url, requestInit);
      if (isHealthy(resp)) return;
    } catch {
      // Connection refused or network error — retry
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Wait for the Splunk management API to become reachable with admin auth.
 *
 * @param {object} [opts]
 * @param {number} [opts.timeout=120000] - Max wait in ms
 * @param {number} [opts.interval=3000] - Delay between attempts in ms
 * @returns {Promise<void>}
 */
async function ensureSplunkHostAccess({ timeout = 120000, interval = 3000 } = {}) {
  const auth = 'Basic ' + Buffer.from(`${SPLUNK_USER}:${SPLUNK_PASSWORD}`).toString('base64');
  await waitForHealthy(`${SPLUNK_URL}/services/server/info/server-info?output_mode=json`, {
    timeout,
    interval,
    requestInit: {
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    },
    isHealthy: response => response.status === 200,
  });
}

/**
 * Bootstrap a bearer token from Splunk REST API for integration test auth.
 * Uses the /services/authorization/tokens endpoint to create a fresh token.
 *
 * @param {string} baseUrl - Splunk management URL (e.g. http://127.0.0.1:18089)
 * @param {object} opts
 * @param {string} opts.user - Splunk admin username
 * @param {string} opts.password - Splunk admin password
 * @returns {Promise<string>} bearer token
 */
async function createSplunkBearerToken(baseUrl, { user, password }) {
  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const resp = await fetch(`${baseUrl}/services/authorization/tokens?output_mode=json`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      name: user,
      audience: 'search',
      type: 'ephemeral',
    }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create Splunk bearer token: HTTP ${resp.status} — ${text}`);
  }

  const data = await resp.json();
  const token = data?.entry?.[0]?.content?.token;
  if (!token) {
    throw new Error(`Splunk token response missing entry[0].content.token: ${JSON.stringify(data)}`);
  }
  return token;
}

module.exports = {
  skipIfNoDocker,
  waitForHealthy,
  ensureSplunkHostAccess,
  createSplunkBearerToken,
  SPLUNK_URL,
  SPLUNK_HEC_URL,
  ELASTIC_URL,
  OPENSEARCH_URL,
  SPLUNK_USER,
  SPLUNK_PASSWORD,
};
