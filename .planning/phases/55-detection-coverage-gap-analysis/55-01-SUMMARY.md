---
phase: 55-detection-coverage-gap-analysis
plan: 01
subsystem: intel
tags: [coverage, threat-profiles, detections, mitre-attack, gap-analysis]

# Dependency graph
requires:
  - phase: 54-detection-rule-ingestion
    provides: "detections table with bundled SigmaHQ rules, searchDetections, detections_fts"
  - phase: 53-mcp-hunt-intel-server
    provides: "openIntelDb, lookupTechnique, getTechniquesByTactic, techniques table with FTS"
provides:
  - "coverage.cjs module with cross-source detection comparison (compareDetections)"
  - "6 curated threat profiles (ransomware, apt, initial-access, persistence, credential-access, defense-evasion)"
  - "Detection suggestion engine (suggestDetections) using tactic-family analysis"
  - "Profile lookup API (getThreatProfile, listThreatProfiles)"
affects: [55-02, compare_detections MCP tool, suggest_detections MCP tool, analyze_coverage extension]

# Tech tracking
tech-stack:
  added: []
  patterns: [tactic-family suggestion engine, curated threat profile constant objects]

key-files:
  created:
    - mcp-hunt-intel/lib/coverage.cjs
    - tests/coverage.test.cjs
  modified: []

key-decisions:
  - "THREAT_PROFILES defined as plain JS constant object with 6 named profiles of curated technique ID arrays"
  - "compareDetections uses LIKE query on technique_ids column for flexible matching including sub-techniques"
  - "suggestDetections finds sibling techniques in same tactic via getTechniquesByTactic, limits to 10 similar rules"
  - "Free-text input to compareDetections uses techniques_fts for FTS lookup then compares first match"

patterns-established:
  - "coverage.cjs exports pure functions taking (db, ...) args consistent with intel.cjs/detections.cjs pattern"
  - "Threat profile lookup is case-insensitive via toLowerCase normalization"

requirements-completed: [DET-07, DET-08, DET-09]

# Metrics
duration: 4min
completed: 2026-04-08
---

# Phase 55 Plan 01: Coverage Data Layer Summary

**Cross-source detection comparison engine with 6 curated threat profiles and tactic-family suggestion logic using existing detections/techniques tables**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T19:09:24Z
- **Completed:** 2026-04-08T19:13:04Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments
- Created coverage.cjs with 5 exports: THREAT_PROFILES, getThreatProfile, listThreatProfiles, compareDetections, suggestDetections
- 6 curated threat profiles with 8-20 technique IDs each covering ransomware, APT, initial-access, persistence, credential-access, and defense-evasion
- compareDetections queries detections table and returns per-source-format breakdown (format, rule_id, title, severity) with source_count
- suggestDetections analyzes tactic-family sibling techniques to find similar detection rules and relevant data sources
- 21 comprehensive tests covering all functions, edge cases, and DB integration

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for coverage.cjs** - `0e3d891` (test)
2. **Task 1 GREEN: Implement coverage.cjs module** - `38de8b9` (feat)

_TDD task with RED and GREEN commits._

## Files Created/Modified
- `mcp-hunt-intel/lib/coverage.cjs` - Coverage comparison, threat profiles, and detection suggestion logic (5 exports)
- `tests/coverage.test.cjs` - 21 unit tests covering THREAT_PROFILES, getThreatProfile, listThreatProfiles, compareDetections, suggestDetections

## Decisions Made
- THREAT_PROFILES defined as plain JS constant object with technique ID arrays (not loaded from DB or config)
- compareDetections uses SQL LIKE on technique_ids column for flexible sub-technique matching
- suggestDetections limits similar_rules to 10 per query for manageable output
- Free-text queries to compareDetections use techniques_fts table for BM25-ranked lookup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test for technique with no detections**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test used T1190 expecting no detections, but bundled SigmaHQ rules include T1190 coverage (exploit public-facing app rules)
- **Fix:** Changed test to use T1199 (Trusted Relationship) which has zero bundled detections
- **Files modified:** tests/coverage.test.cjs
- **Verification:** Test passes, T1199 confirmed to have 0 detections in bundled set
- **Committed in:** 38de8b9 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test expectation)
**Impact on plan:** Minimal -- test used wrong technique ID for "no coverage" scenario.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- coverage.cjs data layer complete and tested, ready for 55-02 to wire MCP tools (compare_detections, suggest_detections)
- All 5 exports available for tool handlers to consume
- Existing mcp-intel tests (33 tests) still pass -- no regressions

---
*Phase: 55-detection-coverage-gap-analysis*
*Completed: 2026-04-08*
