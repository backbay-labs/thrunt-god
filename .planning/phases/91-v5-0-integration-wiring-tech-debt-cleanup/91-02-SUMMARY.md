---
phase: 91-v5-0-integration-wiring-tech-debt-cleanup
plan: 02
subsystem: ui
tags: [obsidian, lifecycle, settings, canvas, typescript]

# Dependency graph
requires:
  - phase: 86
    provides: liveCanvasEnabled setting, inline live canvas wiring, dashboard refresh
  - phase: 79
    provides: WorkspaceService decomposition, command extraction, openCoreFile standalone function
provides:
  - enableLiveCanvas/disableLiveCanvas runtime lifecycle methods on ThruntGodPlugin
  - openCoreFile public method on ThruntGodPlugin
  - Runtime toggle of live canvas and dashboard reactivity without plugin reload
affects: [obsidian-plugin, settings, view]

# Tech tracking
tech-stack:
  added: []
  patterns: [idempotent enable/disable lifecycle pattern for settings toggles]

key-files:
  created: []
  modified:
    - apps/obsidian/src/main.ts
    - apps/obsidian/src/settings.ts

key-decisions:
  - "enableLiveCanvas follows identical idempotent guard pattern as enableAutoIngestion"
  - "openCoreFile added as class method (not import) since view.ts uses this.plugin.openCoreFile pattern"
  - "disableLiveCanvas cleans up both EventBus listener and vault EventRef separately"

patterns-established:
  - "All feature toggles in settings.ts must call corresponding enable/disable lifecycle methods"

requirements-completed: [LIVE-06, CANVAS-09, CANVAS-10]

# Metrics
duration: 2min
completed: 2026-04-13
---

# Phase 91 Plan 02: Live Canvas Toggle Wiring & openCoreFile Fix Summary

**Runtime enable/disable lifecycle for liveCanvasEnabled toggle plus openCoreFile method restoration on ThruntGodPlugin**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-13T01:15:28Z
- **Completed:** 2026-04-13T01:17:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Live canvas auto-population and dashboard reactive refresh now toggleable at runtime via settings without plugin reload
- openCoreFile restored as public method on ThruntGodPlugin, resolving TypeScript compilation errors in view.ts
- All 886 existing tests pass, no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add enableLiveCanvas/disableLiveCanvas lifecycle methods and wire settings toggle** - `33f8cc6c` (feat)
2. **Task 2: Resolve openCoreFile() references in view.ts** - `f370a498` (fix)

## Files Created/Modified
- `apps/obsidian/src/main.ts` - Added enableLiveCanvas/disableLiveCanvas lifecycle methods, openCoreFile public method, refactored onload inline wiring to use enableLiveCanvas(), added disableLiveCanvas() to onunload()
- `apps/obsidian/src/settings.ts` - Wired liveCanvasEnabled onChange to call plugin.enableLiveCanvas()/disableLiveCanvas()

## Decisions Made
- enableLiveCanvas uses same idempotent guard pattern as enableAutoIngestion (check private handler field, return early if already enabled)
- openCoreFile added as class method rather than importing standalone function from commands.ts, since view.ts already uses `this.plugin.openCoreFile()` call pattern
- disableLiveCanvas cleans up EventBus entity:created handler and vault modify EventRef separately for proper resource management

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All liveCanvasEnabled, autoIngestion, huntPulse, mcpEventPolling, and priorHuntSuggestions toggles now have proper enable/disable lifecycle methods
- LIVE-06, CANVAS-09, CANVAS-10 requirements closed
- Plugin class fully typed with all methods view.ts expects

---
*Phase: 91-v5-0-integration-wiring-tech-debt-cleanup*
*Completed: 2026-04-13*
