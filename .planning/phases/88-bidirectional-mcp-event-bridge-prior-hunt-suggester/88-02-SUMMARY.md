---
phase: 88-bidirectional-mcp-event-bridge-prior-hunt-suggester
plan: 02
subsystem: intelligence
tags: [prior-hunt, entity-matching, sidebar, eventbus, suggestions]

requires:
  - phase: 88-bidirectional-mcp-event-bridge-prior-hunt-suggester
    provides: MCP event polling lifecycle, settings toggles for priorHuntSuggestionsEnabled and suggestionMinHunts
  - phase: 87-auto-ingestion-hunt-pulse-feature-toggles
    provides: enable/disable lifecycle pattern, EventBus wiring pattern, hunt pulse
  - phase: 79-eventbus-service-decomposition
    provides: EventBus, entity-utils, cross-hunt EntityNote type, WorkspaceService facade
provides:
  - findPriorHuntMatches pure function for entity-to-historical-hunt matching
  - PriorHuntSuggestion type for cross-hunt intelligence display
  - Prior Hunt Suggestions sidebar section with dismiss capability
  - Entity note cache for performance during rapid ingestion
  - Session-only suggestion dismissal via in-memory Set
affects: [intelligence-service, entity-utils, sidebar-rendering]

tech-stack:
  added: []
  patterns: [entity-note-cache-on-first-use, session-only-dismiss-set, eventbus-suggestion-wiring]

key-files:
  created:
    - apps/obsidian/src/prior-hunt-suggester.ts
    - apps/obsidian/src/__tests__/prior-hunt-suggester.test.ts
  modified:
    - apps/obsidian/src/main.ts
    - apps/obsidian/src/view.ts
    - apps/obsidian/src/sidebar-state.ts
    - apps/obsidian/src/__tests__/sidebar-state.test.ts

key-decisions:
  - "Entity note cache populated on first entity:created (lazy init), invalidated on cache:invalidated event"
  - "Suggestion dismiss is session-only via in-memory Set, never persisted to disk"
  - "Suggestions deduped by entityName to avoid duplicates from rapid entity:created events"
  - "detectHuntId reused from verdict.ts for MISSION.md hunt_id detection"

patterns-established:
  - "Entity note cache: lazy-load on first entity:created, invalidate on cache:invalidated"
  - "Session-only state: use in-memory Set for non-persisted dismiss tracking"
  - "Suggestion handler: stored as named function reference for clean EventBus off() in disable"

requirements-completed: [LIVE-05]

duration: 4min
completed: 2026-04-12
---

# Phase 88 Plan 02: Prior Hunt Suggester Summary

**Prior-hunt entity matching with sidebar suggestions, session-only dismiss, and entity note cache for performance**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T22:30:12Z
- **Completed:** 2026-04-12T22:34:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Pure `findPriorHuntMatches` function with 8 test cases covering exact match, threshold, current-hunt exclusion, and multi-note scenarios
- Dedicated "Prior Hunt Suggestions" collapsible sidebar section rendering entity matches with dismiss buttons
- EventBus-driven suggestion pipeline: entity:created triggers scan, dedup, and sidebar refresh
- Entity note cache avoids repeated disk scans during rapid ingestion bursts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prior-hunt-suggester.ts pure module with findPriorHuntMatches function and tests** - `3f4419dc` (feat, TDD)
2. **Task 2: Wire prior-hunt suggestions into sidebar, EventBus, main.ts lifecycle, and settings** - `ada3d57f` (feat)

## Files Created/Modified
- `apps/obsidian/src/prior-hunt-suggester.ts` - Pure function module: PriorHuntSuggestion type, findPriorHuntMatches
- `apps/obsidian/src/__tests__/prior-hunt-suggester.test.ts` - 8 test cases for entity matching
- `apps/obsidian/src/main.ts` - Suggestion state, lifecycle methods, EventBus wiring, entity note cache
- `apps/obsidian/src/view.ts` - renderPriorHuntSuggestions section with dismiss buttons
- `apps/obsidian/src/sidebar-state.ts` - Added prior-hunt-suggestions default state
- `apps/obsidian/src/__tests__/sidebar-state.test.ts` - Updated section count test (5 to 6)

## Decisions Made
- Reused detectHuntId from verdict.ts for consistent hunt ID detection (MISSION.md > dir name > "manual")
- Entity note cache uses lazy initialization on first entity:created, not eager load at enable time
- Suggestions deduped by entityName in the priorHuntSuggestions array to prevent duplicates
- Named function references stored for EventBus handlers to enable clean off() in disable lifecycle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated sidebar-state test for 6 section keys**
- **Found during:** Task 2 (sidebar-state.ts modification)
- **Issue:** Existing test asserted exactly 5 section keys; adding prior-hunt-suggestions made it 6
- **Fix:** Updated test to expect 6 keys and added assertion for prior-hunt-suggestions default value
- **Files modified:** apps/obsidian/src/__tests__/sidebar-state.test.ts
- **Verification:** All 804 tests pass
- **Committed in:** ada3d57f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test update was necessary consequence of adding new sidebar section. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 88 complete: MCP event bridge (Plan 01) + prior-hunt suggester (Plan 02) both shipped
- 804 tests passing (8 new for prior-hunt-suggester, 2 updated for sidebar-state)
- Ready for Phase 89

---
*Phase: 88-bidirectional-mcp-event-bridge-prior-hunt-suggester*
*Completed: 2026-04-12*
