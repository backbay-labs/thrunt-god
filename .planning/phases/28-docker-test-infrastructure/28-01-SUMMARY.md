---
phase: 28-docker-test-infrastructure
plan: 01
subsystem: testing
tags: [docker, docker-compose, splunk, elasticsearch, opensearch, integration-testing, node-test]

# Dependency graph
requires:
  - phase: 27-sdk-contract-hardening
    provides: All five connector adapters pass contract validation
provides:
  - Docker-compose infrastructure for Splunk 9.4, Elasticsearch 9.3.2, OpenSearch 2.19.1
  - skipIfNoDocker gate for graceful test skipping
  - Seed data fixtures with security events for entity extraction
  - npm scripts for integration test lifecycle (up/run/down)
  - Integration test runner for tests/integration/*.integration.test.cjs
  - Smoke test proving container health and seed data queryability
affects: [29-splunk-integration, 30-elastic-opensearch-integration]

# Tech tracking
tech-stack:
  added: [docker-compose v3.8]
  patterns: [skipIfNoDocker gate, waitForHealthy poller, seed-then-query integration test pattern]

key-files:
  created:
    - tests/integration/docker-compose.yml
    - tests/integration/helpers.cjs
    - tests/integration/fixtures/seed-data.cjs
    - scripts/run-integration-tests.cjs
    - tests/integration/smoke.integration.test.cjs
  modified:
    - package.json

key-decisions:
  - "Non-standard host ports (18089, 18088, 19200, 19201) to avoid collisions with local services"
  - "Splunk healthcheck polls /services/server/info with basic auth (not just port open) for reliable readiness detection"
  - "Seed events use entity-extraction fields matching ECS (host.name, user.name, source.ip) for Elastic/OpenSearch and Splunk-native fields (host, user, src_ip) for Splunk"

patterns-established:
  - "skipIfNoDocker: every integration test describe block calls skipIfNoDocker(t) first, returning early if Docker unavailable"
  - "waitForHealthy: poll URL with configurable timeout/interval before running assertions against a container"
  - "Integration test isolation: tests/integration/ directory with *.integration.test.cjs suffix, separate runner, not discovered by unit test runner"
  - "Test lifecycle scripts: test:integration:up -> run tests -> test:integration:down with exit code preservation"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 28 Plan 01: Docker Test Infrastructure Summary

**Docker-compose infrastructure with Splunk 9.4, Elasticsearch 9.3.2, and OpenSearch 2.19.1 containers, skipIfNoDocker gate, seed data fixtures, and lifecycle smoke test**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T07:02:26Z
- **Completed:** 2026-03-30T07:07:39Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Docker-compose with 3 SIEM containers, health checks, and non-standard ports to avoid collisions
- skipIfNoDocker gate and waitForHealthy poller for graceful integration test handling
- Seed data with security events containing entity-extraction fields (host, user, IP) across all 3 platforms
- npm scripts for full integration test lifecycle with exit code preservation on failure
- Smoke test proving 6 assertions: 3 health+seed, 3 seed-data-queryable
- Unit tests remain fully isolated (1847 pass, 0 fail, 0 integration tests discovered)

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker-compose, skipIfNoDocker helper, and seed data fixtures** - `f11f366` (feat)
2. **Task 2: NPM scripts, integration test runner, and lifecycle smoke test** - `bac893d` (feat)

## Files Created/Modified
- `tests/integration/docker-compose.yml` - Container definitions for Splunk, Elasticsearch, OpenSearch with health checks
- `tests/integration/helpers.cjs` - skipIfNoDocker gate, waitForHealthy poller, container URL constants
- `tests/integration/fixtures/seed-data.cjs` - seedSplunk, seedElastic, seedOpenSearch functions with security event data
- `scripts/run-integration-tests.cjs` - Integration test runner discovering *.integration.test.cjs files
- `tests/integration/smoke.integration.test.cjs` - 6-assertion smoke test for container health and seed data queryability
- `package.json` - Added test:integration:up, test:integration:down, test:integration scripts

## Decisions Made
- Non-standard host ports (18089, 18088, 19200, 19201) to avoid collisions with local services
- Splunk healthcheck uses basic auth against /services/server/info (not just port check) per research pitfall 11
- Seed events use ECS-compatible dotted fields for Elastic/OpenSearch and Splunk-native flat fields for Splunk
- ES/OpenSearch heap capped at 512m (-Xms512m -Xmx512m) per research pitfall 12 for CI memory safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Docker infrastructure ready for Phase 29 (Splunk integration tests) and Phase 30 (Elastic/OpenSearch integration tests)
- Seed data provides the test corpus for connector round-trip validation
- skipIfNoDocker pattern established for all future integration test files

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (f11f366, bac893d) verified in git log.

---
*Phase: 28-docker-test-infrastructure*
*Completed: 2026-03-30*
