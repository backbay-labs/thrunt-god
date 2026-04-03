---
phase: 15-query-analysis-upgrades
plan: 02
subsystem: ui
tags: [preact, webview, vscode-extension, query-analysis, comparison-view, heatmap, sort-controls]

# Dependency graph
requires:
  - phase: 15-query-analysis-upgrades
    provides: deriveQueryAnalysis() store method, QueryAnalysisPanel singleton, expanded ViewModel types
  - phase: 12-design-system
    provides: shared components (Panel, GhostButton, StatCard), hooks (useTheme, useHostMessage, createVsCodeApi), tokens.css
provides:
  - ComparisonView component rendering two-column template diff with a-only/b-only accent bars
  - HeatmapView component rendering count-colored matrix across 3+ queries
  - SortControls pill radiogroup with active/disabled states
  - QuerySelector dual-dropdown with matrix mode toggle
  - Full index.tsx wiring host messages to ViewModel state and user action dispatch
affects: [15-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [opacity-scaled heatmap cells from single CSS variable, hunt-qa- prefix convention for query analysis surface]

key-files:
  created:
    - webview/query-analysis/app.tsx
  modified:
    - webview/query-analysis/index.tsx
    - webview/shared/tokens.css

key-decisions:
  - "Added --hunt-panel-bg, --hunt-surface-raised, --hunt-text-on-accent token variables as aliases to existing hunt variables"
  - "Heatmap opacity scale uses 0.15 minimum for non-zero cells to keep lowest counts visible"
  - "Count bar width calculated relative to max(queryA.eventCount, queryB.eventCount) for proportional comparison"

patterns-established:
  - "hunt-qa-* CSS prefix for all Query Analysis surface classes"
  - "QuerySelector + SortControls + view component pattern for multi-mode webview surfaces"

requirements-completed: [QANL-01, QANL-02, QANL-03]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 15 Plan 02: Query Analysis Webview Rendering Summary

**Side-by-side template comparison with blue/orange diff bars, count-colored heatmap matrix, and sort pill controls in the query-analysis webview**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T00:43:24Z
- **Completed:** 2026-04-03T00:46:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced stub index.tsx with full host-message wiring that manages ViewModel state and dispatches all user actions
- Built ComparisonView with two-column CSS grid, aligned template rows, and visual accent bars (blue for a-only, orange for b-only)
- Built HeatmapView with opacity-scaled cells from hunt-accent-strong across 3+ queries, plus total column
- Built SortControls pill radiogroup with active/disabled states, ARIA roles, and tooltip explanations
- Added QuerySelector with dual dropdowns and matrix mode toggle for 3+ queries
- Added 3 new CSS token variables (--hunt-panel-bg, --hunt-surface-raised, --hunt-text-on-accent) and full hunt-qa-* CSS classes

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire index.tsx to host messages and manage ViewModel state** - `ec2bc9d` (feat)
2. **Task 2: Build ComparisonView, HeatmapView, SortControls, and CSS** - `63c5e88` (feat)

## Files Created/Modified
- `webview/query-analysis/index.tsx` - Full message-handling entry point with createVsCodeApi, useHostMessage, and all user action dispatch
- `webview/query-analysis/app.tsx` - App with ComparisonView, HeatmapView, SortControls, QuerySelector components
- `webview/shared/tokens.css` - Added --hunt-panel-bg/--hunt-surface-raised/--hunt-text-on-accent variables and hunt-qa-* CSS classes

## Decisions Made
- Added --hunt-panel-bg as alias to --hunt-surface, --hunt-surface-raised as alias to --hunt-surface-strong, and --hunt-text-on-accent defaulting to #fff, since the plan's CSS referenced these non-existent variables
- Heatmap cell opacity minimum set to 0.15 for non-zero cells so lowest-count templates remain visible against the background
- Count bar proportional width uses max of both query event counts as denominator for fair cross-query comparison

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added missing CSS token variables**
- **Found during:** Task 2 (CSS authoring)
- **Issue:** Plan CSS referenced --hunt-panel-bg, --hunt-surface-raised, --hunt-text-on-accent which did not exist in :root
- **Fix:** Added all three as aliases/defaults in the :root block of tokens.css
- **Files modified:** webview/shared/tokens.css
- **Verification:** Build succeeds, CSS fallbacks work
- **Committed in:** 63c5e88 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for CSS variable resolution. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ComparisonView and HeatmapView ready for user interaction
- Plan 03 (Receipt QA Inspector rendering) can build on the established App structure and add inspector panel
- All query-analysis webview components export cleanly from app.tsx

## Self-Check: PASSED
