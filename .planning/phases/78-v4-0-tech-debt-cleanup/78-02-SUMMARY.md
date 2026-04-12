---
phase: 78-v4-0-tech-debt-cleanup
plan: 02
subsystem: obsidian-plugin
tags: [canvas, coverage, offline-fallback, template-picker, obsidian]

# Dependency graph
requires:
  - phase: 78-01
    provides: wiki-link resolution and dashboard mtime fixes
  - phase: 76-02
    provides: CanvasTemplateModal and canvasFromCurrentHunt method
  - phase: 73-02
    provides: MCP coverage analysis and buildCoverageReport formatter
provides:
  - canvasFromCurrentHunt template picker via CanvasTemplateModal
  - offline coverage fallback for analyzeCoverage using vault frontmatter
  - extended parseFrontmatterFields with hunt_count and mitre_id extraction
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Offline fallback pattern: MCP-connected path first, then vault-only fallback with same output formatter"
    - "Generator dispatch table reuse: canvasFromCurrentHunt mirrors generateHuntCanvas dispatch pattern"

key-files:
  created: []
  modified:
    - apps/obsidian/src/workspace.ts
    - apps/obsidian/src/main.ts
    - apps/obsidian/src/__tests__/workspace.test.ts

key-decisions:
  - "Extended parseFrontmatterFields to extract hunt_count and mitre_id rather than creating separate parser"
  - "Offline coverage message includes '(offline)' suffix so analyst knows data source"
  - "canvasFromCurrentHunt defaults to kill-chain for backward compatibility"

patterns-established:
  - "Offline fallback pattern: check mcpClient.isConnected() then fall through to vault-only logic using same formatter"

requirements-completed: [CANVAS-03-polish, MCP-04-polish]

# Metrics
duration: 7min
completed: 2026-04-12
---

# Phase 78 Plan 02: Template Picker and Offline Coverage Summary

**canvasFromCurrentHunt gains CanvasTemplateModal template selection, analyzeCoverage gains offline vault-based fallback using buildCoverageReport formatter**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-12T11:18:36Z
- **Completed:** 2026-04-12T11:26:01Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- canvasFromCurrentHunt now accepts a template parameter and dispatches to all 4 canvas generators via dispatch table
- canvas-from-current-hunt command opens CanvasTemplateModal (matching generate-hunt-canvas pattern)
- analyzeCoverage falls back to scanning TTP entity note frontmatter when MCP is disconnected
- Offline coverage report uses the same buildCoverageReport formatter as MCP path for consistent output
- All 369 tests pass across 18 test files with 8 new tests added (91 -> 99 in workspace.test.ts)

## Task Commits

Each task was committed atomically:

1. **Task 1: Template picker for canvasFromCurrentHunt**
   - `65a04284` (test: add failing tests for template picker)
   - `b562c6b2` (feat: implement template picker with dispatch table)
2. **Task 2: Offline coverage fallback for analyzeCoverage**
   - `1341584e` (test: add failing tests for offline coverage)
   - `2e462780` (feat: implement offline coverage fallback)

_TDD workflow: each task has RED (test) and GREEN (feat) commits_

## Files Created/Modified
- `apps/obsidian/src/workspace.ts` - canvasFromCurrentHunt template dispatch, analyzeCoverage offline fallback, parseFrontmatterFields extended
- `apps/obsidian/src/main.ts` - canvas-from-current-hunt command uses CanvasTemplateModal
- `apps/obsidian/src/__tests__/workspace.test.ts` - 8 new tests for template picker and offline coverage

## Decisions Made
- Extended parseFrontmatterFields return type to include hunt_count and mitre_id rather than creating a separate parsing function -- keeps the single parser pattern consistent across all callers
- Offline coverage message includes "(offline)" suffix so analyst knows the data source differs from MCP-enriched analysis
- canvasFromCurrentHunt defaults to 'kill-chain' template for backward compatibility with existing callers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended parseFrontmatterFields to extract hunt_count and mitre_id**
- **Found during:** Task 2 (Offline coverage fallback)
- **Issue:** parseFrontmatterFields only returned {type, tactic} -- offline coverage needs hunt_count and mitre_id from frontmatter
- **Fix:** Added hunt_count and mitre_id regex matches to the existing parser loop, extended return type
- **Files modified:** apps/obsidian/src/workspace.ts
- **Verification:** All 99 workspace tests pass including new offline coverage tests
- **Committed in:** 2e462780 (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for offline coverage to read frontmatter fields. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 v4.0 tech debt items are now resolved
- Phase 78 (v4.0 Tech Debt Cleanup) is complete
- v4.0 milestone fully shipped

## Self-Check: PASSED

All files exist. All 4 commit hashes verified.

---
*Phase: 78-v4-0-tech-debt-cleanup*
*Completed: 2026-04-12*
