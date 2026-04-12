---
phase: 25-extraction-adapters
plan: 01
subsystem: adapters
tags: [m365-defender, kql, playwright, site-adapter, monaco-editor, microsoft-security]

# Dependency graph
requires:
  - phase: 23-certified-adapters
    provides: shared helpers (buildAssessment, extractTableFromSelectors, dedupeEntities, etc.) and fixture test pattern
provides:
  - Full M365 Defender site adapter with KQL/table/entity extraction
  - 3 HTML fixture files for Advanced Hunting, Incident Detail, and unsupported pages
  - fixtures.json manifest for Playwright test integration
affects: [25-02, browser-extension, sidepanel]

# Tech tracking
tech-stack:
  added: []
  patterns: [detect-gate pattern for M365 page classification, Monaco editor KQL extraction via textarea value + view-lines fallback]

key-files:
  created:
    - surfaces/packages/surfaces-site-adapters/src/adapters/m365-defender.ts
    - surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/advanced-hunting-kql-rich.html
    - surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/incident-detail.html
    - surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/generic-unsupported.html
    - surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/fixtures.json
  modified:
    - surfaces/packages/surfaces-site-adapters/src/browser-harness-entry.ts
    - surfaces/packages/surfaces-site-adapters/test/adapters.playwright.test.ts

key-decisions:
  - "M365 detect() uses hasAnySelector for app selectors plus hostname+o365cs-base combo for generic portal detection"
  - "Incident pages without query editor get failure reason for partial completeness, following CrowdStrike/Elastic alert_detail pattern"
  - "Entity extraction from EntityTitle + entity-card selectors, with URL-path-based type inference for entity pages"

patterns-established:
  - "M365 adapter follows same architecture as CrowdStrike: private extract/classify functions + shared helpers"
  - "Incident/alert_detail pages with entities but no query editor yield partial completeness with failure reason"

requirements-completed: [ADPT-07, ADPT-09]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 25 Plan 01: M365 Defender Adapter Summary

**Full M365 Defender site adapter extracting KQL queries from Monaco editor, result tables, and device/user/IP entities with 3 Playwright fixture tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T17:19:35Z
- **Completed:** 2026-04-12T17:22:30Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Promoted M365 Defender adapter from stub to full implementation using all shared helpers (buildAssessment, extractTableFromSelectors, dedupeEntities, inferEntityType, filterSupportedActions, baseContext, normalizeWhitespace, hasAnySelector, firstText, firstValue)
- Created 3 realistic HTML fixture files covering Advanced Hunting (rich KQL + table + entities), Incident Detail (entities only, partial), and generic unsupported pages
- Registered adapter in browser harness and test suite; all 24 Playwright tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create M365 Defender fixture HTML files and manifest** - `fa673c84` (feat)
2. **Task 2: Promote M365 Defender adapter from stub to full implementation** - `967dc79c` (feat)
3. **Task 3: Register M365 Defender in Playwright test suite and verify tests pass** - `58006113` (feat)

## Files Created/Modified
- `surfaces/packages/surfaces-site-adapters/src/adapters/m365-defender.ts` - Full M365 Defender adapter with KQL/table/entity extraction using shared helpers
- `surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/advanced-hunting-kql-rich.html` - Advanced Hunting page with Monaco editor, results table, entity cards
- `surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/incident-detail.html` - Incident detail page with entity cards but no query editor
- `surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/generic-unsupported.html` - Generic M365 portal page with o365cs-base shell only
- `surfaces/packages/surfaces-site-adapters/test/fixtures/m365-defender/fixtures.json` - Manifest with 3 fixture definitions and expected extraction results
- `surfaces/packages/surfaces-site-adapters/src/browser-harness-entry.ts` - Added m365-defender factory (now 6 adapters)
- `surfaces/packages/surfaces-site-adapters/test/adapters.playwright.test.ts` - Added m365-defender to both vendor arrays

## Decisions Made
- M365 detect() uses hasAnySelector for 5 app-specific selectors plus hostname+o365cs-base combo for generic portal detection
- Incident pages without query editor get "No query editor detected on incident page" failure reason, yielding partial completeness (matching CrowdStrike/Elastic alert_detail pattern from Phase 23)
- Entity extraction uses EntityTitle + entity-card selectors with URL-path-based type inference (/user/ -> user, /device/ -> host, /ip/ -> ip)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- M365 Defender adapter is fully operational and tested
- Ready for Plan 25-02 (next extraction adapter)
- Browser harness now has 6 registered adapters (aws, crowdstrike, elastic, m365-defender, okta, sentinel)

## Self-Check: PASSED

All 7 files verified present. All 3 task commits verified in git log.

---
*Phase: 25-extraction-adapters*
*Completed: 2026-04-12*
