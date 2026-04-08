---
phase: 51-program-dashboard-extension-wiring
plan: 01
subsystem: cli, extension
tags: [vscode, watcher, artifact-resolution, cases, cli, rollup, program-state]

requires:
  - phase: 50-program-case-hierarchy
    provides: case_roster in STATE.md frontmatter, getCaseRoster/addCaseToRoster/updateCaseInRoster state functions, cases/ directory structure
provides:
  - stripCasePrefix helper in watcher.ts for case-nested artifact resolution
  - cmdProgramRollup CLI command generating Case Summary in program STATE.md
  - program rollup route in thrunt-tools.cjs
affects: [51-02-PLAN, webview-panel, extension-dashboard]

tech-stack:
  added: []
  patterns:
    - "stripCasePrefix regex pattern for stripping cases/<slug>/ prefix before artifact matching"
    - "cmdProgramRollup idempotent body replacement: read frontmatter, reconstruct yaml, replace entire body"

key-files:
  created: []
  modified:
    - apps/vscode/src/watcher.ts
    - apps/vscode/test/unit/store.test.cjs
    - thrunt-god/bin/lib/commands.cjs
    - thrunt-god/bin/thrunt-tools.cjs
    - tests/commands.test.cjs

key-decisions:
  - "stripCasePrefix applied at all three return paths in toArtifactRelativePath, not in resolveArtifactType, so all downstream consumers automatically work"
  - "cmdProgramRollup replaces entire body below frontmatter for idempotent re-generation"
  - "Stale threshold set to 14 days with no activity for active cases"

patterns-established:
  - "Case prefix stripping: /^cases\\/[^/]+\\/(.+)$/ applied before artifact type resolution"
  - "Program rollup idempotent write: reconstruct frontmatter YAML + replace body to avoid duplication"

requirements-completed: [DASH-01, DASH-03]

duration: 5min
completed: 2026-04-08
---

# Phase 51 Plan 01: Watcher Case Fix + Program Rollup CLI Summary

**Fixed artifact watcher to resolve case-nested artifacts and added cmdProgramRollup generating Case Summary section in program STATE.md**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-08T13:49:39Z
- **Completed:** 2026-04-08T13:55:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed toArtifactRelativePath to strip cases/<slug>/ prefix so resolveArtifactType works for all case-nested artifacts (mission, hypotheses, state, huntmap, evidence_review, query, receipt)
- Added cmdProgramRollup generating Case Summary with case table, coverage gaps, timeline, and stale detection (14-day threshold)
- Wired program rollup route in thrunt-tools.cjs
- All 242 VS Code extension tests pass (including 9 new case artifact tests)
- All 92 CLI tests pass (including 5 new rollup tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix toArtifactRelativePath for cases/ prefix (DASH-03)** - `cc27eb9` (feat)
2. **Task 2: cmdProgramRollup CLI command (DASH-01)** - `d72ff0a` (feat)

## Files Created/Modified
- `apps/vscode/src/watcher.ts` - Added stripCasePrefix helper, applied at all return paths in toArtifactRelativePath
- `apps/vscode/test/unit/store.test.cjs` - Added 9 tests: 7 case-nested artifact resolution + 2 flat-path regression checks
- `thrunt-god/bin/lib/commands.cjs` - Added cmdProgramRollup function with case table, coverage gaps, timeline, stale detection
- `thrunt-god/bin/thrunt-tools.cjs` - Added program route with rollup subcommand
- `tests/commands.test.cjs` - Added 5 tests: empty roster, 2-case counts, technique aggregation, idempotent runs, stale detection

## Decisions Made
- stripCasePrefix applied in toArtifactRelativePath (not resolveArtifactType) so all downstream consumers (CodeLens, diagnostics, IOC decorations, evidence board) automatically work for case artifacts
- cmdProgramRollup replaces entire body below frontmatter for idempotent re-generation (avoids duplicate Case Summary sections)
- Stale threshold: 14 days with no activity for active cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Watcher fix unblocks all VS Code extension features for case artifacts
- cmdProgramRollup unblocks the webview panel in Plan 02 (can display case summary data)
- Both independent backend pieces are complete and tested

## Self-Check: PASSED

All files exist. All commits verified (cc27eb9, d72ff0a).

---
*Phase: 51-program-dashboard-extension-wiring*
*Completed: 2026-04-08*
