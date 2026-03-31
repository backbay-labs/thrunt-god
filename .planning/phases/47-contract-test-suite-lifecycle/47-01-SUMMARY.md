---
phase: 47-contract-test-suite-lifecycle
plan: 01
subsystem: testing
tags: [contract-tests, connector-sdk, node-test, tap, mock-server, adapter-validation]

requires:
  - phase: 45-connector-sdk-package
    provides: validateConnectorAdapter, validateConnectorCapabilities, createQuerySpec, createResultEnvelope, executeConnectorRequest, authorizeRequest, createPaginationState, advancePaginationState
  - phase: 46-plugin-manifest-discovery
    provides: validatePluginManifest, loadPlugin, manifest cross-check patterns
provides:
  - runContractTests() -- ~25 automated contract checks for any connector adapter
  - createTestQuerySpec() -- test helper factory for valid QuerySpec
  - createTestProfile() -- test helper factory for auth profiles
  - createTestSecrets() -- test helper factory for resolved secrets by auth_type
affects: [47-02, 48-built-in-connector-migration, 49-reusable-ci-ecosystem-tooling]

tech-stack:
  added: []
  patterns: [contract test suite pattern with startJsonServer mocks, error-collecting check runner, deep-merge for test fixture overrides]

key-files:
  created:
    - thrunt-god/bin/lib/contract-tests.cjs
    - tests/contract-tests.test.cjs
  modified: []

key-decisions:
  - "Error-collecting pattern: all ~25 checks run to completion, failures aggregated and thrown as single error with failedChecks array"
  - "Adapter validation is a gate: invalid adapters (missing required methods) cause immediate throw before any checks run"
  - "Mock server handler supports both exact 'METHOD /path' matching and prefix matching (path without query string)"
  - "Timeout check uses Promise.race with manual timer rather than SDK withTimeout, avoiding coupling to adapter internals"

patterns-established:
  - "Contract test runner: runContractTests(createAdapter, options) pattern reusable by plugin authors"
  - "Test fixture factories: createTestQuerySpec/Profile/Secrets provide zero-config test setup per auth_type"

requirements-completed: [ECO-03]

duration: 4min
completed: 2026-03-31
---

# Phase 47 Plan 01: Contract Test Suite Summary

**runContractTests() with ~25 automated contract checks validating adapter structure, query prep, execution, normalization, pagination, auth, errors, and optional lifecycle stages using startJsonServer mocks**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T02:43:49Z
- **Completed:** 2026-03-31T02:48:21Z
- **Tasks:** 1 (TDD: RED -> GREEN)
- **Files modified:** 2

## Accomplishments
- Implemented runContractTests() with 25 distinct contract checks across 10 categories (structure, preflight, query prep, execution, normalization, pagination, error handling, auth, optional lifecycle, integration shape)
- Created helper factories createTestQuerySpec, createTestProfile, createTestSecrets covering all 8 auth types
- Built test suite with 22 tests including valid adapter pass-through, broken adapter detection (missing methods, wrong shapes, broken pagination, manifest mismatch), and module coverage verification
- All checks use startJsonServer mocks with zero live service dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests** - `0eea7ef` (test)
2. **Task 1 (GREEN): Implement contract-tests.cjs** - `d4daf1d` (feat)

## Files Created/Modified
- `thrunt-god/bin/lib/contract-tests.cjs` - Contract test suite module with runContractTests and 3 helper factories (510 lines)
- `tests/contract-tests.test.cjs` - Unit tests with 22 test cases covering valid/broken adapters and helper factories (425 lines)

## Decisions Made
- **Error-collecting pattern:** All ~25 checks run to completion rather than failing fast, so plugin authors see all issues at once. Failures are aggregated into a single thrown error with a `failedChecks` array and detailed messages.
- **Adapter validation gate:** If `validateConnectorAdapter()` fails (e.g., missing prepareQuery), the suite throws immediately rather than running checks that would all fail due to missing methods.
- **Mock server routing:** Handler supports both exact `"METHOD /path"` matching and prefix matching (path without query string), providing flexibility for adapters that add query parameters.
- **Timeout check isolation:** Uses Promise.race with manual timer rather than relying on SDK's withTimeout, avoiding coupling the contract check to adapter-internal timeout handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed require path for runtime-fixtures.cjs**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Initial require path `../../tests/runtime-fixtures.cjs` was wrong for the module location at `thrunt-god/bin/lib/`
- **Fix:** Corrected to `../../../tests/runtime-fixtures.cjs`
- **Files modified:** thrunt-god/bin/lib/contract-tests.cjs
- **Verification:** All 22 tests pass
- **Committed in:** d4daf1d (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial path fix, no scope change.

## Issues Encountered
None beyond the auto-fixed path issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- contract-tests.cjs ready for re-export through connector-sdk.cjs and runtime.cjs in Plan 47-02
- cmdDoctorConnectors CLI command can consume runContractTests for per-connector validation
- Plugin authors can import and use runContractTests in their own test files

---
*Phase: 47-contract-test-suite-lifecycle*
*Completed: 2026-03-31*
