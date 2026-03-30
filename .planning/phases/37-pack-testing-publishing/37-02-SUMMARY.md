---
phase: 37-pack-testing-publishing
plan: 02
subsystem: cli
tags: [pack-promote, pack-registry, deprecation-warnings, test-coverage, cli-commands]

requires:
  - phase: 37-01
    provides: getPackFolderForKind, generateTestFixture, generateTestFile, writeTestArtifacts, loadMockResponse, cmdPackTest enhanced flags

provides:
  - cmdPackPromote for promoting local packs to built-in registry
  - loadPackRegistry extension for additional directories via pack_registries config
  - Deprecation warnings for packs with stability deprecated
  - Comprehensive test coverage for all Phase 37 features (25 new tests)

affects: [pack-authoring-cli, connector-plugin-sdk]

tech-stack:
  added: []
  patterns: [pack-promotion-pipeline, configurable-registry-discovery, deprecation-warning-system]

key-files:
  created:
    - .planning/phases/37-pack-testing-publishing/37-02-SUMMARY.md
  modified:
    - thrunt-god/bin/lib/commands.cjs
    - thrunt-god/bin/lib/pack.cjs
    - thrunt-god/bin/thrunt-tools.cjs
    - tests/pack-command.test.cjs
    - tests/pack-library.test.cjs

key-decisions:
  - "PACK-PROMOTE-COPY: Promote copies pack JSON to built-in directory (not move) -- source local pack preserved for continued development"
  - "REGISTRY-WARNINGS-ARRAY: loadPackRegistry returns warnings array as additional property -- existing callers that destructure only packs/overrides/paths are unaffected"
  - "GIT-REGISTRY-STUB: Git-based pack_registries emit clear warning rather than failing silently -- users get actionable guidance to clone and use local type"

patterns-established:
  - "Pack promotion validates stability, schema, and template parameters before copying"
  - "Additional registry directories configured via pack_registries in .planning/config.json"
  - "Deprecated packs emit warnings with optional replaced_by guidance"

requirements-completed: [PACK-03]

duration: 8min
completed: 2026-03-30
---

# Phase 37 Plan 02: Pack Promote, Registry Extension & Comprehensive Tests Summary

**cmdPackPromote command for local-to-built-in pack promotion, loadPackRegistry extended with configurable extra directories and deprecation warnings, 25 new tests covering all Phase 37 features**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T21:30:07Z
- **Completed:** 2026-03-30T21:38:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- cmdPackPromote command validates stability (stable only), runs full schema validation, checks template parameters, then copies pack JSON to built-in registry directory
- loadPackRegistry reads pack_registries config from .planning/config.json, supports local-type additional directories, emits warning for git-type registries
- Deprecation warning system detects packs with stability: deprecated and includes replaced_by hint when available
- 25 new tests covering: getPackFolderForKind mapping, generateTestFixture/generateTestFile, loadMockResponse for 3 connectors, pack_registries config, deprecation warnings, --verbose/--coverage/--validate-only/--mock-data CLI flags, and promote success/failure scenarios
- Test count increased from 82 to 107 (all passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cmdPackPromote, extend loadPackRegistry, add routing** - `1365383` (feat)
2. **Task 2: Comprehensive test coverage for all Phase 37 features** - `17af619` (test)

## Files Created/Modified
- `thrunt-god/bin/lib/commands.cjs` - Added cmdPackPromote function and export
- `thrunt-god/bin/lib/pack.cjs` - Extended loadPackRegistry with pack_registries config, deprecation warnings, and warnings return array
- `thrunt-god/bin/thrunt-tools.cjs` - Added promote subcommand routing and updated help text
- `tests/pack-command.test.cjs` - Added 8 tests: --verbose, --coverage, --validate-only, --mock-data flags plus 4 promote scenarios
- `tests/pack-library.test.cjs` - Added 17 tests: getPackFolderForKind, generateTestFixture, generateTestFile, loadMockResponse, registry extension, deprecation warnings

## Decisions Made
- PACK-PROMOTE-COPY: Promote copies pack JSON to built-in directory rather than moving -- source local pack is preserved for continued development
- REGISTRY-WARNINGS-ARRAY: loadPackRegistry returns warnings array as an additional property on the return object -- existing callers that only destructure packs/overrides/paths are completely unaffected (backward compatible)
- GIT-REGISTRY-STUB: Git-based pack_registries emit a clear "not yet supported" warning with actionable guidance to clone locally, rather than failing silently or throwing an error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test pack fixtures missing required schema fields**
- **Found during:** Task 2 (comprehensive test coverage)
- **Issue:** Plan's test pack JSON fixtures for registry extension and deprecation tests were minimal stubs that failed resolvePackMap's requireComplete validation (missing hypothesis_ids, required_connectors, supported_datasets, publish fields)
- **Fix:** Added all required fields to test pack fixtures to pass schema validation
- **Files modified:** tests/pack-library.test.cjs
- **Verification:** All 3 affected tests pass
- **Committed in:** 17af619 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed --raw flag in test commands preventing JSON output parsing**
- **Found during:** Task 2 (comprehensive test coverage)
- **Issue:** Plan's test commands included --raw flag which causes output() to emit only the shortform string (e.g., "true") instead of JSON, making JSON.parse fail
- **Fix:** Removed --raw from all test runThruntTools calls that parse JSON output
- **Files modified:** tests/pack-command.test.cjs
- **Verification:** All 12 new pack-command tests pass
- **Committed in:** 17af619 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs in plan test specifications)
**Impact on plan:** Both fixes corrected test specification issues from the plan. No scope creep. All intended test coverage achieved.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 37 (Pack Testing & Publishing) is now fully complete
- v2.0 Developer Experience & CI milestone complete (all 7 phases: 31-37)
- Pack authoring CLI fully tested: init, create, lint, test, promote commands with comprehensive coverage
- Ready for v2.1 Advanced Hunt Features milestone

## Self-Check: PASSED

All 6 created/modified files verified present. Both task commits (1365383, 17af619) verified in git log. All 107 tests pass.

---
*Phase: 37-pack-testing-publishing*
*Completed: 2026-03-30*
