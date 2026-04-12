---
phase: 79-service-decomposition-eventbus
plan: 03
subsystem: ui
tags: [obsidian, plugin, decomposition, commands, modals, event-bus]

# Dependency graph
requires:
  - phase: 79-02
    provides: "WorkspaceService facade with domain service delegation and EventBus wiring"
provides:
  - "commands.ts with all 19 command registrations extracted from main.ts"
  - "modals.ts with PromptModal, CanvasTemplateModal, CompareHuntsModal"
  - "main.ts slimmed to 138 LOC lifecycle-only orchestration"
  - "EventBus creation and cleanup in plugin lifecycle"
affects: [80-frontmatter-editor, 81-live-canvas, phase-79-complete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registerCommands(plugin) pattern: commands receive plugin instance, use plugin.xyz instead of this.xyz"
    - "type-only imports for circular dependency avoidance between commands.ts and main.ts"
    - "Module-private helper functions in commands.ts (not exported, not class methods)"

key-files:
  created:
    - "apps/obsidian/src/commands.ts"
    - "apps/obsidian/src/modals.ts"
  modified:
    - "apps/obsidian/src/main.ts"

key-decisions:
  - "Commands receive plugin parameter instead of using class methods -- avoids circular dependency"
  - "Helper functions are module-private (not exported) to preserve encapsulation"
  - "EventBus created in main.ts onload and passed to WorkspaceService constructor"

patterns-established:
  - "registerCommands pattern: single entry point for all command registrations"
  - "Type-only imports for cross-module plugin references"

requirements-completed: [UX-07]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 79 Plan 03: Commands & Modals Extraction Summary

**Extracted 19 commands and 3 modals from main.ts (736 LOC to 138 LOC) completing Phase 79 service decomposition**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T13:11:50Z
- **Completed:** 2026-04-12T13:15:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created modals.ts (153 LOC) with PromptModal, CanvasTemplateModal, CompareHuntsModal
- Created commands.ts (470 LOC) with registerCommands() containing all 19 command registrations and 10 helper functions
- Slimmed main.ts from 736 LOC to 138 LOC -- lifecycle-only orchestration
- Added EventBus creation in onload and cleanup in onunload
- All 382 tests pass without any test file modifications

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract modals to modals.ts and commands to commands.ts** - `8a19e329` (feat)
2. **Task 2: Slim main.ts to lifecycle-only orchestration** - `5ab9f0fe` (refactor)

## Files Created/Modified
- `apps/obsidian/src/modals.ts` - PromptModal, CanvasTemplateModal, CompareHuntsModal classes (153 LOC)
- `apps/obsidian/src/commands.ts` - registerCommands() with all 19 commands and 10 helper functions (470 LOC)
- `apps/obsidian/src/main.ts` - Lifecycle-only plugin class: onload, onunload, activateView, refreshViews, settings (138 LOC)

## Decisions Made
- Commands receive `plugin: ThruntGodPlugin` parameter instead of using `this` binding -- avoids circular dependency and enables type-only import
- Helper functions (openCoreFile, bootstrapWorkspace, etc.) are module-private in commands.ts -- not exported, preserving encapsulation
- EventBus created in main.ts onload() before WorkspaceService, passed as constructor arg

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 79 (Service Decomposition + EventBus) is complete
- main.ts: 138 LOC (target: <300), workspace.ts: 493 LOC (target: <700)
- 6 domain services extracted, EventBus wired, commands and modals separated
- Ready for Phase 80 (FrontmatterEditor) which is prerequisite for verdict lifecycle

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 79-service-decomposition-eventbus*
*Completed: 2026-04-12*
