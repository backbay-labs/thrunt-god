---
phase: 68-entity-note-schema-att-ck-ontology-scaffold
plan: 01
subsystem: schema
tags: [typescript, obsidian, entity-types, frontmatter, yaml, att-ck]

# Dependency graph
requires: []
provides:
  - "ENTITY_TYPES registry with 8 entity type definitions"
  - "ENTITY_FOLDERS constant with 6 unique folder paths"
  - "EntityTypeDefinition and FrontmatterFieldDef type interfaces"
  - "getEntityFolder path resolution helper"
  - "Starter templates with YAML frontmatter for all entity types"
affects: [68-02-att-ck-scaffold, 68-03-bootstrap-extension, entity-ingestion, sidebar-views]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-data-module, frozen-registry, typed-frontmatter-schema]

key-files:
  created:
    - apps/obsidian/src/entity-schema.ts
    - apps/obsidian/src/__tests__/entity-schema.test.ts
  modified:
    - apps/obsidian/src/types.ts
    - apps/obsidian/src/paths.ts

key-decisions:
  - "Pure data module pattern -- entity-schema.ts has zero Obsidian imports, safe for testing and CLI"
  - "IOC subtypes share entities/iocs folder, differentiated by frontmatter type field"
  - "Starter templates include ## Sightings and ## Related sections for future accumulation"

patterns-established:
  - "Entity registry pattern: frozen readonly array with EntityTypeDefinition objects"
  - "Frontmatter schema as typed FrontmatterFieldDef arrays"
  - "Template functions accept name parameter, return valid YAML frontmatter markdown"

requirements-completed: [ONTO-02]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 68 Plan 01: Entity Type Registry Summary

**8 entity types with canonical folders, typed YAML frontmatter schemas, and starter templates matching MILESTONES-v2.md section 3.1**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T04:29:21Z
- **Completed:** 2026-04-12T04:32:26Z
- **Tasks:** 1 (TDD: RED/GREEN)
- **Files modified:** 4

## Accomplishments
- Entity type registry with 8 types: ioc/ip, ioc/domain, ioc/hash, ttp, actor, tool, infrastructure, datasource
- IOC subtypes share entities/iocs folder, differentiated by frontmatter type field
- All frontmatter uses snake_case field names per spec
- getEntityFolder path helper resolves entity folders under planningDir
- 22 tests covering registry shape, template content, snake_case enforcement, and path resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Define entity type registry and path helpers**
   - `32c6d0e9` (test: add failing tests for entity type registry -- RED)
   - `8eff2f47` (feat: implement entity type registry -- GREEN)

## Files Created/Modified
- `apps/obsidian/src/entity-schema.ts` - Pure data module with ENTITY_TYPES (8 entries) and ENTITY_FOLDERS (6 paths)
- `apps/obsidian/src/types.ts` - Added EntityTypeDefinition and FrontmatterFieldDef interfaces
- `apps/obsidian/src/paths.ts` - Added getEntityFolder path resolution helper
- `apps/obsidian/src/__tests__/entity-schema.test.ts` - 22 tests for registry, templates, and paths

## Decisions Made
- Pure data module pattern: entity-schema.ts has zero Obsidian imports, safe for testing and CLI usage
- IOC subtypes share entities/iocs folder, differentiated by frontmatter type field (not separate folders)
- Starter templates include ## Sightings and ## Related sections for future hunt reference accumulation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict null check in test**
- **Found during:** Task 1 (type checking after implementation)
- **Issue:** `template.split('---')[1]` possibly undefined per strict TypeScript
- **Fix:** Added nullish coalescing `?? ''` for type safety
- **Files modified:** apps/obsidian/src/__tests__/entity-schema.test.ts
- **Verification:** `npx tsc --noEmit --skipLibCheck` passes clean
- **Committed in:** 8eff2f47 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial type narrowing fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entity type registry ready for Plan 02 (ATT&CK Ontology Scaffold) to generate technique stubs
- Entity type registry ready for Plan 03 (Bootstrap Extension) to create entity folders and templates
- ENTITY_TYPES and ENTITY_FOLDERS exported for downstream consumers

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 68-entity-note-schema-att-ck-ontology-scaffold*
*Completed: 2026-04-12*
