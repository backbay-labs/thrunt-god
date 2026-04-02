---
phase: 14-evidence-board
plan: 01
subsystem: ui
tags: [vscode-extension, webview, evidence-board, graph, matrix, store-derivation]

requires:
  - phase: 13-hunt-overview-dashboard
    provides: HuntOverviewPanel singleton pattern, store derivation pattern, webview message bridge
provides:
  - deriveEvidenceBoard() store method building graph/matrix ViewModel
  - getEvidenceReview() store accessor for EvidenceReview artifact
  - EvidenceBoardPanel webview provider with typed message bridge
  - thrunt-god.openEvidenceBoard command registration
affects: [14-02 graph-mode-webview, 14-03 matrix-mode-webview]

tech-stack:
  added: []
  patterns: [evidence-board-viewmodel-derivation, matrix-cell-generation, blind-spot-extraction]

key-files:
  created:
    - src/evidenceBoardPanel.ts
    - test/unit/storeDeriveEvidenceBoard.test.cjs
  modified:
    - src/store.ts
    - src/extension.ts
    - package.json

key-decisions:
  - "deriveEvidenceBoard builds edge lookup map for O(1) matrix cell resolution rather than scanning edges per cell"
  - "EvidenceBoardPanel omits diagnostics listener (unlike HuntOverviewPanel) since evidence board ViewModel is not diagnostics-dependent"

patterns-established:
  - "Evidence Board ViewModel derivation: nodes (3 tiers) + edges (receipt cross-refs) + matrixCells (complete cartesian product) + blindSpots"
  - "Matrix cell absent/present pattern: every hypothesis x receipt pair gets a cell with either the edge relationship or absent"

requirements-completed: [EVBD-01, EVBD-02, EVBD-06, EVBD-07, EVBD-08, EVBD-12]

duration: 6min
completed: 2026-04-02
---

# Phase 14 Plan 01: Evidence Board Data Pipeline Summary

**Store derivation function building graph nodes (3 tiers), edges from receipt cross-refs, matrix cells for every hypothesis x receipt pair, and blind spots from EvidenceReview; EvidenceBoardPanel webview provider with init/update/theme message bridge and node:open artifact navigation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-02T23:04:51Z
- **Completed:** 2026-04-02T23:10:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- deriveEvidenceBoard() builds complete EvidenceBoardViewModel from cross-artifact indexes: hypothesis nodes (tier 0), receipt nodes (tier 1), query nodes (tier 2), edges from receipt.relatedHypotheses/relatedQueries, matrixCells for every pair, and blindSpots from EvidenceReview
- EvidenceBoardPanel singleton webview with typed message bridge matching HuntOverviewPanel pattern
- 11 unit tests covering empty store, node construction, edge derivation, matrix cell generation, and blind spot extraction
- All 168 unit tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deriveEvidenceBoard to store (TDD RED)** - `68a05fc` (test)
2. **Task 1: Add deriveEvidenceBoard to store (TDD GREEN)** - `d38a498` (feat)
3. **Task 2: Create EvidenceBoardPanel with command registration** - `83832ab` (feat)

_Note: Task 1 followed TDD flow: RED (failing tests) then GREEN (implementation)_

## Files Created/Modified
- `src/store.ts` - Added getEvidenceReview() accessor and deriveEvidenceBoard() ViewModel derivation method
- `src/evidenceBoardPanel.ts` - New EvidenceBoardPanel webview provider following HuntOverviewPanel singleton pattern
- `src/extension.ts` - Registered thrunt-god.openEvidenceBoard command and re-exports
- `package.json` - Added command, activation event, and view/title menu entry
- `test/unit/storeDeriveEvidenceBoard.test.cjs` - 11 unit tests using prototype.call() pattern

## Decisions Made
- deriveEvidenceBoard builds an edge lookup map (`hypId:rctId` key) for O(1) matrix cell resolution rather than scanning the edges array per cell
- EvidenceBoardPanel omits the diagnostics change listener (unlike HuntOverviewPanel) since evidence board ViewModel is not diagnostics-dependent
- Followed plan exactly for message types, node tier assignments, and claimStatus-to-relationship mapping

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript lint flagged unused EVIDENCE_BOARD_VIEW_TYPE import in extension.ts since it was only used via re-export; fixed by removing from the direct import (re-export handles it independently)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EvidenceBoardPanel sends complete ViewModel to webview on ready and on store changes
- Plans 14-02 (graph mode) and 14-03 (matrix mode) can now implement webview rendering consuming the ViewModel
- All shared types in shared/evidence-board.ts are stable and tested

---
*Phase: 14-evidence-board*
*Completed: 2026-04-02*
