---
phase: 21-bridge-hardening
plan: 01
subsystem: api
tags: [logging, error-handling, subprocess, timeout, json, bun]

# Dependency graph
requires: []
provides:
  - Structured JSON logger module for bridge observability
  - Error classification with machine-readable {error, code, class} responses
  - Subprocess timeout with SIGTERM/SIGKILL escalation
  - Extended BridgeHealthResponse with wsClients, activeCaseId, lastFileWatcherEvent, subprocessAvailable
affects: [22-siem-adapters, 23-evidence-pipeline, 24-detection-promotion]

# Tech tracking
tech-stack:
  added: []
  patterns: [structured-json-logging, error-classification, subprocess-timeout-escalation, promise-race-pattern]

key-files:
  created:
    - surfaces/apps/surface-bridge/src/logger.ts
    - surfaces/apps/surface-bridge/src/errors.ts
    - surfaces/apps/surface-bridge/test/hardening.test.ts
  modified:
    - surfaces/apps/surface-bridge/src/thrunt-tools.ts
    - surfaces/apps/surface-bridge/src/server.ts
    - surfaces/apps/surface-bridge/src/providers.ts
    - surfaces/apps/surface-bridge/src/certification-ops.ts
    - surfaces/packages/surfaces-contracts/src/bridge.ts
    - surfaces/packages/surfaces-mocks/src/bridge.ts

key-decisions:
  - "Promise.race pattern for subprocess timeout instead of sequential pipe reads -- prevents Bun pipe hang on killed processes"
  - "Split handleRequest into outer (logging/error-catch) and inner (routing) for clean separation of concerns"
  - "Logger passed through provider options to subprocess calls rather than global singleton"

patterns-established:
  - "Structured logging: every subsystem event produces JSON with {ts, level, category, msg, ...meta}"
  - "Error classification: all API errors include {error, code, class} for machine consumption"
  - "Subprocess timeout: 30s SIGTERM with 5s grace to SIGKILL using Promise.race"

requirements-completed: [HARD-01, HARD-02, HARD-04]

# Metrics
duration: 11min
completed: 2026-04-12
---

# Phase 21 Plan 01: Bridge Hardening Summary

**Structured JSON logging, subprocess kill-escalation timeouts, and classified error responses for surface-bridge observability**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-12T12:55:58Z
- **Completed:** 2026-04-12T13:07:14Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Logger module emits structured JSON lines covering HTTP, WS, subprocess, file-watcher, lifecycle, and auth categories with level filtering
- Subprocess timeout kills hanging processes with SIGTERM at 30s and SIGKILL escalation after 5s grace period
- Error responses are machine-readable with {error, code, class} where class is one of auth|timeout|subprocess|file-system|validation
- All request handling wrapped in try/catch with automatic error classification
- 17 unit tests covering logger, error classification, error response, and subprocess timeout behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Create logger module, error classification module, and extend contracts** - `9754f9aa` (feat)
2. **Task 2: Add subprocess timeout to runThruntCommand and wire logger + errors into server.ts** - `867ef53b` (feat)
3. **Task 3: Add unit tests for timeout, logger, and error classification** - `ba8dad15` (test)

## Files Created/Modified
- `surfaces/apps/surface-bridge/src/logger.ts` - Structured JSON logger with LogLevel, LogCategory, createLogger
- `surfaces/apps/surface-bridge/src/errors.ts` - Error classification (classifyError) and response builder (errorResponse)
- `surfaces/apps/surface-bridge/src/thrunt-tools.ts` - Subprocess timeout with SIGTERM/SIGKILL escalation via Promise.race
- `surfaces/apps/surface-bridge/src/server.ts` - Wired logger for all events, classified error responses, try/catch wrapper
- `surfaces/apps/surface-bridge/src/providers.ts` - Pass logger and timeout to all runThruntCommand calls
- `surfaces/apps/surface-bridge/src/certification-ops.ts` - Added timeout option to runThruntCommand call
- `surfaces/packages/surfaces-contracts/src/bridge.ts` - Extended BridgeHealthResponse, added BridgeErrorResponse
- `surfaces/packages/surfaces-mocks/src/bridge.ts` - Updated mock to match new interface
- `surfaces/apps/surface-bridge/test/hardening.test.ts` - 17 unit tests for logger, errors, and timeout

## Decisions Made
- Used Promise.race pattern for subprocess timeout instead of sequential pipe reads, because Bun's ReadableStream from proc.stdout hangs indefinitely when a process is killed mid-read
- Split handleRequest into outer (logging, try/catch with classifyError) and inner (routing) functions for clean separation
- Logger is dependency-injected through provider options rather than being a global singleton, supporting testability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed subprocess pipe hang on killed processes**
- **Found during:** Task 3 (timeout test)
- **Issue:** `await new Response(proc.stdout).text()` blocks indefinitely in Bun when process is killed via SIGTERM/SIGKILL
- **Fix:** Restructured to use Promise.race between proc.exited and timeout, only reading streams after confirmed normal exit
- **Files modified:** surfaces/apps/surface-bridge/src/thrunt-tools.ts
- **Verification:** Timeout test completes in ~1.2s (1s timeout + grace handling)
- **Committed in:** ba8dad15 (Task 3 commit)

**2. [Rule 3 - Blocking] Updated surfaces-mocks to match extended BridgeHealthResponse**
- **Found during:** Task 1 (contract extension)
- **Issue:** surfaces-mocks/src/bridge.ts had a BridgeHealthResponse literal missing the new required fields
- **Fix:** Added wsClients, activeCaseId, lastFileWatcherEvent, subprocessAvailable to mock
- **Files modified:** surfaces/packages/surfaces-mocks/src/bridge.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 9754f9aa (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both essential for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bridge is now observable with structured logging across all categories
- Subprocess layer is safe from hangs (30s timeout with kill escalation)
- Error responses are machine-parseable for downstream SIEM adapter consumption
- Ready for Phase 21 Plan 02 and Phase 22 (SIEM adapters)

---
*Phase: 21-bridge-hardening*
*Completed: 2026-04-12*
