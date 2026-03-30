---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Developer Experience & CI
status: Not started — needs discuss -> plan -> execute
stopped_at: Completed 34-02-PLAN.md
last_updated: "2026-03-30T19:47:46Z"
last_activity: 2026-03-30 -- Activated v2.0/v2.1/v2.2 milestones from research specs
progress:
  total_phases: 19
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v2.0 Developer Experience & CI — Phase 31 (Core CI Pipeline)

## Current Milestone: v2.0 Developer Experience & CI

**Goal:** Ship CI/CD pipeline, connector scaffolding CLI, and pack authoring tools to accelerate development velocity and enable third-party contributions.

## Current Position

Phase: 31 of 37 (Core CI Pipeline)
Plan: 0 of 0 (not yet planned)
Status: Not started — needs discuss -> plan -> execute
Last activity: 2026-03-30 -- Activated v2.0/v2.1/v2.2 milestones from research specs

Progress: [..........] 0% (v2.0 not started)

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

Last session: 2026-03-30T19:47:46Z
Stopped at: Completed 34-02-PLAN.md
Resume file: None
