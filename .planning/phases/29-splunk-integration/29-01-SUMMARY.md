---
phase: 29-splunk-integration
plan: 01
subsystem: connectors
tags: [splunk, async-job, integration-test, bearer-token, docker, siem]

# Dependency graph
requires:
  - phase: 28-docker-test-infrastructure
    provides: Docker compose, skipIfNoDocker, waitForHealthy, seedSplunk helpers
  - phase: 27-connector-surfaces
    provides: createSplunkAdapter, executeQuerySpec, parseSplunkResultsPayload
provides:
  - Splunk async job fallback (create/poll/results) triggered by HTTP 504
  - createSplunkBearerToken helper for integration test auth bootstrap
  - Docker-based Splunk integration test with entity extraction validation
affects: [30-elastic-opensearch-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-job-fallback-on-504, bearer-token-bootstrap-via-rest, integration-test-with-docker]

key-files:
  created:
    - tests/integration/splunk.integration.test.cjs
  modified:
    - thrunt-god/bin/lib/runtime.cjs
    - tests/connectors-siem.test.cjs
    - tests/integration/helpers.cjs

key-decisions:
  - "executeSplunkAsyncJob catches 504 inside adapter executeRequest rather than relying on outer retry loop"
  - "Async job poll uses options.sleep injection for zero-delay unit tests"
  - "Bearer token bootstrapped via /services/authorization/tokens with static token type"
  - "Integration test folds metadata assertions into adapter round-trip test to avoid test coupling"

patterns-established:
  - "Async job fallback: adapter catches specific HTTP status, falls back to alternate API path internally"
  - "Response tagging: __splunk_async flag on response object for normalizeResponse metadata branching"
  - "Token bootstrap: createSplunkBearerToken helper reusable across integration tests"

requirements-completed: [INTG-01, CONN-06]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 29 Plan 01: Splunk Integration Summary

**Splunk async job fallback on HTTP 504 with Docker-based integration test bootstrapping bearer tokens and validating entity extraction against live Splunk data**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T07:23:02Z
- **Completed:** 2026-03-30T07:28:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Splunk adapter catches HTTP 504 from export endpoint and falls back to async job path (POST create, GET poll, GET results)
- Unit test proves fallback triggers on 504, exercises all 4 HTTP requests, validates entity extraction and metadata.endpoint
- Integration test bootstraps bearer token from Splunk REST API, executes real SPL query through full adapter pipeline
- All 1848 unit tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Splunk async job fallback in adapter + unit test**
   - `42ad92c` (test: failing test for async job fallback)
   - `c1e9eca` (feat: implement Splunk async job fallback)
2. **Task 2: Splunk Docker integration test with bearer token bootstrap** - `4ab7337` (feat)

_Note: Task 1 used TDD flow with separate RED and GREEN commits_

## Files Created/Modified
- `thrunt-god/bin/lib/runtime.cjs` - Added executeSplunkAsyncJob function and async fallback in executeRequest
- `tests/connectors-siem.test.cjs` - Added unit test for async job fallback triggered by HTTP 504
- `tests/integration/splunk.integration.test.cjs` - New Docker integration test with bearer token + entity extraction
- `tests/integration/helpers.cjs` - Added createSplunkBearerToken helper function

## Decisions Made
- Async job fallback catches 504 inside adapter's executeRequest to prevent the outer retry loop from retrying the export endpoint repeatedly
- Response object tagged with `__splunk_async = true` flag so normalizeResponse can set correct metadata.endpoint without additional parameters
- Poll loop uses `options.sleep` injection (falls back to 2-second real sleep) for zero-delay unit testing
- Bearer token created via `/services/authorization/tokens` with `type=static` for integration test persistence across requests
- Integration test metadata assertions folded into the adapter round-trip test rather than a separate coupled test

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Splunk connector is production-ready with async job fallback for long-running queries
- Integration test infrastructure from Phase 28 proven working for Splunk
- Same pattern (bearer token bootstrap, entity extraction validation) ready for Elastic/OpenSearch in Phase 30
- Blocker from STATE.md resolved: Splunk token creation bootstrap sequence validated

## Self-Check: PASSED

All 5 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 29-splunk-integration*
*Completed: 2026-03-30*
