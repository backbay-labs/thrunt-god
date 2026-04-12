---
phase: 68-entity-note-schema-att-ck-ontology-scaffold
plan: 02
subsystem: obsidian-plugin
tags: [mitre-attack, scaffold, yaml-frontmatter, obsidian, dataview, tdd]

requires:
  - phase: 68-01
    provides: "Entity type registry (ENTITY_TYPES, ENTITY_FOLDERS), paths.ts (normalizePath, getEntityFolder), vault-adapter.ts (VaultAdapter interface)"
provides:
  - "ATT&CK scaffold module (scaffold.ts) with 4 exported functions"
  - "Bundled MITRE ATT&CK Enterprise JSON (161 parent techniques)"
  - "Scaffold ATT&CK ontology command in command palette"
  - "Idempotent technique note generation with typed YAML frontmatter"
affects: [68-03, entity-enrichment, hunt-tracking, dataview-queries]

tech-stack:
  added: [resolveJsonModule]
  patterns: [pure-function-module, dynamic-import-for-deferred-loading, yaml-array-for-multi-tactic]

key-files:
  created:
    - apps/obsidian/data/mitre-attack-enterprise.json
    - apps/obsidian/src/scaffold.ts
    - apps/obsidian/src/__tests__/scaffold.test.ts
  modified:
    - apps/obsidian/tsconfig.json
    - apps/obsidian/src/main.ts

key-decisions:
  - "Physical JSON copy over symlink -- symlinks break production builds per RESEARCH.md"
  - "Dynamic import for scaffold module -- defers 85KB JSON loading until command is invoked"
  - "YAML array for multi-tactic techniques -- enables Dataview WHERE contains(tactic, ...) queries"

patterns-established:
  - "Pure data module pattern: scaffold.ts has zero Obsidian imports, safe for testing and CLI"
  - "Dynamic import pattern: heavy modules loaded on-demand via await import() in command callbacks"
  - "Idempotent scaffold pattern: check fileExists before createFile, report created/skipped counts"

requirements-completed: [ONTO-01]

duration: 4min
completed: 2026-04-12
---

# Phase 68 Plan 02: ATT&CK Ontology Scaffold Summary

**ATT&CK scaffold command generating 161 technique notes with typed YAML frontmatter, multi-tactic arrays, sanitized filenames, and idempotent skip logic**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T04:35:05Z
- **Completed:** 2026-04-12T04:38:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Bundled MITRE ATT&CK Enterprise JSON (161 parent techniques, v15.1) into `apps/obsidian/data/`
- Created pure-function scaffold module with sanitizeFileName, getTechniqueFileName, getParentTechniques, generateTechniqueNote
- Registered "Scaffold ATT&CK ontology" command in main.ts with dynamic import to defer JSON loading
- 26 tests covering all scaffold functions plus idempotency integration test (135 total tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Copy ATT&CK JSON and configure TypeScript** - `69a2fa45` (chore)
2. **Task 2 RED: Add failing scaffold tests** - `f492493e` (test)
3. **Task 2 GREEN: Implement scaffold module and command** - `d29a095f` (feat)

**Plan metadata:** (pending)

_TDD task had RED + GREEN commits._

## Files Created/Modified

- `apps/obsidian/data/mitre-attack-enterprise.json` - Bundled ATT&CK Enterprise technique data (161 techniques)
- `apps/obsidian/src/scaffold.ts` - Pure-function module for technique note generation
- `apps/obsidian/src/__tests__/scaffold.test.ts` - 26 tests for scaffold functions and idempotency
- `apps/obsidian/tsconfig.json` - Added resolveJsonModule: true for JSON import type checking
- `apps/obsidian/src/main.ts` - Added scaffold-attack-ontology command and scaffoldAttack method

## Decisions Made

- Physical JSON copy (not symlink) to avoid production build breakage
- Dynamic import for scaffold module to defer 85KB JSON until command invocation
- YAML array format for multi-tactic techniques enables Dataview `WHERE contains(tactic, ...)` queries
- OS-unsafe characters replaced with hyphens using regex `/[/\\:*?"<>|]/g`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertion for unsafe character replacement**
- **Found during:** Task 2 (TDD GREEN)
- **Issue:** Test expected `A-B-C-D---E-F-G-H` for input `A\B:C*D?"E<F>G|H` but `?"` is only 2 unsafe chars producing 2 hyphens, not 3
- **Fix:** Corrected expected value to `A-B-C-D--E-F-G-H`
- **Files modified:** apps/obsidian/src/__tests__/scaffold.test.ts
- **Verification:** All 26 tests pass
- **Committed in:** d29a095f (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 test assertion bug)
**Impact on plan:** Trivial test correction. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ATT&CK scaffold command ready for use in Obsidian
- Plan 03 (entity creation commands) can build on entity-schema.ts and scaffold.ts patterns
- 161 parent technique notes can be generated with a single command palette invocation

## Self-Check: PASSED

All 5 files verified present. All 3 commits verified in git log.

---
*Phase: 68-entity-note-schema-att-ck-ontology-scaffold*
*Completed: 2026-04-12*
