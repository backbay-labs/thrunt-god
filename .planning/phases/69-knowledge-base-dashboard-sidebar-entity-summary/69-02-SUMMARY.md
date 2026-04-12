---
phase: 69-knowledge-base-dashboard-sidebar-entity-summary
plan: 02
subsystem: ui
tags: [obsidian, sidebar, entity-counts, collapsible-details, knowledge-base]

# Dependency graph
requires:
  - phase: 69-01
    provides: KNOWLEDGE_BASE.md template, listFiles on VaultAdapter
provides:
  - EntityCounts interface on ViewModel
  - Entity count computation via listFiles in WorkspaceService
  - Collapsible Knowledge Base sidebar section with per-type counts
  - Open dashboard button linking to KNOWLEDGE_BASE.md
affects: [70-entity-notes, sidebar-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Collapsible details/summary pattern for sidebar sections"
    - "Folder-based entity counting via listFiles with .md filter"

key-files:
  created: []
  modified:
    - apps/obsidian/src/types.ts
    - apps/obsidian/src/workspace.ts
    - apps/obsidian/src/view.ts
    - apps/obsidian/styles.css
    - apps/obsidian/src/__tests__/workspace.test.ts

key-decisions:
  - "EntityCounts uses folder path keys (e.g. 'entities/iocs') not entity type keys -- consistent with ENTITY_FOLDERS constant"
  - "KB section uses native HTML details/summary for collapsible behavior -- no Obsidian API dependency"

patterns-established:
  - "Collapsible card sections: details/summary inside thrunt-god-card with custom triangle marker"
  - "Entity counting: listFiles + .md filter pattern for folder-based file counts"

requirements-completed: [ONTO-05]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 69 Plan 02: Sidebar Entity Summary

**Collapsible Knowledge Base section in sidebar showing per-type entity counts (IOCs, TTPs, Actors, Tools, Infrastructure, Data Sources) with dashboard link**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T05:03:28Z
- **Completed:** 2026-04-12T05:06:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ViewModel extended with EntityCounts interface computed from listFiles on all 6 entity folders
- Collapsible Knowledge Base section renders between hunt status card and core artifacts list
- Section shows count for each entity type plus total, with "Open dashboard" button opening KNOWLEDGE_BASE.md
- 4 new entity count tests verify zero counts, .md filtering, invalidation, and non-.md exclusion

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ViewModel with entity counts (TDD RED)** - `d6d4886a` (test)
2. **Task 1: Implement entity count computation (TDD GREEN)** - `eda0e6a1` (feat)
3. **Task 2: Render collapsible KB section in sidebar** - `c06c6d63` (feat)

## Files Created/Modified
- `apps/obsidian/src/types.ts` - EntityCounts interface, entityCounts field on ViewModel
- `apps/obsidian/src/workspace.ts` - Entity count computation via listFiles per ENTITY_FOLDERS
- `apps/obsidian/src/view.ts` - renderKnowledgeBaseSection method with collapsible details/summary
- `apps/obsidian/styles.css` - CSS for KB section: collapsible header, triangle marker, field/actions layout
- `apps/obsidian/src/__tests__/workspace.test.ts` - 4 new entity count tests, updated ViewModel literals

## Decisions Made
- EntityCounts uses folder path keys (e.g. "entities/iocs") not entity type keys -- consistent with ENTITY_FOLDERS constant and avoids translation layer
- KB section uses native HTML details/summary for collapsible behavior -- no Obsidian API dependency, works everywhere

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Knowledge Base sidebar section complete and wired to existing invalidate/render cycle
- Entity counts will automatically update when vault events trigger cache invalidation
- Ready for entity note creation UI in next phase

## Self-Check: PASSED

All 5 modified files verified on disk. All 3 commit hashes verified in git log.

---
*Phase: 69-knowledge-base-dashboard-sidebar-entity-summary*
*Completed: 2026-04-12*
