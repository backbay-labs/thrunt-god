---
phase: 79-service-decomposition-eventbus
plan: 01
subsystem: infra
tags: [eventbus, service-decomposition, entity-utils, typescript, vitest]

# Dependency graph
requires: []
provides:
  - Typed EventBus class for inter-service communication (5 event types)
  - Shared entity utility functions (parseEntityNote, scanEntityNotes, parseFrontmatterFields)
  - 5 domain service class shells (IntelligenceService, CanvasService, McpBridgeService, WatcherService, JournalService)
affects: [79-02-PLAN, 79-03-PLAN, phase-87, phase-89]

# Tech tracking
tech-stack:
  added: []
  patterns: [typed-eventbus, constructor-injection, pure-function-extraction, domain-service-shells]

key-files:
  created:
    - apps/obsidian/src/services/event-bus.ts
    - apps/obsidian/src/entity-utils.ts
    - apps/obsidian/src/services/intelligence-service.ts
    - apps/obsidian/src/services/canvas-service.ts
    - apps/obsidian/src/services/mcp-bridge-service.ts
    - apps/obsidian/src/services/watcher-service.ts
    - apps/obsidian/src/services/journal-service.ts
    - apps/obsidian/src/__tests__/event-bus.test.ts
    - apps/obsidian/src/__tests__/entity-utils.test.ts
  modified: []

key-decisions:
  - "EventBus uses Map<string, Set<Function>> for handler storage -- zero dependencies, fully typed"
  - "Entity-utils extracted as pure functions matching workspace.ts behavior verbatim (including sightings regex behavior)"
  - "Domain service shells use constructor injection pattern matching existing WorkspaceService pattern"

patterns-established:
  - "Typed EventBus: compile-time safe event emitter with EventMap type constraint"
  - "Constructor injection: domain services accept VaultAdapter, getPlanningDir getter, optional EventBus"
  - "Pure function extraction: shared utilities in standalone modules for cross-service use"

requirements-completed: [UX-06]

# Metrics
duration: 7min
completed: 2026-04-12
---

# Phase 79 Plan 01: Service Decomposition Foundation Summary

**Typed EventBus with 5 event types, 3 shared entity utility functions, and 5 domain service class shells with constructor injection**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-12T12:48:11Z
- **Completed:** 2026-04-12T12:55:16Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- EventBus class with typed EventMap supporting 5 inter-service event types (cache:invalidated, entity:created, entity:modified, ingestion:complete, canvas:generated)
- Extracted parseEntityNote, scanEntityNotes, parseFrontmatterFields from WorkspaceService as pure functions in entity-utils.ts
- Created 5 domain service class shells with correct constructor signatures and method stubs
- 13 new tests (6 EventBus + 7 entity-utils), 382 total passing (zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: EventBus class + entity-utils.ts extraction + tests** - `9fe40106` (feat)
2. **Task 2: Domain service class shells with constructor signatures** - `19710aed` (feat)

## Files Created/Modified
- `apps/obsidian/src/services/event-bus.ts` - Typed EventBus class with on/off/emit/removeAllListeners
- `apps/obsidian/src/entity-utils.ts` - Pure extraction of parseEntityNote, scanEntityNotes, parseFrontmatterFields
- `apps/obsidian/src/services/intelligence-service.ts` - Shell: ingestion, cross-hunt intel, dashboard (4 stubs)
- `apps/obsidian/src/services/canvas-service.ts` - Shell: hunt canvas generation (2 stubs)
- `apps/obsidian/src/services/mcp-bridge-service.ts` - Shell: MCP enrichment, coverage, logging (4 stubs)
- `apps/obsidian/src/services/watcher-service.ts` - Stub for Phase 87
- `apps/obsidian/src/services/journal-service.ts` - Stub for Phase 89
- `apps/obsidian/src/__tests__/event-bus.test.ts` - 6 tests for EventBus behavior
- `apps/obsidian/src/__tests__/entity-utils.test.ts` - 7 tests for entity utility functions

## Decisions Made
- Used Map<string, Set<Function>> for EventBus handler storage (zero dependencies, fully typed, ~55 LOC)
- Extracted entity-utils as exact copy of workspace.ts private methods (preserving existing behavior including sightings regex)
- Made EventBus optional parameter on all domain service constructors (backward compatibility)
- McpBridgeService constructor accepts optional McpClient (matching WorkspaceService pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Discovered pre-existing latent bug in sightings counting regex (`/^## Sightings\s*$([\s\S]*?)(?=^## |\n$|$)/m`): the lazy capture group combined with multiline `$` causes the capture to always be empty, resulting in sightingsCount always being 0. This is the exact same behavior as the original workspace.ts code. Tests adjusted to match actual behavior. Logged to deferred-items.md for future fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EventBus, entity-utils, and all 5 service shells are ready for Plan 02 (WorkspaceService decomposition)
- Plan 02 will move actual logic from WorkspaceService methods into the domain service shells
- No blockers

## Self-Check: PASSED

- All 9 created files verified present
- Both task commits (9fe40106, 19710aed) verified in git log
- 382 tests passing (20 test files, zero failures)

---
*Phase: 79-service-decomposition-eventbus*
*Completed: 2026-04-12*
