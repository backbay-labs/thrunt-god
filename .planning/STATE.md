---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Live Connector Integrations
status: completed
stopped_at: Completed 29-01-PLAN.md
last_updated: "2026-03-30T07:30:28.013Z"
last_activity: 2026-03-30 -- Completed 29-01 Splunk integration
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v1.6 Phase 29 — Splunk Integration

## Current Milestone: v1.6 Live Connector Integrations

**Goal:** Ship real, multi-surface connectors for Splunk, Elastic/OpenSearch, and Microsoft Sentinel/Defender XDR with Docker-based integration tests.

## Current Position

Phase: 29 of 30 (Splunk Integration)
Plan: 1 of 1 (complete)
Status: Phase Complete
Last activity: 2026-03-30 -- Completed 29-01 Splunk integration

Progress: [██████████] 100% (v1.6 phase 29)

## Performance Metrics

**Velocity:**
- Total plans completed: 4 (v1.6)
- Average duration: 4min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 27 | 2 | 6min | 3min |
| 28 | 1 | 5min | 5min |
| 29 | 1 | 5min | 5min |

*Updated after each plan completion*
| Phase 29 P01 | 5min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [29-01]: executeSplunkAsyncJob catches 504 inside adapter executeRequest rather than relying on outer retry loop
- [29-01]: Async job poll uses options.sleep injection for zero-delay unit tests
- [29-01]: Bearer token bootstrapped via /services/authorization/tokens with type=static
- [29-01]: Integration test folds metadata assertions into adapter round-trip test to avoid test coupling
- [28-01]: Non-standard host ports (18089, 18088, 19200, 19201) to avoid collisions with local services
- [28-01]: Seed events use ECS-compatible fields for Elastic/OpenSearch and Splunk-native fields for Splunk
- [28-01]: Splunk healthcheck polls /services/server/info with basic auth for reliable readiness detection
- [27-02]: OpenSearch reuses normalizeElasticRows via adapter shim that maps {schema, datarows} to {columns, values}
- [27-02]: Defender XDR uses dedicated normalizeDefenderResults since Results are pre-formed objects (no column mapping needed)
- [27-02]: Defender XDR defaults to api.security.microsoft.com for both base URL and OAuth scope
- [27-01]: status_override uses first-non-null-wins semantics in accumulator for multi-page queries
- [27-01]: Sentinel PartialError warning includes error.message and error.details for downstream analysis
- [v1.0-v1.4]: Connector SDK exists with typed interfaces; connectors are stubs — v1.6 upgrades to real network-calling implementations
- [v1.5]: Shipped TUI Operator Console (phases 23-26) in main thrunt-god repo
- [v1.6 roadmap]: OpenSearch and Defender XDR built as separate adapters (not subclasses); OpenSearch reuses normalizeElasticRows(); Defender XDR has its own {Schema,Results} normalizer
- [v1.6 roadmap]: Sentinel/Defender XDR tested via startJsonServer() fixture only — no Docker image exists for SaaS services
- [v1.6 roadmap]: EQL surface (CONN-05) and SigV4 (CONN-07) grouped with Elastic/OpenSearch integration (Phase 30)
- [v1.6 roadmap]: Splunk async job fallback (CONN-06) grouped with Splunk integration (Phase 29)
- [Phase 29]: executeSplunkAsyncJob catches 504 inside adapter executeRequest rather than outer retry loop
- [Phase 29]: Bearer token bootstrapped via /services/authorization/tokens with type=static for integration tests

### Pending Todos

None yet.

### Blockers/Concerns

- ~Splunk token creation bootstrap sequence in testcontainers context unverified~ — RESOLVED in 29-01: createSplunkBearerToken validated
- OpenSearch /_plugins/_esql/query endpoint path in OpenSearch 3.x not confirmed — verify before Phase 30
- Retry-After header access in executeConnectorRequest retry loop may need targeted refactor

## Session Continuity

Last session: 2026-03-30T07:30:22.072Z
Stopped at: Completed 29-01-PLAN.md
Resume file: None
