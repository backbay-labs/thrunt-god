---
phase: 07-extension-scaffold-and-build-infrastructure
plan: 02
subsystem: testing
tags: [node-test, vscode-test-cli, esbuild, smoke-test, cjs-bundle, mocha]

# Dependency graph
requires:
  - phase: 07-01
    provides: Extension scaffold with activate/deactivate exports and constants module
provides:
  - Three-tier test harness (unit via node:test, integration via @vscode/test-cli, smoke via require check)
  - CI smoke test validating CJS bundle loads and exports (BUILD-03)
  - Unit tests for extension exports and constants values (BUILD-05)
  - Integration test scaffold with .vscode-test.mjs config and hunt workspace fixture
  - Lightweight vscode mock for Node.js test execution
affects: [08-data-layer, 09-native-ui, 10-diagnostics, 11-webview]

# Tech tracking
tech-stack:
  added: ["@vscode/test-cli ^0.0.12", "@vscode/test-electron ^2.4.1", "esbuild-register ^3.6.0"]
  patterns: [three-tier-test-harness, vscode-mock-for-unit-tests, cjs-smoke-test, node-test-runner]

key-files:
  created:
    - thrunt-god-vscode/test/unit/extension.test.cjs
    - thrunt-god-vscode/test/unit/constants.test.cjs
    - thrunt-god-vscode/test/_setup/vscode-mock.cjs
    - thrunt-god-vscode/test/smoke.cjs
    - thrunt-god-vscode/test/integration/activation.test.ts
    - thrunt-god-vscode/.vscode-test.mjs
    - thrunt-god-vscode/tsconfig.test.json
    - thrunt-god-vscode/test/fixtures/sample-hunt/.hunt/MISSION.md
  modified:
    - thrunt-god-vscode/package.json

key-decisions:
  - "Unit tests use .cjs files testing built CJS bundle via require() rather than .ts files requiring a TypeScript loader"
  - "Lightweight vscode mock injected via Module._resolveFilename for Node.js test execution without VS Code runtime"
  - "Constants tested by building constants.ts to a standalone CJS module via esbuild at test time"

patterns-established:
  - "Three-tier test pattern: unit (node:test + CJS), integration (@vscode/test-cli + Mocha), smoke (require check)"
  - "vscode-mock.cjs pattern: register mock in Module cache before requiring the extension bundle"
  - "pretest hooks ensure build is current before running unit and smoke tests"

requirements-completed: [BUILD-03, BUILD-05]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 7 Plan 2: Test Harness Summary

**Three-tier test harness with 11 passing unit tests, CI smoke test validating CJS bundle, and integration scaffold for VS Code API tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T14:32:47Z
- **Completed:** 2026-04-02T14:36:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- 11 unit tests passing via node:test validating extension exports (activate, deactivate) and constants (HUNT_MARKERS, HUNT_DIRS, OUTPUT_CHANNEL_NAME, COMMAND_PREFIX)
- CI smoke test (BUILD-03) validates CJS bundle loads, exports are functions, deactivate() does not throw
- Integration test scaffold with @vscode/test-cli config, Mocha-style activation tests, and sample hunt workspace fixture
- Lightweight vscode mock enabling require() of the built bundle in plain Node.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unit tests (node:test) for extension exports and constants** - `8885a18` (test)
2. **Task 2: Create CI smoke test, integration test scaffold, and .vscode-test config** - `9dabd37` (test)

## Files Created/Modified
- `thrunt-god-vscode/test/_setup/vscode-mock.cjs` - Minimal vscode API mock for Node.js test execution
- `thrunt-god-vscode/test/unit/extension.test.cjs` - Unit tests for activate/deactivate exports from CJS bundle
- `thrunt-god-vscode/test/unit/constants.test.cjs` - Unit tests for HUNT_MARKERS, HUNT_DIRS, OUTPUT_CHANNEL_NAME, COMMAND_PREFIX
- `thrunt-god-vscode/test/smoke.cjs` - CI smoke test (BUILD-03) validating CJS bundle loads and exports
- `thrunt-god-vscode/test/integration/activation.test.ts` - Mocha-style integration test scaffold for VS Code activation
- `thrunt-god-vscode/.vscode-test.mjs` - @vscode/test-cli configuration with hunt workspace fixture
- `thrunt-god-vscode/test/fixtures/sample-hunt/.hunt/MISSION.md` - Test fixture for integration test workspace
- `thrunt-god-vscode/tsconfig.test.json` - TypeScript config for test files extending main tsconfig
- `thrunt-god-vscode/package.json` - Added test scripts and devDependencies

## Decisions Made
- Unit tests use `.cjs` files testing the built CJS bundle via `require()` instead of `.ts` files. This matches the existing CLI test pattern, avoids needing a TypeScript loader for unit tests, and tests the actual build artifact.
- Created a lightweight vscode mock (`test/_setup/vscode-mock.cjs`) that injects into Node's module cache via `Module._resolveFilename`. This enables `require('vscode')` to resolve in plain Node.js without the VS Code runtime.
- Constants are tested by building `constants.ts` to a standalone CJS module via esbuild at test time, rather than testing the source or extracting from the bundle. This verifies the build pipeline produces correct values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vscode mock for Node.js test execution**
- **Found during:** Task 1 (unit test creation)
- **Issue:** The built CJS bundle requires 'vscode' at the top level, which fails in plain Node.js. Plan didn't account for this (unit tests and smoke test cannot `require('./dist/extension.js')` without a vscode module).
- **Fix:** Created `test/_setup/vscode-mock.cjs` that registers a minimal vscode API stub in Node's module cache. Used `--require` in the test:unit script to load it before tests.
- **Files modified:** thrunt-god-vscode/test/_setup/vscode-mock.cjs, thrunt-god-vscode/package.json (test:unit script)
- **Verification:** `npm run test:unit` and `npm run test:smoke` both pass with the mock
- **Committed in:** 8885a18 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for correctness -- without the vscode mock, no test tier can require the bundle outside VS Code. No scope creep.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Test harness is fully operational for all future phases to add tests at the appropriate tier
- Unit tests for new modules: add `.test.cjs` files to `test/unit/` using `node:test`
- Integration tests for VS Code API features: add `.test.ts` files to `test/integration/` using Mocha-style `suite/test`
- Phase 08 (data layer) can immediately add unit tests for parsers and data models
- Integration tests will need Xvfb or similar for headless CI -- this is a future concern

---
## Self-Check: PASSED

All 8 created files verified present on disk. Both task commits (8885a18, 9dabd37) verified in git log.

---
*Phase: 07-extension-scaffold-and-build-infrastructure*
*Completed: 2026-04-02*
