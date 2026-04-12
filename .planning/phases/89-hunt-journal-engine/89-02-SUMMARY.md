---
phase: 89-hunt-journal-engine
plan: 02
subsystem: plugin-commands
tags: [obsidian, journal, commands, chooser-modal, event-bus]

requires:
  - phase: 89-hunt-journal-engine/01
    provides: "Pure journal.ts module with createJournalNote, appendJournalEntry, extractTags, buildSummarySection, replaceSummarySection"
provides:
  - "JournalService with vault I/O for journal CRUD operations"
  - "Journal... chooser modal with 3 items (New Entry, Generate Summary, Create Journal)"
  - "4 registered commands (journal-chooser visible, 3 hidden aliases)"
  - "hypothesis:changed EventBus event for tag-driven workflows"
  - "WorkspaceService.journal public getter for service access"
affects: [90-playbook-engine]

tech-stack:
  added: []
  patterns: [JournalService constructor injection matching WatcherService pattern, JournalChooserModal following CopyChooserModal pattern]

key-files:
  created: []
  modified:
    - apps/obsidian/src/services/journal-service.ts
    - apps/obsidian/src/services/event-bus.ts
    - apps/obsidian/src/workspace.ts
    - apps/obsidian/src/commands.ts
    - apps/obsidian/src/chooser-modals.ts
    - apps/obsidian/src/__tests__/command-consolidation.test.ts

key-decisions:
  - "JournalService uses VaultAdapter API (ensureFolder/createFile/modifyFile/readFile/fileExists) not raw fs"
  - "Journal commands detect huntId via MISSION.md > planning dir > manual fallback, same as verdict commands"
  - "JournalChooserModal delegates to executeCommandById for consistent command routing"
  - "appendEntry emits hypothesis:changed for ALL hypothesis tags in journal content, not just new entry"

patterns-established:
  - "Journal command pattern: detect huntId, prompt user, delegate to JournalService, show Notice, refresh views"
  - "Auto-create journal on appendEntry when journal does not exist (defensive creation)"

requirements-completed: [JOURNAL-01, JOURNAL-02, JOURNAL-03, JOURNAL-04]

duration: 4min
completed: 2026-04-12
---

# Phase 89 Plan 02: Hunt Journal Engine -- Commands and Service Wiring Summary

**JournalService with vault I/O, Journal... chooser modal with 3 items, 4 registered commands, and hypothesis:changed EventBus event**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T23:24:24Z
- **Completed:** 2026-04-12T23:29:01Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- JournalService fully implemented with createJournal, appendEntry, generateSummary, listJournals, journalExists methods
- EventBus extended with hypothesis:changed event type for tag-driven workflows
- WorkspaceService wired with JournalService via constructor injection and public getter
- JournalChooserModal with 3 items (New Entry, Generate Summary, Create Journal) following CopyChooserModal pattern
- 4 journal commands registered: journal-chooser (visible), create-journal, new-journal-entry, journal-summary (hidden aliases)
- All 839 existing tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: JournalService implementation + EventBus extension + WorkspaceService wiring** - `ac71c6bd` (feat)
2. **Task 2: Journal commands + JournalChooserModal + command registration** - `9df8579d` (feat)

## Files Created/Modified
- `apps/obsidian/src/services/journal-service.ts` - Full JournalService implementation replacing stub (createJournal, appendEntry, generateSummary, listJournals, journalExists)
- `apps/obsidian/src/services/event-bus.ts` - Added hypothesis:changed event type to EventMap
- `apps/obsidian/src/workspace.ts` - Wired JournalService with constructor injection and public journal getter
- `apps/obsidian/src/commands.ts` - Registered 4 journal commands with createJournal/newJournalEntry/journalSummary handlers
- `apps/obsidian/src/chooser-modals.ts` - Added JournalChooserModal with JOURNAL_ITEMS array
- `apps/obsidian/src/__tests__/command-consolidation.test.ts` - Updated for 16 visible commands and 21+ hidden aliases

## Decisions Made
- JournalService uses VaultAdapter API methods (ensureFolder, createFile, modifyFile, readFile, fileExists) rather than the plan's generic names (createFolder, create, modify, exists), adapting to the actual interface
- Journal commands detect huntId using the same MISSION.md priority chain as verdict commands (reusing detectHuntId from verdict.ts)
- JournalChooserModal delegates sub-commands via executeCommandById for consistent routing through Obsidian command system
- appendEntry emits hypothesis:changed for all hypothesis tags found in journal content after appending, enabling reactive workflows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted VaultAdapter method names to actual interface**
- **Found during:** Task 1 (JournalService implementation)
- **Issue:** Plan referenced createFolder/create/modify/exists but VaultAdapter uses ensureFolder/createFile/modifyFile/fileExists
- **Fix:** Used actual VaultAdapter method names throughout JournalService
- **Files modified:** apps/obsidian/src/services/journal-service.ts
- **Verification:** TypeScript compilation passes, all tests pass
- **Committed in:** ac71c6bd (Task 1 commit)

**2. [Rule 3 - Blocking] Updated command-consolidation test for new command count**
- **Found during:** Task 2 (command registration)
- **Issue:** Test expected exactly 15 visible commands; adding journal-chooser made it 16
- **Fix:** Updated test to expect 16 visible commands, added journal-chooser to expected IDs list, updated hidden alias count to 21+, added journal mock to mock plugin
- **Files modified:** apps/obsidian/src/__tests__/command-consolidation.test.ts
- **Verification:** All 839 tests pass including updated assertions
- **Committed in:** 9df8579d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hunt journal engine is complete (Phase 89 done)
- JournalService is wired into WorkspaceService and accessible via commands
- Phase 90 (Playbook Engine) can build on this foundation
- hypothesis:changed event is available for reactive workflows in future phases

---
*Phase: 89-hunt-journal-engine*
*Completed: 2026-04-12*
