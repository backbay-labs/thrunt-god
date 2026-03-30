# Roadmap: THRUNT GOD

## Milestones

- v1.0 Query Runtime & Connector SDK (Phases 1-6) -- shipped 2026-03-25
- v1.1 Hunt Packs & Technique Packs (Phases 7-11) -- shipped 2026-03-25
- v1.2 Evidence Integrity & Provenance (Phases 12-16) -- shipped 2026-03-27
- v1.3 Detection Promotion Pipeline (Phases 17-19) -- shipped 2026-03-27
- v1.4 Hunt Learning & Recommendation Engine (Phases 20-22) -- shipped 2026-03-27
- v1.5 TUI Operator Console (Phases 23-26) -- shipped 2026-03-30
- v1.6 Live Connector Integrations (Phases 27-30) -- shipped 2026-03-30
- **v2.0 Developer Experience & CI (Phases 31-37) -- active**
- v2.1 Advanced Hunt Features (Phases 38-44) -- planned
- v2.2 Connector Ecosystem (Phases 45-49) -- planned

## v2.0 Developer Experience & CI

**Milestone Goal:** Ship CI/CD pipeline, connector scaffolding CLI, and pack authoring tools to accelerate development velocity and enable third-party contributions.

## Phases

- [x] **Phase 31: Core CI Pipeline** - GitHub Actions for unit tests with Node 20/22/24 matrix, c8 coverage gates with lcov reporting, artifact upload (completed 2026-03-30)
- [x] **Phase 32: Integration Test CI & Pack Validation** - Docker-compose in CI for Splunk/Elastic/OpenSearch, pack lint/test/validate as CI gates, reusable workflow template (completed 2026-03-30)
- [x] **Phase 33: SDK Export Surface** - Export ~15 internal runtime.cjs functions needed by standalone connector files (completed 2026-03-30)
- [x] **Phase 34: Connector Scaffolding CLI** - thrunt-tools init connector command with interactive mode, zero-dep templates, post-scaffold validation (completed 2026-03-30)
- [x] **Phase 35: Pack Authoring Interactive CLI** - MITRE ATT&CK technique picker, hypothesis builder with quality checks, pack type selection (completed 2026-03-30)
- [x] **Phase 36: Pack Query Wiring & Validation** - Per-connector query template starters for all 10 connectors, entity extraction rule builder, schema validation pipeline (completed 2026-03-30)
- [x] **Phase 37: Pack Testing & Publishing** - Enhanced pack test with mock data and coverage, fixture generation, pack distribution (completed 2026-03-30)

## Phase Details

### Phase 31: Core CI Pipeline
**Goal**: Ship a GitHub Actions workflow that runs unit tests across Node 20/22/24, enforces 70% coverage via c8 with lcov reporting, and uploads coverage artifacts
**Depends on**: Nothing (first v2.0 phase)
**Requirements**: CI-01
**Plans:** 1/1 plans complete
Plans:
- [ ] 31-01-PLAN.md -- Update test.yml with Node 20/22/24 matrix, lcov reporter, coverage artifact upload
**Success Criteria** (what must be TRUE):
  1. GitHub Actions workflow runs unit tests on Node 20, 22, and 24 in parallel
  2. Coverage gate enforces 70% line coverage via c8 with lcov reporter
  3. Coverage artifact uploaded from ubuntu/Node 22 job
  4. All 1,850+ existing tests pass in CI

### Phase 32: Integration Test CI & Pack Validation
**Goal**: Ship Docker-based integration test CI and pack validation gates that run on every PR
**Depends on**: Phase 31 (base CI workflow exists)
**Requirements**: CI-02
**Plans:** 1/1 plans complete
Plans:
- [ ] 32-01-PLAN.md -- integration.yml, pack-validation.yml, validate-all-packs.cjs, reusable-pack-test.yml
**Success Criteria** (what must be TRUE):
  1. Integration test workflow provisions Splunk 9.4, Elasticsearch, and OpenSearch via docker-compose in CI
  2. Pack validation job runs pack lint, pack test, and pack validate against all 16 shipped packs
  3. Reusable workflow template enables third-party pack repos to run the same validation
  4. Integration tests complete within 20 minutes in CI

### Phase 33: SDK Export Surface
**Goal**: Export ~15 internal runtime.cjs functions to module.exports so standalone connector files in connectors/ can import them without closure access
**Depends on**: Nothing (can run in parallel with Phases 31-32)
**Requirements**: SDK-01
**Plans:** 1/1 plans complete
Plans:
- [ ] 33-01-PLAN.md -- Add 18 SDK functions to module.exports and create export verification tests
**Success Criteria** (what must be TRUE):
  1. normalizeBaseUrl, joinUrl, buildUrl, executeConnectorRequest, addEntitiesFromRecord, normalizeEvent, toArray, getNestedValue, isPlainObject, parseResponseBody, parseLinkHeader, getSecret, normalizeSecretRef are exported from runtime.cjs
  2. All existing tests pass unchanged after exports are added
  3. A standalone connector file in connectors/ can require('../bin/lib/runtime.cjs') and call all exported functions

### Phase 34: Connector Scaffolding CLI
**Goal**: Ship thrunt-tools init connector command that scaffolds a complete connector with adapter, tests, and optional Docker integration test template
**Depends on**: Phase 33 (SDK exports must exist for generated adapter to call them)
**Requirements**: INIT-01
**Plans:** 2/2 plans complete
Plans:
- [ ] 34-01-PLAN.md -- Template engine, 8 template files, cmdInitConnector command with interactive mode and Docker generation
- [ ] 34-02-PLAN.md -- Scaffolder test suite covering validation, generation, dry-run, and contract checks
**Success Criteria** (what must be TRUE):
  1. thrunt-tools init connector <id> generates adapter module, unit test, and README
  2. Interactive mode prompts for connector name, auth types, datasets, languages, Docker image
  3. Generated adapter passes validateConnectorAdapter() immediately after scaffold
  4. Generated unit test file runs and passes with startJsonServer mock
  5. Optional Docker integration test template generated with --docker flag

### Phase 35: Pack Authoring Interactive CLI
**Goal**: Ship thrunt pack create command with interactive guided flow for creating hunt packs including MITRE ATT&CK technique selection
**Depends on**: Nothing (builds on existing pack init command)
**Requirements**: PACK-01
**Plans:** 3/3 plans complete
Plans:
- [ ] 35-01-PLAN.md -- MITRE ATT&CK data bundle, mitre-data.cjs module, and mitre-data tests
- [ ] 35-02-PLAN.md -- pack-author.cjs interactive engine, cmdPackCreate routing
- [ ] 35-03-PLAN.md -- Pack author test suite and end-to-end verification
**Success Criteria** (what must be TRUE):
  1. thrunt pack create launches interactive 8-step guided flow
  2. MITRE ATT&CK technique picker supports search by ID (T1078), name (Valid Accounts), and tactic (Initial Access)
  3. Hypothesis builder generates testable hypotheses with quality checks and success criteria
  4. Pack type selection covers all 6 kinds: technique, domain, family, campaign, custom, example
  5. Generated pack passes validatePackDefinition() with all ~47 validation rules

### Phase 36: Pack Query Wiring & Validation
**Goal**: Ship per-connector query template starters and entity extraction rule builder with incremental schema validation
**Depends on**: Phase 35 (interactive pack creation flow exists)
**Requirements**: PACK-02
**Plans:** 3/3 plans complete
Plans:
- [ ] 36-01-PLAN.md -- query-starters.cjs module with 10 connector starter templates, entity scope types, incremental validation helpers
- [ ] 36-02-PLAN.md -- Extend pack-author.cjs with query starter integration, entity selection, and 4-checkpoint validation
- [ ] 36-03-PLAN.md -- Test suite for query starters, entity types, incremental validation, and template parameter detection
**Success Criteria** (what must be TRUE):
  1. Query template starters provided for all 10 connectors with correct language identifiers
  2. Entity extraction rule builder maps fields to entity types from the 13 runtime entity kinds
  3. Template parameter auto-detection identifies {{parameter}} placeholders
  4. Incremental 4-checkpoint validation pipeline provides feedback at each stage

### Phase 37: Pack Testing & Publishing
**Goal**: Ship enhanced pack test with mock data support, fixture generation, and pack distribution mechanisms
**Depends on**: Phase 36 (query wiring and validation exist)
**Requirements**: PACK-03
**Plans:** 2/2 plans complete
Plans:
- [ ] 37-01-PLAN.md -- Test fixture generation, mock response fixtures, enhanced cmdPackTest with --verbose/--mock-data/--coverage/--validate-only
- [ ] 37-02-PLAN.md -- Pack promote command, registry extension with pack_registries config, deprecation warnings, comprehensive test coverage
**Success Criteria** (what must be TRUE):
  1. pack test --verbose shows detailed execution trace
  2. pack test --mock-data validates against synthetic data fixtures
  3. Auto-generated test fixtures accompany new packs
  4. pack promote command enables built-in promotion workflow
  5. Git-based registry configuration for pack sharing

## v2.1 Advanced Hunt Features

### Phase 38: Replay Engine Core
**Goal**: Ship ReplaySpec schema and core replay infrastructure that reconstructs original hunt queries from receipts and applies time window mutations
**Depends on**: Nothing (first v2.1 phase, uses existing evidence system)
**Requirements**: REPLAY-01
**Plans:** 1/1 plans complete
Plans:
- [ ] 38-01-PLAN.md -- ReplaySpec Zod schema, createReplaySpec, parseShiftDuration, applyMutations, resolveReplaySource with three-strategy artifact resolution
**Success Criteria** (what must be TRUE):
  1. ReplaySpec Zod schema validates replay configurations with time_mutation, source_override, and ioc_injection fields
  2. resolveReplaySource() reconstructs original QuerySpecs from MANIFESTS/QUERIES/METRICS artifacts
  3. Three time mutation modes supported: absolute (fixed start/end), shift (delta from original), lookback (relative to now)
  4. replay.cjs module created with correct dependency chain (imports from evidence.cjs, not runtime.cjs importing it)

### Phase 39: Per-Language Query Rewriters
**Goal**: Ship regex-based time rewriters for all 5 query languages that safely substitute time ranges in existing query statements
**Depends on**: Phase 38 (ReplaySpec and core infrastructure exist)
**Requirements**: REPLAY-02
**Plans:** 1/1 plans complete
Plans:
- [ ] 39-01-PLAN.md -- Per-language time rewriters (SPL, ES|QL, EQL, KQL, OpenSearch SQL), TIME_REWRITERS registry, rewriteQueryTime dispatcher
**Success Criteria** (what must be TRUE):
  1. SPL rewriter handles earliest/latest modifiers in query strings
  2. ES|QL rewriter handles @timestamp range filters
  3. EQL rewriter uses filter-param approach (modifies filter object, not query string)
  4. KQL rewriter handles TimeGenerated > ago() patterns for both Sentinel and Defender XDR
  5. OpenSearch SQL rewriter handles WHERE timestamp clauses
  6. TIME_REWRITERS registry maps connector IDs to rewriter functions
  7. Fallback warning emitted when inline time cannot be extracted

### Phase 40: Source Retargeting & IOC Injection
**Goal**: Ship cross-connector replay via pack-based target selection and IOC injection with input sanitization
**Depends on**: Phase 39 (time rewriters exist for all languages)
**Requirements**: REPLAY-03
**Plans:** 1/1 plans complete
Plans:
- [ ] 40-01-PLAN.md -- Source retargeting (pack-based + same-language), IOC injection engine (field map, validation, sanitization, per-language injection)
**Success Criteria** (what must be TRUE):
  1. Pack-based retargeting selects different execution targets from the same pack for cross-connector replay
  2. Same-language retargeting with field mapping warnings supported
  3. IOC append and replace modes available for injecting indicators
  4. Per-connector IOC_FIELD_MAP defines correct field paths per entity type
  5. IOC values validated per type (IP regex, hash hex pattern, domain RFC)
  6. Query injection prevented via input sanitization

### Phase 41: Replay Diffing & Receipt Lineage
**Goal**: Ship entity-level result comparison and replay receipt lineage chain linking replays to originals
**Depends on**: Phase 40 (retargeting and IOC injection exist)
**Requirements**: REPLAY-04
**Success Criteria** (what must be TRUE):
  1. Entity-level diffing supports three modes: full, counts_only, entities_only
  2. Diff report identifies new, missing, and changed entities between original and replay
  3. Replay receipts link to originals via lineage fields in query logs, receipts, manifests, and telemetry
  4. runtime replay CLI command executes a replay from receipt reference
  5. replay list and replay diff CLI commands available

### Phase 42: Tenant Registry & Auth
**Goal**: Ship tenant configuration system extending connector_profiles with per-tenant credential management and CRUD commands
**Depends on**: Nothing (first multi-tenant phase, builds on existing connector_profiles)
**Requirements**: TENANT-01
**Success Criteria** (what must be TRUE):
  1. Tenant config schema extends connector_profiles with tenant metadata (display_name, tags, enabled flag)
  2. Credential isolation enforced — per-tenant token cache via fresh Map() instances
  3. CRUD CLI commands: tenant add, tenant list, tenant remove, tenant test
  4. assessTenantReadiness() validates tenant connectivity before dispatch
  5. tenant.cjs module created with Zod validation

### Phase 43: Dispatch Coordinator
**Goal**: Ship fan-out execution engine that dispatches hunts across N tenants with concurrency control and error isolation
**Depends on**: Phase 42 (tenant registry and auth exist)
**Requirements**: TENANT-02
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
**Success Criteria** (what must be TRUE):
  1. @thrunt/connector-sdk package created with zero production dependencies
  2. Exports: validateConnectorAdapter, createConnectorCapabilities, createWarning, createRuntimeError, startJsonServer, runContractTests
  3. All auth utilities exported: createAuthProfile, resolveSecretRefs, authorizeRequest
  4. runtime.cjs becomes thin re-export wrapper for SDK functions
  5. All 1,850+ existing tests pass unchanged after extraction

### Phase 46: Plugin Manifest & Discovery
**Goal**: Define thrunt-connector.json manifest format and implement runtime plugin discovery with triple-precedence resolution
**Depends on**: Phase 45 (@thrunt/connector-sdk package exists)
**Requirements**: ECO-02
**Success Criteria** (what must be TRUE):
  1. thrunt-connector.json schema defined with name, version, auth_types, query_surfaces, capabilities
  2. validatePluginManifest() enforces 8 validation rules
  3. discoverPlugins() implements triple discovery: explicit config > node_modules scan > built-in fallback
  4. ConnectorRegistry extended to PluginRegistry with provenance tracking (getPluginInfo, isBuiltIn, isOverridden)

### Phase 47: Contract Test Suite & Plugin Lifecycle
**Goal**: Ship automated contract test suite and full plugin lifecycle management
**Depends on**: Phase 46 (manifest and discovery exist)
**Requirements**: ECO-03
**Success Criteria** (what must be TRUE):
  1. runContractTests() validates ~25 automated checks (15 core checks enumerated)
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
**Goal**: Ship GitHub Actions reusable workflow for plugin repos, starter template, and documentation enabling third-party connector development
**Depends on**: Phase 48 (migration validates the plugin pattern end-to-end)
**Requirements**: ECO-05
**Success Criteria** (what must be TRUE):
  1. Reusable GitHub Actions workflow for third-party connector repos
  2. Starter template repository with example connector
  3. CLI commands: thrunt connectors list, thrunt connectors search, thrunt connectors init
  4. Documentation enables third-party developer to create/test/publish a connector in under 2 hours

## Progress

**Execution Order:**
Phases execute in numeric order: 31 -> 32 -> 33 -> 34 -> 35 -> 36 -> 37 -> 38 -> 39 -> 40 -> 41 -> 42 -> 43 -> 44 -> 45 -> 46 -> 47 -> 48 -> 49

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 31. Core CI Pipeline | 1/1 | Complete    | 2026-03-30 |
| 32. Integration Test CI & Pack Validation | 1/1 | Complete    | 2026-03-30 |
| 33. SDK Export Surface | 1/1 | Complete    | 2026-03-30 |
| 34. Connector Scaffolding CLI | 2/2 | Complete    | 2026-03-30 |
| 35. Pack Authoring Interactive CLI | 3/3 | Complete    | 2026-03-30 |
| 36. Pack Query Wiring & Validation | 3/3 | Complete    | 2026-03-30 |
| 37. Pack Testing & Publishing | 2/2 | Complete    | 2026-03-30 |
| 38. Replay Engine Core | 1/1 | Complete    | 2026-03-30 |
| 39. Per-Language Query Rewriters | 1/1 | Complete    | 2026-03-30 |
| 40. Source Retargeting & IOC Injection | 1/1 | Complete   | 2026-03-30 |
| 41. Replay Diffing & Receipt Lineage | 0/0 | Not Started | |
| 42. Tenant Registry & Auth | 0/0 | Not Started | |
| 43. Dispatch Coordinator | 0/0 | Not Started | |
| 44. Cross-Tenant Aggregation & Heatmap | 0/0 | Not Started | |
| 45. @thrunt/connector-sdk Package | 0/0 | Not Started | |
| 46. Plugin Manifest & Discovery | 0/0 | Not Started | |
| 47. Contract Test Suite & Plugin Lifecycle | 0/0 | Not Started | |
| 48. Built-in Connector Migration | 0/0 | Not Started | |
| 49. Reusable CI & Ecosystem Tooling | 0/0 | Not Started | |
