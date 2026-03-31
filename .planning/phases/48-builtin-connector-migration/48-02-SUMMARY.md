---
phase: 48-builtin-connector-migration
plan: 02
subsystem: connectors
tags: [connector-sdk, okta, m365, crowdstrike, aws, gcp, modular-architecture, barrel-export]

# Dependency graph
requires:
  - phase: 48-builtin-connector-migration
    plan: 01
    provides: connectors/ directory with 5 SIEM adapters, barrel index, established extraction pattern
  - phase: 45-connector-sdk-package
    provides: connector-sdk.cjs with 60 SDK exports used by all adapter factories
  - phase: 47-contract-test-plugin-lifecycle
    provides: contract-tests.cjs runContractTests for per-adapter validation
provides:
  - 5 additional connector files (okta, m365, crowdstrike, aws, gcp) under connectors/
  - Finalized barrel (connectors/index.cjs) with createBuiltInConnectorRegistry and all 10 adapters
  - runtime.cjs reduced to 50-line thin re-export wrapper with zero adapter code
affects: [49-ecosystem-tooling, connector-plugin-sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [complete connector-per-file extraction, barrel-owns-registry pattern]

key-files:
  created:
    - thrunt-god/bin/lib/connectors/okta.cjs
    - thrunt-god/bin/lib/connectors/m365.cjs
    - thrunt-god/bin/lib/connectors/crowdstrike.cjs
    - thrunt-god/bin/lib/connectors/aws.cjs
    - thrunt-god/bin/lib/connectors/gcp.cjs
  modified:
    - thrunt-god/bin/lib/connectors/index.cjs
    - thrunt-god/bin/lib/runtime.cjs

key-decisions:
  - "decodeMaybeJson moved into aws.cjs as local helper (only used by CloudTrailEvent parsing)"
  - "createBuiltInConnectorRegistry moved from runtime.cjs into connectors/index.cjs barrel"
  - "aws.cjs needs isPlainObject from SDK despite plan omission (used in .filter(isPlainObject))"
  - "runtime.cjs reduced to pure spread/re-export -- no SDK destructure, no helpers, no factories"

patterns-established:
  - "Registry-in-barrel: createBuiltInConnectorRegistry lives in connectors/index.cjs, not runtime.cjs"
  - "Zero-adapter runtime: runtime.cjs is purely re-exports, all adapter logic in individual connector files"

requirements-completed: [ECO-04]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 48 Plan 02: Remaining Connector Extraction Summary

**Extracted 5 remaining connectors (Okta, M365, CrowdStrike, AWS, GCP), moved createBuiltInConnectorRegistry into barrel, and reduced runtime.cjs to 50-line thin wrapper with zero adapter definitions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T03:22:30Z
- **Completed:** 2026-03-31T03:27:30Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Extracted 5 remaining connector adapters (okta, m365, crowdstrike, aws, gcp) to individual files under connectors/
- Moved createBuiltInConnectorRegistry from runtime.cjs into connectors/index.cjs barrel with all 10 adapter imports
- Reduced runtime.cjs from 574 lines to 50 lines -- pure re-export wrapper with zero adapter code
- All 83 exports preserved, all 10 connectors in registry, all 2379 tests pass unchanged
- All 10 connectors pass runContractTests individually when loaded from their connector files

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract 5 remaining connectors and move decodeMaybeJson** - `94f073d` (feat)
2. **Task 2: Finalize barrel file with all 10 connectors and reduce runtime.cjs to re-export wrapper** - `3570ac2` (refactor)
3. **Task 3: Validate each connector passes runContractTests individually** - validation-only (no files changed)

## Files Created/Modified
- `thrunt-god/bin/lib/connectors/okta.cjs` - Okta System Log adapter with parseLinkHeader pagination (104 lines)
- `thrunt-god/bin/lib/connectors/m365.cjs` - Microsoft 365 Graph Security adapter for sign-ins and alerts (134 lines)
- `thrunt-god/bin/lib/connectors/crowdstrike.cjs` - CrowdStrike Falcon Alerts adapter with FQL queries (95 lines)
- `thrunt-god/bin/lib/connectors/aws.cjs` - AWS CloudTrail LookupEvents adapter with co-located decodeMaybeJson helper (119 lines)
- `thrunt-god/bin/lib/connectors/gcp.cjs` - GCP Cloud Logging entries.list adapter (101 lines)
- `thrunt-god/bin/lib/connectors/index.cjs` - Finalized barrel with all 10 adapter imports and createBuiltInConnectorRegistry (34 lines)
- `thrunt-god/bin/lib/runtime.cjs` - Thin re-export wrapper with zero adapter definitions (50 lines)

## Decisions Made
- decodeMaybeJson moved into aws.cjs as a local function since it is only used by the AWS adapter's CloudTrailEvent JSON parsing
- createBuiltInConnectorRegistry moved from runtime.cjs into connectors/index.cjs so the barrel owns the registry construction
- Added missing isPlainObject to aws.cjs SDK destructure -- the plan's interface spec omitted it but the adapter code uses `.filter(isPlainObject)` on CloudTrail Events

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing isPlainObject to aws.cjs SDK destructure**
- **Found during:** Task 2 (barrel finalization and verification)
- **Issue:** Plan's SDK import list for AWS adapter omitted isPlainObject, but the adapter's normalizeResponse uses `.filter(isPlainObject)` on the Events array
- **Fix:** Added isPlainObject to the destructured SDK imports in aws.cjs
- **Files modified:** thrunt-god/bin/lib/connectors/aws.cjs
- **Verification:** All contract tests pass, all 2379 tests pass
- **Committed in:** 3570ac2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 10 built-in connectors now live in individual files under connectors/ (11 .cjs files total including barrel)
- runtime.cjs is a pure re-export wrapper suitable for eventual deprecation
- Each connector file is self-contained with only connector-sdk.cjs dependency, suitable for future standalone publication
- Phase 48 (Built-in Connector Migration) complete -- ready for Phase 49 (Ecosystem Tooling)

## Self-Check: PASSED

- All 7 files verified present on disk
- Commits 94f073d and 3570ac2 verified in git log
- 83 exports confirmed from runtime.cjs
- 10 connectors confirmed in registry (aws, crowdstrike, defender_xdr, elastic, gcp, m365, okta, opensearch, sentinel, splunk)
- All 10 connectors pass runContractTests individually
- 2379 tests pass (0 failures)

---
*Phase: 48-builtin-connector-migration*
*Completed: 2026-03-31*
