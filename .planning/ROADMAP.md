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
- **v2.2 Connector Ecosystem (Phases 45-49) -- shipped 2026-03-31**
- **v3.0 Hunt Program Intelligence (Phases 50-57) -- in progress**

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
**Plans:** 1/1 plans complete
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
**Plans:** 2/2 plans complete
Plans:
- [x] 46-01-PLAN.md — Plugin manifest schema validation (validatePluginManifest, loadPluginManifest, loadPlugin) with 8 validation rules and cross-check logic
- [x] 46-02-PLAN.md — Discovery engine (discoverPlugins, createPluginRegistry, _scanNodeModules), PluginRegistry with provenance tracking, runtime.cjs re-exports
**Success Criteria** (what must be TRUE):
  1. thrunt-connector.json schema defined with name, version, auth_types, query_surfaces, capabilities
  2. validatePluginManifest() enforces 8 validation rules
  3. discoverPlugins() implements triple discovery: explicit config > node_modules scan > built-in fallback
  4. ConnectorRegistry extended to PluginRegistry with provenance tracking

### Phase 47: Contract Test Suite & Plugin Lifecycle
**Goal**: Ship automated contract test suite and full plugin lifecycle management
**Depends on**: Phase 46 (manifest and discovery exist)
**Requirements**: ECO-03
**Plans:** 2/2 plans complete
Plans:
- [x] 47-01-PLAN.md — Contract test suite (runContractTests with ~25 checks, createTestQuerySpec, createTestProfile, createTestSecrets helpers)
- [x] 47-02-PLAN.md — Plugin lifecycle wiring (re-exports through connector-sdk.cjs/runtime.cjs, cmdDoctorConnectors CLI command)
**Success Criteria** (what must be TRUE):
  1. runContractTests() validates ~25 automated checks
  2. Full lifecycle: install -> validate -> register -> use
  3. Contract suite catches >90% of common adapter bugs
  4. All checks use startJsonServer mocks with no live services required

### Phase 48: Built-in Connector Migration
**Goal**: Extract all 10 built-in connectors into individual plugin-format files without breaking the public API
**Depends on**: Phase 47 (contract test suite validates extracted connectors)
**Requirements**: ECO-04
**Plans:** 2/2 plans complete
Plans:
- [ ] 48-01-PLAN.md — Extract 5 SIEM connectors (Splunk, Elastic, Sentinel, OpenSearch, Defender XDR) with parsers, create barrel file, update runtime.cjs
- [ ] 48-02-PLAN.md — Extract 5 remaining connectors (Okta, M365, CrowdStrike, AWS, GCP), finalize barrel, reduce runtime.cjs to thin wrapper, validate all 10 pass contract tests
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
**Plans:** 2/2 plans complete
Plans:
- [x] 49-01-PLAN.md — Reusable connector CI workflow (workflow_call), standalone plugin starter template directory (7 template files), structure tests
- [x] 49-02-PLAN.md — CLI commands (connectors list/search/init), third-party connector development guide, CLI tests
**Success Criteria** (what must be TRUE):
  1. Reusable GitHub Actions workflow for third-party connector repos
  2. Starter template repository with example connector
  3. CLI commands: thrunt connectors list, thrunt connectors search, thrunt connectors init
  4. Documentation enables third-party developer to create/test/publish a connector in under 2 hours

---

## v3.0 Hunt Program Intelligence

**Milestone Goal:** Restructure program/case hierarchy so all modules resolve artifacts in cases/ subdirectories, then layer cross-case intelligence, a unified MCP server for ATT&CK and detection data, detection coverage analysis, a persistent knowledge graph, and full agent wiring on top.

### Phases

- [x] **Phase 50: Program & Case Hierarchy** - Refactor planningPaths and all artifact-resolving modules; new-program and new-case commands; case migration (completed 2026-04-08)
- [x] **Phase 51: Program Dashboard & Extension Wiring** - STATE.md case rollup, VS Code webview for program overview, extension artifact watcher for cases/ (completed 2026-04-08)
- [ ] **Phase 52: Cross-Case Intelligence** - SQLite+FTS5 case index, auto-search on new-case, case-search CLI command
- [ ] **Phase 53: MCP Server & ATT&CK Tools** - @thrunt/mcp-hunt-intel stdio server, technique/group/software lookup, Navigator layer generation, coverage analysis
- [ ] **Phase 54: Detection Rule Ingestion** - Multi-format parsers (Sigma, ESCU, Elastic TOML, KQL markdown), unified detections table, bundled SigmaHQ rules
- [ ] **Phase 55: Detection Coverage & Gap Analysis** - Cross-source coverage comparison, gap identification against threat profiles, detection suggestions
- [ ] **Phase 56: Knowledge Graph** - Persistent entity/relation graph in program.db, decision logging, institutional memory, ATT&CK STIX auto-population
- [ ] **Phase 57: Agent Wiring & Workflow Integration** - MCP tools in agent frontmatter, new-case auto-workflow, pre-built MCP prompts

## Phase Details

### Phase 50: Program & Case Hierarchy
**Goal**: Hunters can create programs and cases with correct directory isolation; all existing modules resolve artifacts from cases/ subdirectories without breaking the flat .planning/ path for legacy hunts
**Depends on**: Nothing (first v3.0 phase — all downstream phases need cases/ to exist)
**Requirements**: HIER-01, HIER-02, HIER-03, HIER-04, HIER-05
**Plans:** 3/3 plans complete
Plans:
- [x] 50-01-PLAN.md — Core planningPaths/planningDir refactor for case-awareness + getActiveCase/setActiveCase/resolveHuntContext helpers
- [ ] 50-02-PLAN.md — Frontmatter array-of-objects extension, case_roster in STATE.md, new-case bootstrap, case CLI commands (new/list/close/status)
- [ ] 50-03-PLAN.md — migrate-case command for flat-to-case conversion with rollback and roster update
**Success Criteria** (what must be TRUE):
  1. Running `thrunt new-program` creates .planning/MISSION.md, .planning/STATE.md, and .planning/ENVIRONMENT.md at the root
  2. Running `thrunt new-case <name>` creates an isolated .planning/cases/<slug>/ directory with its own huntmap, hypotheses, queries, and receipts
  3. Program STATE.md lists all cases with their status (active/closed/stale), opened date, and technique coverage — updated automatically when case status changes
  4. All existing artifact-resolution modules (huntmap, evidence, phase, state, validate) read and write correctly when pointed at a case subdirectory path
  5. Running `thrunt-tools migrate-case` converts an existing flat .planning/ hunt into the cases/<slug>/ format without data loss

### Phase 51: Program Dashboard & Extension Wiring
**Goal**: Hunters can see all cases in a program at a glance — both in STATE.md and in the VS Code extension — and the extension resolves case artifacts correctly
**Depends on**: Phase 50 (cases/ directory structure exists)
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. Program STATE.md aggregates active/closed/stale case counts, overall technique coverage gaps, and a case timeline — readable without opening individual case directories
  2. The VS Code extension webview opens a program-level case overview panel showing each case's status, opened/closed date, and technique coverage metrics
  3. The extension's artifact watcher resolves huntmaps, receipts, and findings inside .planning/cases/<slug>/ subdirectories — decorations and sidebar entries appear for case artifacts
**Plans:** 2/2 plans complete
Plans:
- [ ] 51-01-PLAN.md — Watcher artifact fix for cases/ prefix + CLI cmdProgramRollup for STATE.md rollup
- [ ] 51-02-PLAN.md — VS Code program dashboard webview panel (shared types, panel provider, store method, Preact UI)

### Phase 52: Cross-Case Intelligence
**Goal**: Hunters starting a new case automatically see relevant past cases; hunters can explicitly search the full case archive
**Depends on**: Phase 50 (cases/ exist and can be closed/indexed)
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04
**Success Criteria** (what must be TRUE):
  1. Closing a case triggers indexing of its findings, hypotheses, techniques, IOCs, and outcome summary into the program SQLite+FTS5 database
  2. Opening a new case with `thrunt new-case` automatically queries past cases and surfaces any matches for similar signals, hypotheses, or techniques before the hunter writes their first query
  3. Running `thrunt-tools case-search <query>` returns matching past cases with case name, matched text in context, technique overlap, and outcome summary — optionally filtered by program
  4. Search results include enough context that a hunter can decide whether a past case is relevant without opening it
**Plans:** 1/2 plans executed
Plans:
- [ ] 52-01-PLAN.md — SQLite+FTS5 db.cjs module with openProgramDb, ensureSchema, indexCase, searchCases, findTechniqueOverlap
- [ ] 52-02-PLAN.md — Wire indexing into cmdCaseClose, auto-search into cmdCaseNew, new cmdCaseSearch CLI command

### Phase 53: MCP Server & ATT&CK Tools
**Goal**: The @thrunt/mcp-hunt-intel MCP server is running and agents can query ATT&CK technique data, threat groups, Navigator layers, and coverage gaps through it
**Depends on**: Phase 50 (program DB path established; no runtime dependency on cases/)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06
**Success Criteria** (what must be TRUE):
  1. `npx @thrunt/mcp-hunt-intel` starts a stdio MCP server with tool timeout enforcement and stdout purity (no debug output to stdout)
  2. An agent can call technique lookup by ATT&CK ID (e.g., T1059.001), run full-text search across technique descriptions, and filter by tactic or platform
  3. An agent can look up a threat group, retrieve its associated techniques and software/malware, and understand group-to-technique mappings
  4. An agent can generate an ATT&CK Navigator v4.5 layer file for a custom technique set, a coverage snapshot, a specific threat group, or a gap analysis
  5. An agent can request a per-tactic coverage breakdown and identify which techniques used by a named threat group have no detection coverage
  6. The global ~/.thrunt/intel.db is populated with ATT&CK STIX data on first run and shared safely between CLI and MCP server via WAL mode and busy_timeout
**Plans:** 2 plans
Plans:
- [ ] 51-01-PLAN.md — Watcher artifact fix for cases/ prefix + CLI cmdProgramRollup for STATE.md rollup
- [ ] 51-02-PLAN.md — VS Code program dashboard webview panel (shared types, panel provider, store method, Preact UI)

### Phase 54: Detection Rule Ingestion
**Goal**: Detection rules from Sigma, Splunk ESCU, Elastic, and KQL sources are parsed, normalized, and searchable in a unified table
**Depends on**: Phase 53 (global intel.db schema established; detections table lives in same DB)
**Requirements**: DET-01, DET-02, DET-03, DET-04, DET-05, DET-06
**Success Criteria** (what must be TRUE):
  1. A Sigma YAML file is parsed and produces a record with id, title, MITRE technique tags, severity level, logsource, detection logic, and false positives
  2. A Splunk ESCU YAML file is parsed and produces a record with detection metadata, analytic stories, and data model references
  3. An Elastic TOML rule file is parsed and produces a record with rule metadata, query, and MITRE mappings
  4. A KQL markdown file is parsed and produces a record with detection query, Microsoft table references, and MITRE tags
  5. All parsed rules land in a unified detections table with FTS5 external content, searchable by technique ID, tactic, severity, source format, or process name
  6. Bundled SigmaHQ core rules are indexed on first run; setting SIGMA_PATHS, SPLUNK_PATHS, or ELASTIC_PATHS environment variables causes those custom rule directories to be indexed in addition to bundled rules
**Plans:** 2 plans
Plans:
- [ ] 51-01-PLAN.md — Watcher artifact fix for cases/ prefix + CLI cmdProgramRollup for STATE.md rollup
- [ ] 51-02-PLAN.md — VS Code program dashboard webview panel (shared types, panel provider, store method, Preact UI)

### Phase 55: Detection Coverage & Gap Analysis
**Goal**: Hunters can compare detection coverage across sources, identify gaps against named threat profiles, and receive concrete suggestions for uncovered techniques
**Depends on**: Phase 54 (detections table is populated)
**Requirements**: DET-07, DET-08, DET-09
**Success Criteria** (what must be TRUE):
  1. Given a technique ID or topic, a hunter can see which detection sources (Sigma, ESCU, Elastic, KQL) have coverage and how those rules differ
  2. Given a named threat profile (ransomware, APT, initial-access, persistence, credential-access, defense-evasion), a hunter can see which techniques in that profile have no detection and which have partial coverage
  3. For any uncovered technique, the system suggests detections based on available data sources and patterns extracted from existing rules in the same tactic family
**Plans:** 2 plans
Plans:
- [ ] 51-01-PLAN.md — Watcher artifact fix for cases/ prefix + CLI cmdProgramRollup for STATE.md rollup
- [ ] 51-02-PLAN.md — VS Code program dashboard webview panel (shared types, panel provider, store method, Preact UI)

### Phase 56: Knowledge Graph
**Goal**: Hunt decisions, learnings, and threat relationships persist across sessions as a queryable knowledge graph that grows with every hunt
**Depends on**: Phase 50 (program.db path established), Phase 53 (ATT&CK STIX data available for auto-population)
**Requirements**: KNOW-01, KNOW-02, KNOW-03, KNOW-04
**Success Criteria** (what must be TRUE):
  1. The knowledge graph stores entities (threat_actor, technique, detection, campaign, tool, vulnerability, data_source) with typed relations in program.db — entities created during a hunt persist to the next session
  2. When a hunter makes a decision during a hunt (e.g., choosing a query approach, ruling out a hypothesis), that decision is logged with context and reasoning and is retrievable in future hunts on the same topic
  3. Learnings and tribal knowledge patterns written during a hunt are persisted and surfaced when a new hunt touches the same techniques or threat actors
  4. ATT&CK STIX relationships (group-to-technique, campaign-to-software, software-to-technique) are automatically imported into the knowledge graph from intel.db on program initialization
**Plans:** 2 plans
Plans:
- [ ] 51-01-PLAN.md — Watcher artifact fix for cases/ prefix + CLI cmdProgramRollup for STATE.md rollup
- [ ] 51-02-PLAN.md — VS Code program dashboard webview panel (shared types, panel provider, store method, Preact UI)

### Phase 57: Agent Wiring & Workflow Integration
**Goal**: Hunt agents invoke MCP tools natively, new-case initialization includes past-case and detection coverage lookups automatically, and pre-built prompts give hunters a running start for common scenarios
**Depends on**: Phase 52 (case search available), Phase 53 (MCP server running), Phase 54 (detections indexed), Phase 56 (knowledge graph populated)
**Requirements**: WIRE-01, WIRE-02, WIRE-03
**Success Criteria** (what must be TRUE):
  1. The query-writer, signal-triager, and hunt-planner agent frontmatter files list mcp__thrunt_hunt_intel__* tools so agents can call ATT&CK lookup, coverage analysis, and detection search without manual configuration
  2. Running `thrunt new-case` automatically queries past cases for similar signals and runs detection coverage for the case's stated technique focus — the hunter sees both results before writing their first hypothesis
  3. A hunter can select a pre-built MCP prompt (ransomware readiness, APT emulation, detection sprint, SOC investigation) and immediately get a structured starting context with relevant ATT&CK techniques, existing detection coverage, and past case references
**Plans:** 2 plans
Plans:
- [ ] 51-01-PLAN.md — Watcher artifact fix for cases/ prefix + CLI cmdProgramRollup for STATE.md rollup
- [ ] 51-02-PLAN.md — VS Code program dashboard webview panel (shared types, panel provider, store method, Preact UI)

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
| 43. Dispatch Coordinator | 2/2 | Complete | 2026-03-31 |
| 44. Cross-Tenant Aggregation & Heatmap | 2/2 | Complete | 2026-03-31 |
| 45. @thrunt/connector-sdk Package | 1/1 | Complete | 2026-03-31 |
| 46. Plugin Manifest & Discovery | 2/2 | Complete | 2026-03-31 |
| 47. Contract Test Suite & Plugin Lifecycle | 2/2 | Complete | 2026-03-31 |
| 48. Built-in Connector Migration | 2/2 | Complete | 2026-03-31 |
| 49. Reusable CI & Ecosystem Tooling | 2/2 | Complete | 2026-03-31 |
| 50. Program & Case Hierarchy | 3/3 | Complete    | 2026-04-08 |
| 51. Program Dashboard & Extension Wiring | 2/2 | Complete    | 2026-04-08 |
| 52. Cross-Case Intelligence | 1/2 | In Progress|  |
| 53. MCP Server & ATT&CK Tools | 0/TBD | Not started | - |
| 54. Detection Rule Ingestion | 0/TBD | Not started | - |
| 55. Detection Coverage & Gap Analysis | 0/TBD | Not started | - |
| 56. Knowledge Graph | 0/TBD | Not started | - |
| 57. Agent Wiring & Workflow Integration | 0/TBD | Not started | - |
