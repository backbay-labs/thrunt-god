---
phase: 41-replay-diffing-receipt-lineage
plan: 01
subsystem: replay
tags: [diff, lineage, telemetry, evidence, manifest, replay-engine]

requires:
  - phase: 38-replay-engine-core
    provides: ReplaySpec schema, source resolution, mutation application
  - phase: 40-source-retargeting-ioc-injection
    provides: IOC injection, pack retargeting, per-language query rewriters
provides:
  - buildDiff() entity-level diff engine with full/counts_only/entities_only modes
  - Lineage rendering in buildReceiptDocument and buildQueryLogDocument
  - Optional lineage field in createEvidenceManifest
  - replay_context in recordHuntExecution, new recordReplayExecution function
  - 24 new tests covering diff, lineage, manifest, and telemetry extensions
affects: [41-02, replay-cli-commands, evidence-pipeline]

tech-stack:
  added: []
  patterns: [entity-set-diff-by-composite-key, optional-lineage-rendering, replay-telemetry-records]

key-files:
  created: []
  modified:
    - thrunt-god/bin/lib/replay.cjs
    - thrunt-god/bin/lib/evidence.cjs
    - thrunt-god/bin/lib/manifest.cjs
    - thrunt-god/bin/lib/telemetry.cjs
    - tests/replay.test.cjs

key-decisions:
  - "ENTITY-SET-COMPOSITE-KEY: Entity comparison uses Set of kind:value composite keys for O(n) diff rather than nested loops"
  - "LINEAGE-TEMPLATE-INLINE: Lineage section rendered via template literal conditional rather than separate render function -- minimal surface area"
  - "REPLAY-CONTEXT-NULL-DEFAULT: replay_context and lineage fields default to null (not undefined) for consistent JSON serialization"

patterns-established:
  - "Diff modes: full (entities + events + findings), counts_only (event aggregates only), entities_only (entity set diff without findings)"
  - "Lineage rendering: optional ## Lineage section appended after ## Notes in evidence documents"
  - "Replay telemetry: RE- prefixed records with mutation_types and diff_mode tracking"

requirements-completed: [REPLAY-04]

duration: 4min
completed: 2026-03-30
---

# Phase 41 Plan 01: Replay Diffing & Receipt Lineage Summary

**Entity-level diff engine with 3 modes, lineage rendering in receipts/query logs/manifests, and replay-aware telemetry**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T22:44:27Z
- **Completed:** 2026-03-30T22:49:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- buildDiff() computes entity-level delta between two result envelopes in full, counts_only, and entities_only modes using Set-based composite key comparison
- Evidence documents (receipts and query logs) render optional ## Lineage section with replay_id, original query/receipt IDs, mutations applied, and replay reason
- Evidence manifests include optional lineage field with replay_id, original_manifest_ids, original_query_ids, and mutations
- Telemetry extended with replay_context in hunt executions and new recordReplayExecution for replay-specific metrics
- 24 new tests (133 total, all passing) covering all diff modes, edge cases, lineage rendering, manifest lineage, and telemetry extensions

## Task Commits

Each task was committed atomically:

1. **Task 1: buildDiff engine and replay lineage extensions** - `6a8e8d3` (test: RED), `675b234` (feat: GREEN)
2. **Task 2: Diff and lineage unit tests** - `34b0ea4` (test: additional edge cases)

## Files Created/Modified
- `thrunt-god/bin/lib/replay.cjs` - Added buildDiff() function with 3 diff modes and entity-set comparison
- `thrunt-god/bin/lib/evidence.cjs` - Added optional ## Lineage section to buildQueryLogDocument and buildReceiptDocument
- `thrunt-god/bin/lib/manifest.cjs` - Added optional lineage field to createEvidenceManifest
- `thrunt-god/bin/lib/telemetry.cjs` - Added replay_context to recordHuntExecution, new recordReplayExecution function
- `tests/replay.test.cjs` - 24 new tests across 5 new describe blocks

## Decisions Made
- ENTITY-SET-COMPOSITE-KEY: Entity comparison uses Set of `kind:value` composite keys for O(n) diff rather than nested loops
- LINEAGE-TEMPLATE-INLINE: Lineage section rendered via template literal conditional rather than separate render function -- minimal surface area
- REPLAY-CONTEXT-NULL-DEFAULT: replay_context and lineage fields default to null (not undefined) for consistent JSON serialization

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- buildDiff, lineage rendering, manifest lineage, and replay telemetry are all ready for consumption by Plan 02 (CLI commands)
- All backward compatibility verified: existing evidence, manifest, and replay tests pass unchanged

## Self-Check: PASSED

All 6 files verified present. All 3 task commits verified in git log.

---
*Phase: 41-replay-diffing-receipt-lineage*
*Completed: 2026-03-30*
