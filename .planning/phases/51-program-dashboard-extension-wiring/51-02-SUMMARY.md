---
phase: 51-program-dashboard-extension-wiring
plan: 02
subsystem: vscode, webview
tags: [vscode, preact, webview, program-dashboard, store-derive, panel-provider]

requires:
  - phase: 51-program-dashboard-extension-wiring
    provides: stripCasePrefix for case artifact resolution, cmdProgramRollup for CLI rollup data
provides:
  - ProgramDashboardPanel webview panel provider with createOrShow/restorePanel/revive
  - store.deriveProgramDashboard() method transforming child hunts into ProgramDashboardViewModel
  - Shared type definitions (CaseCard, ProgramDashboardViewModel, message protocols)
  - Preact webview UI with case card grid, aggregate stats, timeline, empty state
  - esbuild config entry for program-dashboard webview bundle
  - Extension registration (serializer + openProgramDashboard command)
affects: [future-dashboard-enrichment, technique-coverage-integration]

tech-stack:
  added: []
  patterns:
    - "ProgramDashboardPanel follows huntOverviewPanel pattern exactly: createOrShow/restorePanel/revive static methods, store.onDidChange reactivity, theme change handling"
    - "deriveProgramDashboard uses 14-day stale threshold consistent with cmdProgramRollup"
    - "CaseCard status derived from ChildHuntSummary: closed (status=Closed|Complete), stale (>14d inactive + not closed), active (all others)"

key-files:
  created:
    - apps/vscode/shared/program-dashboard.ts
    - apps/vscode/src/programDashboardPanel.ts
    - apps/vscode/webview/program-dashboard/index.tsx
    - apps/vscode/test/unit/programDashboardPanel.test.cjs
  modified:
    - apps/vscode/src/store.ts
    - apps/vscode/src/extension.ts
    - apps/vscode/esbuild.config.mjs

key-decisions:
  - "deriveProgramDashboard placed on HuntDataStore class alongside deriveHuntOverview/deriveEvidenceBoard/deriveQueryAnalysis for consistent store-driven pattern"
  - "uniqueTechniques set to 0 as placeholder -- technique data requires file reads the store doesn't currently do (can be enriched later via CLI rollup)"
  - "case:open navigates to MISSION.md file via vscode.open rather than opening a new workspace window"

patterns-established:
  - "Program dashboard follows same panel lifecycle pattern as all other webview panels: HuntOverviewPanel, EvidenceBoardPanel, QueryAnalysisPanel, DrainTemplatePanel"
  - "Mock store for testing requires explicit deriveProgramDashboard implementation since mock is a plain object, not HuntDataStore class instance"

requirements-completed: [DASH-02]

duration: 8min
completed: 2026-04-08
---

# Phase 51 Plan 02: Program Dashboard Extension Wiring Summary

**Store-driven Program Dashboard webview panel with case card grid, aggregate stats, timeline, and 14 unit tests covering lifecycle, viewModel derivation, message handling, and store reactivity**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-08T13:58:14Z
- **Completed:** 2026-04-08T14:06:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Built complete Program Dashboard webview panel following huntOverviewPanel pattern with createOrShow/restorePanel/revive lifecycle, store.onDidChange reactivity, and theme change handling
- Added deriveProgramDashboard() to HuntDataStore that transforms getChildHunts() into ProgramDashboardViewModel with stale detection (14-day threshold), case status classification (active/closed/stale), and chronological timeline
- Created Preact webview UI rendering: header with program name + mission snippet, 5 aggregate StatCard components, responsive case card grid with Badge status indicators and Open Case buttons, timeline section, and empty state
- All 256 VS Code extension tests pass (including 14 new program dashboard panel tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared types, panel provider, store method, esbuild config, extension registration** - `b96da88` (feat)
2. **Task 2: Preact webview UI and panel unit tests** - `5b1dcf7` (feat)

## Files Created/Modified
- `apps/vscode/shared/program-dashboard.ts` - Shared types: CaseCard, ProgramDashboardViewModel, boot data, host/webview message protocols
- `apps/vscode/src/programDashboardPanel.ts` - Panel provider: createOrShow, restorePanel, revive, buildViewModel, handleMessage (webview:ready, case:open, refresh)
- `apps/vscode/src/store.ts` - Added deriveProgramDashboard() method with stale detection and timeline generation
- `apps/vscode/src/extension.ts` - Added import, serializer registration, openProgramDashboard command, panel export
- `apps/vscode/esbuild.config.mjs` - Added program-dashboard webview bundle entry
- `apps/vscode/webview/program-dashboard/index.tsx` - Preact UI: ProgramDashboard, CaseCardComponent, AggregateStats, TimelineSection
- `apps/vscode/test/unit/programDashboardPanel.test.cjs` - 14 tests: lifecycle (6), viewModel derivation (3), message handling (3), store reactivity (1), view type (1)

## Decisions Made
- deriveProgramDashboard placed on HuntDataStore class alongside existing derive methods for consistent store-driven pattern
- uniqueTechniques set to 0 as placeholder -- technique data requires file reads the store doesn't currently do
- case:open navigates to MISSION.md file via vscode.open (lightweight) rather than opening a new workspace window

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created placeholder webview index.tsx during Task 1**
- **Found during:** Task 1 (esbuild config verification)
- **Issue:** esbuild.config.mjs includes all webview entries and builds them simultaneously; missing program-dashboard/index.tsx caused build failure for the entire bundle
- **Fix:** Created minimal placeholder index.tsx in Task 1 so esbuild passes, replaced with full implementation in Task 2
- **Files modified:** apps/vscode/webview/program-dashboard/index.tsx
- **Verification:** esbuild builds all entries without errors
- **Committed in:** b96da88 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary since esbuild processes all entries together. Placeholder was replaced in Task 2 with no impact on final output.

## Issues Encountered
- Mock store for panel tests initially used `return {...}` instead of `const store = {...}; return store`, causing `deriveProgramDashboard` assignment to be unreachable dead code. Fixed by restructuring the mock factory function.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Program Dashboard panel is fully functional and tested
- Phase 51 is complete (both plans executed: Plan 01 watcher fix + CLI rollup, Plan 02 webview panel)
- uniqueTechniques can be enriched in a future phase via CLI rollup data integration

## Self-Check: PASSED

All files exist. All commits verified (b96da88, 5b1dcf7).

---
*Phase: 51-program-dashboard-extension-wiring*
*Completed: 2026-04-08*
