---
phase: 76-canvas-kill-chain-generator-templates
plan: 01
subsystem: ui
tags: [obsidian, canvas, mitre-attack, kill-chain, diamond-model, visualization]

# Dependency graph
requires:
  - phase: 68-entity-schema-vault-bootstrap
    provides: Entity type definitions and folder structure
provides:
  - "4 canvas template generators (kill chain, diamond, lateral movement, hunt progression)"
  - "CanvasEntity, CanvasNode, CanvasEdge, CanvasData types"
  - "TACTIC_ORDER constant with 14 ATT&CK tactics"
  - "ENTITY_COLORS mapping for entity type color coding"
affects: [76-02-canvas-command-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-data-module, canvas-json-generation, tdd-red-green]

key-files:
  created:
    - apps/obsidian/src/canvas-generator.ts
    - apps/obsidian/src/__tests__/canvas-generator.test.ts
  modified:
    - apps/obsidian/src/types.ts

key-decisions:
  - "Pure data module pattern for canvas-generator.ts -- zero Obsidian imports, consistent with entity-schema.ts and ingestion.ts"
  - "Entity type color resolution uses startsWith('ioc') prefix matching for IOC subtypes (ioc/ip, ioc/domain, ioc/hash)"
  - "EdgeGroup interface for co-occurrence edges rather than requiring callers to build edge pairs"

patterns-established:
  - "Canvas JSON generation: pure functions producing CanvasData -> JSON.stringify -> .canvas file"
  - "Card dimensions vary by entity type: TTP 200x100, IOC 150x80, default 180x90"

requirements-completed: [CANVAS-01, CANVAS-02]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 76 Plan 01: Canvas Generator Engine Summary

**Pure canvas JSON generator with 4 ATT&CK visualization templates: kill chain columns, diamond model quadrants, lateral movement grid, and hunt progression timeline**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-12T07:39:38Z
- **Completed:** 2026-04-12T07:44:28Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Built canvas generator engine with 4 template layouts producing valid Obsidian Canvas JSON
- Kill chain layout places TTPs across 14 ATT&CK tactic columns with 250px spacing
- Diamond model layout positions entities in 4 quadrants (actors top, tools right, IOCs bottom, TTPs left)
- Lateral movement layout arranges IOCs in a 4-column grid with co-occurrence edges
- Hunt progression layout stacks entities vertically with sequential timeline edges
- Entity color coding: IOCs #4a90d9, TTPs #d94a4a, actors #9b59b6, tools #e67e22
- 14 unit tests covering all generators, constants, and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Canvas types and generator engine with TDD**
   - `a93802e1` (test) - RED: failing tests for all 4 canvas generators
   - `f87e3ca7` (feat) - GREEN: implementation passing all 14 tests

## Files Created/Modified
- `apps/obsidian/src/canvas-generator.ts` - Pure canvas JSON generation module with 4 template generators, TACTIC_ORDER, ENTITY_COLORS
- `apps/obsidian/src/__tests__/canvas-generator.test.ts` - 14 unit tests covering all generators and edge cases
- `apps/obsidian/src/types.ts` - Added CanvasEntity, CanvasNode, CanvasEdge, CanvasData interfaces

## Decisions Made
- Pure data module pattern for canvas-generator.ts -- zero Obsidian imports, consistent with entity-schema.ts and ingestion.ts
- Entity type color resolution uses startsWith('ioc') prefix matching for IOC subtypes
- EdgeGroup interface for co-occurrence edges rather than requiring callers to build edge pairs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode errors with noUncheckedIndexedAccess**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Array index access and Record key access produced `T | undefined` under noUncheckedIndexedAccess
- **Fix:** Added non-null assertions (!) on array index accesses where bounds are guaranteed by loop conditions
- **Files modified:** apps/obsidian/src/canvas-generator.ts, apps/obsidian/src/__tests__/canvas-generator.test.ts
- **Verification:** `npx tsc --noEmit --skipLibCheck` passes with zero errors
- **Committed in:** f87e3ca7 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** TypeScript strict mode compliance required non-null assertions. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Canvas generator module ready for command wiring in Plan 02
- All 4 generators exported as named exports for direct import
- EdgeGroup interface ready for receipt-based co-occurrence grouping

---
*Phase: 76-canvas-kill-chain-generator-templates*
*Completed: 2026-04-12*
