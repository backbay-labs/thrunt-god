---
phase: 21-bridge-hardening
plan: 02
subsystem: api
tags: [health-check, graceful-degradation, subprocess-monitoring, bun-server]

# Dependency graph
requires:
  - phase: 21-bridge-hardening/01
    provides: "Logger, error classification, timeout handling, BridgeHealthResponse contract"
provides:
  - "Subprocess health monitor with periodic probing"
  - "Extended /api/health returning full operational state"
  - "Write-route gating with 503 BRIDGE_DEGRADED response"
  - "Graceful degradation allowing reads when subprocess is down"
affects: [22-siem-adapters, 23-evidence-pipeline, 25-obsidian-surface]

# Tech tracking
tech-stack:
  added: []
  patterns: [periodic-health-probe, degradation-gate, state-change-callback]

key-files:
  created:
    - surfaces/apps/surface-bridge/src/subprocess-health.ts
    - surfaces/apps/surface-bridge/test/degradation.test.ts
  modified:
    - surfaces/apps/surface-bridge/src/server.ts

key-decisions:
  - "Consecutive failure threshold of 2 before marking unavailable (allows one transient failure)"
  - "caseRoot used as activeCaseId since CaseSummary has no dedicated ID field"
  - "Certification routes excluded from subprocess gate (filesystem-only operations)"
  - "onStateChange callback broadcasts BRIDGE_DEGRADED event to WebSocket clients"

patterns-established:
  - "Health monitor pattern: factory function returning interface with isAvailable/getState/probe/start/stop"
  - "Route gating pattern: Set-based route list checked before dispatch"

requirements-completed: [HARD-03, HARD-05]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 21 Plan 02: Health Endpoint & Graceful Degradation Summary

**Subprocess health monitor with periodic probing, extended /api/health returning full operational state, and write-route gating that returns 503 BRIDGE_DEGRADED when subprocess is unavailable**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T13:10:16Z
- **Completed:** 2026-04-12T13:13:29Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created subprocess health monitor that probes thrunt-tools at startup and every 60s
- Extended /api/health to return full BridgeHealthResponse with wsClients, activeCaseId, lastFileWatcherEvent, subprocessAvailable, and dynamic status field
- Gated write operations (case/open, evidence/attach, execute/*) with 503 when subprocess unavailable while keeping all read routes functional
- Added 10 integration tests covering health response fields and degradation behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Create subprocess health monitor and extend /api/health endpoint** - `4afc93f6` (feat)
2. **Task 2: Gate write operations on subprocess availability** - `02abb739` (feat)
3. **Task 3: Integration tests for health endpoint and graceful degradation** - `41977a86` (test)

## Files Created/Modified
- `surfaces/apps/surface-bridge/src/subprocess-health.ts` - Health monitor with probe(), startPeriodicProbe(), isAvailable(), getState(), stop()
- `surfaces/apps/surface-bridge/src/server.ts` - Extended health endpoint, subprocess gate, health monitor lifecycle
- `surfaces/apps/surface-bridge/test/degradation.test.ts` - 10 integration tests for health and degradation

## Decisions Made
- Used `caseRoot` as activeCaseId since CaseSummary type has no caseId field (closest semantic match)
- Set consecutiveFailures threshold at 2 to avoid flapping on transient failures
- Certification routes intentionally excluded from subprocess gate (they operate on filesystem only)
- State change callback fires WebSocket broadcast so connected clients are notified of degradation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed activeCaseId field reference**
- **Found during:** Task 1 (Health endpoint extension)
- **Issue:** Plan specified `caseId` property on CaseSummary but the type only has `caseRoot`
- **Fix:** Used `caseRoot` as the active case identifier
- **Files modified:** surfaces/apps/surface-bridge/src/server.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 4afc93f6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial property name correction. No scope change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bridge now supports monitoring and graceful degradation
- Ready for Phase 22 (SIEM Adapters) which depends on stable bridge subprocess layer
- All downstream phases can rely on health endpoint for availability checks

---
*Phase: 21-bridge-hardening*
*Completed: 2026-04-12*
