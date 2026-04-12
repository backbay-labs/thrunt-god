---
phase: 24-sidepanel-ui
plan: 02
subsystem: ui
tags: [browser-extension, sidepanel, evidence-timeline, click-to-navigate, chrome-extension]

requires:
  - phase: 24-sidepanel-ui/01
    provides: CaseViewModel enrichments (EvidenceTimelineEntry, RecommendedAction, AdapterStatus types and projection logic)
provides:
  - Scrollable chronological evidence timeline with vendor badges and type badges (QRY/RCT/EVD)
  - Click-to-navigate infrastructure for timeline items, hypotheses, and recommended actions
  - navigate:artifact and navigate:action chrome.runtime message protocol
affects: [background-script, bridge-navigation]

tech-stack:
  added: []
  patterns: [querySelectorAll delegation for dynamic click handlers, chrome.runtime.sendMessage navigation protocol, banner feedback on navigation intent]

key-files:
  created: []
  modified:
    - surfaces/apps/browser-extension/src/sidepanel/index.ts

key-decisions:
  - "Navigation sends chrome.runtime messages (navigate:artifact, navigate:action) for background handler -- sidepanel-only scope, background handler deferred"
  - "Evidence timeline capped at scroll-pane 280px max-height for more room than standard 170px"
  - "Banner feedback dismisses after 3 seconds on navigation clicks vs 5 seconds for capture actions"

patterns-established:
  - "Click-to-navigate pattern: data-* attributes on rendered HTML + querySelectorAll delegation in bindActions()"
  - "Navigation message protocol: navigate:artifact {artifactId, artifactType} and navigate:action {actionId}"

requirements-completed: [SIDE-02, SIDE-06]

duration: 2min
completed: 2026-04-12
---

# Phase 24 Plan 02: Evidence Timeline and Click-to-Navigate Summary

**Scrollable evidence timeline with QRY/RCT/EVD type badges and vendor badges, plus click-to-navigate on all interactive sidepanel elements**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-12T17:00:56Z
- **Completed:** 2026-04-12T17:03:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced basic "Recent Artifacts" section with full chronological evidence timeline showing type badges (QRY/RCT/EVD), vendor badges, timestamps, and truncated summaries in a 280px scrollable container
- Wired click-to-navigate handlers on all interactive elements: evidence timeline items, hypothesis cards, and recommended action rows
- Established navigate:artifact and navigate:action chrome.runtime message protocol for background script consumption
- Every clickable element shows immediate banner feedback confirming navigation intent

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Recent Artifacts with scrollable evidence timeline** - `e431e48b` (feat)
2. **Task 2: Wire click-to-navigate on timeline items, hypotheses, and actions** - `6a57ecdc` (feat)

## Files Created/Modified
- `surfaces/apps/browser-extension/src/sidepanel/index.ts` - Replaced renderRecentActivity with renderEvidenceTimeline, added click handlers for timeline/hypotheses/actions in bindActions()

## Decisions Made
- Navigation sends chrome.runtime messages rather than directly opening URLs, keeping the sidepanel decoupled from URL resolution logic that belongs in the background script
- Evidence timeline scroll-pane uses 280px max-height (vs standard 170px) to give the timeline more room since it is the primary evidence display
- Navigation banner feedback uses 3-second timeout (vs 5-second for capture results) for snappier UX on lightweight navigation clicks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 24 (Sidepanel UI) is complete with all plans executed
- Background script handler for navigate:artifact and navigate:action messages can be added as a minor enhancement in a future phase
- All SIDE-02 and SIDE-06 requirements are satisfied at the sidepanel UI level

---
*Phase: 24-sidepanel-ui*
*Completed: 2026-04-12*
