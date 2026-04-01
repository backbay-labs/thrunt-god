# Connector Plugin Developer Guide

Build, test, and publish standalone connector plugins for THRUNT GOD.

This guide walks you through the full lifecycle of creating a third-party connector -- from scaffolding to publishing on npm. A developer familiar with Node.js and REST APIs should be able to complete the entire workflow in under 2 hours.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Quick Start](#2-quick-start)
3. [Plugin Manifest Reference](#3-plugin-manifest-reference)
4. [Adapter Interface](#4-adapter-interface)
5. [SDK API Reference](#5-sdk-api-reference)
6. [Testing Your Connector](#6-testing-your-connector)
7. [CI Integration](#7-ci-integration)
8. [Publishing to npm](#8-publishing-to-npm)
9. [Contribution Guidelines](#9-contribution-guidelines)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

A THRUNT GOD connector plugin is a standalone npm package that teaches the threat-hunting orchestrator how to query a specific security data source (SIEM, EDR, identity provider, cloud platform, etc.).

**How it fits into the ecosystem:**

```
+-----------------+       +-------------------+       +------------------+
|  Hunt Pack      | ----> |  THRUNT GOD Core  | ----> |  Your Connector  |
|  (query specs)  |       |  (orchestrator)   |       |  (plugin)        |
+-----------------+       +-------------------+       +------------------+
                                                             |
                                                             v
                                                      +------------------+
                                                      |  Your SIEM/EDR   |
                                                      |  API endpoint    |
                                                      +------------------+
```

**Security model:** THRUNT GOD is local-first. Credentials never leave the operator's machine. Your connector receives secrets at execution time via environment variables or files -- secrets are never stored in config, logged, or transmitted to third parties.

**Plugin discovery:** THRUNT GOD discovers plugins in three ways:
- **Built-in connectors** (10 shipped with the core)
- **node_modules** packages with a `thrunt-connector.json` manifest
- **Explicit config paths** specified in the operator's config file

---

## 2. Quick Start

Scaffold a new connector project in under 5 minutes:

```bash
# Scaffold the project
thrunt connectors init my_vendor

# Enter the project directory and install dependencies
cd thrunt-connector-my_vendor
npm install

# Run the contract tests (should pass with the stub adapter)
npm test
```

### What was created

| File | Purpose |
|------|---------|
| `package.json` | npm package with `thrunt-god` as a peer dependency and `c8` for coverage |
| `thrunt-connector.json` | Plugin manifest declaring capabilities, auth types, and permissions |
| `src/index.cjs` | Adapter module exporting `createAdapter()` with 4 TODO sections |
| `tests/unit.test.cjs` | Unit tests with mock server and adapter validation |
| `tests/contract.test.cjs` | Contract test suite (~25 automated checks) |
| `README.md` | Documentation with quick start, CI integration, and publishing guide |
| `.gitignore` | Standard Node.js gitignore |

### Customization flags

```bash
# Specify auth types, dataset kinds, and more
thrunt connectors init my_vendor \
  --auth api_key,bearer \
  --datasets events,alerts \
  --languages api,sql \
  --pagination cursor \
  --display-name "My Vendor EDR" \
  --docs-url "https://docs.myvendor.com/api"

# Preview what would be created without writing files
thrunt connectors init my_vendor --dry-run

# Use scoped package name (@thrunt/ namespace)
thrunt connectors init my_vendor --scoped
```

### See what's installed

```bash
# List all installed connectors (built-in + plugins)
thrunt connectors list

# Search npm for available connectors
thrunt connectors search sentinelone
```

---

## 3. Plugin Manifest Reference

Every connector plugin must include a `thrunt-connector.json` file in its package root. This manifest declares the connector's capabilities and is validated at discovery time.

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | `string` | npm package name | `"thrunt-connector-sentinelone"` |
| `version` | `string` | Semver version | `"0.1.0"` |
| `sdk_version` | `string` | Compatible thrunt-god semver range | `"^0.1.0"` |
| `connector_id` | `string` | Lowercase identifier (2-64 chars, `/^[a-z][a-z0-9_-]{1,63}$/`) | `"sentinelone"` |
| `display_name` | `string` | Human-readable name | `"SentinelOne"` |
| `entry` | `string` | Relative path to CJS module exporting `createAdapter()` | `"./src/index.cjs"` |
| `auth_types` | `string[]` | Authentication methods supported | `["api_key"]` |
| `dataset_kinds` | `string[]` | Data categories the connector can query | `["events", "alerts"]` |
| `languages` | `string[]` | Query languages supported | `["api", "dv"]` |
| `pagination_modes` | `string[]` | Pagination strategies supported | `["cursor", "none"]` |
| `permissions` | `object` | Runtime permission declarations | See below |

### Permissions Object

```json
{
  "permissions": {
    "network": true,
    "filesystem": false,
    "subprocess": false,
    "env_access": ["SENTINELONE_TOKEN", "SENTINELONE_URL"]
  }
}
```

- `network` (boolean): Whether the connector makes outbound HTTP requests (almost always `true`)
- `filesystem` (boolean): Whether the connector reads/writes local files
- `subprocess` (boolean): Whether the connector spawns child processes
- `env_access` (string[]): List of environment variable names the connector reads

### Valid Enum Values

**auth_types:** `api_key`, `basic`, `bearer`, `oauth_client_credentials`, `oauth_refresh`, `sigv4`, `service_account`, `session`

**dataset_kinds:** `events`, `alerts`, `entities`, `identity`, `endpoint`, `cloud`, `email`, `other`

**pagination_modes:** `auto`, `none`, `cursor`, `offset`, `page`, `token`

### Example Manifest

```json
{
  "name": "thrunt-connector-sentinelone",
  "version": "0.1.0",
  "sdk_version": "^0.1.0",
  "connector_id": "sentinelone",
  "display_name": "SentinelOne",
  "entry": "./src/index.cjs",
  "auth_types": ["api_key"],
  "dataset_kinds": ["events", "alerts"],
  "languages": ["api", "dv"],
  "pagination_modes": ["cursor"],
  "permissions": {
    "network": true,
    "filesystem": false,
    "subprocess": false,
    "env_access": ["SENTINELONE_TOKEN"]
  }
}
```

### Validation

Validate your manifest locally:

```bash
# Via npm script (configured in scaffolded package.json)
npm run validate

# Or via the thrunt CLI (when installed as a plugin)
thrunt runtime doctor-connectors
```

---

## 4. Adapter Interface

Your connector module must export a `createAdapter()` function that returns an adapter object. The adapter has 4 methods (1 optional, 3 required):

### Method Signatures

```javascript
function createAdapter() {
  return {
    capabilities: createConnectorCapabilities({ /* ... */ }),

    // Optional: Validate config before query execution
    preflight({ profile }) { /* ... */ },

    // Required: Build an HTTP request from a QuerySpec
    prepareQuery({ spec, profile, pagination }) { /* ... */ },

    // Required: Execute the request with auth
    executeRequest({ prepared, profile, secrets, options }) { /* ... */ },

    // Required: Transform the raw response into the standard envelope
    normalizeResponse({ response, spec }) { /* ... */ },
  };
}

module.exports = { createAdapter };
```

### preflight (optional)

Validate prerequisites before query execution. Throw an error with a descriptive `code` property if requirements are not met.

```javascript
preflight({ profile }) {
  const baseUrl = normalizeBaseUrl(profile);
  if (!baseUrl) {
    throw Object.assign(
      new Error('SentinelOne connector requires profile.base_url'),
      { code: 'SENTINELONE_BASE_URL_REQUIRED' }
    );
  }
}
```

**Parameters:**
- `profile` (object): The connector profile from the operator's config (contains `base_url`, `auth_type`, `secret_refs`, etc.)

### prepareQuery (required)

Translate a QuerySpec into a backend-native HTTP request. This is where you map THRUNT GOD's universal query format to your API's specific endpoint, parameters, and body format.

```javascript
prepareQuery({ spec, profile, pagination }) {
  const baseUrl = normalizeBaseUrl(profile);
  const url = joinUrl(baseUrl, '/web/api/v2.1/dv/events');

  return {
    request: {
      method: 'GET',
      url: buildUrl(url, {
        query: spec.query.statement,
        fromDate: spec.time_window?.start,
        toDate: spec.time_window?.end,
        limit: pagination?.limit || 100,
        cursor: pagination?.cursor || undefined,
      }),
      headers: { 'content-type': 'application/json' },
    },
  };
}
```

**Parameters:**
- `spec` (QuerySpec): Contains `query.statement`, `query.language`, `dataset.kind`, `time_window.start`, `time_window.end`
- `profile` (object): Connector profile with `base_url`, `auth_type`, `secret_refs`
- `pagination` (object|null): Contains `cursor`, `offset`, `page`, `limit` depending on pagination mode

**Return:** `{ request: { method, url, headers, body? } }`

### executeRequest (required)

Execute the prepared request with authentication. Most connectors can delegate to the SDK's `executeConnectorRequest` helper, which handles auth injection, retries, and timeout.

```javascript
executeRequest({ prepared, profile, secrets, options }) {
  return executeConnectorRequest({
    request: prepared.request,
    profile,
    secrets,
    auth: { type: profile?.auth_type || 'api_key' },
    options,
  });
}
```

**Parameters:**
- `prepared` (object): The return value from `prepareQuery`
- `profile` (object): Connector profile
- `secrets` (object): Resolved secrets (tokens, passwords) from `secret_refs`
- `options` (object): Execution options (timeout, retries, etc.)

### normalizeResponse (required)

Transform the backend's raw response into the standard envelope shape. This is where you extract events, entities (hosts, users, IPs), and pagination state.

```javascript
normalizeResponse({ response, spec }) {
  const rows = toArray(response.data?.data);
  const entities = [];

  const events = rows.map(row => {
    addEntitiesFromRecord(entities, 'sentinelone', row, [
      { kind: 'host', paths: ['agentComputerName', 'endpoint.name'] },
      { kind: 'user', paths: ['user', 'srcProcUser'] },
      { kind: 'ip', paths: ['agentIp', 'networkIp'] },
    ]);

    return normalizeEvent('sentinelone', row, {
      datasetKind: spec.dataset.kind,
      timestampPaths: ['createdAt', 'eventTime'],
      idPaths: ['id', 'eventId'],
      titlePath: 'eventType',
    });
  });

  return {
    events,
    entities,
    warnings: [],
    metadata: {
      backend: 'sentinelone',
      endpoint: '/web/api/v2.1/dv/events',
      total_items: response.data?.pagination?.totalItems,
    },
    has_more: !!response.data?.pagination?.nextCursor,
    next_cursor: response.data?.pagination?.nextCursor || null,
  };
}
```

**Return shape:**

| Field | Type | Description |
|-------|------|-------------|
| `events` | `object[]` | Normalized event objects |
| `entities` | `object[]` | Extracted entities (host, user, ip, domain, hash, process) |
| `warnings` | `string[]` | Non-fatal issues during normalization |
| `metadata` | `object` | Backend-specific metadata (endpoint, counts, etc.) |
| `has_more` | `boolean` | Whether more pages are available |
| `next_cursor` | `string\|null` | Pagination cursor for the next page |

### Minimal Working Adapter

Here is a complete minimal adapter that queries a JSON API:

```javascript
'use strict';

const {
  createConnectorCapabilities,
  normalizeBaseUrl,
  joinUrl,
  buildUrl,
  executeConnectorRequest,
  toArray,
  addEntitiesFromRecord,
  normalizeEvent,
} = require('thrunt-god/thrunt-god/bin/lib/connector-sdk.cjs');

function createAdapter() {
  return {
    capabilities: createConnectorCapabilities({
      id: 'my_vendor',
      display_name: 'My Vendor',
      auth_types: ['api_key'],
      dataset_kinds: ['events'],
      languages: ['api'],
      pagination_modes: ['none'],
    }),

    preflight({ profile }) {
      if (!normalizeBaseUrl(profile)) {
        throw Object.assign(new Error('base_url required'), { code: 'MY_VENDOR_BASE_URL' });
      }
    },

    prepareQuery({ spec, profile }) {
      return {
        request: {
          method: 'GET',
          url: buildUrl(joinUrl(normalizeBaseUrl(profile), '/api/events'), {
            q: spec.query.statement,
            from: spec.time_window?.start,
            to: spec.time_window?.end,
          }),
          headers: { 'accept': 'application/json' },
        },
      };
    },

    executeRequest({ prepared, profile, secrets, options }) {
      return executeConnectorRequest({
        request: prepared.request,
        profile,
        secrets,
        auth: { type: 'api_key' },
        options,
      });
    },

    normalizeResponse({ response, spec }) {
      const rows = toArray(response.data?.events);
      const entities = [];
      const events = rows.map(row => {
        addEntitiesFromRecord(entities, 'my_vendor', row, [
          { kind: 'host', paths: ['hostname'] },
          { kind: 'ip', paths: ['source_ip', 'dest_ip'] },
        ]);
        return normalizeEvent('my_vendor', row, {
          datasetKind: spec.dataset.kind,
          timestampPaths: ['timestamp', 'created_at'],
          idPaths: ['id'],
          titlePath: 'event_type',
        });
      });
      return { events, entities, warnings: [], metadata: { backend: 'my_vendor' }, has_more: false, next_cursor: null };
    },
  };
}

module.exports = { createAdapter };
```

---

## 5. SDK API Reference

All SDK functions are available from the connector-sdk module:

```javascript
const sdk = require('thrunt-god/thrunt-god/bin/lib/connector-sdk.cjs');
```

### Core Factories

| Function | Description |
|----------|-------------|
| `createConnectorCapabilities(opts)` | Create a validated capabilities descriptor for your adapter |
| `createConnectorRegistry(adapters)` | Create a registry from an array of adapter objects |

### URL Helpers

| Function | Description |
|----------|-------------|
| `normalizeBaseUrl(profile)` | Extract and normalize `base_url` from a profile (strips trailing slash) |
| `joinUrl(base, path)` | Join a base URL with a path segment |
| `buildUrl(url, params)` | Append query parameters to a URL |

### HTTP and Auth

| Function | Description |
|----------|-------------|
| `executeConnectorRequest(opts)` | Execute an HTTP request with auth, retries, and timeout |
| `authorizeRequest(request, auth, secrets)` | Inject auth headers/params into a request object |
| `performHttpRequest(request, options)` | Low-level HTTP request without auth handling |

### Normalization

| Function | Description |
|----------|-------------|
| `normalizeEvent(connectorId, row, opts)` | Normalize a raw event row into the standard shape |
| `addEntity(entities, kind, value, source)` | Add a single entity (deduped) to an entities array |
| `addEntitiesFromRecord(entities, source, record, mapping)` | Extract and add multiple entities from a record using path mappings |
| `toArray(value)` | Coerce a value to an array (wraps non-arrays, handles null) |
| `getNestedValue(obj, path)` | Safely read a nested property by dot-separated path |

### Response Parsing

| Function | Description |
|----------|-------------|
| `parseResponseBody(response)` | Parse response body as JSON or text |
| `parseLinkHeader(header)` | Parse HTTP `Link` headers for pagination |

### Validation

| Function | Description |
|----------|-------------|
| `validateConnectorAdapter(adapter)` | Validate an adapter object against the SDK contract |
| `validateConnectorCapabilities(caps)` | Validate a capabilities descriptor |

### Result Building

| Function | Description |
|----------|-------------|
| `createResultEnvelope(data)` | Create a standard result envelope |
| `createWarning(code, message)` | Create a structured warning |
| `createRuntimeError(code, message)` | Create a structured error |

### Testing Utilities

| Function | Description |
|----------|-------------|
| `runContractTests(factory, opts)` | Run the full ~25-check contract test suite against an adapter |
| `createTestQuerySpec(overrides)` | Create a test QuerySpec with sensible defaults |
| `createTestProfile(overrides)` | Create a test connector profile |
| `createTestSecrets(overrides)` | Create test secrets |

Test utilities are also available from the contract-tests module:

```javascript
const { runContractTests } = require('thrunt-god/thrunt-god/bin/lib/contract-tests.cjs');
```

For mock servers in unit tests:

```javascript
const { startJsonServer } = require('thrunt-god/tests/runtime-fixtures.cjs');
```

### Constants

| Constant | Values |
|----------|--------|
| `AUTH_TYPES` | `api_key`, `basic`, `bearer`, `oauth_client_credentials`, `oauth_refresh`, `sigv4`, `service_account`, `session` |
| `DATASET_KINDS` | `events`, `alerts`, `entities`, `identity`, `endpoint`, `cloud`, `email`, `other` |
| `PAGINATION_MODES` | `auto`, `none`, `cursor`, `offset`, `page`, `token` |

---

## 6. Testing Your Connector

### Unit Tests with Mock Server

The scaffolded project includes a unit test that uses `startJsonServer` to mock your backend's API:

```javascript
const { startJsonServer } = require('thrunt-god/tests/runtime-fixtures.cjs');

test('executes query and normalizes response', async () => {
  const fixture = await startJsonServer(async ({ req, body }) => {
    // Assert request shape and return mock response
    return {
      json: {
        events: [
          { id: 'evt-001', timestamp: '2025-01-01T12:00:00Z', hostname: 'ws-01' }
        ],
      },
    };
  });

  try {
    const registry = createConnectorRegistry([createAdapter()]);
    const result = await executeQuerySpec(querySpec, registry, { config });
    assert.strictEqual(result.envelope.status, 'ok');
  } finally {
    await fixture.close();
  }
});
```

### Contract Test Suite

The contract test suite runs approximately 25 automated checks against your adapter, validating:

- **Capabilities shape:** All required fields present, valid enum values, correct types
- **Method signatures:** `prepareQuery`, `executeRequest`, `normalizeResponse` exist and are callable
- **Response normalization:** Returns proper envelope shape with `events`, `entities`, `warnings`, `metadata`, `has_more`, `next_cursor`
- **Adapter validation:** Passes `validateConnectorAdapter()` structural checks
- **Timeout handling:** Adapter responds within configured timeout budget

```javascript
const { runContractTests } = require('thrunt-god/thrunt-god/bin/lib/contract-tests.cjs');
const { createAdapter } = require('../src/index.cjs');
const { describe } = require('node:test');

describe('my_vendor contract tests', () => {
  runContractTests(() => createAdapter(), { connectorId: 'my_vendor' });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run a specific test file
node --test tests/unit.test.cjs
```

### Common Contract Test Failures

| Failure | Cause | Fix |
|---------|-------|-----|
| `capabilities.id missing` | `createConnectorCapabilities` not called or `id` omitted | Add `id` field to capabilities |
| `prepareQuery must return request` | `prepareQuery` returns undefined or missing `request` key | Return `{ request: { method, url, headers } }` |
| `normalizeResponse must return events array` | `normalizeResponse` returns undefined or wrong shape | Return `{ events: [], entities: [], warnings: [], metadata: {}, has_more: false, next_cursor: null }` |
| `adapter validation failed` | Missing required method | Ensure all 3 required methods are defined |
| `auth_types invalid` | Using a value not in `AUTH_TYPES` constant | Check the valid enum values in Section 3 |

---

## 7. CI Integration

### Using the Reusable Workflow

Add this workflow to your repository at `.github/workflows/connector-test.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    uses: backbay-labs/thrunt-god/.github/workflows/reusable-connector-test.yml@main
    with:
      thrunt-version: 'latest'
      node-version: '22'
```

### What the Workflow Validates

The reusable workflow `reusable-connector-test.yml` performs these steps:

1. **Checkout** your connector repository
2. **Setup Node.js** with the specified version
3. **Install thrunt-god** at the specified version (for SDK and contract tests)
4. **npm ci** to install your connector's dependencies
5. **Manifest validation** via `thrunt runtime doctor-connectors` (checks `thrunt-connector.json`)
6. **Unit tests** via `node --test tests/`
7. **Contract tests** via `node --test tests/contract.test.cjs`
8. **Coverage report** via `c8` with LCOV output uploaded as an artifact

### Workflow Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `thrunt-version` | `latest` | Version of thrunt-god to install |
| `node-version` | `22` | Node.js version |
| `connector-directory` | `.` | Working directory (for monorepo setups) |

---

## 8. Publishing to npm

### Package Naming Conventions

| Namespace | Meaning | Requirements |
|-----------|---------|--------------|
| `@thrunt/connector-*` | **Verified** connectors | Code review by maintainers, security audit |
| `thrunt-connector-*` | **Community** connectors | Self-published, no review required |

### Required Keywords

Your `package.json` must include these keywords for discovery via `thrunt connectors search`:

```json
{
  "keywords": ["thrunt-god", "thrunt-connector", "your-vendor-name"]
}
```

### Publishing Workflow

```bash
# 1. Ensure all tests pass
npm test

# 2. Validate manifest
npm run validate

# 3. Bump version
npm version patch  # or minor/major

# 4. Publish
npm publish

# 5. Verify discoverability
thrunt connectors search your-vendor-name
```

### Discoverability

After publishing, operators can find your connector with:

```bash
thrunt connectors search sentinelone
```

This searches the npm registry for packages matching `thrunt-connector` and the search term, filtering by name and keywords.

### Pre-publish Checklist

- [ ] All contract tests pass (`npm test`)
- [ ] Manifest validates (`npm run validate`)
- [ ] `thrunt-connector.json` has correct `connector_id` and `sdk_version`
- [ ] `package.json` includes `thrunt-god` and `thrunt-connector` keywords
- [ ] README includes auth configuration instructions
- [ ] No secrets or credentials in committed files

---

## 9. Contribution Guidelines

### Connector Naming Conventions

- **connector_id:** Lowercase, underscores only, starts with a letter. 2-64 characters. Must match `/^[a-z][a-z0-9_-]{1,63}$/`.
- **display_name:** Title-cased human-readable name (e.g., `SentinelOne`, `CrowdStrike Falcon`).
- **Package name:** `thrunt-connector-{connector_id}` for community, `@thrunt/connector-{connector_id}` for verified.

### Code Review Criteria for @thrunt/ Namespace

To publish under the verified `@thrunt/` namespace, your connector must pass:

1. **Contract tests:** All ~25 checks pass
2. **Manifest validation:** All required fields correct, permissions accurately declared
3. **Security review:** No credential leaks, proper secret handling via `secret_refs`
4. **Code quality:** No eval(), no dynamic requires of user input, proper error handling
5. **Documentation:** README with auth configuration and usage examples

### Contract Test Pass Requirement

All connectors (community and verified) must pass the contract test suite before publishing. The CI workflow enforces this automatically.

### Security Review Process for Verified Namespace

1. Open a pull request against the [thrunt-god](https://github.com/backbay-labs/thrunt-god) repository
2. Include your connector as a new directory under `connectors/` or as a link to your published package
3. Maintainers review: permission declarations, secret handling, network endpoints, error paths
4. Upon approval, the connector is published under `@thrunt/connector-*`

---

## 10. Troubleshooting

### Common Contract Test Failures

**"capabilities.auth_types contains invalid value"**
- Your `auth_types` array contains a string not in the `AUTH_TYPES` constant
- Valid values: `api_key`, `basic`, `bearer`, `oauth_client_credentials`, `oauth_refresh`, `sigv4`, `service_account`, `session`

**"prepareQuery did not return request object"**
- Your `prepareQuery` method must return `{ request: { method, url, headers } }`
- The `method` must be a valid HTTP method string
- The `url` must be a non-empty string

**"normalizeResponse returned invalid shape"**
- Must return `{ events, entities, warnings, metadata, has_more, next_cursor }`
- `events` and `entities` must be arrays (can be empty)
- `has_more` must be a boolean
- `next_cursor` must be a string or null

### Manifest Validation Errors

**"Missing required field: X"**
- Your `thrunt-connector.json` is missing a required field
- See the [Required Fields](#required-fields) table for the complete list

**"connector_id format invalid"**
- Must be lowercase letters, numbers, underscores, and hyphens
- Must start with a letter
- Must be between 2-64 characters

**"sdk_version incompatible"**
- The `sdk_version` range in your manifest does not include the installed thrunt-god version
- Update to a compatible range (e.g., `"^0.1.0"`)

### Auth Configuration Issues

**"secret_refs not found"**
- The connector profile in the operator's config does not have the expected `secret_refs` entries
- Ensure the profile maps secret names to `{ type: "env", value: "ENV_VAR_NAME" }`

**"Environment variable not set"**
- The environment variable referenced by a secret_ref is not defined
- Set it: `export MY_VENDOR_TOKEN="your-token-here"`

**"401 Unauthorized from backend"**
- The API token/key is invalid or expired
- Verify the token works with a direct curl request before debugging the connector

### Plugin Not Discovered

**"Connector not found after npm install"**
- Ensure `thrunt-connector.json` exists in the package root
- Ensure the `entry` field points to a valid CJS module that exports `createAdapter()`
- Run `thrunt connectors list` to see discovered plugins
- Run `thrunt runtime doctor-connectors` for detailed diagnostics

---

*Last updated: 2026-03-31*
