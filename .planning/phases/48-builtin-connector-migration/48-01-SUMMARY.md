---
phase: 48-builtin-connector-migration
plan: 01
subsystem: connectors
tags: [connector-sdk, siem, modular-architecture, barrel-export, splunk, elastic, sentinel, opensearch, defender-xdr]

# Dependency graph
requires:
  - phase: 45-connector-sdk-package
    provides: connector-sdk.cjs with 60 SDK exports used by all adapter factories
  - phase: 47-contract-test-plugin-lifecycle
    provides: contract-tests.cjs, plugin-registry.cjs, runtime.cjs re-exports
provides:
  - 5 individual SIEM connector files under connectors/ (splunk, elastic, sentinel, opensearch, defender-xdr)
  - connectors/index.cjs barrel re-exporting all 5 SIEM adapter factories and parsers
  - runtime.cjs importing from connectors/index.cjs with zero public API change
affects: [48-02-plan, connector-plugin-sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [connector-per-file extraction, barrel re-export pattern, cross-connector parser sharing]

key-files:
  created:
    - thrunt-god/bin/lib/connectors/splunk.cjs
    - thrunt-god/bin/lib/connectors/elastic.cjs
    - thrunt-god/bin/lib/connectors/sentinel.cjs
    - thrunt-god/bin/lib/connectors/opensearch.cjs
    - thrunt-god/bin/lib/connectors/defender-xdr.cjs
    - thrunt-god/bin/lib/connectors/index.cjs
  modified:
    - thrunt-god/bin/lib/runtime.cjs

key-decisions:
  - "normalizeElasticRows shared between elastic.cjs and opensearch.cjs via cross-connector import (opensearch imports from elastic)"
  - "sleep() moved into splunk.cjs as local helper since it was only used by executeSplunkAsyncJob"
  - "decodeMaybeJson kept in runtime.cjs since AWS adapter (still inline) uses it"
  - "SDK destructure in runtime.cjs trimmed to only functions used by remaining 5 inline adapters"

patterns-established:
  - "Connector-per-file: each connector is a self-contained .cjs file requiring only ../connector-sdk.cjs"
  - "Barrel pattern: connectors/index.cjs spreads all individual connector exports for single-import convenience"
  - "Cross-connector sharing: opensearch.cjs imports normalizeElasticRows from elastic.cjs (the one allowed cross-connector import)"

requirements-completed: [ECO-04]

# Metrics
duration: 9min
completed: 2026-03-31
---

# Phase 48 Plan 01: SIEM Connector Extraction Summary

**Extracted 5 SIEM connector adapters (Splunk, Elastic, Sentinel, OpenSearch, Defender XDR) from monolithic runtime.cjs into individual files under connectors/ with barrel re-export and zero API change**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-31T03:09:30Z
- **Completed:** 2026-03-31T03:18:39Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extracted 5 SIEM connector adapters with co-located parsers into individual files (~750 lines moved out of runtime.cjs)
- Created connectors/index.cjs barrel that re-exports all 5 adapter factories and their parser functions
- runtime.cjs now imports SIEM adapters from connectors/index.cjs while keeping 5 remaining adapters (okta, m365, crowdstrike, aws, gcp) inline for Plan 02
- All 83 runtime.cjs exports preserved, all 10 connectors in registry, all 2379 tests pass unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract 5 SIEM connector files with co-located parsers** - `54e1919` (feat)
2. **Task 2: Create barrel file and update runtime.cjs to import from barrel** - `2c68f79` (refactor)

## Files Created/Modified
- `thrunt-god/bin/lib/connectors/splunk.cjs` - Splunk adapter with parseSplunkResultsPayload, executeSplunkAsyncJob, sleep
- `thrunt-god/bin/lib/connectors/elastic.cjs` - Elastic adapter with normalizeElasticRows (shared with opensearch)
- `thrunt-god/bin/lib/connectors/sentinel.cjs` - Sentinel adapter with normalizeAzureTables
- `thrunt-god/bin/lib/connectors/opensearch.cjs` - OpenSearch adapter importing normalizeElasticRows from elastic.cjs
- `thrunt-god/bin/lib/connectors/defender-xdr.cjs` - Defender XDR adapter with normalizeDefenderResults
- `thrunt-god/bin/lib/connectors/index.cjs` - Barrel file re-exporting all 5 SIEM connectors
- `thrunt-god/bin/lib/runtime.cjs` - Removed 670 lines of inline SIEM adapters/parsers, added import from connectors/

## Decisions Made
- normalizeElasticRows is exported from elastic.cjs and imported by opensearch.cjs (cross-connector sharing for column/value format normalization)
- sleep() moved into splunk.cjs as a local function since only executeSplunkAsyncJob used it
- decodeMaybeJson kept inline in runtime.cjs since the AWS adapter (still inline, Plan 02) uses it
- SDK destructure in runtime.cjs reduced from 26 to 13 functions (only what remaining inline adapters need)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- connectors/ directory established with 5 SIEM adapters, ready for Plan 02 to extract remaining 5 (okta, m365, crowdstrike, aws, gcp)
- Barrel pattern established for Plan 02 to extend with additional connector requires
- decodeMaybeJson ready to move with AWS adapter in Plan 02
- createBuiltInConnectorRegistry stays in runtime.cjs until Plan 02 moves it into the barrel

## Self-Check: PASSED

- All 7 files verified present on disk
- Commits 54e1919 and 2c68f79 verified in git log
- 83 exports confirmed from runtime.cjs
- 10 connectors confirmed in registry
- 2379 tests pass (0 failures)

---
*Phase: 48-builtin-connector-migration*
*Completed: 2026-03-31*
