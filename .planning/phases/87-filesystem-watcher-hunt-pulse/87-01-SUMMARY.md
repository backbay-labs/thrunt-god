---
phase: 87-filesystem-watcher-hunt-pulse
plan: 01
subsystem: services
tags: [watcher, ingestion, pulse, event-bus, obsidian]

# Dependency graph
requires:
  - phase: 79-service-decomposition
    provides: WatcherService stub, EventBus, IntelligenceService with runIngestion
provides:
  - WatcherService with isAutoIngestTarget, handleAutoIngest, recordActivity, resetActivity
  - formatHuntPulse pure function for status bar text formatting
  - EventMap watcher:activity event type for inter-service pulse communication
affects: [87-02-PLAN, hunt-pulse-ui, live-companion]

# Tech tracking
tech-stack:
  added: []
  patterns: [constructor injection with IntelligenceService, pure function formatting with injected time]

key-files:
  created:
    - apps/obsidian/src/hunt-pulse.ts
    - apps/obsidian/src/__tests__/watcher-service.test.ts
    - apps/obsidian/src/__tests__/hunt-pulse.test.ts
  modified:
    - apps/obsidian/src/services/watcher-service.ts
    - apps/obsidian/src/services/event-bus.ts

key-decisions:
  - "WatcherService constructor changes from stub (adds getPlanningDir and intelligenceService params); Plan 87-02 updates main.ts"
  - "formatHuntPulse is a pure function with injected now/count for full testability"
  - "handleAutoIngest increments recentArtifactCount by created+updated (not raw entity count)"

patterns-established:
  - "Pure function formatting: inject time and counts, return string, no side effects"
  - "WatcherService path scoping: planning dir prefix + subfolder + filename prefix guard"

requirements-completed: [LIVE-01, LIVE-02]

# Metrics
duration: 2min
completed: 2026-04-12
---

# Phase 87 Plan 01: WatcherService + Hunt Pulse Summary

**WatcherService with auto-ingestion path scoping (RECEIPTS/RCT-*, QUERIES/QRY-*), hunt pulse pure function for status bar idle/active display, and EventBus watcher:activity extension**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-12T21:15:45Z
- **Completed:** 2026-04-12T21:18:04Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments
- WatcherService replaces stub with real auto-ingestion path scoping and IntelligenceService delegation
- formatHuntPulse pure function handles idle/active states with singular/plural formatting and 5-minute threshold
- EventBus extended with watcher:activity event type for inter-service pulse communication
- 22 new tests pass (7 hunt-pulse + 15 watcher-service), 766 total tests green

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for WatcherService and formatHuntPulse** - `2e4f257` (test)
2. **Task 1 GREEN: Implement WatcherService, formatHuntPulse, EventBus extension** - `a3a4ebf` (feat)

**Plan metadata:** pending (docs: complete plan)

_Note: TDD task with RED/GREEN commits_

## Files Created/Modified
- `apps/obsidian/src/hunt-pulse.ts` - Pure function for status bar pulse text formatting
- `apps/obsidian/src/services/watcher-service.ts` - WatcherService with auto-ingestion path scoping, activity tracking
- `apps/obsidian/src/services/event-bus.ts` - Extended EventMap with watcher:activity event type
- `apps/obsidian/src/__tests__/watcher-service.test.ts` - 15 tests: isAutoIngestTarget scoping, handleAutoIngest delegation, recordActivity tracking
- `apps/obsidian/src/__tests__/hunt-pulse.test.ts` - 7 tests: idle/active states, boundary conditions, singular/plural

## Decisions Made
- WatcherService constructor signature changes from stub (adds getPlanningDir and intelligenceService params) -- Plan 87-02 will update main.ts
- formatHuntPulse is a pure function with injected `now` and `recentArtifactCount` for deterministic testing
- handleAutoIngest increments recentArtifactCount by `created + updated` from IngestionResult (not raw entity count)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WatcherService ready for Plan 87-02 to wire into plugin lifecycle with Obsidian vault events
- formatHuntPulse ready for status bar integration
- Constructor signature change requires main.ts update in Plan 87-02

---
*Phase: 87-filesystem-watcher-hunt-pulse*
*Completed: 2026-04-12*
