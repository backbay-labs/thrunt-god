---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Advanced Hunt Features
status: in_progress
stopped_at: Completed 46-01-PLAN.md
last_updated: "2026-03-31T01:49:22.000Z"
last_activity: 2026-03-31 -- Completed Phase 46 Plan 01 (Plugin Manifest Validation & Loading)
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 7
  completed_plans: 6
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v2.2 Phase 46 — Plugin Manifest & Discovery (Plan 01 complete)

## Current Milestone: v2.2 Connector Ecosystem

**Goal:** Extract SDK into standalone package, implement plugin manifest/discovery, contract testing, built-in connector migration, and ecosystem tooling.

## Current Position

Phase: 46 (Plugin Manifest & Discovery) -- In Progress (1 of 2 plans done)
Status: Plan 01 complete -- plugin-registry.cjs with validatePluginManifest, loadPluginManifest, loadPlugin
Last activity: 2026-03-31 -- Completed Phase 46 Plan 01 (Plugin Manifest Validation & Loading)

Progress: [████------] 40% (2 of 5 phases started)

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

Last session: 2026-03-31T01:49:22Z
Stopped at: Completed 46-01-PLAN.md
Resume: Phase 46 Plan 01 complete. plugin-registry.cjs with manifest validation and loading. Ready for Plan 02 (Plugin Discovery).
