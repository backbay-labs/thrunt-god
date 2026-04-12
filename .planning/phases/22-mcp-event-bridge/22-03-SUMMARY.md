---
phase: 22-mcp-event-bridge
plan: 03
subsystem: api
tags: [json-rpc, websocket, mutations, thrunt-tools, validation]

# Dependency graph
requires:
  - phase: 22-mcp-event-bridge-01
    provides: EventBridge types, event journal, file watcher
  - phase: 22-mcp-event-bridge-02
    provides: WebSocket envelope broadcasting, journal replay, server lifecycle
provides:
  - MutationRequest/MutationResponse JSON-RPC 2.0 protocol types
  - Mutation handler with validation, dispatch, and error classification
  - WebSocket inbound message handling for bidirectional mutations
  - 4 mutation methods: evidence.attach, verdict.update, ioc.add, case.open
affects: [surface-extension, surface-obsidian, detection-promotion]

# Tech tracking
tech-stack:
  added: []
  patterns: [json-rpc-2.0-over-websocket, param-validation-with-custom-error-classes, hypothesis-existence-check]

key-files:
  created:
    - surfaces/apps/surface-bridge/src/mutation-handler.ts
    - surfaces/apps/surface-bridge/test/mutations.test.ts
  modified:
    - surfaces/packages/surfaces-contracts/src/bridge.ts
    - surfaces/apps/surface-bridge/src/server.ts

key-decisions:
  - "ErrorClass literal union duplicated in contracts (not imported from errors.ts) to avoid cross-package import for type-only concern"
  - "evidence.attach maps to manual_note EvidenceAttachment type for content-based attach via mutation protocol"
  - "ParamValidationError and HypothesisNotFoundError custom error classes for distinct JSON-RPC error codes vs generic INTERNAL_ERROR"
  - "HypothesisSummary.id used (not hypothesisId) matching actual contract type definition"

patterns-established:
  - "JSON-RPC 2.0 mutation protocol: requests carry method/params/id, responses correlate via id"
  - "Layered validation: structural (parse/jsonrpc/method/id) -> precondition (subprocess/case) -> param-specific"
  - "Custom error classes thrown from method handlers, caught and mapped to JSON-RPC error codes in handle()"

requirements-completed: [MCPB-04, MCPB-05]

# Metrics
duration: 6min
completed: 2026-04-12
---

# Phase 22 Plan 03: Mutation Protocol Summary

**JSON-RPC 2.0 bidirectional mutation protocol over WebSocket with 4 validated methods and 14 unit tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-12T14:02:23Z
- **Completed:** 2026-04-12T14:08:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Mutation protocol types: MutationRequest, MutationResponse, MutationMethod, typed params for each method, MutationError with JSON-RPC error codes
- Mutation handler with layered validation (structural, precondition, param-specific), hypothesis existence check, and thrunt-tools/provider delegation
- WebSocket inbound message dispatch wired into server.ts
- 14 unit tests passing: malformed JSON, invalid requests, unknown methods, subprocess unavailable, case not open, param validation, hypothesis not found, successful mutations, response correlation

## Task Commits

Each task was committed atomically:

1. **Task 1: Define mutation protocol types in contracts** - `4823bae8` (feat)
2. **Task 2: Create mutation handler with validation and thrunt-tools delegation** - `ae9ed993` (feat)
3. **Task 3: Wire mutation handler into server.ts WebSocket message handler and add tests** - `a886aa81` (feat)

## Files Created/Modified
- `surfaces/packages/surfaces-contracts/src/bridge.ts` - Added MutationRequest, MutationResponse, MutationMethod, param types, error codes
- `surfaces/apps/surface-bridge/src/mutation-handler.ts` - Mutation handler: parse, validate, dispatch, error classify
- `surfaces/apps/surface-bridge/src/server.ts` - WebSocket message handler wired to mutation handler
- `surfaces/apps/surface-bridge/test/mutations.test.ts` - 14 unit tests for mutation handler

## Decisions Made
- ErrorClass literal union duplicated in contracts rather than cross-package import -- avoids runtime dependency for type-only concern
- evidence.attach creates manual_note EvidenceAttachment from content/surfaceId -- simplest mapping for mutation protocol content attach
- Custom ParamValidationError and HypothesisNotFoundError classes thrown from handlers, caught in handle() for distinct JSON-RPC error codes
- Used HypothesisSummary.id (not hypothesisId) matching the actual contract type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript ArrayBuffer cast in WebSocket message handler**
- **Found during:** Task 3 (server.ts wiring)
- **Issue:** `message as ArrayBuffer` failed TS strict check since Bun's Buffer type doesn't overlap with ArrayBuffer
- **Fix:** Changed to `message as unknown as ArrayBuffer` for safe cast
- **Files modified:** surfaces/apps/surface-bridge/src/server.ts
- **Committed in:** a886aa81

**2. [Rule 1 - Bug] Fixed HypothesisSummary field name mismatch**
- **Found during:** Task 2 (mutation handler)
- **Issue:** Plan used `hypothesisId` but HypothesisSummary contract defines `id` as the identifier field
- **Fix:** Used `h.id` instead of `h.hypothesisId` for hypothesis existence check
- **Files modified:** surfaces/apps/surface-bridge/src/mutation-handler.ts
- **Committed in:** ae9ed993

**3. [Rule 1 - Bug] Fixed LogCategory usage for mutation logging**
- **Found during:** Task 2 (mutation handler)
- **Issue:** Used 'mutation' as LogCategory but valid categories are 'http', 'ws', 'subprocess', 'file-watcher', 'lifecycle', 'auth'
- **Fix:** Changed to 'lifecycle' category for mutation error logging
- **Files modified:** surfaces/apps/surface-bridge/src/mutation-handler.ts
- **Committed in:** ae9ed993

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs)
**Impact on plan:** All auto-fixes necessary for TypeScript compilation and runtime correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bridge is now a full bidirectional synchronization point -- surfaces can observe changes (Plan 02 events) and write back (Plan 03 mutations)
- All 3 plans of Phase 22 complete
- Ready for downstream phases that depend on the bridge mutation protocol (surface extension, obsidian plugin, detection promotion)

## Self-Check: PASSED

All 4 files verified on disk. All 3 task commits verified in git log.

---
*Phase: 22-mcp-event-bridge*
*Completed: 2026-04-12*
