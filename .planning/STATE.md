---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Developer Experience & CI
status: completed
stopped_at: Completed 37-02-PLAN.md
last_updated: "2026-03-30T21:40:16.804Z"
last_activity: 2026-03-30 -- Completed 37-02 Pack Promote, Registry Extension & Comprehensive Tests
progress:
  total_phases: 19
  completed_phases: 7
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v2.0 Developer Experience & CI — Phase 37 (Pack Testing & Publishing)

## Current Milestone: v2.0 Developer Experience & CI

**Goal:** Ship CI/CD pipeline, connector scaffolding CLI, and pack authoring tools to accelerate development velocity and enable third-party contributions.

## Current Position

Phase: 37 of 37 (Pack Testing & Publishing)
Plan: 2 of 2 (Pack Promote, Registry Extension & Comprehensive Tests)
Status: Complete
Last activity: 2026-03-30 -- Completed 37-02 Pack Promote, Registry Extension & Comprehensive Tests

Progress: [██████████] 100% (13/13 plans complete)

## Upcoming Milestones

| Milestone | Phases | Status | Research |
|-----------|--------|--------|----------|
| v2.0 Developer Experience & CI | 31-37 | Active | cicd-pipeline-spec.md, thrunt-init-spec.md, pack-authoring-cli-spec.md |
| v2.1 Advanced Hunt Features | 38-44 | Planned | hunt-replay-spec.md, multi-tenant-coordination-spec.md |
| v2.2 Connector Ecosystem | 45-49 | Planned | connector-plugin-sdk-spec.md |

## Performance Metrics

**Velocity (v1.6 baseline):**
- Average plan duration: 4min
- Average plans per phase: 1.5

## Accumulated Context

### Decisions

All historical decisions logged in PROJECT.md Key Decisions table.
- [Phase 31-core-ci-pipeline]: CI-INLINE-LCOV: Inline c8 command in CI rather than modifying test:coverage npm script — lcov reporter is CI-only; local dev does not need lcov files on every run
- [Phase 32-integration-test-ci-pack-validation]: REUSABLE-SHA-PIN: SHA-pinned actions in reusable-pack-test.yml rather than floating @v4 tags — consistent with test.yml, reduces supply chain risk
- [Phase 32-integration-test-ci-pack-validation]: PACK-VALIDATION-PR-FILTER: pack-validation.yml uses path filters on push but not on pull_request, ensuring all PRs get pack gate regardless of which files changed
- [Phase 33-sdk-export-surface]: EXPORT-COUNT-43: Pre-existing module.exports had 43 symbols (not 32 as plan interface doc stated); Phase 33 brings total to 61
- [Phase 34-connector-scaffolding-cli]: TMPL-NO-DEPS: Plain {{VARIABLE}} substitution — no third-party template library (Handlebars/EJS/Mustache). Zero new dependencies.
- [Phase 34-connector-scaffolding-cli]: ADAPTER-STANDALONE: Generated adapters are standalone .cjs files in connectors/ directory — scaffolder prints registration instructions rather than auto-patching runtime.cjs
- [Phase 34-connector-scaffolding-cli]: PORT-AUTOSCAN: Docker host port auto-assigned by scanning docker-compose.yml for highest 19xxx port and incrementing; starts from 19300 if no 19xxx ports exist
- [Phase 34-connector-scaffolding-cli]: SUBPROCESS-TESTING: Test cmdInitConnector via execFileSync subprocess rather than direct function call — tests full CLI dispatch path
- [Phase 34-connector-scaffolding-cli]: INLINE-TEMPLATE-TEST: Reimplemented renderTemplate algorithm inline in test file since it is not exported from commands.cjs
- [Phase 35-pack-authoring-interactive-cli]: BUNDLED-JSON: Ship 160-technique bundled JSON extract rather than runtime STIX fetch -- zero network dependency for CLI
- [Phase 35-pack-authoring-interactive-cli]: DUPLICATE-DEDUP: Removed duplicate T1548 entry during data bundle creation -- kept the version with sub-techniques
- [Phase 35]: READLINE-PROMISES: Used node:readline/promises for async interactive prompts, consistent with cmdInitConnector pattern
- [Phase 35]: PARTIAL-VALIDATION: Non-interactive mode uses requireComplete:false since scaffolds need manual editing
- [Phase 35]: COMBINED-REGRESSION-GUARDS: Included regression guard tests (cmdPackCreate export, circular dependency, DATASET_KINDS) directly in main test file rather than separate file
- [Phase 36-pack-query-wiring-validation]: HARDCODED-ENTITY-KINDS: Entity scope types hardcoded from reviewed runtime extraction list rather than dynamically importing runtime.cjs -- keeps module independently testable
- [Phase 36]: STARTER-PREFILL: Pre-fill query lines array from starter template rather than replacing prompt -- user can extend starter content
- [Phase 36]: ENTITY-STEP-7B: Entity type selection added as Step 7b within stepTelemetry rather than a separate step function -- keeps 8-step flow structure intact
- [Phase 36]: SUITE-NUMBERING-CONTIGUOUS: Numbered new test suites 11-16 contiguously following existing suites 1-10 in the test file
- [Phase 37]: CANONICAL-FOLDER-FN: Consolidated getPackFolderForKind into pack.cjs as single source of truth, re-exported from pack-author.cjs for backward compatibility
- [Phase 37]: SCHEMA-ALWAYS-VALIDATE: cmdPackTest now always runs schema validation even in non-validate-only mode, surfacing warnings alongside errors
- [Phase 37]: PACK-PROMOTE-COPY: Promote copies pack JSON to built-in directory rather than moving -- source local pack preserved for continued development
- [Phase 37]: REGISTRY-WARNINGS-ARRAY: loadPackRegistry returns warnings array as additional property -- backward compatible, existing callers unaffected
- [Phase 37]: GIT-REGISTRY-STUB: Git-based pack_registries emit clear warning rather than failing silently -- actionable guidance to clone and use local type

### Research Specs Available

Each phase has a reviewed+corrected research spec in `.planning/research/`:
- `cicd-pipeline-spec.md` — Phases 31-32 (CI/CD)
- `thrunt-init-spec.md` — Phases 33-34 (SDK exports + connector scaffolding)
- `pack-authoring-cli-spec.md` — Phases 35-37 (pack authoring)
- `hunt-replay-spec.md` — Phases 38-41 (replay engine)
- `multi-tenant-coordination-spec.md` — Phases 42-44 (multi-tenant)
- `connector-plugin-sdk-spec.md` — Phases 45-49 (ecosystem)

Review reports in `.planning/research/reviews/` document corrections applied.

### Critical Prerequisites

- Phase 33 (SDK Export Surface) MUST complete before Phase 34 (Connector Scaffolding) — generated adapter files need exported functions
- Phase 45 (@thrunt/connector-sdk) should reference Phase 33's export decisions
- v2.0 CI pipeline should be active before v2.1/v2.2 development begins

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-30T21:40:16.798Z
Stopped at: Completed 37-02-PLAN.md
Resume file: None
