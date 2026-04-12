---
phase: 85-canvas-adapter-reactive-nodes
plan: 01
subsystem: canvas
tags: [canvas, css, entity-colors, verdict, confidence, pure-module, tdd]

# Dependency graph
requires:
  - phase: 82-frontmatter-editor-verdict-lifecycle
    provides: "FrontmatterEditor for verdict/confidence fields in entity notes"
  - phase: 76-canvas-templates
    provides: "canvas-generator.ts with CanvasData types and layout generators"
provides:
  - "canvas-adapter.ts pure module: entity color mapping, JSON patch, verdict CSS, confidence opacity"
  - "ENTITY_TYPE_COLORS canonical color constant (6 entity types)"
  - "CSS rules for 5 verdict border styles and 3 confidence opacity tiers"
  - "canvas-generator.ts unified to single color source of truth"
affects: [85-02-reactive-canvas-service, canvas-service, entity-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure adapter module for canvas appearance mapping (zero Obsidian imports)"
    - "CSS :has() selectors for canvas node verdict/confidence styling via cssclasses"
    - "JSON patch with no-op optimization (skip if color unchanged)"

key-files:
  created:
    - "apps/obsidian/src/canvas-adapter.ts"
    - "apps/obsidian/src/__tests__/canvas-adapter.test.ts"
  modified:
    - "apps/obsidian/src/canvas-generator.ts"
    - "apps/obsidian/src/__tests__/canvas-generator.test.ts"
    - "apps/obsidian/styles.css"

key-decisions:
  - "ENTITY_TYPE_COLORS uses 6 base type keys; IOC subtypes resolved via prefix match in resolveEntityColor"
  - "patchCanvasNodeColors skips nodes where color already matches (no-op optimization avoids unnecessary writes)"
  - "Confidence tiers: low (<0.4), medium (0.4-0.7), high (>0.7 or undefined)"
  - "CSS verdict borders use :has() selectors on cssclasses frontmatter, confirmed compatible with Obsidian Electron (Chromium 112+)"
  - "canvas-generator ENTITY_COLORS removed; getEntityColor delegates to resolveEntityColor for single source of truth"

patterns-established:
  - "Pure adapter pattern: canvas-adapter.ts has zero Obsidian imports, all functions are pure and testable"
  - "CSS :has() verdict styling: .canvas-node:has(.thrunt-verdict-X) .canvas-node-container for border styles"
  - "Confidence opacity via CSS tiers: .canvas-node:has(.thrunt-confidence-X) with low/medium/high"

requirements-completed: [CANVAS-07, CANVAS-08, CANVAS-11]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 85 Plan 01: Canvas Adapter Pure Module Summary

**Pure canvas-adapter module with 6 locked entity colors, JSON patch for node colors, verdict CSS classes, confidence opacity, and 45 TDD tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-12T19:23:33Z
- **Completed:** 2026-04-12T19:28:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created canvas-adapter.ts pure module with 7 exports: ENTITY_TYPE_COLORS, resolveEntityColor, patchCanvasNodeColors, mapVerdictToCssClass, computeConfidenceOpacity, buildEntityCssClasses, parseCanvasRelevantFields
- Unified entity colors to single source of truth -- canvas-generator.ts now delegates to canvas-adapter.ts
- Added CSS rules for 5 verdict border styles and 3 confidence opacity tiers using :has() selectors
- All 708 tests pass across 39 test files with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create canvas-adapter.ts pure module with tests** - `6b946eff` (feat, TDD: red-green)
2. **Task 2: Update canvas-generator.ts to use adapter colors and add CSS rules** - `82981d77` (feat)

## Files Created/Modified
- `apps/obsidian/src/canvas-adapter.ts` - Pure module: entity color mapping, JSON patch, verdict CSS class, confidence opacity, frontmatter parser
- `apps/obsidian/src/__tests__/canvas-adapter.test.ts` - 45 unit tests covering all canvas-adapter functions
- `apps/obsidian/src/canvas-generator.ts` - Removed ENTITY_COLORS, getEntityColor delegates to resolveEntityColor
- `apps/obsidian/src/__tests__/canvas-generator.test.ts` - Updated to import ENTITY_TYPE_COLORS from canvas-adapter, use new canonical colors
- `apps/obsidian/styles.css` - Added canvas entity node CSS rules for verdict borders and confidence opacity tiers

## Decisions Made
- ENTITY_TYPE_COLORS uses 6 base type keys (ioc, ttp, actor, tool, infrastructure, datasource); IOC subtypes resolved via startsWith('ioc') prefix match
- patchCanvasNodeColors includes no-op optimization: skips nodes where color already matches, avoids unnecessary canvas writes
- Confidence tiers: low (<0.4), medium (0.4-0.7), high (>0.7 or undefined defaults to high)
- parseCanvasRelevantFields is a standalone frontmatter parser (not importing from entity-utils) to keep canvas-adapter fully pure
- canvas-generator ENTITY_COLORS constant removed entirely; getEntityColor becomes a thin passthrough to resolveEntityColor
- canvas-generator test assertions updated from old colors (#4a90d9, #d94a4a) to new canonical colors (#e53935, #fb8c00)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated canvas-generator test color assertions**
- **Found during:** Task 2 (canvas-generator migration)
- **Issue:** Existing canvas-generator tests asserted old ENTITY_COLORS values (#4a90d9 for IOC, #d94a4a for TTP) that no longer exist
- **Fix:** Updated all color assertions to match new canonical ENTITY_TYPE_COLORS values (#e53935 for IOC, #fb8c00 for TTP), changed import from ENTITY_COLORS to ENTITY_TYPE_COLORS from canvas-adapter
- **Files modified:** apps/obsidian/src/__tests__/canvas-generator.test.ts
- **Verification:** All 14 canvas-generator tests pass, full 708-test suite green
- **Committed in:** 82981d77 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary to maintain test correctness after migrating to canonical colors. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- canvas-adapter.ts ready for Plan 85-02 to wire CanvasService reactive updates
- resolveEntityColor available for entity-to-color mapping in reactive handler
- patchCanvasNodeColors ready for read-modify-write pattern on .canvas files
- CSS verdict/confidence styles deployed via styles.css, will activate when entity notes use cssclasses frontmatter

---
## Self-Check: PASSED

All created files exist, all commit hashes verified.

---
*Phase: 85-canvas-adapter-reactive-nodes*
*Completed: 2026-04-12*
