---
phase: 87-filesystem-watcher-hunt-pulse
plan: 02
subsystem: ui
tags: [obsidian, vault-events, status-bar, settings, auto-ingestion, hunt-pulse, feature-toggles]

# Dependency graph
requires:
  - phase: 87-filesystem-watcher-hunt-pulse (plan 01)
    provides: WatcherService with handleAutoIngest/isAutoIngestTarget/recordActivity/getLastActivityTimestamp/getRecentArtifactCount, formatHuntPulse pure function
provides:
  - Settings-gated auto-ingestion on vault create events with 2000ms debounce
  - Hunt pulse status bar element with 30s refresh and click-to-sidebar
  - 5 new feature toggle settings with runtime enable/disable
  - WatcherService fully wired into WorkspaceService and plugin lifecycle
affects: [phase-88-mcp-event-polling, phase-88-prior-hunt-suggestions]

# Tech tracking
tech-stack:
  added: []
  patterns: [settings-gated lifecycle features with enable/disable methods, vault EventRef offref cleanup, once-created debouncer pattern]

key-files:
  created:
    - apps/obsidian/src/__tests__/feature-toggles.test.ts
  modified:
    - apps/obsidian/src/settings.ts
    - apps/obsidian/src/workspace.ts
    - apps/obsidian/src/main.ts

key-decisions:
  - "Debouncer created ONCE in onload, not per-enable cycle, to avoid stale references per pitfall #5"
  - "enableAutoIngestion/disableAutoIngestion are idempotent with guard checks"
  - "huntPulseEl is separate from existing statusBarItemEl (workspace status)"
  - "MCP event polling and prior-hunt suggestions are disabled placeholder toggles for Phase 88"

patterns-established:
  - "Settings-gated lifecycle: enable/disable methods called from both onload (initial) and settings onChange (runtime)"
  - "Vault EventRef stored for offref cleanup in disable path"
  - "setInterval ID stored for clearInterval cleanup in both disable and onunload"

requirements-completed: [LIVE-01, LIVE-02, LIVE-06]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 87 Plan 02: Filesystem Watcher + Hunt Pulse Lifecycle Wiring Summary

**Auto-ingestion on vault create events with 2000ms debounce, hunt pulse status bar with 30s refresh, and 5 runtime feature toggles with enable/disable lifecycle methods**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T21:20:44Z
- **Completed:** 2026-04-12T21:24:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended ThruntGodPluginSettings with 5 new toggle fields (autoIngestion, debounce, huntPulse, mcpEventPolling, priorHuntSuggestions) with correct defaults
- Wired auto-ingestion: vault create events in RECEIPTS/ and QUERIES/ trigger debounced handleAutoIngest with Notice showing ingested artifact count
- Wired hunt pulse: separate status bar element updated every 30s via formatHuntPulse, clickable to open sidebar view
- Added "Live Hunt" settings section with 5 toggle controls including runtime enable/disable without reload
- WatcherService properly instantiated in WorkspaceService with planningDirGetter and IntelligenceService, exposed via public getter

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend settings with live feature toggles and update WorkspaceService WatcherService wiring** - `fbad1e54` (feat)
2. **Task 2: Wire auto-ingestion vault events, hunt pulse status bar, and dynamic enable/disable in main.ts** - `f8af14d0` (feat)

## Files Created/Modified
- `apps/obsidian/src/settings.ts` - Extended interface with 5 new fields, added Live Hunt settings section with toggle controls
- `apps/obsidian/src/workspace.ts` - WatcherService import, instantiation with correct params, public watcher getter
- `apps/obsidian/src/main.ts` - Auto-ingestion debouncer, vault event wiring, hunt pulse status bar, enable/disable methods, onunload cleanup
- `apps/obsidian/src/__tests__/feature-toggles.test.ts` - 6 tests for settings defaults and interface completeness

## Decisions Made
- Debouncer created ONCE in onload, not per-enable cycle, to avoid stale references per pitfall #5 in RESEARCH.md
- enableAutoIngestion/disableAutoIngestion are idempotent -- guard checks prevent double-registration
- huntPulseEl is a separate status bar element from existing statusBarItemEl (workspace status)
- MCP event polling and prior-hunt suggestions toggles are disabled placeholders for Phase 88

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 87 complete: WatcherService, formatHuntPulse, auto-ingestion, hunt pulse, and feature toggles all wired
- Phase 88 placeholders (mcpEventPolling, priorHuntSuggestions) ready for implementation
- All 772 tests pass across 44 test files with zero regressions

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 87-filesystem-watcher-hunt-pulse*
*Completed: 2026-04-12*
