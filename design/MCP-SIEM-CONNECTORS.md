# MCP/SIEM Connectors -- Design Specification

**Version:** 1.0
**Date:** 2026-04-02
**Status:** Draft
**Branch:** feat/drain-template-clustering

This document describes the integration layer that connects thrunt-god's hunt
orchestration platform to live SIEM data sources (Splunk, Microsoft Sentinel,
CrowdStrike Falcon) via both the existing connector SDK and the Model Context
Protocol (MCP). The goal: eliminate copy-paste query workflows and feed live
telemetry into Drain template clustering.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Connector Interface Contract](#connector-interface-contract)
- [Per-Platform Implementation Notes](#per-platform-implementation-notes)
- [Authentication and Credential Management](#authentication-and-credential-management)
- [Query Lifecycle](#query-lifecycle)
- [Query Translation Layer](#query-translation-layer)
- [Result Normalization and Drain Integration](#result-normalization-and-drain-integration)
- [Rate Limiting and Pagination](#rate-limiting-and-pagination)
- [Error Handling and Retry Strategy](#error-handling-and-retry-strategy)
- [MCP Tool Definitions](#mcp-tool-definitions)
- [IPC: VSCode Extension Progress Reporting](#ipc-vscode-extension-progress-reporting)
- [Environment Auto-Population](#environment-auto-population)
- [Testing Approach](#testing-approach)
- [Phased Rollout Plan](#phased-rollout-plan)
- [Estimated Effort Breakdown](#estimated-effort-breakdown)

---

## Architecture Overview

```
 +-------------------------------------------------------------------+
 |                          MCP CLIENT                                |
 |  (Claude Code / Claude Agent / VSCode Copilot / external agent)   |
 +-------------------------------+-----------------------------------+
                                 | JSON-RPC 2.0 (tools/call)
 +-------------------------------v-----------------------------------+
 |                       MCP SERVER (thrunt-god)                      |
 |  apps/terminal/src/mcp/index.ts                                   |
 |                                                                    |
 |  New tools:                                                        |
 |    siem_query         - Execute a hunt query against a connector   |
 |    siem_status        - Poll job status / progress                 |
 |    siem_discover      - List connectors, datasets, field schemas   |
 |    siem_env_populate  - Auto-populate ENVIRONMENT.md from live     |
 |                         telemetry metadata                         |
 +------+--------+--------+---------+--------------------------------+
        |        |        |         |
 +------v--+ +---v----+ +-v------+ +v-----------+
 |Connector | |Connect.| |Connect.| | Connector  |
 |Orchestr. | |Registry| |Profile | | Health     |
 |(new)     | |(exists)| |Resolve | | Doctor     |
 +------+---+ +---+----+ +(exists)+ | (exists)   |
        |         |                  +------------+
 +------v---------v--------------------------------------+
 |           CONNECTOR SDK (connector-sdk.cjs)            |
 |  createQuerySpec | executeConnectorRequest | normalize |
 |  createResultEnvelope | pagination state machine      |
 +------+--------+--------+-----------------------------+
        |        |        |
 +------v--+ +---v----+ +-v---------+
 | Splunk   | |Sentinel| |CrowdStrike|
 | Adapter  | |Adapter | |Adapter    |
 | (exists) | |(exists)| |(exists)   |
 +------+---+ +---+----+ +----+-----+
        |         |            |
 +------v---------v------------v-----------+
 |            SIEM APIs (external)          |
 |  Splunk REST | Azure Log Analytics      |
 |  CrowdStrike Falcon API                |
 +------------------------------------------+
        |
 +------v------------------------------------------+
 |         RESULT PIPELINE (new)                    |
 |  Normalize -> Drain Clustering -> QRY-*.md      |
 |  -> Manifest -> Evidence chain                  |
 +------+------------------------------------------+
        | IPC (postMessage / file watch)
 +------v------------------------------------------+
 |         VSCODE EXTENSION                         |
 |  Drain Template Viewer | Status Bar | Sidebar   |
 +--------------------------------------------------+
```

### Key Principle: Adapters Already Exist

The three connectors (Splunk, Sentinel, CrowdStrike) already have adapter
implementations in `thrunt-god/bin/lib/connectors/`. They implement the
full adapter interface: `preflight`, `prepareQuery`, `executeRequest`,
`normalizeResponse`. The connector SDK provides `createQuerySpec`,
`createResultEnvelope`, pagination state machines, auth profile resolution,
and secret reference resolution.

What does NOT exist yet:

1. **MCP tool wrappers** that expose connector execution as MCP-callable tools
2. **A connector orchestrator** that manages the full lifecycle (submit, poll,
   stream, normalize, emit artifacts)
3. **Query translation** from thrunt-god's abstract hunt format to SPL/KQL/FQL
4. **Progress reporting** back to the VSCode extension via IPC
5. **ENVIRONMENT.md auto-population** from connector metadata discovery
6. **Live Drain clustering** integration on streamed results

This design adds those layers on top of the existing foundation.

---

## Connector Interface Contract

### Existing Adapter Interface (connector-sdk.cjs)

Every connector adapter already conforms to this shape:

```typescript
interface ConnectorAdapter {
  capabilities: ConnectorCapabilities;
  preflight(ctx: PreflightContext): void;              // throws on misconfiguration
  prepareQuery(ctx: PrepareContext): PreparedRequest;   // builds HTTP request
  executeRequest(ctx: ExecuteContext): Promise<HttpResponse>;
  normalizeResponse(ctx: NormalizeContext): NormalizedResult;
  emitArtifacts?(ctx: EmitContext): void;               // optional
  onError?(ctx: ErrorContext): void;                    // optional
}

interface ConnectorCapabilities {
  id: string;                     // "splunk" | "sentinel" | "crowdstrike"
  display_name: string;
  auth_types: AuthType[];         // e.g. ["basic", "bearer"]
  dataset_kinds: DatasetKind[];   // e.g. ["events", "alerts"]
  languages: QueryLanguage[];     // e.g. ["spl"]
  pagination_modes: PaginationMode[];
  supports_entities: boolean;
  supports_relationships: boolean;
  supports_receipts: boolean;
  supports_dry_run: boolean;
  docs_url: string | null;
  limitations: string[];
  supported_parameters: string[];
}

type AuthType =
  | 'api_key' | 'basic' | 'bearer'
  | 'oauth_client_credentials' | 'oauth_refresh'
  | 'sigv4' | 'service_account' | 'session';

type DatasetKind =
  | 'events' | 'alerts' | 'entities'
  | 'identity' | 'endpoint' | 'cloud'
  | 'email' | 'other';

type QueryLanguage = 'spl' | 'kql' | 'fql' | 'api' | 'native';
type PaginationMode = 'auto' | 'none' | 'cursor' | 'offset' | 'page' | 'token';
```

### New: Connector Orchestrator Interface

The orchestrator sits between MCP tools and individual adapters. It owns the
full lifecycle from QuerySpec creation through artifact emission.

```typescript
interface ConnectorOrchestrator {
  /**
   * Execute a query end-to-end: validate -> preflight -> prepare ->
   * execute (with pagination + retries) -> normalize -> emit artifacts.
   * Returns a stream of progress events.
   */
  executeQuery(
    input: QueryInput,
    options?: OrchestratorOptions,
  ): AsyncGenerator<QueryProgressEvent, QueryResult>;

  /**
   * Discover available data sources, field schemas, and retention windows
   * from a configured connector. Used for ENVIRONMENT.md auto-population.
   */
  discoverMetadata(
    connectorId: string,
    profileName?: string,
  ): Promise<ConnectorMetadata>;

  /**
   * List all configured connectors with health status.
   */
  listConnectors(): Promise<ConnectorSummary[]>;

  /**
   * Run a smoke test against a specific connector profile.
   */
  healthCheck(
    connectorId: string,
    profileName?: string,
  ): Promise<HealthCheckResult>;
}

interface QueryInput {
  connectorId: string;
  profileName?: string;            // defaults to "default"
  query: {
    language: QueryLanguage;       // "spl" | "kql" | "fql" | "abstract"
    statement: string;
  };
  dataset: {
    kind: DatasetKind;
    name?: string;
  };
  timeWindow: {
    start?: string;                // ISO-8601
    end?: string;                  // ISO-8601
    lookbackMinutes?: number;
    preset?: string;               // e.g. "last_24h"
  };
  pagination?: {
    mode?: PaginationMode;
    limit?: number;
    maxPages?: number;
  };
  execution?: {
    timeoutMs?: number;
    maxRetries?: number;
    dryRun?: boolean;
  };
  evidence?: {
    hypothesisIds?: string[];
    receiptPolicy?: 'all' | 'material' | 'none';
  };
  huntContext?: {
    huntRoot: string;              // path to .hunt/ directory
    phaseNumber?: number;
  };
}

interface OrchestratorOptions {
  onProgress?: (event: QueryProgressEvent) => void;
  abortSignal?: AbortSignal;
  config?: Record<string, unknown>;  // .thrunt-god/config.json content
}
```

### Progress Events

```typescript
type QueryProgressEvent =
  | { stage: 'validating'; message: string }
  | { stage: 'preflight'; message: string }
  | { stage: 'preparing'; message: string }
  | { stage: 'executing'; page: number; maxPages: number; message: string }
  | { stage: 'polling'; attempt: number; jobId?: string; message: string }
  | { stage: 'normalizing'; eventsProcessed: number; message: string }
  | { stage: 'clustering'; templateCount: number; message: string }
  | { stage: 'emitting'; artifactId: string; message: string }
  | { stage: 'complete'; queryId: string; summary: QueryResultSummary }
  | { stage: 'error'; code: string; message: string; retryable: boolean };

interface QueryResultSummary {
  queryId: string;
  connectorId: string;
  dataset: string;
  eventCount: number;
  entityCount: number;
  templateCount: number;
  pagesFetched: number;
  durationMs: number;
  status: 'ok' | 'partial' | 'error' | 'empty';
  warnings: string[];
}

interface QueryResult {
  summary: QueryResultSummary;
  artifactPaths: {
    queryLog: string;              // path to QRY-*.md
    manifest?: string;             // path to MAN-*.md
  };
  normalizedEvents: NormalizedEvent[];
  entities: NormalizedEntity[];
  drainClusters: DrainCluster[];
}
```

---

## Per-Platform Implementation Notes

### Splunk (splunk.cjs)

**What exists:**
- Adapter: `createSplunkAdapter()` with SPL statement normalization
- Auth: `basic` and `bearer` token
- Execution: Streaming via `search/v2/jobs/export`, with automatic fallback
  to async `search/jobs` on 504/transport errors
- Normalization: `_raw` JSON expansion, entity extraction from standard fields
- Pagination: Single-request (streaming)

**What to add for MCP integration:**

1. **Metadata discovery endpoint:**
   - `GET /services/data/indexes?output_mode=json` -- list indexes with retention
   - `GET /services/data/inputs/all?output_mode=json` -- list data inputs
   - `GET /services/saved/searches?output_mode=json` -- list saved searches
   - `GET /services/search/fields?output_mode=json` -- field discovery (per-index)
   - Parse `frozenTimePeriodInSecs` for retention window calculation

2. **Query translation (abstract -> SPL):**
   - Simple field equality: `field=value` -> `field=value`
   - Time range: handled by `earliest_time`/`latest_time` parameters
   - Entity pivots: `entity.user="admin"` -> `user="admin" OR src_user="admin"`
   - Index selection: `dataset.name` -> `index=<name>`
   - Wildcard support already native to SPL

3. **Async job progress:**
   - The existing `executeSplunkAsyncJob` polls until `isDone`. Inject progress
     callbacks at each poll iteration with `dispatchCount` from job status.
   - Parse `doneProgress` field (float 0-1) from job status for percentage.

4. **Rate limiting:**
   - Splunk Enterprise has no built-in rate limiting API. Respect `max_search_per_cpu`
     concurrency limits. Use a semaphore with configurable concurrency (default: 2).
   - Splunk Cloud: honor `X-Rate-Limit-Remaining` headers if present.

**Estimated effort:** 3 days (metadata discovery + translation + progress)

### Microsoft Sentinel (sentinel.cjs)

**What exists:**
- Adapter: `createSentinelAdapter()` with KQL query execution
- Auth: `oauth_client_credentials` or `bearer`
- Execution: POST to `/workspaces/{workspaceId}/query`
- Normalization: Azure table format (columns + row arrays) to flat objects
- Pagination: None (single request)

**What to add for MCP integration:**

1. **Metadata discovery endpoints:**
   - `POST /workspaces/{id}/query` with `{query: ".show tables"}` -- list tables
   - `POST /workspaces/{id}/query` with `{query: "TableName | getschema"}` --
     field schemas per table
   - `GET /subscriptions/{subId}/resourceGroups/{rg}/providers/Microsoft.OperationalInsights/workspaces/{ws}?api-version=2022-10-01`
     -- workspace metadata including retention
   - Table-level retention: `{table} | where TimeGenerated > ago(365d) | summarize min(TimeGenerated)` --
     effective retention discovery

2. **Query translation (abstract -> KQL):**
   - Field equality: `field == "value"` -> `field == "value"` (direct)
   - Time range: `| where TimeGenerated between(datetime(start)..datetime(end))`
   - Entity pivots: `entity.user="admin"` ->
     `| where Account == "admin" or AccountName == "admin" or UserPrincipalName == "admin"`
   - Table selection: `dataset.name` -> table name prefix in KQL
   - Boolean operators map directly: `and`, `or`, `not`

3. **Large result handling:**
   - Log Analytics API has a 500,000 row limit per query.
   - For larger result sets: implement time-window splitting. Divide the time
     range into N sub-windows, execute each, and merge results.
   - Max response size: 64MB. Parse `X-Content-Length` and warn if close.

4. **OAuth token lifecycle:**
   - Use `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
   - Scope: `https://api.loganalytics.azure.com/.default`
   - Cache tokens in memory with 5-minute pre-expiry refresh.
   - Support multi-tenant: `connector.tenant` in QuerySpec maps to tenant ID.

5. **Rate limiting:**
   - Azure Monitor has documented limits: 200 requests per 30 seconds per workspace.
   - Parse `Retry-After` header on 429 responses.
   - Implement token bucket with configurable rate (default: 5 req/s).

**Estimated effort:** 4 days (metadata discovery + translation + time splitting + OAuth)

### CrowdStrike Falcon (crowdstrike.cjs)

**What exists:**
- Adapter: `createCrowdStrikeAdapter()` with FQL filter support
- Auth: `oauth_client_credentials` or `bearer`
- Execution: POST to `alerts/combined/alerts/v1`
- Normalization: Extract from `resources` array with entity extraction
- Pagination: Token-based (cursor via `meta.pagination.after`)

**What to add for MCP integration:**

1. **Metadata discovery endpoints:**
   - `GET /fwmgr/queries/platforms/v1` -- list available platforms
   - `GET /detects/queries/detects/v1?limit=1` -- smoke test detection stream
   - `GET /devices/queries/devices-scroll/v1?limit=1` -- smoke test device access
   - Use OAuth token scopes to determine accessible APIs:
     - `alerts:read` -> Alerts surface
     - `detections:read` -> Detection events
     - `devices:read` -> Device/endpoint inventory
     - `event-streams:read` -> Event stream API
   - No direct field schema discovery; use hardcoded known schemas per API surface.

2. **Query translation (abstract -> FQL):**
   - Field equality: `field:"value"` -> FQL syntax
   - Time range: `created_timestamp:>'2026-04-01T00:00:00Z'`
   - Boolean operators: `+` for AND, `,` for OR in FQL
   - Entity pivots: `entity.device="host1"` -> `device.hostname:"host1"`
   - Severity filtering: `severity_name:['Critical','High']`

3. **Multi-surface query routing:**
   - Based on `dataset.kind`:
     - `alerts` -> `alerts/combined/alerts/v1` (existing)
     - `endpoint` -> `devices/combined/host-group-members/v1` or
       `detects/combined/detects/v1`
     - `events` -> Event Stream API (SSE) -- different execution model
   - Event Stream requires SSE client, not standard HTTP request/response.
     Defer to Phase 2 rollout.

4. **Rate limiting:**
   - CrowdStrike uses `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
     `X-RateLimit-RetryAfter` headers.
   - Implement sliding window rate limiter that reads these headers.
   - Default: respect API-reported limits, no client-side guessing.

5. **Pagination:**
   - Already implemented with cursor-based pagination.
   - Add progress reporting: emit `executing` events with page count.

**Estimated effort:** 3 days (multi-surface routing + translation + rate limiting)

---

## Authentication and Credential Management

### Secret Storage Model

Credentials NEVER appear in config files, MCP messages, or logs. The existing
connector SDK uses a three-tier secret reference system:

```typescript
type SecretRefType = 'env' | 'file' | 'command';

interface SecretRef {
  type: SecretRefType;
  value: string;  // env var name | file path | shell command
}
```

**Resolution order (existing, in `resolveSecretRefs`):**

1. `env` -- Read from `process.env[value]` (e.g., `SPLUNK_TOKEN`)
2. `file` -- Read from filesystem (e.g., `/run/secrets/sentinel-client-secret`)
3. `command` -- Execute shell command and capture stdout (e.g., `op read op://vault/splunk/token`)
   - 5-second timeout, stderr suppressed
   - Supports 1Password CLI, `aws secretsmanager`, `gcloud secrets`, `vault kv get`

**Profile storage (existing, in `.thrunt-god/config.json`):**

```json
{
  "connector_profiles": {
    "splunk": {
      "default": {
        "auth_type": "bearer",
        "base_url": "https://splunk.corp.example.com:8089",
        "secret_refs": {
          "access_token": { "type": "env", "value": "SPLUNK_BEARER_TOKEN" }
        },
        "default_parameters": {
          "search_mode": "normal"
        }
      }
    },
    "sentinel": {
      "production": {
        "auth_type": "oauth_client_credentials",
        "base_url": "https://api.loganalytics.azure.com/v1",
        "token_url": "https://login.microsoftonline.com/TENANT_ID/oauth2/v2.0/token",
        "tenant": "TENANT_ID",
        "scopes": ["https://api.loganalytics.azure.com/.default"],
        "secret_refs": {
          "client_id": { "type": "env", "value": "AZURE_CLIENT_ID" },
          "client_secret": { "type": "env", "value": "AZURE_CLIENT_SECRET" }
        },
        "default_parameters": {
          "workspace_id": "WORKSPACE_GUID"
        }
      }
    },
    "crowdstrike": {
      "default": {
        "auth_type": "oauth_client_credentials",
        "base_url": "https://api.crowdstrike.com",
        "secret_refs": {
          "client_id": { "type": "env", "value": "CS_CLIENT_ID" },
          "client_secret": { "type": "env", "value": "CS_CLIENT_SECRET" }
        }
      }
    }
  }
}
```

### New: OAuth Token Cache

For connectors using `oauth_client_credentials`, the existing SDK resolves
tokens per-request. For MCP integration with multiple queries in a session,
we add an in-memory token cache:

```typescript
interface TokenCache {
  /**
   * Get a valid token, refreshing if expired or within refresh window.
   * Thread-safe via single-flight deduplication.
   */
  getToken(
    connectorId: string,
    profileName: string,
    tokenUrl: string,
    credentials: { clientId: string; clientSecret: string },
    scopes: string[],
  ): Promise<string>;

  /** Invalidate a cached token (e.g., after a 401). */
  invalidate(connectorId: string, profileName: string): void;

  /** Clear all cached tokens. */
  clear(): void;
}
```

**Cache behavior:**
- Tokens are cached by `{connectorId}:{profileName}` key
- Refresh 5 minutes before expiry (`expires_in - 300` seconds)
- Single-flight: concurrent requests for the same key share one token fetch
- Max cache entries: 50 (LRU eviction)
- Tokens NEVER written to disk, NEVER logged, NEVER included in telemetry

### Security Invariants

1. Secret references are resolved at execution time, not stored resolved
2. `resolveSecretRefs` output is passed to the adapter and immediately discarded
3. MCP tool responses NEVER include credentials or token values
4. The `command` secret ref type has a 5-second timeout to prevent hanging
5. Config file validation rejects profiles with inline credential values
   (strings that look like tokens/passwords in non-`secret_refs` fields)
6. `.thrunt-god/config.json` should be in `.gitignore` (the installer already
   handles this)

---

## Query Lifecycle

### End-to-End Flow

```
  MCP Client                     MCP Server / Orchestrator
  --------                       -------------------------
  tools/call siem_query
    { connectorId, query, ... }
            ------>
                                 1. Validate input
                                 2. Resolve connector profile
                                 3. Resolve secret refs
                                 4. Create QuerySpec (SDK)
                                 5. Translate query if abstract
                                 6. Run adapter.preflight()
                                 7. Run adapter.prepareQuery()
                                 8. LOOP: execute + paginate
                                    |  adapter.executeRequest()
                                    |  adapter.normalizeResponse()
                                    |  accumulate events, entities
                                    |  advance pagination state
                                    |  emit progress event
                                    +--until exhausted or limit
                                 9. Run Drain clustering on events
                                10. Build QRY-*.md artifact
                                11. Update manifest (MAN-*.md)
                                12. Write artifacts to .hunt/QUERIES/
            <------
  tools/call result
    { queryId, summary, ... }
```

### Stage Details

**Stage 1-3: Setup**

```typescript
// Resolve profile from config
const config = loadConfig(huntRoot);
const profile = resolveConnectorProfile(config, connectorId, profileName);
const secrets = resolveSecretRefs(profile, { env: process.env, cwd: huntRoot });
```

**Stage 4-5: Query Preparation**

```typescript
// Create SDK query spec
const spec = createQuerySpec({
  connector: { id: connectorId, profile: profileName },
  dataset: input.dataset,
  time_window: input.timeWindow,
  query: translateQuery(input.query, connectorId),
  pagination: input.pagination,
  execution: input.execution,
  evidence: input.evidence,
});
```

**Stage 6-8: Execution Loop**

```typescript
// Preflight check
adapter.preflight({ spec, profile, secrets });

// Pagination loop
let pagination = createPaginationState(spec.pagination);
const allEvents: NormalizedEvent[] = [];
const allEntities: NormalizedEntity[] = [];

while (!pagination.exhausted) {
  const prepared = adapter.prepareQuery({ spec, profile, pagination });
  const response = await adapter.executeRequest({
    prepared, profile, secrets, spec, options
  });
  const normalized = adapter.normalizeResponse({ response, spec });

  allEvents.push(...normalized.events);
  allEntities.push(...normalized.entities);

  onProgress?.({
    stage: 'executing',
    page: pagination.pages_fetched + 1,
    maxPages: pagination.max_pages,
    message: `Page ${pagination.pages_fetched + 1}: ${normalized.events.length} events`,
  });

  pagination = advancePaginationState(pagination, {
    cursor: normalized.next_cursor,
    has_more: normalized.has_more,
  });
}
```

**Stage 9: Drain Clustering**

```typescript
// Run Drain template mining on normalized event summaries
const drainInput = allEvents.map(e => e.summary || e.title || JSON.stringify(e.raw));
const clusters = runDrainClustering(drainInput, {
  depth: 4,
  similarityThreshold: 0.4,
  maxClusters: 100,
});

onProgress?.({
  stage: 'clustering',
  templateCount: clusters.length,
  message: `${clusters.length} templates from ${allEvents.length} events`,
});
```

**Stage 10-12: Artifact Emission**

```typescript
// Build and write QRY-*.md with template clustering section
const queryId = spec.query_id;
const artifactPath = path.join(huntRoot, 'QUERIES', `${queryId}.md`);
const queryDoc = buildQueryLogDocument({
  spec,
  events: allEvents,
  entities: allEntities,
  clusters,
  summary: { eventCount: allEvents.length, entityCount: allEntities.length },
});

await fs.writeFile(artifactPath, queryDoc, 'utf-8');

// Update manifest
await updateManifest(huntRoot, queryId, artifactPath);

onProgress?.({
  stage: 'complete',
  queryId,
  summary: { ... },
});
```

---

## Query Translation Layer

When `query.language` is `"abstract"`, the orchestrator translates to the
connector's native language before passing to the adapter.

### Abstract Query Format

```typescript
interface AbstractQuery {
  language: 'abstract';
  statement: string;  // Structured query DSL (see below)
}
```

**Abstract DSL grammar (simple, JSON-based):**

```json
{
  "filter": {
    "and": [
      { "field": "sourcetype", "op": "eq", "value": "WinEventLog:Security" },
      { "field": "EventCode", "op": "in", "values": ["4624", "4625"] },
      { "field": "user", "op": "contains", "value": "admin" }
    ]
  },
  "fields": ["_time", "EventCode", "user", "src_ip", "ComputerName"],
  "orderBy": { "field": "_time", "direction": "desc" },
  "limit": 1000
}
```

When the statement is a plain string (not JSON), it passes through unchanged
to the native language, allowing hunters to write raw SPL/KQL/FQL when needed.

### Translation: Abstract -> SPL

```
filter.and[{field: "x", op: "eq", value: "v"}]  ->  x="v"
filter.and[{field: "x", op: "in", values: [...]}]  ->  x IN ("a", "b")
filter.and[{field: "x", op: "contains", value: "v"}]  ->  x="*v*"
filter.and[{field: "x", op: "gt", value: "v"}]  ->  x>v
filter.or[...]  ->  (clause1 OR clause2)
filter.not[...]  ->  NOT (clause)
fields: [...]  ->  | table field1, field2
orderBy: {field, direction}  ->  | sort direction field
limit: N  ->  | head N
```

### Translation: Abstract -> KQL

```
filter.and[{field: "x", op: "eq", value: "v"}]  ->  | where x == "v"
filter.and[{field: "x", op: "in", values: [...]}]  ->  | where x in ("a", "b")
filter.and[{field: "x", op: "contains", value: "v"}]  ->  | where x contains "v"
filter.and[{field: "x", op: "gt", value: "v"}]  ->  | where x > v
filter.or[...]  ->  | where (clause1 or clause2)
filter.not[...]  ->  | where not(clause)
fields: [...]  ->  | project field1, field2
orderBy: {field, direction}  ->  | sort by field direction
limit: N  ->  | take N
```

Table prefix: `dataset.name` maps to KQL table name (e.g., `SigninLogs`,
`SecurityEvent`, `CommonSecurityLog`).

### Translation: Abstract -> FQL

```
filter.and[{field: "x", op: "eq", value: "v"}]  ->  x:'v'
filter.and[{field: "x", op: "in", values: [...]}]  ->  x:['a','b']
filter.and[{field: "x", op: "gt", value: "v"}]  ->  x:>'v'
filter.or[...]  ->  clause1,clause2   (FQL OR)
filter.not[...]  ->  !clause
```

FQL does not support arbitrary field projection or ordering in filter syntax.
`fields` and `orderBy` map to the `sort` parameter in the API request body.
`limit` maps to the `limit` request field.

### Passthrough Mode

When `query.language` matches the connector's native language (`spl` for
Splunk, `kql` for Sentinel, `fql` for CrowdStrike), the statement passes
through without translation. This is the expected mode for expert hunters
who write their own queries.

### Translation Module Location

```
thrunt-god/bin/lib/query-translator.cjs
  exports:
    translateToSpl(abstractQuery) -> string
    translateToKql(abstractQuery) -> string
    translateToFql(abstractQuery) -> string
    translateQuery(queryInput, connectorId) -> { language, statement }
```

---

## Result Normalization and Drain Integration

### Normalized Event Schema

All connectors already normalize to this shape via `normalizeEvent()`:

```typescript
interface NormalizedEvent {
  id: string;                // event ID (source-specific)
  source: string;            // connector ID
  timestamp: string;         // ISO-8601
  title: string;             // sourcetype / alert name
  summary: string;           // human-readable summary
  severity: string | null;   // "info" | "low" | "medium" | "high" | "critical"
  raw: Record<string, unknown>;  // original event data
  dataset: string;           // dataset kind
}

interface NormalizedEntity {
  kind: string;              // "host" | "user" | "ip" | "device" | ...
  value: string;
  source: string;            // connector ID
}
```

### Drain Clustering Pipeline

The Drain algorithm mines log templates from unstructured/semi-structured text.
The pipeline:

```
NormalizedEvent[]
  -> extract summary strings
  -> tokenize (split on whitespace, preserve structure)
  -> Drain parse tree (depth-limited prefix tree)
  -> cluster by template similarity
  -> emit DrainCluster[]
```

```typescript
interface DrainCluster {
  templateId: string;         // sha256(template)[:16]
  template: string;           // "User <*> logged in from <*>"
  count: number;
  percentage: number;
  sampleEvents: string[];     // up to 3 sample event IDs
  eventIds: string[];         // all matching event IDs
}

interface DrainConfig {
  depth: number;              // parse tree depth (default: 4)
  similarityThreshold: number; // 0-1, cluster merge threshold (default: 0.4)
  maxClusters: number;        // cap on cluster count (default: 100)
  maxLogLength: number;       // truncate logs beyond this (default: 2000)
  paramRegex?: RegExp[];      // additional patterns to treat as wildcards
}
```

### Integration with QRY-*.md Artifacts

The `buildQueryLogDocument()` function (in `evidence.cjs`) already generates
the `## Result Summary` and `## Template Clustering` sections. The new pipeline
feeds Drain output directly:

```markdown
## Result Summary

events=1247, templates=23, entities=18

| Template | Count | % | Sample |
|----------|-------|---|--------|
| User <*> authenticated from <*> via OAuth | 423 | 33.9% | evt-001 |
| Failed login for <*> from IP <*> | 312 | 25.0% | evt-044 |
| ...

## Template Clustering

### Template a1b2c3d4e5f67890 Details

**Template:** `User <*> authenticated from <*> via OAuth`
**Count:** 423 (33.9%)

**Sample Event:**
```
User john.doe@corp.com authenticated from 10.0.1.42 via OAuth
```

**Parameter Values:**
| Position | Unique Values | Top 3 |
|----------|--------------|-------|
| 1 | 47 | john.doe@corp.com (89), admin@corp.com (34), ... |
| 2 | 12 | 10.0.1.42 (201), 10.0.1.43 (98), ... |
```

### Drain Output -> VSCode Extension

The VSCode extension's `DrainTemplatePanel` already consumes `Query` objects
with `templates` and `templateDetails` arrays. The pipeline must produce
output that matches the existing `DrainTemplate` and detail interfaces:

```typescript
// Existing types in thrunt-god-vscode/src/types.ts
interface DrainTemplate {
  templateId: string;
  template: string;
  count: number;
  percentage: number;
}

// Additional detail type used by drainViewer.ts
interface TemplateDetail {
  templateId: string;
  summary: string;
  detailLines: string[];
  sampleEventText: string | null;
  sampleEventId: string | null;
  eventIds: string[];
}
```

No changes needed to the VSCode extension's Drain viewer. The pipeline
writes QRY-*.md files; the extension's `ArtifactWatcher` detects the change;
the parser extracts template data; the `HuntDataStore` updates; the
`DrainTemplatePanel` re-renders.

---

## Rate Limiting and Pagination

### Pagination State Machine (Existing)

The connector SDK provides `createPaginationState()` and
`advancePaginationState()` which track pages fetched, cursor position, and
exhaustion. The orchestrator drives this loop.

### New: Per-Connector Rate Limiters

```typescript
interface RateLimiter {
  /** Wait until a request slot is available. */
  acquire(): Promise<void>;

  /** Release a slot (called after response). */
  release(): void;

  /** Update limits from response headers. */
  updateFromHeaders(headers: Record<string, string>): void;

  /** Reset rate limiter state. */
  reset(): void;
}
```

**Implementation per connector:**

| Connector    | Strategy          | Default Limit     | Header Source                  |
|-------------|-------------------|-------------------|-------------------------------|
| Splunk      | Semaphore         | 2 concurrent      | None (no rate limit headers)  |
| Sentinel    | Token bucket      | 5 req/s           | `Retry-After` on 429         |
| CrowdStrike | Sliding window    | API-reported      | `X-RateLimit-Remaining`, `X-RateLimit-RetryAfter` |

### Large Result Set Handling

**Splunk:** Streaming mode (`search/v2/jobs/export`) delivers results
incrementally. For very large result sets, the existing adapter falls back
to async job mode which pages internally.

**Sentinel:** Single-request API with 500K row limit. For larger sets:

```typescript
async function splitTimeWindowQuery(
  orchestrator: ConnectorOrchestrator,
  input: QueryInput,
  maxRowsPerWindow: number = 100_000,
): Promise<QueryResult> {
  // Binary split: execute query, check if result is truncated,
  // split time window in half and recurse.
  const result = await orchestrator.executeQuery(input);
  if (result.summary.status === 'partial' && result.summary.eventCount >= maxRowsPerWindow) {
    const mid = midpoint(input.timeWindow.start, input.timeWindow.end);
    const left = await splitTimeWindowQuery(orchestrator, { ...input, timeWindow: { ...input.timeWindow, end: mid } });
    const right = await splitTimeWindowQuery(orchestrator, { ...input, timeWindow: { ...input.timeWindow, start: mid } });
    return mergeResults(left, right);
  }
  return result;
}
```

**CrowdStrike:** Cursor-based pagination already handled by the SDK state
machine. Max 1000 results per page. The orchestrator loops until cursor is
exhausted or `maxPages` is reached.

### Streaming vs Batch

The default mode is **batch with progress events**. Streaming (SSE/WebSocket)
is deferred to Phase 2. Reasons:

1. The connector SDK is request/response oriented
2. Drain clustering requires all events before producing templates
3. Batch mode is simpler to test with recorded responses
4. Splunk's async job mode is effectively batch-with-polling

---

## Error Handling and Retry Strategy

### Error Classification

```typescript
type ErrorCategory =
  | 'auth'          // 401, 403, token expired
  | 'rate_limit'    // 429, X-RateLimit-Remaining: 0
  | 'timeout'       // request timeout, job poll timeout
  | 'server'        // 500, 502, 503, 504
  | 'transport'     // DNS failure, connection refused, TLS error
  | 'validation'    // invalid query, missing parameters
  | 'quota'         // search quota exceeded (Splunk), workspace limit (Sentinel)
  | 'not_found'     // 404, workspace/index does not exist
  | 'unknown';      // unclassified errors

interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  message: string;
  code: string;
  httpStatus?: number;
  retryAfterMs?: number;
  suggestion?: string;
}
```

### Retry Strategy

```typescript
interface RetryPolicy {
  maxRetries: number;          // from spec.execution.max_retries (default: 2)
  backoffMs: number;           // from spec.execution.backoff_ms (default: 1000)
  maxBackoffMs: number;        // cap at 30 seconds
  retryableCategories: ErrorCategory[];
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  backoffMs: 1000,
  maxBackoffMs: 30_000,
  retryableCategories: ['rate_limit', 'timeout', 'server', 'transport'],
};
```

**Retry behavior:**
- Exponential backoff: `min(backoffMs * 2^attempt, maxBackoffMs)`
- Jitter: +/- 20% randomization to prevent thundering herd
- `rate_limit`: use `retryAfterMs` from response headers instead of backoff
- `auth`: retry once after token refresh (invalidate cache), then fail
- `validation` and `not_found`: never retry
- `quota`: never retry; surface to user with suggestion

### Error Reporting to MCP

Errors are returned as structured tool results, never thrown:

```json
{
  "content": [{
    "type": "text",
    "text": "{\"error\": {\"category\": \"auth\", \"message\": \"OAuth token expired and refresh failed\", \"suggestion\": \"Check AZURE_CLIENT_SECRET environment variable\", \"retryable\": false}}"
  }]
}
```

### Circuit Breaker

For persistent failures (3+ consecutive errors of the same category within
60 seconds), the orchestrator enters a "circuit open" state for that
connector+profile pair. While open:

- New requests return immediately with a `circuit_open` error
- A probe request is attempted after 30 seconds
- If the probe succeeds, the circuit closes

This prevents hammering a broken endpoint during an incident.

---

## MCP Tool Definitions

Four new tools are added to the MCP server (`apps/terminal/src/mcp/index.ts`).
Each follows the existing `ToolDefinition` pattern used by `dispatchTool` and
`gateTool`.

### Tool 1: `siem_query`

```typescript
const siemQueryTool: ToolDefinition = {
  name: 'siem_query',
  description: `Execute a query against a configured SIEM connector (Splunk, Sentinel, CrowdStrike).

Returns normalized events, Drain template clusters, and writes a QRY-*.md artifact
to the hunt directory. Supports both native query languages (SPL, KQL, FQL) and
an abstract query format that translates automatically.

Use siem_discover first to check available connectors and datasets.`,
  parameters: {
    type: 'object',
    properties: {
      connectorId: {
        type: 'string',
        enum: ['splunk', 'sentinel', 'crowdstrike'],
        description: 'Target SIEM connector',
      },
      profileName: {
        type: 'string',
        description: 'Auth profile name (default: "default")',
      },
      query: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['spl', 'kql', 'fql', 'abstract'],
            description: 'Query language',
          },
          statement: {
            type: 'string',
            description: 'Query string (native language or abstract JSON DSL)',
          },
        },
        required: ['language', 'statement'],
      },
      dataset: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['events', 'alerts', 'entities', 'identity', 'endpoint'],
            description: 'Dataset type to query',
          },
          name: {
            type: 'string',
            description: 'Specific dataset/index/table name',
          },
        },
        required: ['kind'],
      },
      timeWindow: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'ISO-8601 start time' },
          end: { type: 'string', description: 'ISO-8601 end time' },
          lookbackMinutes: { type: 'number', description: 'Lookback from now' },
        },
      },
      maxResults: {
        type: 'number',
        description: 'Maximum events to return (default: 5000)',
      },
      hypothesisIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Link query to hunt hypotheses',
      },
      dryRun: {
        type: 'boolean',
        description: 'Validate query without executing (default: false)',
      },
    },
    required: ['connectorId', 'query', 'dataset'],
  },
  handler: async (params, context) => { /* ... */ },
};
```

### Tool 2: `siem_status`

```typescript
const siemStatusTool: ToolDefinition = {
  name: 'siem_status',
  description: `Check the status of a running or completed SIEM query.

Use this to poll long-running queries or retrieve results from a previous execution.`,
  parameters: {
    type: 'object',
    properties: {
      queryId: {
        type: 'string',
        description: 'Query ID (QRY-*) to check status for',
      },
    },
    required: ['queryId'],
  },
  handler: async (params, context) => { /* ... */ },
};
```

### Tool 3: `siem_discover`

```typescript
const siemDiscoverTool: ToolDefinition = {
  name: 'siem_discover',
  description: `Discover available SIEM connectors, their configuration status,
available datasets, field schemas, and retention windows.

Use this before running queries to understand what data is available.
Pass a connectorId for detailed metadata; omit for a summary of all connectors.`,
  parameters: {
    type: 'object',
    properties: {
      connectorId: {
        type: 'string',
        description: 'Specific connector to discover (omit for all)',
      },
      profileName: {
        type: 'string',
        description: 'Auth profile name (default: "default")',
      },
      includeFields: {
        type: 'boolean',
        description: 'Include field schemas (slower, default: false)',
      },
    },
    required: [],
  },
  handler: async (params, context) => { /* ... */ },
};
```

### Tool 4: `siem_env_populate`

```typescript
const siemEnvPopulateTool: ToolDefinition = {
  name: 'siem_env_populate',
  description: `Auto-populate ENVIRONMENT.md with telemetry metadata from configured SIEM connectors.

Discovers available log sources, retention windows, field schemas, and query paths
from all configured connectors and writes them to the hunt's ENVIRONMENT.md file.

Only modifies the Telemetry Surfaces section. Existing content is preserved.`,
  parameters: {
    type: 'object',
    properties: {
      huntRoot: {
        type: 'string',
        description: 'Path to .hunt/ directory (default: auto-detect)',
      },
      connectorIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Limit to specific connectors (default: all configured)',
      },
      merge: {
        type: 'boolean',
        description: 'Merge with existing entries (default: true)',
      },
    },
    required: [],
  },
  handler: async (params, context) => { /* ... */ },
};
```

### Tool Registration

All four tools are added to the `tools` array in `apps/terminal/src/tools/index.ts`:

```typescript
export const tools: ToolDefinition[] = [
  dispatchTool,
  gateTool,
  siemQueryTool,     // new
  siemStatusTool,    // new
  siemDiscoverTool,  // new
  siemEnvPopulateTool, // new
];
```

The MCP server (`apps/terminal/src/mcp/index.ts`) already exposes all
registered tools via `tools/list` and `tools/call`. No changes needed to the
MCP server itself.

---

## IPC: VSCode Extension Progress Reporting

### Architecture

The VSCode extension is a separate process from the MCP server/CLI. Two IPC
channels are available:

1. **File system watching** (existing) -- The extension watches `.hunt/` for
   artifact changes. When a QRY-*.md file is written, the extension detects
   it and updates the UI.

2. **MCP discovery file** (existing) -- The MCP server writes
   `.thrunt-god/mcp.json` with its port. The extension could connect as an
   MCP client.

### Progress Reporting: File-Based Approach (MVP)

For the MVP, progress reporting uses a lightweight file-based approach that
requires no new IPC protocol:

```
.thrunt-god/query-progress/
  QRY-20260402-001.json    # Updated during execution
```

**Progress file format:**

```json
{
  "queryId": "QRY-20260402-001",
  "connectorId": "sentinel",
  "stage": "executing",
  "page": 3,
  "maxPages": 10,
  "eventsProcessed": 1500,
  "startedAt": "2026-04-02T14:30:00Z",
  "updatedAt": "2026-04-02T14:30:12Z",
  "message": "Page 3/10: 500 events"
}
```

The VSCode extension adds a file watcher for
`.thrunt-god/query-progress/*.json` and surfaces progress in the status bar.
On completion, the progress file is deleted and the final QRY-*.md artifact
triggers the Drain viewer update.

### Progress Reporting: MCP WebSocket (Phase 2)

In Phase 2, the extension connects to the MCP server's port as a client and
subscribes to progress notifications. This provides sub-second updates without
file system overhead:

```typescript
// Extension connects as MCP client
const client = await MCP.connect('thrunt-god', '127.0.0.1', port);

// Subscribe to notifications (MCP notifications are one-way)
client.onNotification('siem/progress', (event: QueryProgressEvent) => {
  statusBar.updateProgress(event);
});
```

This requires adding notification support to the MCP server, which is
straightforward (notifications have no `id` field in JSON-RPC).

---

## Environment Auto-Population

### Data Flow

```
siem_env_populate tool invoked
  -> For each configured connector:
     1. Resolve profile + secrets
     2. Run metadata discovery queries
     3. Parse results into TelemetrySurface objects
  -> Read existing ENVIRONMENT.md (if any)
  -> Merge discovered surfaces with existing entries
  -> Write updated ENVIRONMENT.md
```

### ENVIRONMENT.md Format

The existing format from `design/DATA-MODELS.md`:

```markdown
## Telemetry Surfaces

| Surface | System | Retention | Query Path | Notes |
|---------|--------|-----------|------------|-------|
| Windows Security Events | Sentinel | 90 days | SecurityEvent | EventID 4624/4625/4688 |
| Azure AD Sign-ins | Sentinel | 30 days | SigninLogs | OAuth, SAML, password |
| CrowdStrike Alerts | CrowdStrike | 180 days | alerts/combined/alerts/v1 | Severity filtering |
| Firewall Logs | Splunk | 365 days | index=fw sourcetype=paloalto | North-south traffic |
```

### Discovery Implementation Per Connector

**Splunk:**
```typescript
async function discoverSplunkMetadata(profile, secrets): Promise<TelemetrySurface[]> {
  // GET /services/data/indexes?output_mode=json
  // Extract: index name, retention (frozenTimePeriodInSecs), current size
  // Map to: surface = index name, system = "Splunk", retention = computed
}
```

**Sentinel:**
```typescript
async function discoverSentinelMetadata(profile, secrets): Promise<TelemetrySurface[]> {
  // POST /query with ".show tables"
  // For each table: query "T | summarize min(TimeGenerated), count()" for retention + volume
  // Map to: surface = table name, system = "Sentinel", retention = computed
}
```

**CrowdStrike:**
```typescript
async function discoverCrowdStrikeMetadata(profile, secrets): Promise<TelemetrySurface[]> {
  // Static mapping based on OAuth scopes:
  //   alerts:read -> "CrowdStrike Alerts" surface
  //   detections:read -> "CrowdStrike Detections" surface
  //   devices:read -> "CrowdStrike Device Inventory" surface
  // Retention: CrowdStrike default is 90 days, surface from /falconx/queries/reports/v1 if available
}
```

---

## Testing Approach

### Tier 1: Contract Tests (No Network Required)

The existing `contract-tests.cjs` provides `runContractTests()` which validates
any adapter against the SDK contract using `startJsonServer` (a local HTTP
server that replays recorded responses).

**Extend for MCP integration:**

```typescript
// tests/mcp-siem-tools.contract.test.ts
import { runContractTests, createTestQuerySpec, createTestProfile } from
  'thrunt-god/bin/lib/contract-tests.cjs';

describe('siem_query tool contract', () => {
  // Verify tool parameter validation
  test('rejects missing connectorId', async () => { ... });
  test('rejects invalid query language', async () => { ... });
  test('rejects future time window', async () => { ... });

  // Verify result envelope shape
  test('returns QueryResultSummary with all required fields', async () => { ... });
  test('returns normalized events matching NormalizedEvent schema', async () => { ... });
  test('returns DrainCluster[] when events > 0', async () => { ... });
});
```

### Tier 2: Recorded Response Tests

Capture real API responses and replay them:

```
tests/fixtures/recorded/
  splunk/
    search-export-200.json          # Successful search
    search-export-504-fallback.json # Timeout -> async job fallback
    async-job-create.json           # Job creation response
    async-job-poll-progress.json    # Poll response (not done)
    async-job-poll-done.json        # Poll response (done)
    async-job-results.json          # Final results
  sentinel/
    query-200.json                  # Successful KQL query
    query-partial-error.json        # PartialError response
    show-tables-200.json            # .show tables for discovery
    getschema-200.json              # Table schema response
  crowdstrike/
    alerts-combined-200.json        # First page
    alerts-combined-page2.json      # Second page (cursor)
    oauth-token-200.json            # Token exchange
    oauth-token-expired.json        # Expired token
```

**Fixture recording utility:**

```bash
# Record a live Splunk response (run once with real credentials)
RECORD_FIXTURES=1 bun test tests/connectors/splunk.live.test.ts

# Replay recorded fixtures (CI-safe, no credentials needed)
bun test tests/connectors/splunk.replay.test.ts
```

The recording utility uses the `options.fetch` injection point that the
connector SDK already supports. During recording mode, a wrapper `fetch`
captures request/response pairs to JSON files. During replay mode, a mock
`fetch` serves from those files.

### Tier 3: Mock MCP Server Integration Tests

Test the full path from MCP `tools/call` through the orchestrator to artifact
emission:

```typescript
// tests/integration/mcp-siem-e2e.test.ts
describe('MCP SIEM end-to-end', () => {
  let server: McpServerImpl;
  let mockSiem: MockSiemServer;

  beforeAll(async () => {
    // Start mock SIEM that replays recorded responses
    mockSiem = await startMockSiem('splunk', 'tests/fixtures/recorded/splunk');

    // Configure connector profile pointing to mock
    await writeTestConfig({
      connector_profiles: {
        splunk: {
          test: {
            auth_type: 'bearer',
            base_url: mockSiem.url,
            secret_refs: { access_token: { type: 'env', value: 'TEST_TOKEN' } },
          },
        },
      },
    });

    // Start MCP server
    server = new McpServerImpl();
    await server.start({ port: 0 });
  });

  test('siem_query returns results and writes QRY-*.md', async () => {
    const response = await callTool(server.getPort(), 'siem_query', {
      connectorId: 'splunk',
      profileName: 'test',
      query: { language: 'spl', statement: 'index=main sourcetype=syslog' },
      dataset: { kind: 'events' },
      timeWindow: { lookbackMinutes: 60 },
    });

    expect(response.summary.status).toBe('ok');
    expect(response.summary.eventCount).toBeGreaterThan(0);
    expect(response.artifactPaths.queryLog).toMatch(/QRY-.*\.md$/);
    // Verify artifact was written
    expect(fs.existsSync(response.artifactPaths.queryLog)).toBe(true);
  });

  test('siem_discover lists available datasets', async () => {
    const response = await callTool(server.getPort(), 'siem_discover', {
      connectorId: 'splunk',
      profileName: 'test',
    });

    expect(response.connectorId).toBe('splunk');
    expect(response.datasets).toBeInstanceOf(Array);
    expect(response.datasets.length).toBeGreaterThan(0);
  });
});
```

### Tier 4: Query Translation Unit Tests

```typescript
// tests/unit/query-translator.test.ts
describe('translateToSpl', () => {
  test('simple field equality', () => {
    const result = translateToSpl({
      filter: { and: [{ field: 'sourcetype', op: 'eq', value: 'syslog' }] },
    });
    expect(result).toBe('search sourcetype="syslog"');
  });

  test('multiple conditions with OR', () => {
    const result = translateToSpl({
      filter: {
        or: [
          { field: 'EventCode', op: 'eq', value: '4624' },
          { field: 'EventCode', op: 'eq', value: '4625' },
        ],
      },
    });
    expect(result).toBe('search (EventCode="4624" OR EventCode="4625")');
  });

  test('with field projection and limit', () => {
    const result = translateToSpl({
      filter: { and: [{ field: 'index', op: 'eq', value: 'main' }] },
      fields: ['_time', 'host', 'sourcetype'],
      limit: 100,
    });
    expect(result).toBe('search index="main" | table _time, host, sourcetype | head 100');
  });
});

// Similar suites for translateToKql and translateToFql
```

### Tier 5: Drain Clustering Integration Tests

```typescript
// tests/unit/drain-integration.test.ts
describe('Drain clustering on SIEM results', () => {
  test('produces templates from normalized Splunk events', () => {
    const events = loadFixture('splunk/search-export-200.json');
    const normalized = splunkAdapter.normalizeResponse({ response: { data: events }, spec });
    const clusters = runDrainClustering(
      normalized.events.map(e => e.summary),
      { depth: 4, similarityThreshold: 0.4 },
    );

    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0].template).toContain('<*>');
    expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(normalized.events.length);
  });
});
```

---

## Phased Rollout Plan

### Phase 1: Splunk MVP (Weeks 1-2)

**Why Splunk first:**
- Most mature adapter in the codebase (async job fallback, streaming export)
- Most common SIEM in enterprise environments
- Simplest auth model (bearer token or basic auth, no OAuth flow)
- Existing test fixtures in the contract test suite

**Deliverables:**
1. Connector orchestrator (lifecycle management, pagination loop, progress events)
2. `siem_query` MCP tool (Splunk only)
3. `siem_status` MCP tool
4. `siem_discover` MCP tool (Splunk metadata discovery)
5. Query translation (abstract -> SPL)
6. Drain clustering integration (events -> templates -> QRY-*.md)
7. File-based progress reporting for VSCode extension
8. Recorded response test fixtures for Splunk
9. Contract tests + unit tests + integration test

**MVP exit criteria:**
- A user can invoke `siem_query` from Claude Code, execute an SPL query
  against a live Splunk instance, and see Drain template clusters in the
  VSCode extension's Drain Template Viewer.

### Phase 2: Sentinel + Environment Auto-Population (Weeks 3-4)

**Deliverables:**
1. Sentinel metadata discovery (`.show tables`, schema, retention)
2. Query translation (abstract -> KQL)
3. OAuth token cache with automatic refresh
4. Time-window splitting for large result sets
5. `siem_env_populate` MCP tool
6. ENVIRONMENT.md auto-population from Splunk + Sentinel
7. Rate limiting (token bucket for Sentinel)
8. Recorded response test fixtures for Sentinel
9. Contract tests + integration tests

### Phase 3: CrowdStrike + Hardening (Weeks 5-6)

**Deliverables:**
1. CrowdStrike multi-surface query routing (alerts vs detections vs devices)
2. Query translation (abstract -> FQL)
3. Sliding window rate limiter (header-driven)
4. Circuit breaker for persistent failures
5. CrowdStrike metadata discovery (scope-based)
6. ENVIRONMENT.md auto-population from CrowdStrike
7. Error classification and structured error responses
8. Recorded response test fixtures for CrowdStrike
9. Contract tests + integration tests

### Phase 4: Polish + MCP WebSocket Progress (Weeks 7-8)

**Deliverables:**
1. MCP notification support for real-time progress
2. VSCode extension MCP client connection
3. Status bar progress indicator (live query progress)
4. Query history panel in sidebar (past queries, re-run)
5. Multi-connector query support (same abstract query, multiple SIEMs)
6. Performance optimization (streaming normalization, incremental Drain)
7. Documentation: setup guide, connector configuration reference
8. End-to-end smoke test against real SIEM instances (manual)

---

## Estimated Effort Breakdown

| Component                          | New Code | Tests | Total  |
|------------------------------------|----------|-------|--------|
| Connector orchestrator             | 3 days   | 1 day | 4 days |
| MCP tool definitions (4 tools)     | 2 days   | 1 day | 3 days |
| Query translation (3 languages)    | 3 days   | 2 days| 5 days |
| OAuth token cache                  | 1 day    | 0.5 d | 1.5 d  |
| Rate limiters (3 implementations)  | 2 days   | 1 day | 3 days |
| Metadata discovery (3 connectors)  | 3 days   | 1 day | 4 days |
| ENVIRONMENT.md auto-population     | 1 day    | 0.5 d | 1.5 d  |
| Drain clustering integration       | 2 days   | 1 day | 3 days |
| File-based progress reporting      | 1 day    | 0.5 d | 1.5 d  |
| MCP WebSocket progress (Phase 4)   | 2 days   | 1 day | 3 days |
| VSCode extension integration       | 2 days   | 1 day | 3 days |
| Recorded response fixtures         | 2 days   | --    | 2 days |
| Error handling + circuit breaker   | 2 days   | 1 day | 3 days |
| Integration tests (end-to-end)     | --       | 3 days| 3 days |
| Documentation                      | 2 days   | --    | 2 days |
| **Total**                          | **28 d** | **14.5 d** | **42.5 days** |

**Calendar time estimate:** 8 weeks at 5 days/week with one developer.
Phase 1 (Splunk MVP) delivers usable value in 2 weeks.

---

## Appendix A: File Locations for New Code

```
thrunt-god/bin/lib/
  connector-orchestrator.cjs     # NEW: Lifecycle orchestrator
  query-translator.cjs           # NEW: Abstract -> SPL/KQL/FQL
  rate-limiter.cjs               # NEW: Per-connector rate limiters
  token-cache.cjs                # NEW: OAuth token cache
  metadata-discovery.cjs         # NEW: Per-connector metadata discovery
  env-populator.cjs              # NEW: ENVIRONMENT.md writer

apps/terminal/src/
  mcp/
    siem-tools.ts                # NEW: siem_query, siem_status, siem_discover, siem_env_populate
  hunt/
    drain-pipeline.ts            # NEW: Drain clustering pipeline for live events

tests/
  connectors/
    splunk.replay.test.ts        # NEW: Recorded response replay
    sentinel.replay.test.ts      # NEW
    crowdstrike.replay.test.ts   # NEW
  mcp/
    siem-tools.contract.test.ts  # NEW: Tool parameter/result contract tests
    siem-e2e.test.ts             # NEW: Full MCP integration test
  unit/
    query-translator.test.ts     # NEW: Translation unit tests
    rate-limiter.test.ts         # NEW
    token-cache.test.ts          # NEW
    drain-pipeline.test.ts       # NEW
  fixtures/
    recorded/
      splunk/                    # NEW: Recorded Splunk responses
      sentinel/                  # NEW: Recorded Sentinel responses
      crowdstrike/               # NEW: Recorded CrowdStrike responses
```

## Appendix B: Configuration Example

Complete `.thrunt-god/config.json` with all three connectors configured:

```json
{
  "connector_profiles": {
    "splunk": {
      "default": {
        "auth_type": "bearer",
        "base_url": "https://splunk.corp.example.com:8089",
        "secret_refs": {
          "access_token": { "type": "env", "value": "SPLUNK_BEARER_TOKEN" }
        },
        "default_parameters": {
          "search_mode": "normal"
        },
        "smoke_test": {
          "query": "| makeresults count=1",
          "expected_fields": ["_time"]
        }
      }
    },
    "sentinel": {
      "production": {
        "auth_type": "oauth_client_credentials",
        "base_url": "https://api.loganalytics.azure.com/v1",
        "token_url": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token",
        "tenant": "YOUR_TENANT_ID",
        "scopes": ["https://api.loganalytics.azure.com/.default"],
        "secret_refs": {
          "client_id": { "type": "env", "value": "AZURE_CLIENT_ID" },
          "client_secret": { "type": "env", "value": "AZURE_CLIENT_SECRET" }
        },
        "default_parameters": {
          "workspace_id": "YOUR_WORKSPACE_GUID"
        },
        "smoke_test": {
          "query": "Heartbeat | take 1",
          "expected_fields": ["TimeGenerated", "Computer"]
        }
      }
    },
    "crowdstrike": {
      "default": {
        "auth_type": "oauth_client_credentials",
        "base_url": "https://api.crowdstrike.com",
        "secret_refs": {
          "client_id": { "type": "env", "value": "CS_CLIENT_ID" },
          "client_secret": { "type": "env", "value": "CS_CLIENT_SECRET" }
        },
        "smoke_test": {
          "query": "severity_name:['Critical']",
          "expected_fields": ["id", "created_timestamp", "severity_name"]
        }
      }
    }
  },
  "siem_defaults": {
    "max_results": 5000,
    "timeout_ms": 120000,
    "max_retries": 2,
    "drain": {
      "depth": 4,
      "similarity_threshold": 0.4,
      "max_clusters": 100
    }
  }
}
```

## Appendix C: Example MCP Tool Invocation

### Claude Code / Agent invoking siem_query

```
User: "Search Sentinel for failed Azure AD sign-ins in the last 24 hours"

Claude invokes: tools/call siem_query
{
  "connectorId": "sentinel",
  "profileName": "production",
  "query": {
    "language": "kql",
    "statement": "SigninLogs | where ResultType != '0' | where TimeGenerated > ago(24h)"
  },
  "dataset": { "kind": "identity", "name": "SigninLogs" },
  "timeWindow": { "lookbackMinutes": 1440 },
  "hypothesisIds": ["HYP-01"]
}

Response:
{
  "summary": {
    "queryId": "QRY-20260402143022-A1B2C3D4",
    "connectorId": "sentinel",
    "dataset": "identity",
    "eventCount": 1247,
    "entityCount": 18,
    "templateCount": 23,
    "pagesFetched": 1,
    "durationMs": 4321,
    "status": "ok",
    "warnings": []
  },
  "artifactPaths": {
    "queryLog": ".hunt/QUERIES/QRY-20260402143022-A1B2C3D4.md"
  },
  "topTemplates": [
    {
      "templateId": "a1b2c3d4e5f67890",
      "template": "User <*> failed sign-in from <*> with error <*>",
      "count": 423,
      "percentage": 33.9
    },
    {
      "templateId": "f0e1d2c3b4a59876",
      "template": "MFA challenge failed for <*> from device <*>",
      "count": 312,
      "percentage": 25.0
    }
  ]
}
```

The VSCode extension's file watcher detects the new QRY-*.md file, the parser
extracts template data, and the Drain Template Viewer renders the stacked bar
visualization automatically.
