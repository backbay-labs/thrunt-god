---
phase: 90-playbook-distillation-detection-pipeline
plan: 02
subsystem: obsidian-plugin
tags: [obsidian, playbook, detection, entity-schema, schema-migration, journal-service, commands, chooser-modal]

# Dependency graph
requires:
  - phase: 90-01
    provides: "Pure playbook.ts and detection.ts modules with extractPlaybookData, generatePlaybookNote, parsePlaybookFrontmatter, applyPlaybookToMission, buildPlaybookJournalEntries, createDetectionNote"
provides:
  - "Detection entity type in ENTITY_TYPES and ENTITY_FOLDERS"
  - "Schema migration v4 with linked_detections field"
  - "JournalService.generatePlaybook, listPlaybooks, applyPlaybook methods"
  - "3 new hidden-alias commands: generate-playbook, apply-playbook, create-detection"
  - "PlaybookSuggestModal and RuleLanguageSuggestModal chooser modals"
  - "6-item Journal... chooser (3 original + 3 new)"
affects: [entity-schema, schema-migration, journal-service, commands, chooser-modals]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Detection entity type follows ENTITY_TYPES pattern with createDetectionNote starterTemplate", "PlaybookSuggestModal follows FuzzySuggestModal + ChooserItem pattern", "Playbook commands follow detectHuntId + JournalService + Notice pattern"]

key-files:
  created: []
  modified:
    - apps/obsidian/src/entity-schema.ts
    - apps/obsidian/src/schema-migration.ts
    - apps/obsidian/src/services/journal-service.ts
    - apps/obsidian/src/commands.ts
    - apps/obsidian/src/chooser-modals.ts
    - apps/obsidian/src/__tests__/schema-migration.test.ts
    - apps/obsidian/src/__tests__/entity-schema.test.ts
    - apps/obsidian/src/__tests__/command-consolidation.test.ts

key-decisions:
  - "Detection entity type uses createDetectionNote as starterTemplate (delegates to pure module)"
  - "Detection template has no verdict/Sightings/Verdict History sections (different entity archetype)"
  - "Schema migration v4 is field-only (linked_detections), no section additions"
  - "createDetectionCmd uses RuleLanguageSuggestModal for sigma/kql/spl selection"
  - "createDetectionCmd links detection to technique notes via addToArray on linked_detections"
  - "applyPlaybook checks for existing hunt_id before overwriting MISSION.md (pitfall #6 guard)"

patterns-established:
  - "Detection entity: no verdict or sightings sections; uses rule-specific sections (## Rule, ## Context, ## Source Hunt)"
  - "Playbook/detection commands follow same detectHuntId + Notice flow as journal commands"
  - "RuleLanguageSuggestModal: small focused FuzzySuggestModal for detection rule language selection"

requirements-completed: [JOURNAL-05, JOURNAL-06, JOURNAL-07]

# Metrics
duration: 7min
completed: 2026-04-13
---

# Phase 90 Plan 02: Playbook/Detection Integration Summary

**Detection entity type, schema migration v4, 3 playbook/detection commands, and 6-item Journal chooser wired into the Obsidian plugin**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-13T00:23:43Z
- **Completed:** 2026-04-13T00:31:08Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Detection entity type registered in ENTITY_TYPES with entities/detections folder, frontmatter fields, and createDetectionNote starterTemplate
- Schema migration v4 adds linked_detections array to technique notes for detection coverage tracking
- JournalService extended with generatePlaybook (reads journal + receipts, writes PLAYBOOK-{huntId}.md), listPlaybooks (scans playbooks/ dir), and applyPlaybook (pre-populates MISSION.md and creates journal)
- 3 new hidden-alias commands (generate-playbook, apply-playbook, create-detection) accessible via Journal... chooser modal
- PlaybookSuggestModal lists available playbooks for apply-playbook flow
- RuleLanguageSuggestModal prompts for sigma/kql/spl detection rule language
- Full test suite passes: 886 tests across 50 files with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Entity Schema + Schema Migration + JournalService Playbook Methods** - `47d398eb` (feat)
2. **Task 2: Commands, Chooser Modal, and Full Integration** - `c0df3faa` (feat)

## Files Created/Modified
- `apps/obsidian/src/entity-schema.ts` - Added detection entity type to ENTITY_TYPES, entities/detections to ENTITY_FOLDERS
- `apps/obsidian/src/schema-migration.ts` - Bumped CURRENT_SCHEMA_VERSION to 4, added migration v4 with linked_detections
- `apps/obsidian/src/services/journal-service.ts` - Added generatePlaybook, listPlaybooks, applyPlaybook methods
- `apps/obsidian/src/commands.ts` - Registered 3 new hidden-alias commands with handler functions
- `apps/obsidian/src/chooser-modals.ts` - Added PlaybookSuggestModal, RuleLanguageSuggestModal, extended JOURNAL_ITEMS
- `apps/obsidian/src/__tests__/schema-migration.test.ts` - Added v4 migration tests, updated version assertions
- `apps/obsidian/src/__tests__/entity-schema.test.ts` - Added detection entity tests, updated counts
- `apps/obsidian/src/__tests__/command-consolidation.test.ts` - Updated hidden alias count, added playbook/detection assertions

## Decisions Made
- Detection entity type has no verdict, Sightings, or Verdict History sections -- it uses rule-specific sections (Rule, Context, Source Hunt) that better match the detection use case
- Updated "every template" tests to filter detection type rather than adding verdict/sightings to detection template, preserving detection archetype distinctness
- createDetectionCmd generates a timestamped detection name (Detection-{huntId}-{timestamp}) for uniqueness
- applyPlaybook checks for existing hunt_id in MISSION.md before overwriting (per pitfall #6 from RESEARCH.md)
- Schema migration v4 is field-only (linked_detections: []) with no section additions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Detection entity type missing verdict in template vs test expectations**
- **Found during:** Task 1
- **Issue:** Existing "every template" tests expected verdict: unknown and ## Sightings/## Verdict History in all entity templates, but detection templates have a different archetype
- **Fix:** Updated 3 "every template" tests to filter detection type, added explicit detection template assertions
- **Files modified:** apps/obsidian/src/__tests__/entity-schema.test.ts
- **Verification:** All 32 entity-schema tests pass

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test adaptation was necessary for correctness. Detection entities are fundamentally different from IOC/TTP entities. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 90 (final phase of v5.0) is now complete
- All 26 plans across 12 phases shipped
- 886 tests passing with zero regressions
- Playbook distillation and detection pipeline fully integrated into plugin

---
*Phase: 90-playbook-distillation-detection-pipeline*
*Completed: 2026-04-13*
