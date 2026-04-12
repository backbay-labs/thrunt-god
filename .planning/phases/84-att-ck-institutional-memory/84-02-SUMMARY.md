---
phase: 84-att-ck-institutional-memory
plan: 02
subsystem: intelligence
tags: [obsidian, att-ck, false-positive, coverage-staleness, schema-migration, fuzzy-modal, receipt-scanning]

# Dependency graph
requires:
  - phase: 84-01
    provides: "Pure modules: false-positive.ts, technique-intelligence.ts, technique-hunt-history.ts, coverage-staleness.ts"
provides:
  - "'Add false positive' command with TechniqueSuggestModal two-step UX"
  - "staleCoverageDays setting (default 90) in Intelligence section"
  - "Schema migration v3: coverage_status, fp_count, Known False Positives section"
  - "IntelligenceService.refreshTechniqueIntelligence with receipt scanning"
  - "Technique-specific refresh integrated into refresh-entity-intelligence command"
affects: [85-journal-tags, 86-playbooks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step fuzzy modal UX: TechniqueSuggestModal -> PromptModal for user input flows"
    - "Service method forwarding: WorkspaceService delegates to IntelligenceService"
    - "Receipt scanning: claim_status -> HuntOutcome mapping (supports->TP, disproves->FP, else->inconclusive)"

key-files:
  created: []
  modified:
    - apps/obsidian/src/settings.ts
    - apps/obsidian/src/schema-migration.ts
    - apps/obsidian/src/chooser-modals.ts
    - apps/obsidian/src/commands.ts
    - apps/obsidian/src/workspace.ts
    - apps/obsidian/src/services/intelligence-service.ts
    - apps/obsidian/src/__tests__/schema-migration.test.ts
    - apps/obsidian/src/__tests__/command-consolidation.test.ts
    - apps/obsidian/src/__tests__/chooser-modals.test.ts

key-decisions:
  - "TechniqueSuggestModal follows VerdictSuggestModal pattern for consistent fuzzy UI"
  - "add-false-positive chooser item delegates via executeCommandById for consistent command routing"
  - "Technique refresh runs after entity refresh on TTP notes (additive, not replacing)"
  - "WorkspaceService.refreshTechniqueIntelligence forwards to IntelligenceService (consistent facade pattern)"
  - "mapClaimStatusToOutcome uses string equality (supports->TP, disproves->FP) per RESEARCH.md heuristic"

patterns-established:
  - "Two-step modal UX: FuzzySuggestModal selection -> PromptModal text input for annotate workflows"
  - "Receipt scanning pattern: list RECEIPTS/, parseReceipt, filter by technique_refs, map claim_status"

requirements-completed: [INTEL-06, INTEL-07, INTEL-08]

# Metrics
duration: 8min
completed: 2026-04-12
---

# Phase 84 Plan 02: ATT&CK Institutional Memory Wiring Summary

**False positive command with technique fuzzy-select + receipt-scanning technique refresh wired into Obsidian plugin surface**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-12T18:13:33Z
- **Completed:** 2026-04-12T18:21:59Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- "Add false positive" command accessible from both command palette and Intelligence chooser with two-step FuzzySuggestModal technique selection + PromptModal pattern description
- Schema migration v3 adds coverage_status (default stale), fp_count (default 0), and ## Known False Positives section to all entity notes
- IntelligenceService.refreshTechniqueIntelligence scans RECEIPTS/ for matching technique references and maps claim_status to TP/FP/inconclusive outcomes
- staleCoverageDays setting (default 90) in Intelligence settings section for configurable coverage staleness threshold

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings, schema migration v3, TechniqueSuggestModal, and "Add false positive" command** - `5ef3646d` (feat)
2. **Task 2: IntelligenceService.refreshTechniqueIntelligence + receipt scanning** - `e763204b` (feat)

## Files Created/Modified
- `apps/obsidian/src/settings.ts` - Added staleCoverageDays to interface, defaults, and settings UI
- `apps/obsidian/src/schema-migration.ts` - Bumped to v3, added coverage_status/fp_count fields + Known False Positives section
- `apps/obsidian/src/chooser-modals.ts` - Added TechniqueSuggestModal class, buildTechniqueItems helper, add-false-positive to intelligence items
- `apps/obsidian/src/commands.ts` - Added add-false-positive command + addFalsePositive helper, extended refreshEntityIntel for technique notes
- `apps/obsidian/src/workspace.ts` - Added refreshTechniqueIntelligence forwarding method
- `apps/obsidian/src/services/intelligence-service.ts` - Added refreshTechniqueIntelligence with receipt scanning + mapClaimStatusToOutcome
- `apps/obsidian/src/__tests__/schema-migration.test.ts` - Updated for v3: new fixtures, new migration tests, updated counts
- `apps/obsidian/src/__tests__/command-consolidation.test.ts` - Updated visible command count to 13, added add-false-positive
- `apps/obsidian/src/__tests__/chooser-modals.test.ts` - Updated intelligence items count to 7, added TechniqueSuggestModal tests

## Decisions Made
- TechniqueSuggestModal follows VerdictSuggestModal pattern (FuzzySuggestModal with constructor injection) for consistent fuzzy UI
- add-false-positive chooser item delegates via executeCommandById for consistent command routing
- Technique refresh runs after entity refresh on TTP notes (additive enhancement, not replacement)
- WorkspaceService.refreshTechniqueIntelligence forwards to IntelligenceService (consistent with existing facade pattern)
- mapClaimStatusToOutcome uses direct string equality matching per RESEARCH.md heuristic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added WorkspaceService forwarding method for refreshTechniqueIntelligence**
- **Found during:** Task 1 (extending refreshEntityIntel)
- **Issue:** IntelligenceService is private within WorkspaceService; commands.ts cannot access it directly
- **Fix:** Added refreshTechniqueIntelligence forwarding method on WorkspaceService (consistent with existing facade pattern for crossHuntIntel, compareHuntsReport, etc.)
- **Files modified:** apps/obsidian/src/workspace.ts
- **Verification:** Tests pass, method accessible via plugin.workspaceService
- **Committed in:** 5ef3646d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for correct architecture -- follows existing established pattern.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 84 complete: ATT&CK institutional memory fully wired into Obsidian plugin
- Hunt history, false positives, coverage staleness, and technique intelligence all operational
- Ready for Phase 85 (journal tags) and beyond
- 663 tests passing with zero regressions

---
*Phase: 84-att-ck-institutional-memory*
*Completed: 2026-04-12*
