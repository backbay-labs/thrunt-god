---
phase: 80-sidebar-progressive-disclosure-onboarding
plan: 02
subsystem: ui
tags: [obsidian, hotkeys, commands, keyboard-shortcuts]

# Dependency graph
requires:
  - phase: 79-service-decomposition-eventbus
    provides: registerCommands function with plugin parameter injection
provides:
  - Default hotkeys on 3 core commands (Open workspace, Hyper Copy, Ingest)
  - Obsidian API mock stub for vitest (enables testing modules that import obsidian)
  - Vitest config with obsidian alias for the obsidian app
affects: [sidebar-ux, command-palette]

# Tech tracking
tech-stack:
  added: []
  patterns: [vitest-obsidian-mock-alias, obsidian-mod-hotkeys]

key-files:
  created:
    - apps/obsidian/src/__tests__/commands-hotkeys.test.ts
    - apps/obsidian/src/__mocks__/obsidian.ts
    - apps/obsidian/vitest.config.ts
  modified:
    - apps/obsidian/src/commands.ts

key-decisions:
  - "Created obsidian API mock stub + vitest alias to enable testing modules that import from types-only obsidian package"

patterns-established:
  - "Obsidian mock: use vitest.config.ts alias pointing to src/__mocks__/obsidian.ts for modules importing obsidian"
  - "Hotkey convention: use Mod modifier (not Ctrl) for cross-platform Cmd/Ctrl compatibility"

requirements-completed: [UX-05]

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 80 Plan 02: Default Hotkeys Summary

**Default keyboard shortcuts (Mod+Shift+T/H/I) on 3 core commands with TDD test coverage and obsidian mock infrastructure**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T13:49:01Z
- **Completed:** 2026-04-12T13:53:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- Added default hotkeys to 3 core commands: Open workspace (Mod+Shift+T), Hyper Copy for Agent (Mod+Shift+H), Ingest agent output (Mod+Shift+I)
- Created obsidian API mock stub and vitest alias config, enabling tests for any module that imports from the types-only obsidian package
- 5 new tests verify hotkey definitions; all 406 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing hotkey tests** - `af360c02` (test)
2. **Task 1 (GREEN): Add hotkeys to 3 commands** - `20ef4c5c` (feat)

## Files Created/Modified
- `apps/obsidian/src/commands.ts` - Added `hotkeys` property to 3 command registrations
- `apps/obsidian/src/__tests__/commands-hotkeys.test.ts` - 5 tests verifying hotkey definitions on all 3 commands
- `apps/obsidian/src/__mocks__/obsidian.ts` - Lightweight stub of Obsidian API classes (Notice, Modal, Setting, etc.)
- `apps/obsidian/vitest.config.ts` - Vitest config aliasing `obsidian` to the mock stub

## Decisions Made
- Created obsidian API mock stub + vitest config alias rather than inline vi.mock(), because the obsidian npm package is types-only (no JS entrypoint) and the vite resolver fails before vi.mock can intercept
- Used `Mod` modifier (not `Ctrl`) per Obsidian convention -- maps to Cmd on macOS, Ctrl on Windows/Linux

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created obsidian mock infrastructure for vitest**
- **Found during:** Task 1 RED phase
- **Issue:** The `obsidian` npm package has `"main": ""` (types-only, no JS entrypoint). Vitest's vite resolver fails before vi.mock can intercept the import, preventing any test from importing commands.ts.
- **Fix:** Created `src/__mocks__/obsidian.ts` with lightweight stubs for Notice, Modal, Setting, etc. Added `vitest.config.ts` with an alias redirecting `obsidian` imports to the mock.
- **Files created:** `apps/obsidian/vitest.config.ts`, `apps/obsidian/src/__mocks__/obsidian.ts`
- **Verification:** All 406 tests pass including 5 new hotkey tests
- **Committed in:** af360c02 (RED phase commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Mock infrastructure was necessary to test any module importing from obsidian. Unlocks future test coverage for commands, modals, views, and settings. No scope creep.

## Issues Encountered
None beyond the obsidian mock infrastructure (documented above as deviation).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 core commands have discoverable keyboard shortcuts
- Analysts can invoke Open workspace, Hyper Copy, and Ingest without command palette
- Mock infrastructure enables testing of any module that imports from obsidian

---
*Phase: 80-sidebar-progressive-disclosure-onboarding*
*Completed: 2026-04-12*
