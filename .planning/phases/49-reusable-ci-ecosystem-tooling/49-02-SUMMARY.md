---
phase: 49-reusable-ci-ecosystem-tooling
plan: 02
subsystem: cli
tags: [cli, npm, ecosystem, connector-plugin, documentation, scaffolding]

# Dependency graph
requires:
  - phase: 49-01-reusable-ci-ecosystem-tooling
    provides: Reusable CI workflow and connector plugin starter template directory
  - phase: 46-plugin-manifest-discovery
    provides: plugin-registry.cjs with discoverPlugins, listPlugins API
  - phase: 47-contract-test-suite
    provides: contract-tests.cjs with runContractTests for testing docs
provides:
  - CLI commands for connector ecosystem management (list, search, init)
  - Comprehensive third-party connector development guide (793 lines)
  - Unit tests for all 3 CLI commands and routing
affects: [connector-ecosystem-publishing, third-party-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [scanTemplateDir recursive template discovery, npm search --json for registry queries, parseConnectorArgs reuse for CLI flag parsing]

key-files:
  created:
    - docs/connector-plugin-guide.md
    - tests/connector-cli.test.cjs
  modified:
    - thrunt-god/bin/lib/commands.cjs
    - thrunt-god/bin/thrunt-tools.cjs

key-decisions:
  - "Package.json version read via require('../../../package.json') from commands.cjs location (thrunt-god/bin/lib/)"
  - "Template directory scanned recursively via scanTemplateDir to handle src/ and tests/ subdirectories"
  - "connectors init outputs to thrunt-connector-{id} subdirectory within the target output dir"
  - "--scoped flag toggles between thrunt-connector-{id} and @thrunt/connector-{id} package naming"

patterns-established:
  - "connectors subcommand namespace in thrunt-tools for ecosystem management"
  - "Recursive template directory scanning for flexible template layouts"

requirements-completed: [ECO-05]

# Metrics
duration: 7min
completed: 2026-03-31
---

# Phase 49 Plan 02: Connector CLI Commands & Developer Guide Summary

**Three CLI commands (connectors list/search/init) for ecosystem management plus a 793-line third-party connector development guide covering manifest, adapter interface, SDK API, testing, CI, and publishing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T03:48:34Z
- **Completed:** 2026-03-31T03:56:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 3 CLI commands: `connectors list` shows all 10 built-in + installed plugins with provenance, `connectors search` queries npm registry, `connectors init` scaffolds standalone plugin projects from templates
- Comprehensive 10-section developer guide enabling third-party developers to create, test, CI-integrate, and publish connector plugins
- 13 unit tests covering all commands, input validation, dry-run mode, file generation, routing, and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement connectors list, search, and init CLI commands** - `8f1fa36` (feat)
2. **Task 2: Create third-party connector development guide** - `c3135b2` (docs)

## Files Created/Modified
- `thrunt-god/bin/lib/commands.cjs` - Added cmdConnectorsList, cmdConnectorsSearch, cmdConnectorsInit functions
- `thrunt-god/bin/thrunt-tools.cjs` - Added connectors case routing and help comment entries
- `tests/connector-cli.test.cjs` - 13 unit tests for all connector CLI commands
- `docs/connector-plugin-guide.md` - 793-line comprehensive third-party developer guide

## Decisions Made
- Package.json version read via `require('../../../package.json')` from `thrunt-god/bin/lib/commands.cjs` since root package.json is 3 levels up
- Template directory scanned recursively via `scanTemplateDir` function to handle `src/` and `tests/` subdirectories automatically
- `connectors init` outputs to `thrunt-connector-{id}` subdirectory within the specified output directory (matching npm package naming)
- `--scoped` flag switches package name from `thrunt-connector-{id}` to `@thrunt/connector-{id}` for verified namespace

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed package.json require path**
- **Found during:** Task 1 (cmdConnectorsInit implementation)
- **Issue:** Plan specified `require('../../package.json')` but package.json is at project root, 3 levels up from commands.cjs
- **Fix:** Changed to `require('../../../package.json')`
- **Files modified:** thrunt-god/bin/lib/commands.cjs
- **Verification:** Tests pass, version correctly read as ^0.1.0
- **Committed in:** 8f1fa36 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Path correction necessary for correct SDK version extraction. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 49 complete: all 2 plans delivered
- v2.2 Connector Ecosystem milestone fully complete (Phases 45-49)
- Ecosystem tooling ready: CI workflow, template scaffolding, CLI commands, developer guide
- All 2406 tests passing across the full test suite

---
*Phase: 49-reusable-ci-ecosystem-tooling*
*Completed: 2026-03-31*
