---
phase: 32-integration-test-ci-pack-validation
plan: 01
subsystem: testing
tags: [github-actions, docker-compose, splunk, elasticsearch, opensearch, pack-validation, ci]

# Dependency graph
requires:
  - phase: 31-core-ci-pipeline
    provides: SHA-pinned action versions, concurrency pattern, test.yml structure reference

provides:
  - Docker-based SIEM integration test CI (integration.yml)
  - Pack validation gate for all PRs (pack-validation.yml)
  - Pack registry iteration script with JSON report (validate-all-packs.cjs)
  - Reusable workflow template for third-party pack repos (reusable-pack-test.yml)

affects:
  - 33-sdk-export-surface
  - 34-connector-scaffolding
  - third-party pack repo consumers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SHA-pinned GitHub Actions (checkout@de0fac2e..., setup-node@53b83947...) across all workflows"
    - "docker compose up -d --wait for deterministic container readiness in CI"
    - "Separate timeout-minutes on job (20) and container startup step (8) for SIEM workflows"
    - "loadPackRegistry() for dynamic pack discovery in validation scripts"
    - "Pack validation report as JSON artifact with 30-day retention for audit trail"
    - "workflow_call with typed inputs for reusable workflows"

key-files:
  created:
    - .github/workflows/integration.yml
    - .github/workflows/pack-validation.yml
    - .github/workflows/reusable-pack-test.yml
    - scripts/validate-all-packs.cjs
  modified: []

key-decisions:
  - "Push triggers on pack-validation.yml use path filters (thrunt-god/packs/**, pack.cjs, runtime.cjs, tests/pack*.test.cjs) but pull_request trigger runs on all PRs to main without filters"
  - "Integration workflow uses fail-fast: false so all three SIEM adapters are tested even when one fails"
  - "Reusable workflow uses SHA-pinned actions (matching test.yml) rather than @v4 floating tags from research spec"
  - "Container startup gets its own timeout-minutes: 8 separate from the job-level timeout-minutes: 20"
  - "validate-all-packs.cjs uses loadPackRegistry() for dynamic discovery rather than a hardcoded list"

patterns-established:
  - "Workflow concurrency: group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }} cancel-in-progress: true"
  - "Failure artifact capture: collect logs with if: failure(), upload with retention-days"
  - "Always teardown: if: always() on docker compose down -v"

requirements-completed: [CI-02]

# Metrics
duration: 2min
completed: 2026-03-30
---

# Phase 32 Plan 01: Integration Test CI & Pack Validation Summary

**Docker-based SIEM integration tests (Splunk 9.4, ES 8.17.0, OpenSearch 2.19.1) and a pack validation gate added to CI via three new GitHub Actions workflows and a registry-driven validation script**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T18:57:12Z
- **Completed:** 2026-03-30T18:59:04Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `integration.yml` provisions all three SIEMs via docker-compose in CI, captures logs on failure, and tears down with `if: always()`
- `pack-validation.yml` gates every PR on pack lint, bootstrap/render validation of all 16 packs, and three pack unit test files
- `validate-all-packs.cjs` dynamically discovers all packs via `loadPackRegistry()`, produces a JSON report, and exits non-zero on any failure
- `reusable-pack-test.yml` enables third-party pack repos to validate against THRUNT GOD via `workflow_call` with configurable version, Node, and packs directory

## Task Commits

Each task was committed atomically:

1. **Task 1: Create integration.yml** - `e56f7c2` (feat)
2. **Task 2: Create validate-all-packs.cjs and pack-validation.yml** - `30075ff` (feat)
3. **Task 3: Create reusable-pack-test.yml** - `b0915a1` (feat)

## Files Created/Modified
- `.github/workflows/integration.yml` - Docker-based SIEM integration test CI with 20-min timeout, 8-min container startup, log capture on failure
- `.github/workflows/pack-validation.yml` - Pack validation gate running lint, bootstrap/render, and unit tests; path-filtered push, all-PR pull_request
- `.github/workflows/reusable-pack-test.yml` - Reusable workflow_call template for third-party pack repos with three typed inputs
- `scripts/validate-all-packs.cjs` - Pack registry iteration script producing pack-validation-report.json with {timestamp, total, passed, failed, packs}

## Decisions Made
- Push triggers on pack-validation.yml use path filters but pull_request trigger runs on all PRs — ensures no pack regression slips through any PR regardless of which files changed
- SHA-pinned actions used in reusable-pack-test.yml (matching test.yml pattern) rather than floating @v4 tags from research spec — pins against supply chain attack surface
- Integration workflow uses `fail-fast: false` — all three SIEM adapters tested even when one fails, giving complete failure picture per run

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All CI gates are active: unit tests (Phase 31), integration tests, and pack validation all gated on PRs
- Phase 33 (SDK Export Surface) can begin — CI will catch any regressions introduced during SDK work
- Third-party pack repo consumers can reference reusable-pack-test.yml immediately

## Self-Check: PASSED

All files and commits verified:
- FOUND: .github/workflows/integration.yml
- FOUND: .github/workflows/pack-validation.yml
- FOUND: .github/workflows/reusable-pack-test.yml
- FOUND: scripts/validate-all-packs.cjs
- FOUND: .planning/phases/32-integration-test-ci-pack-validation/32-01-SUMMARY.md
- FOUND commit e56f7c2 (Task 1)
- FOUND commit 30075ff (Task 2)
- FOUND commit b0915a1 (Task 3)

---
*Phase: 32-integration-test-ci-pack-validation*
*Completed: 2026-03-30*
