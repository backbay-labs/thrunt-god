---
phase: 79-service-decomposition-eventbus
plan: 02
subsystem: architecture
tags: [decomposition, facade-pattern, domain-services, eventbus, obsidian]

# Dependency graph
requires:
  - phase: 79-01
    provides: EventBus, entity-utils, domain service shells
provides:
  - IntelligenceService with 4 real implementations (runIngestion, crossHuntIntel, compareHuntsReport, generateKnowledgeDashboard)
  - CanvasService with 2 real implementations (generateHuntCanvas, canvasFromCurrentHunt)
  - McpBridgeService with 4 real implementations (enrichFromMcp, analyzeCoverage, logDecision, logLearning)
  - WorkspaceService as thin facade delegating 10 methods to 3 domain services
  - WorkspaceService constructor accepts optional EventBus as 6th parameter
affects: [79-03, all-future-phases-using-workspace-service]

# Tech tracking
tech-stack:
  added: []
  patterns: [facade-delegation, constructor-injection, domain-service-decomposition]

key-files:
  created: []
  modified:
    - apps/obsidian/src/services/intelligence-service.ts
    - apps/obsidian/src/services/canvas-service.ts
    - apps/obsidian/src/services/mcp-bridge-service.ts
    - apps/obsidian/src/workspace.ts

key-decisions:
  - "Domain services receive planningDirGetter closure, not raw settings -- keeps services independent of settings shape"
  - "Facade methods call invalidate() after delegation for methods that mutate vault state"
  - "enrichFromMcp and logDecision/logLearning do NOT call invalidate() in facade since they did not in original"

patterns-established:
  - "Facade delegation: WorkspaceService.method() -> this.domainService.method() with optional invalidate()"
  - "Constructor injection: domain services receive vaultAdapter, planningDirGetter, and optional EventBus"

requirements-completed: [UX-06]

# Metrics
duration: 10min
completed: 2026-04-12
---

# Phase 79 Plan 02: Service Decomposition Summary

**WorkspaceService decomposed from 1,545 LOC to 493 LOC via facade delegation to IntelligenceService, CanvasService, and McpBridgeService -- all 382 tests pass unchanged**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-12T12:58:50Z
- **Completed:** 2026-04-12T13:09:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Moved 10 method implementations from WorkspaceService into 3 domain services (character-for-character copies)
- Converted WorkspaceService to thin facade with 1-3 line delegation methods
- Removed 3 private utility methods from workspace.ts (already extracted to entity-utils in Plan 01)
- All 382 existing tests pass with zero test file modifications

## Task Commits

Each task was committed atomically:

1. **Task 1: Move business logic into domain services** - `28a131af` (feat)
2. **Task 2: Convert WorkspaceService to facade** - `5b53b0b2` (feat)

## Files Created/Modified
- `apps/obsidian/src/services/intelligence-service.ts` - Real implementations: runIngestion, crossHuntIntel, compareHuntsReport, generateKnowledgeDashboard
- `apps/obsidian/src/services/canvas-service.ts` - Real implementations: generateHuntCanvas, canvasFromCurrentHunt
- `apps/obsidian/src/services/mcp-bridge-service.ts` - Real implementations: enrichFromMcp, analyzeCoverage, logDecision, logLearning
- `apps/obsidian/src/workspace.ts` - Thin facade (493 LOC, down from 1,545)

## Decisions Made
- Domain services receive a `planningDirGetter` closure `() => string` that evaluates `getPlanningDir(settings, default)` on each call, keeping services decoupled from settings shape
- Facade methods that mutate vault state (runIngestion, analyzeCoverage, generateHuntCanvas, etc.) call `this.invalidate()` after delegation to maintain cache-busting behavior
- enrichFromMcp, logDecision, and logLearning do NOT call invalidate() in the facade layer because the original WorkspaceService methods only called invalidate() conditionally or the domain service handles it internally
- Unused imports cleaned up from workspace.ts after extraction (canvas-generator, cross-hunt, ingestion, mcp-enrichment)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WorkspaceService facade is complete, ready for Plan 79-03 (wiring EventBus emissions in domain services)
- Domain services already accept optional EventBus in constructor but do not emit events yet
- All 382 tests pass, providing solid regression baseline for Plan 03

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 79-service-decomposition-eventbus*
*Completed: 2026-04-12*
