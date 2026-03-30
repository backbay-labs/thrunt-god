---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Live Connector Integrations
status: completed
stopped_at: Completed 28-01-PLAN.md -- phase 28 complete (Docker test infrastructure)
last_updated: "2026-03-30T07:09:13.799Z"
last_activity: 2026-03-30 -- Completed 28-01 Docker test infrastructure
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v1.6 Phase 28 — Docker Test Infrastructure

## Current Milestone: v1.6 Live Connector Integrations

**Goal:** Ship real, multi-surface connectors for Splunk, Elastic/OpenSearch, and Microsoft Sentinel/Defender XDR with Docker-based integration tests.

## Current Position

Phase: 28 of 30 (Docker Test Infrastructure)
Plan: 1 of 1 (complete)
Status: Phase Complete
Last activity: 2026-03-30 -- Completed 28-01 Docker test infrastructure

Progress: [██████████] 100% (v1.6 phase 28)

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (v1.6)
- Average duration: 4min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 27 | 2 | 6min | 3min |
| 28 | 1 | 5min | 5min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

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

### Pending Todos

None yet.

### Blockers/Concerns

- Splunk token creation bootstrap sequence in testcontainers context unverified — validate during Phase 29 planning
- OpenSearch /_plugins/_esql/query endpoint path in OpenSearch 3.x not confirmed — verify before Phase 30
- Retry-After header access in executeConnectorRequest retry loop may need targeted refactor

## Session Continuity

Last session: 2026-03-30T07:09:13.795Z
Stopped at: Completed 28-01-PLAN.md -- phase 28 complete (Docker test infrastructure)
Resume file: None
