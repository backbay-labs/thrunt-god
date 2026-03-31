# Roadmap: THRUNT GOD

## Milestones

- v1.0 Query Runtime & Connector SDK (Phases 1-6) -- shipped 2026-03-25
- v1.1 Hunt Packs & Technique Packs (Phases 7-11) -- shipped 2026-03-25
- v1.2 Evidence Integrity & Provenance (Phases 12-16) -- shipped 2026-03-27
- v1.3 Detection Promotion Pipeline (Phases 17-19) -- shipped 2026-03-27
- v1.4 Hunt Learning & Recommendation Engine (Phases 20-22) -- shipped 2026-03-27
- v1.5 TUI Operator Console (Phases 23-26) -- shipped 2026-03-30
- v1.6 Live Connector Integrations (Phases 27-30) -- shipped 2026-03-30
- **v2.0 Developer Experience & CI (Phases 31-37) -- shipped 2026-03-30**
- **v2.1 Advanced Hunt Features (Phases 38-44) -- shipped 2026-03-31**
- v2.2 Connector Ecosystem (Phases 45-49) -- planned

## v2.1 Advanced Hunt Features

**Milestone Goal:** Ship hunt replay engine for retroactive hunting and multi-tenant coordination for MSSP/enterprise fan-out across customer environments.

## Phases

- [x] **Phase 31: Core CI Pipeline** - GitHub Actions for unit tests with Node 20/22/24 matrix, c8 coverage gates (completed 2026-03-30)
- [x] **Phase 32: Integration Test CI & Pack Validation** - Docker-compose in CI, pack validation gates (completed 2026-03-30)
- [x] **Phase 33: SDK Export Surface** - Export ~18 internal runtime.cjs functions (completed 2026-03-30)
- [x] **Phase 34: Connector Scaffolding CLI** - thrunt-tools init connector command (completed 2026-03-30)
- [x] **Phase 35: Pack Authoring Interactive CLI** - MITRE ATT&CK technique picker, hypothesis builder (completed 2026-03-30)
- [x] **Phase 36: Pack Query Wiring & Validation** - Per-connector query starters, entity extraction, validation pipeline (completed 2026-03-30)
- [x] **Phase 37: Pack Testing & Publishing** - Enhanced pack test, fixture generation, pack promote (completed 2026-03-30)
- [x] **Phase 38: Replay Engine Core** - ReplaySpec schema, source resolution, time mutations (completed 2026-03-30)
- [x] **Phase 39: Per-Language Query Rewriters** - SPL, ES|QL, EQL, KQL, OpenSearch SQL time rewriters (completed 2026-03-30)
- [x] **Phase 40: Source Retargeting & IOC Injection** - Pack-based retargeting, IOC validation and injection (completed 2026-03-30)
- [x] **Phase 41: Replay Diffing & Receipt Lineage** - Entity-level diffing, lineage chain, CLI commands (completed 2026-03-30)
- [x] **Phase 42: Tenant Registry & Auth** - Tenant config, credential isolation, CRUD commands (completed 2026-03-30)
- [x] **Phase 43: Dispatch Coordinator** - Promise.allSettled() fan-out with concurrency semaphore, per-tenant isolation (completed 2026-03-31)
- [x] **Phase 44: Cross-Tenant Aggregation & Heatmap** - Result merging, entity dedup, tenant x MITRE technique heatmap (completed 2026-03-31)

## Phase Details

### Phase 43: Dispatch Coordinator
**Goal**: Ship fan-out execution engine that dispatches hunts across N tenants with concurrency control and error isolation
**Depends on**: Phase 42 (tenant registry and auth exist)
**Requirements**: TENANT-02
**Plans:** 2/2 plans complete
Plans:
- [x] 43-01-PLAN.md — Core dispatch module (resolveTenantTargets, cloneTenantSpec, dispatchMultiTenant) with config keys and runtime re-exports
- [x] 43-02-PLAN.md — CLI dispatch command wiring and comprehensive unit tests
**Success Criteria** (what must be TRUE):
  1. resolveTenantTargets() filters tenants by tag, connector type, or ID
  2. dispatchMultiTenant() executes via Promise.allSettled() with configurable concurrency semaphore (default 5)
  3. Per-tenant timeout and retry isolation — one tenant failure does not affect others
  4. Per-tenant token cache prevents credential cross-contamination
  5. MultiTenantResult shape aggregates per-tenant results with status

### Phase 44: Cross-Tenant Aggregation & Heatmap
**Goal**: Ship cross-tenant result merging with entity deduplication and tenant x MITRE technique heatmap generation
**Depends on**: Phase 43 (dispatch coordinator produces MultiTenantResult)
**Requirements**: TENANT-03
**Plans:** 2/2 plans complete
Plans:
- [x] 44-01-PLAN.md — Aggregation module (tagEventsWithTenant, deduplicateEntities, correlateFindings, aggregateResults), writeMultiTenantArtifacts in evidence.cjs, config key
- [x] 44-02-PLAN.md — Heatmap module (buildHeatmapFromResults, renderHeatmapTable, writeHeatmapArtifacts), CLI commands (runtime aggregate, runtime heatmap), runtime re-exports
**Success Criteria** (what must be TRUE):
  1. Events tagged with tenant_id for provenance tracking
  2. Entity deduplication by (kind, value) across tenants with tenant attribution
  3. Multi-tenant finding correlation: entities appearing in multiple tenants, technique spread analysis
  4. Heatmap data model with sparse tenant x technique cells and severity levels
  5. Heatmap output in both JSON and Markdown formats to .planning/HEATMAPS/
  6. heatmap.cjs module created

## v2.2 Connector Ecosystem

### Phase 45: @thrunt/connector-sdk Package
**Goal**: Extract SDK types, validators, test helpers, and auth utilities from runtime.cjs into a zero-dependency standalone npm package
**Depends on**: Phase 33 (SDK exports already identified and exported)
**Requirements**: ECO-01
**Plans:** 1 plan
Plans:
- [x] 45-01-PLAN.md — Extract 60 SDK symbols into connector-sdk.cjs, refactor runtime.cjs to re-export via spread, verify full test suite
**Success Criteria** (what must be TRUE):
  1. @thrunt/connector-sdk package created with zero production dependencies
  2. Exports: validateConnectorAdapter, createConnectorCapabilities, createWarning, createRuntimeError, startJsonServer, runContractTests
  3. All auth utilities exported: createAuthProfile, resolveSecretRefs, authorizeRequest
  4. runtime.cjs becomes thin re-export wrapper for SDK functions
  5. All 2,190+ existing tests pass unchanged after extraction

### Phase 46: Plugin Manifest & Discovery
**Goal**: Define thrunt-connector.json manifest format and implement runtime plugin discovery with triple-precedence resolution
**Depends on**: Phase 45 (@thrunt/connector-sdk package exists)
**Requirements**: ECO-02
**Success Criteria** (what must be TRUE):
  1. thrunt-connector.json schema defined with name, version, auth_types, query_surfaces, capabilities
  2. validatePluginManifest() enforces 8 validation rules
  3. discoverPlugins() implements triple discovery: explicit config > node_modules scan > built-in fallback
  4. ConnectorRegistry extended to PluginRegistry with provenance tracking

### Phase 47: Contract Test Suite & Plugin Lifecycle
**Goal**: Ship automated contract test suite and full plugin lifecycle management
**Depends on**: Phase 46 (manifest and discovery exist)
**Requirements**: ECO-03
**Success Criteria** (what must be TRUE):
  1. runContractTests() validates ~25 automated checks
  2. Full lifecycle: install -> validate -> register -> use
  3. Contract suite catches >90% of common adapter bugs
  4. All checks use startJsonServer mocks with no live services required

### Phase 48: Built-in Connector Migration
**Goal**: Extract all 10 built-in connectors into individual plugin-format files without breaking the public API
**Depends on**: Phase 47 (contract test suite validates extracted connectors)
**Requirements**: ECO-04
**Success Criteria** (what must be TRUE):
  1. All 10 connectors extracted to individual files under connectors/
  2. Connector-specific parsers co-located with their adapters
  3. runtime.cjs imports from barrel file — zero public API change
  4. Each extracted connector passes runContractTests() individually
  5. All existing tests pass unchanged

### Phase 49: Reusable CI & Ecosystem Tooling
**Goal**: Ship GitHub Actions reusable workflow for plugin repos, starter template, and documentation
**Depends on**: Phase 48 (migration validates the plugin pattern end-to-end)
**Requirements**: ECO-05
**Success Criteria** (what must be TRUE):
  1. Reusable GitHub Actions workflow for third-party connector repos
  2. Starter template repository with example connector
  3. CLI commands: thrunt connectors list, thrunt connectors search, thrunt connectors init
  4. Documentation enables third-party developer to create/test/publish a connector in under 2 hours

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 31. Core CI Pipeline | 1/1 | Complete | 2026-03-30 |
| 32. Integration Test CI & Pack Validation | 1/1 | Complete | 2026-03-30 |
| 33. SDK Export Surface | 1/1 | Complete | 2026-03-30 |
| 34. Connector Scaffolding CLI | 2/2 | Complete | 2026-03-30 |
| 35. Pack Authoring Interactive CLI | 3/3 | Complete | 2026-03-30 |
| 36. Pack Query Wiring & Validation | 3/3 | Complete | 2026-03-30 |
| 37. Pack Testing & Publishing | 2/2 | Complete | 2026-03-30 |
| 38. Replay Engine Core | 1/1 | Complete | 2026-03-30 |
| 39. Per-Language Query Rewriters | 1/1 | Complete | 2026-03-30 |
| 40. Source Retargeting & IOC Injection | 1/1 | Complete | 2026-03-30 |
| 41. Replay Diffing & Receipt Lineage | 2/2 | Complete | 2026-03-30 |
| 42. Tenant Registry & Auth | 2/2 | Complete | 2026-03-30 |
| 43. Dispatch Coordinator | 2/2 | Complete    | 2026-03-31 |
| 44. Cross-Tenant Aggregation & Heatmap | 2/2 | Complete    | 2026-03-31 |
| 45. @thrunt/connector-sdk Package | 1/1 | Complete    | 2026-03-31 |
| 46. Plugin Manifest & Discovery | 0/0 | Not Started | |
| 47. Contract Test Suite & Plugin Lifecycle | 0/0 | Not Started | |
| 48. Built-in Connector Migration | 0/0 | Not Started | |
| 49. Reusable CI & Ecosystem Tooling | 0/0 | Not Started | |
