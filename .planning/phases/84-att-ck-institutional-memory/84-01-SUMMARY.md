---
phase: 84-att-ck-institutional-memory
plan: 01
subsystem: intelligence
tags: [att-ck, technique-notes, hunt-history, false-positive, coverage-staleness, pure-modules]

# Dependency graph
requires:
  - phase: 83-cross-hunt-aggregation-computed-confidence
    provides: "hunt-history.ts section pattern, entity-intelligence.ts coordinator pattern, frontmatter-editor.ts"
provides:
  - "technique-hunt-history.ts: buildTechniqueHuntHistorySection, appendTechniqueHuntHistorySection"
  - "false-positive.ts: buildFPSection, appendFalsePositiveEntry"
  - "coverage-staleness.ts: computeCoverageStatus, extractLastHuntedDate"
  - "technique-intelligence.ts: refreshTechniqueIntelligence coordinator"
affects: [84-02, intelligence-service, technique-refresh-command]

# Tech tracking
tech-stack:
  added: []
  patterns: [technique-note-section-management, UTC-day-diff-for-staleness, FP-entry-counting-via-regex]

key-files:
  created:
    - apps/obsidian/src/technique-hunt-history.ts
    - apps/obsidian/src/false-positive.ts
    - apps/obsidian/src/coverage-staleness.ts
    - apps/obsidian/src/technique-intelligence.ts
    - apps/obsidian/src/__tests__/technique-hunt-history.test.ts
    - apps/obsidian/src/__tests__/false-positive.test.ts
    - apps/obsidian/src/__tests__/coverage-staleness.test.ts
    - apps/obsidian/src/__tests__/technique-intelligence.test.ts
  modified: []

key-decisions:
  - "Technique Hunt History uses 3-case placement (no Verdict History anchor), distinct from entity 4-case"
  - "Coverage staleness uses UTC-normalized day diff to avoid timezone boundary issues"
  - "FP append is single-entry (not bulk replace) matching append-only requirement"
  - "Coordinator extracts lastHuntedDate BEFORE replacing Hunt History section to handle empty-entries fallback"
  - "FP counting uses regex /^- \\*\\*pattern\\*\\*:/ for locked format detection"

patterns-established:
  - "Technique note section ordering: ## Sub-Techniques > ## Hunt History > ## Known False Positives > ## Sightings > ## Detections > ## Related"
  - "UTC midnight normalization for date-only comparisons (getUTCFullYear/getUTCMonth/getUTCDate)"
  - "Coordinator reads before writes pattern: extract data from original content before transformation"

requirements-completed: [INTEL-06, INTEL-07, INTEL-08]

# Metrics
duration: 7min
completed: 2026-04-12
---

# Phase 84 Plan 01: ATT&CK Institutional Memory - Pure Modules Summary

**Four pure TypeScript modules for ATT&CK technique intelligence: hunt history section builder, false positive registry, coverage staleness computation, and coordinator -- 46 tests, zero Obsidian imports**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-12T18:03:19Z
- **Completed:** 2026-04-12T18:10:26Z
- **Tasks:** 2
- **Files created:** 8

## Accomplishments
- Technique hunt history section builder with locked entry format (queries, data_sources, outcome)
- False positive registry with append-only semantics and placeholder removal
- Coverage staleness computation with UTC-normalized day diff and configurable threshold
- Technique intelligence coordinator composing all modules with frontmatter updates (hunt_count, last_hunted, coverage_status, fp_count)

## Task Commits

Each task was committed atomically:

1. **Task 1: technique-hunt-history.ts, false-positive.ts, coverage-staleness.ts** - `5ca92195` (test RED) + `2b355fbc` (feat GREEN)
2. **Task 2: technique-intelligence.ts coordinator** - `1e516fba` (test RED) + `20fbbc33` (feat GREEN)

_TDD: tests written first (RED), then implementation (GREEN)._

## Files Created/Modified
- `apps/obsidian/src/technique-hunt-history.ts` - Hunt History section builder for technique notes (buildTechniqueHuntHistorySection, appendTechniqueHuntHistorySection)
- `apps/obsidian/src/false-positive.ts` - False positive registry (buildFPSection, appendFalsePositiveEntry)
- `apps/obsidian/src/coverage-staleness.ts` - Coverage staleness computation (computeCoverageStatus, extractLastHuntedDate)
- `apps/obsidian/src/technique-intelligence.ts` - Coordinator composing all three modules (refreshTechniqueIntelligence)
- `apps/obsidian/src/__tests__/technique-hunt-history.test.ts` - 12 tests for technique hunt history
- `apps/obsidian/src/__tests__/false-positive.test.ts` - 10 tests for false positive registry
- `apps/obsidian/src/__tests__/coverage-staleness.test.ts` - 13 tests for coverage staleness
- `apps/obsidian/src/__tests__/technique-intelligence.test.ts` - 11 tests for coordinator

## Decisions Made
- Technique notes use 3-case section placement (replace existing, insert before Sightings, insert after frontmatter) -- deliberately excludes Verdict History anchor that entity notes use
- Coverage staleness uses UTC-normalized day diff (getUTCFullYear/getUTCMonth/getUTCDate) to avoid timezone boundary edge cases where local midnight differs from UTC midnight
- False positive append is single-entry operation (not bulk replace like Hunt History) matching the append-only requirement
- Coordinator extracts lastHuntedDate from original content BEFORE calling appendTechniqueHuntHistorySection, because empty entries replacement would destroy existing date data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed timezone boundary in coverage staleness computation**
- **Found during:** Task 1 (coverage-staleness.ts)
- **Issue:** `new Date('2026-04-02')` parsed as UTC midnight, but `getDate()` returned local time (PDT=UTC-7), causing 91-day calculation to return 90
- **Fix:** Used `getUTCFullYear()/getUTCMonth()/getUTCDate()` for consistent UTC day normalization
- **Files modified:** `apps/obsidian/src/coverage-staleness.ts`
- **Verification:** Boundary test (90 days = current, 91 days = stale) passes correctly
- **Committed in:** `2b355fbc` (part of Task 1 GREEN commit)

**2. [Rule 1 - Bug] Fixed Hunt History replace test false positive from shared placeholder text**
- **Found during:** Task 1 (technique-hunt-history.test.ts)
- **Issue:** Test checked `not.toContain('_No hunts..._')` but the same placeholder appeared in ## Sightings section, causing false failure
- **Fix:** Made assertion scoped to ## Hunt History section content only
- **Files modified:** `apps/obsidian/src/__tests__/technique-hunt-history.test.ts`
- **Verification:** Test correctly validates Hunt History section without false match on Sightings placeholder
- **Committed in:** `2b355fbc` (part of Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four pure modules ready for Plan 84-02 (commands + integration)
- technique-intelligence.ts ready for IntelligenceService integration
- false-positive.ts ready for FP command with FuzzySuggestModal
- coverage-staleness.ts ready for settings extension (staleCoverageDays)
- Full test suite passes with 652 tests (46 new + 606 existing)

## Self-Check: PASSED

All 8 created files verified. All 4 commits verified (5ca92195, 2b355fbc, 1e516fba, 20fbbc33).

---
*Phase: 84-att-ck-institutional-memory*
*Completed: 2026-04-12*
