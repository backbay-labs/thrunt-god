---
phase: 12-connector-certification-live-readiness
plan: 01
subsystem: runtime-certification
tags:
  - runtime
  - connectors
  - certification
  - smoke-test
  - readiness
provides:
  - runtime doctor readiness scoring
  - runtime smoke live certification queries
  - profile-defined connector smoke specs
affects:
  - connector onboarding workflow
  - operator trust in live hunts
  - later evidence-integrity phases
tech-stack:
  added: []
  patterns:
    - connector certification extends the shared runtime instead of creating a parallel harness
    - profile-defined smoke specs let backend-specific safe queries stay local-first and operator-controlled
key-files:
  created:
    - .planning/phases/12-connector-certification-live-readiness/12-CONTEXT.md
    - .planning/phases/12-connector-certification-live-readiness/12-01-PLAN.md
  modified:
    - thrunt-god/bin/lib/runtime.cjs
    - thrunt-god/bin/lib/commands.cjs
    - thrunt-god/bin/thrunt-tools.cjs
    - docs/COMMANDS.md
    - docs/CONFIGURATION.md
    - docs/ARCHITECTURE.md
    - docs/FEATURES.md
    - commands/hunt/run.md
    - tests/runtime-contract.test.cjs
    - tests/runtime-doctor.test.cjs
    - tests/docs-contract.test.cjs
key-decisions:
  - `runtime doctor` stays safe by default and only runs live smoke checks when `--live` is requested.
  - `runtime smoke` runs read-only live checks without writing normal hunt query-log or receipt artifacts.
  - Readiness scoring is only considered live-verified when a real smoke execution succeeds.
patterns-established:
  - readiness reports combine static config checks with optional live backend verification
  - smoke-spec precedence is CLI override, then profile-defined config, then built-in safe defaults
hypotheses-completed:
  - HYP-01
duration: 1 session
completed: 2026-03-25
---

# Phase 12: Connector Certification & Live Readiness Summary

**Added a real connector certification layer.** THRUNT can now score connector readiness, run live read-only smoke queries, and let operators define safe profile-local smoke tests for backends like Elastic that should not ship a hardcoded probe.

## Performance
- **Duration:** 1 implementation slice
- **Tasks:** 3/3 complete
- **Files modified:** 11

## Accomplishments
- Added runtime readiness scoring with per-check detail for adapter registration, profile validity, auth material, preflight readiness, smoke spec availability, and live smoke status.
- Added `runtime doctor` and `runtime smoke` command surfaces to certify connectors before live hunts.
- Added built-in safe smoke coverage where appropriate and profile-defined `smoke_test` support where operators need backend-specific control.
- Documented the certification workflow across command, configuration, architecture, feature, and hunt-run docs.
- Added regression coverage that proves static readiness, live Okta certification, and profile-defined Elastic smoke specs end to end.

## Files Created/Modified
- `thrunt-god/bin/lib/runtime.cjs` - readiness scoring, smoke-spec resolution, and live smoke execution
- `thrunt-god/bin/lib/commands.cjs` - runtime doctor/smoke command handlers and boolean flag parsing
- `thrunt-god/bin/thrunt-tools.cjs` - CLI routing and help text for certification commands
- `docs/COMMANDS.md` - operator docs for doctor and smoke commands
- `docs/CONFIGURATION.md` - `smoke_test` profile contract and usage examples
- `docs/ARCHITECTURE.md` - certification/readiness model in the runtime architecture
- `docs/FEATURES.md` - product-surface description of certification and readiness scoring
- `commands/hunt/run.md` - onboarding/debugging guidance pointing to certification commands
- `tests/runtime-contract.test.cjs` - runtime contract coverage for smoke-spec resolution
- `tests/runtime-doctor.test.cjs` - command-level live certification coverage
- `tests/docs-contract.test.cjs` - public-doc contract coverage for certification

## Decisions & Deviations
This phase was inserted ahead of evidence-manifest work because evidence trust is weak if the repo cannot first prove connector readiness against real backends. The new certification layer is intentionally local-first and operational: connectors are only live-verified after a real smoke query succeeds.

## Self-Check
- Operators can certify connectors before running a real hunt.
- Connectors without shipped smoke queries can still participate through profile-defined smoke specs.
- The public contract is protected by docs tests, not just implementation behavior.

## Next Phase Readiness
Phase 13 is now the right next step. With runtime trust and live certification in place, receipt-manifest canonicalization can build on a more defensible execution substrate.
