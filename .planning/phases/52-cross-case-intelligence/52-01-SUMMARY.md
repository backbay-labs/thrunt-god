---
phase: 52-cross-case-intelligence
plan: 01
subsystem: database
tags: [sqlite, fts5, better-sqlite3, full-text-search, cross-case-intelligence]

requires:
  - phase: 50-case-management
    provides: case directory structure (.planning/cases/<slug>/) with STATE.md, FINDINGS.md, HYPOTHESES.md
provides:
  - db.cjs module with 5 core exports + 2 helpers for SQLite cross-case intelligence
  - FTS5 full-text search across case artifacts
  - B-tree technique overlap lookup via case_techniques junction table
  - Idempotent case indexing with transaction safety
affects: [52-02 case-close-integration, 52-03 case-search-cli, future knowledge graph]

tech-stack:
  added: [better-sqlite3 ^12.8.0]
  patterns: [FTS5 external content with explicit sync, BEGIN IMMEDIATE transactions, B-tree junction for structured lookups]

key-files:
  created: [thrunt-god/bin/lib/db.cjs, tests/db.test.cjs]
  modified: [package.json, package-lock.json]

key-decisions:
  - "IOC extraction uses cascading hash regex (SHA256 first, then SHA1, then MD5) to avoid substring false positives"
  - "parseHypotheses splits on ## or ### headings into individual artifact rows for granular FTS matching"
  - "extractIOCs returns structured object (ips, md5s, sha1s, sha256s) and indexCase stores all as single ioc artifact row"

patterns-established:
  - "FTS5 external content sync: delete FTS entries BEFORE content rows during re-indexing"
  - "BEGIN IMMEDIATE via db.transaction().immediate() for all write operations"
  - "B-tree case_techniques table for exact technique ID matching (never use FTS5 for T-codes)"
  - "openProgramDb returns null (not throw) when .planning/ absent"
  - "searchCases returns [] (not throw) on empty DB or query errors"

requirements-completed: [INTEL-01]

duration: 14min
completed: 2026-04-08
---

# Phase 52 Plan 01: Cross-Case Intelligence DB Module Summary

**SQLite+FTS5 db.cjs module with 5 core exports for cross-case full-text search, technique overlap, and idempotent case artifact indexing via better-sqlite3**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-08T14:27:46Z
- **Completed:** 2026-04-08T14:42:05Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- db.cjs module with openProgramDb, ensureSchema, indexCase, searchCases, findTechniqueOverlap + extractTechniqueIds, extractIOCs helpers
- FTS5 external content table (case_artifacts_fts) with porter unicode61 tokenizer for prose search
- B-tree case_techniques junction table with idx_case_techniques_tid index for exact technique ID matching
- Idempotent re-indexing: FTS delete-before-content pattern prevents phantom entries
- BEGIN IMMEDIATE transactions prevent write-upgrade deadlock
- 35 unit tests covering all exports, edge cases, and idempotency

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for db.cjs** - `34aa238` (test)
2. **Task 1 (GREEN): Implement db.cjs module** - `9f1e56a` (feat)

## Files Created/Modified
- `thrunt-god/bin/lib/db.cjs` - SQLite database module (400 lines, 5 core exports + 2 helpers)
- `tests/db.test.cjs` - Comprehensive unit tests (533 lines, 35 tests across 7 suites)
- `package.json` - Added better-sqlite3 ^12.8.0 production dependency
- `package-lock.json` - Lock file updated with better-sqlite3 and native module dependencies

## Decisions Made
- IOC extraction uses cascading hash regex approach: extract SHA256 (64-char) first, remove from text, then SHA1 (40-char), then MD5 (32-char) to avoid substring collisions where a SHA256 would also match MD5 and SHA1 patterns
- HYPOTHESES.md parsed into individual sections by splitting on ## or ### headings, enabling granular per-hypothesis FTS matching rather than whole-file indexing
- All IOCs stored as a single 'ioc' artifact row (concatenated with type prefixes like ip:, md5:, sha256:) rather than individual rows per IOC, keeping the artifact table focused on searchable text blocks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. better-sqlite3 ships prebuilt binaries for Node 20+ on all major platforms.

## Next Phase Readiness
- db.cjs is ready for integration into cmdCaseClose (Plan 02 indexing trigger) and cmdCaseNew (Plan 02 auto-search)
- All exports tested and verified; downstream plans can require('./db.cjs') directly
- No blockers or concerns

---
*Phase: 52-cross-case-intelligence*
*Completed: 2026-04-08*
