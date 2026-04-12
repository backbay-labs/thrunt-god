---
phase: 24-sidepanel-ui
plan: 01
subsystem: ui
tags: [browser-extension, sidepanel, typescript, chrome-extension, projections]

requires:
  - phase: 23-certified-adapters
    provides: certification status summaries and CaseViewModel with vendor data
provides:
  - RecommendedAction, AdapterStatus, EvidenceTimelineEntry contract types
  - deriveRecommendedActions, mergeEvidenceTimeline, deriveAdapterStatuses projection functions
  - Vendor status pill-row, hypothesis evidence counts, recommended actions sidepanel sections
affects: [24-02-PLAN, sidepanel-timeline, browser-extension]

tech-stack:
  added: []
  patterns: [derivation-functions-in-projections, badge-state-mapping-for-adapters, legacy-fallback-for-recommended-action]

key-files:
  created: []
  modified:
    - surfaces/packages/surfaces-contracts/src/case.ts
    - surfaces/packages/surfaces-state/src/projections.ts
    - surfaces/packages/surfaces-state/src/index.ts
    - surfaces/packages/surfaces-mocks/src/view-model.ts
    - surfaces/apps/browser-extension/src/sidepanel/index.ts

key-decisions:
  - "Adapter display names derived by capitalizing vendorId segments (split on hyphen) rather than maintaining a separate display name registry"
  - "Evidence timeline merges queries, receipts, and evidence into a single chronological list capped at 20 entries"
  - "Recommended actions sorted by priority with max 5 items to prevent information overload"
  - "Legacy single recommendedAction field preserved as fallback when recommendedActions array is empty"

patterns-established:
  - "Derivation pattern: projections.ts derives enriched data, CaseViewModel carries it, sidepanel renders it"
  - "Badge state mapping: adapter states map to badge-success/info/warning/neutral for consistent visual language"

requirements-completed: [SIDE-01, SIDE-03, SIDE-04, SIDE-05]

duration: 3min
completed: 2026-04-12
---

# Phase 24 Plan 01: Sidepanel Data Model Enrichments Summary

**Three new CaseViewModel derivations (adapter status, evidence timeline, recommended actions) with corresponding sidepanel UI sections showing vendor pills, hypothesis evidence counts, and prioritized action items**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T16:54:11Z
- **Completed:** 2026-04-12T16:57:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added RecommendedAction, AdapterStatus, and EvidenceTimelineEntry contract types to surfaces-contracts
- Implemented three derivation functions in projections.ts: deriveRecommendedActions (analyzes evidence gaps, phase readiness, capture debt, hypothesis coverage), mergeEvidenceTimeline (chronological merge of queries/receipts/evidence), deriveAdapterStatuses (vendor state from certification data)
- Enhanced sidepanel with vendor adapter status pill-row, per-hypothesis evidence count badges (warning on zero), recommended actions section with priority/category badges, and case signal display in hero card

## Task Commits

Each task was committed atomically:

1. **Task 1: Define contract types and data derivation functions** - `20393568` (feat)
2. **Task 2: Render vendor status, evidence counts, and recommended actions in sidepanel** - `ad6205d2` (feat)

## Files Created/Modified
- `surfaces/packages/surfaces-contracts/src/case.ts` - Added RecommendedAction, AdapterStatus, EvidenceTimelineEntry interfaces and 3 new CaseViewModel fields
- `surfaces/packages/surfaces-state/src/projections.ts` - Added deriveRecommendedActions, mergeEvidenceTimeline, deriveAdapterStatuses functions; updated projectCaseViewModel
- `surfaces/packages/surfaces-state/src/index.ts` - Re-exported 3 new derivation functions
- `surfaces/packages/surfaces-mocks/src/view-model.ts` - Added required new fields to mock CaseViewModel
- `surfaces/apps/browser-extension/src/sidepanel/index.ts` - Added renderVendorStatusRow, renderRecommendedActions; enhanced renderHypotheses with evidence counts; enhanced renderCaseHeader with signal; updated render() ordering

## Decisions Made
- Adapter display names derived by capitalizing vendorId segments (e.g. 'crowdstrike' -> 'Crowdstrike') rather than maintaining a separate display name mapping
- Evidence timeline capped at 20 entries sorted most-recent-first for bounded rendering
- Recommended actions capped at 5, sorted by priority (high/medium/low) to prevent information overload
- Legacy single `recommendedAction` string preserved as fallback when the new `recommendedActions` array is empty

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed mock CaseViewModel missing new required fields**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** surfaces-mocks/src/view-model.ts mock did not include the 3 new CaseViewModel fields, causing TS2739
- **Fix:** Added `recommendedActions: []`, `evidenceTimeline: []`, `adapterStatuses: []` to mock
- **Files modified:** surfaces/packages/surfaces-mocks/src/view-model.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** 20393568 (Task 1 commit)

**2. [Rule 3 - Blocking] Added new function exports to state package index**
- **Found during:** Task 1 (checking public API surface)
- **Issue:** surfaces-state/src/index.ts had explicit named exports; new functions would not be accessible via package import
- **Fix:** Added deriveRecommendedActions, mergeEvidenceTimeline, deriveAdapterStatuses to the export list
- **Files modified:** surfaces/packages/surfaces-state/src/index.ts
- **Verification:** TypeScript compiles and imports resolve
- **Committed in:** 20393568 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 new CaseViewModel fields populated via projections, ready for Plan 02 evidence timeline and click-to-navigate features
- Sidepanel section ordering matches CONTEXT.md specification with insertion points for Plan 02

## Self-Check: PASSED

All files exist, both commits verified, all expected exports and functions confirmed present.

---
*Phase: 24-sidepanel-ui*
*Completed: 2026-04-12*
