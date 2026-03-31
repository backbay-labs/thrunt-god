---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Connector Ecosystem
current_plan: 49-02 -- COMPLETE
status: Connector CLI commands and developer guide complete. Phase 49 done. v2.2 milestone complete.
stopped_at: Completed 49-02-PLAN.md
last_updated: "2026-03-31T03:56:01Z"
last_activity: 2026-03-31 -- Completed Phase 49 Plan 02 (Reusable CI Ecosystem Tooling)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v2.2 Connector Ecosystem milestone complete (all 5 phases, 13 plans delivered)

## Current Milestone: v2.2 Connector Ecosystem

**Goal:** Extract SDK into standalone package, implement plugin manifest/discovery, contract testing, built-in connector migration, and ecosystem tooling.

## Current Position

Phase: 49 (Reusable CI Ecosystem Tooling) -- COMPLETE (2 of 2 plans done)
Current Plan: 49-02 -- COMPLETE
Status: Connector CLI commands and developer guide complete. Phase 49 done.
Last activity: 2026-03-31 -- Completed Phase 49 Plan 02 (Reusable CI Ecosystem Tooling)

Progress: [██████████] 100% (13 of 13 plans complete)

## Completed This Session

| Phase | Name | Tests Added |
|-------|------|-------------|
| 31 | Core CI Pipeline | CI workflow |
| 32 | Integration Test CI & Pack Validation | 4 workflow files |
| 33 | SDK Export Surface | 25 tests |
| 34 | Connector Scaffolding CLI | 17 tests |
| 35 | Pack Authoring Interactive CLI | 69 tests |
| 36 | Pack Query Wiring & Validation | 28 tests |
| 37 | Pack Testing & Publishing | 25 tests |
| 38 | Replay Engine Core | 30 tests |
| 39 | Per-Language Query Rewriters | 30 tests |
| 40 | Source Retargeting & IOC Injection | 49 tests |
| 41 | Replay Diffing & Receipt Lineage | 35 tests |
| 42 | Tenant Registry & Auth | 29 tests |
| 43 | Dispatch Coordinator | 34 tests |
| 44 | Cross-Tenant Aggregation & Heatmap | 78 tests |
| 45 | @thrunt/connector-sdk Package | 0 tests (pure refactor) |
| 46 | Plugin Manifest & Discovery (Plan 01) | 22 tests |
| 46 | Plugin Manifest & Discovery (Plan 02) | 18 tests |
| 47 | Contract Test Suite (Plan 01) | 22 tests |
| 47 | Plugin Lifecycle Wiring (Plan 02) | 15 tests |
| 48 | SIEM Connector Extraction (Plan 01) | 0 tests (pure refactor) |
| 48 | Remaining Connector Extraction (Plan 02) | 0 tests (pure refactor) |
| 49 | Reusable CI Ecosystem Tooling (Plan 01) | 14 tests |
| 49 | Connector CLI & Developer Guide (Plan 02) | 13 tests |

## Accumulated Context

### Decisions

- CI-INLINE-LCOV: lcov reporter is CI-only, local dev uses text reporter
- SDK exports: 18 functions exported, total 61 exports from runtime.cjs
- Connector scaffolding uses zero-dep template engine with {{VARIABLE}} substitution
- Pack authoring: 8-step interactive flow with MITRE ATT&CK technique picker (160 techniques)
- Replay engine: 3 time mutation modes (absolute/shift/lookback), per-language rewriters
- IOC injection with per-connector field maps and input sanitization
- Tenant registry extends connector_profiles config with per-tenant credential isolation
- [Phase 43]: Promise.race semaphore with .finally() for concurrency control in dispatch coordinator
- [Phase 43]: Per-tenant Map isolation for token cache prevents credential cross-contamination
- [Phase 43]: Handle parseRuntimeArgs default empty tags array by checking length > 0 before treating as valid filter
- [Phase 44]: Entity dedup uses Map with composite key kind:value.toLowerCase() for O(1) lookup
- [Phase 44]: Temporal clustering uses sliding window with configurable cluster_window_minutes (default 15)
- [Phase 44]: Aggregate receipts carry counts and cross-refs only, never raw event data for tenant isolation
- [Phase 44]: Sparse heatmap cells: only cells with >0 events included, clear cells omitted
- [Phase 44]: Technique inference from 3 sources: pack metadata, 12-keyword heuristic map, explicit tags
- [Phase 44]: Heatmap severity 2-tier: >10=high, >0=medium, 0=clear (null severity)
- [Phase 45]: connector-sdk.cjs has 60 SDK exports (15 constants + 45 functions), runtime.cjs re-exports via ...sdk spread
- [Phase 45]: Lazy require pattern for _getDefaultRegistry() avoids circular dependency between sdk and runtime at load time
- [Phase 45]: sleep and decodeMaybeJson duplicated in runtime.cjs (internal SDK helpers needed by adapter code)
- [Phase 46]: Minimal semver range parser handles ^/~/>=/>= <A patterns without adding semver dependency
- [Phase 46]: Built-in connector ID collision produces warning not error, with allowOverride escape hatch
- [Phase 46]: Cross-check validates adapter capabilities are superset of manifest declarations
- [Phase 46]: PluginRegistry as Map-based standalone object (not extending ConnectorRegistry via prototype)
- [Phase 46]: Triple-precedence resolution: built-in (lowest) -> node_modules -> config-path -> config-override (highest)
- [Phase 46]: Lockfile mtime used for _scanNodeModules cache invalidation
- [Phase 46]: Lazy require of runtime.cjs inside discoverPlugins() to avoid circular dependency at module load time
- [Phase 47]: Error-collecting pattern: all ~25 checks run to completion, failures aggregated into single thrown error with failedChecks array
- [Phase 47]: Adapter validation gate: invalid adapters cause immediate throw before running individual contract checks
- [Phase 47]: Timeout check uses Promise.race with manual timer rather than SDK withTimeout, avoiding coupling to adapter internals
- [Phase 47]: Deferred Object.assign for connector-sdk.cjs re-exports avoids circular require with contract-tests.cjs
- [Phase 47]: Explicit runtime.cjs contract-test re-exports because ...sdk spread evaluates before deferred Object.assign
- [Phase 47]: cmdDoctorConnectors performs 3 checks per connector: adapter_registered, adapter_valid, capabilities_complete plus manifest_cross_check for non-built-in plugins
- [Phase 48]: normalizeElasticRows shared between elastic.cjs and opensearch.cjs via cross-connector import
- [Phase 48]: sleep() moved into splunk.cjs as local helper (only used by executeSplunkAsyncJob)
- [Phase 48]: decodeMaybeJson kept in runtime.cjs for AWS adapter (Plan 02 will move it)
- [Phase 48]: SDK destructure in runtime.cjs reduced from 26 to 13 functions after SIEM extraction
- [Phase 48]: decodeMaybeJson moved into aws.cjs as local helper (only used by CloudTrailEvent parsing)
- [Phase 48]: createBuiltInConnectorRegistry moved from runtime.cjs into connectors/index.cjs barrel
- [Phase 48]: runtime.cjs reduced to 50-line pure re-export wrapper with zero adapter code
- [Phase 48]: decodeMaybeJson moved into aws.cjs as local helper (only used by CloudTrailEvent parsing)
- [Phase 49]: Standalone plugin templates use require('thrunt-god/thrunt-god/bin/lib/connector-sdk.cjs') path for SDK imports
- [Phase 49]: Plugin template exports createAdapter() (not create{Name}Adapter) matching plugin loading contract
- [Phase 49]: Template uses peerDependencies for thrunt-god to avoid version conflicts in plugin consumers
- [Phase 49]: connectors init outputs to thrunt-connector-{id} subdirectory with recursive template scanning
- [Phase 49]: --scoped flag toggles between thrunt-connector-{id} and @thrunt/connector-{id} package naming
- [Phase 49]: Package.json version read via require('../../../package.json') from commands.cjs (3 levels up to root)

### Research Specs Available

- `cicd-pipeline-spec.md` — Phases 31-32
- `thrunt-init-spec.md` — Phases 33-34
- `pack-authoring-cli-spec.md` — Phases 35-37
- `hunt-replay-spec.md` — Phases 38-41
- `multi-tenant-coordination-spec.md` — Phases 42-44
- `connector-plugin-sdk-spec.md` — Phases 45-49

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-31T03:56:01Z
Stopped at: Completed 49-02-PLAN.md
Resume: Phase 49 complete (both plans done). v2.2 Connector Ecosystem milestone fully delivered. 3 CLI commands (connectors list/search/init) in commands.cjs with routing in thrunt-tools.cjs. 793-line developer guide at docs/connector-plugin-guide.md. 27 ecosystem tests (14 structure + 13 CLI). All 2406 project tests passing.
