---
phase: 44-cross-tenant-aggregation-heatmap
plan: "02"
subsystem: heatmap
tags: [multi-tenant, heatmap, mitre-attack, technique-inference, markdown-rendering]

requires:
  - phase: 44-cross-tenant-aggregation-heatmap
    provides: aggregation.cjs with tagEventsWithTenant, deduplicateEntities, aggregateResults, correlateFindings
  - phase: 43-dispatch-coordinator
    provides: dispatchMultiTenant returning MultiTenantResult with tenant_results[]

provides:
  - heatmap.cjs module with inferTechniques, buildHeatmapFromResults, renderHeatmapTable, writeHeatmapArtifacts
  - CLI commands runtime aggregate and runtime heatmap via thrunt-tools.cjs
  - All 8 Phase 44 functions re-exported via runtime.cjs (4 aggregation + 4 heatmap)
  - TECHNIQUE_KEYWORD_MAP with 12 keyword-to-ATT&CK-technique mappings

affects: [dispatch workflow, evidence pipeline, runtime SDK surface]

tech-stack:
  added: []
  patterns: [sparse heatmap cells, severity thresholds (>10=high >0=medium 0=clear), keyword-based technique inference]

key-files:
  created:
    - thrunt-god/bin/lib/heatmap.cjs
    - tests/heatmap.test.cjs
  modified:
    - thrunt-god/bin/lib/commands.cjs
    - thrunt-god/bin/thrunt-tools.cjs
    - thrunt-god/bin/lib/runtime.cjs

key-decisions:
  - "Sparse cell representation: only cells with >0 matching events are included in the cells array"
  - "Technique inference from 3 sources: pack metadata, event keyword heuristics (12 keywords), explicit tags"
  - "Heatmap severity uses 2-tier grading: >10=high, >0=medium, 0=clear (null severity)"
  - "Entity count per cell uses all entities from the tenant envelope, not just matching-event entities"

patterns-established:
  - "TECHNIQUE_KEYWORD_MAP: static lowercase keyword -> ATT&CK ID map for event content scanning"
  - "Event field scanning: title, action, process_name, command_line checked case-insensitively"
  - "Heatmap artifact dual-format: JSON for machine consumption, Markdown for human review"

requirements-completed: [TENANT-03]

duration: 6min
completed: 2026-03-31
---

# Phase 44 Plan 02: Cross-Tenant Heatmap Summary

**Tenant-by-MITRE-technique heatmap with keyword-based technique inference, severity-graded sparse cells, JSON+Markdown artifact output, and CLI commands for aggregate and heatmap workflows**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T01:03:41Z
- **Completed:** 2026-03-31T01:09:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built heatmap.cjs module with 4 exported functions: inferTechniques, buildHeatmapFromResults, renderHeatmapTable, writeHeatmapArtifacts
- TECHNIQUE_KEYWORD_MAP with 12 keyword-to-ATT&CK technique mappings (LSASS, PowerShell, mimikatz, cmd.exe, certutil, whoami, net.exe, wmic, psexec, rundll32, regsvr32, mshta)
- Technique inference from 3 sources: pack metadata attack field, event content heuristic keyword matching, explicit technique:TXXXX tags
- Sparse heatmap cells with severity grading (>10=high, >0=medium, 0=clear), sample_event_ids (max 5), first_seen/last_seen timestamps
- Markdown table rendering with tenant rows x technique columns, formatted as **N** (high) / N (medium) / -- (clear)
- JSON + Markdown artifact output to .planning/HEATMAPS/ directory
- CLI commands cmdRuntimeAggregate and cmdRuntimeHeatmap with full dispatch + aggregate + heatmap pipeline
- All 8 Phase 44 functions re-exported via runtime.cjs (tagEventsWithTenant, deduplicateEntities, aggregateResults, correlateFindings, buildHeatmapFromResults, renderHeatmapTable, writeHeatmapArtifacts, inferTechniques)
- 46 tests passing across 7 test suites

## Task Commits

Each task was committed atomically:

1. **Task 1: Create heatmap.cjs with technique inference, heatmap building, and artifact writing** - `7caa0eb` (test/RED) + `4a3ac60` (feat/GREEN)
2. **Task 2: Wire CLI commands and runtime re-exports** - `e78684c` (feat)

_Note: Task 1 used TDD with RED/GREEN commits_

## Files Created/Modified
- `thrunt-god/bin/lib/heatmap.cjs` - Heatmap module: inferTechniques, buildHeatmapFromResults, renderHeatmapTable, writeHeatmapArtifacts, TECHNIQUE_KEYWORD_MAP
- `tests/heatmap.test.cjs` - 46 unit tests covering technique inference, heatmap construction, rendering, artifact writing, re-exports, CLI routing
- `thrunt-god/bin/lib/commands.cjs` - Added cmdRuntimeAggregate and cmdRuntimeHeatmap command handlers
- `thrunt-god/bin/thrunt-tools.cjs` - Added routing for runtime aggregate and runtime heatmap subcommands
- `thrunt-god/bin/lib/runtime.cjs` - Re-exported 8 aggregation + heatmap functions

## Decisions Made
- Sparse cell representation: only cells with >0 matching events are included (clear cells omitted) -- matches GOAL.md constraint on sparse arrays
- Entity count per heatmap cell uses total unique entities from the tenant envelope (not per-technique entity filtering) for simplicity and accuracy
- Technique inference keyword matching scans title, action, process_name, command_line fields case-insensitively
- cmdRuntimeAggregate and cmdRuntimeHeatmap reuse same dispatch pattern as cmdRuntimeDispatch for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 44 complete: aggregation and heatmap modules fully built and tested
- Runtime SDK surface expanded with 8 new functions for multi-tenant aggregation and heatmap
- CLI provides full pipeline: runtime dispatch -> runtime aggregate -> runtime heatmap
- 78 total tests across aggregation (32) and heatmap (46) test suites

---
*Phase: 44-cross-tenant-aggregation-heatmap*
*Completed: 2026-03-31*
