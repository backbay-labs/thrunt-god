---
phase: 23-certified-adapters
plan: 03
subsystem: browser-extension, certification
tags: [content-scripts, site-adapters, redaction, elastic, crowdstrike, browser-extension]

requires:
  - phase: 23-01
    provides: Elastic site-adapter implementation in surfaces-site-adapters package
  - phase: 23-02
    provides: CrowdStrike site-adapter implementation in surfaces-site-adapters package
provides:
  - Slim content scripts delegating to shared site-adapter package for elastic and crowdstrike
  - Certification redaction patterns for elastic deployment URLs, spaces, and crowdstrike regions, hashes
affects: [certification-campaigns, browser-extension-build]

tech-stack:
  added: []
  patterns:
    - "Browser-safe import via @thrunt-surfaces/site-adapters/browser entrypoint (avoids Node.js certification dependencies)"
    - "Content script thin wrapper pattern: import adapter factory + call initializeAdapter()"

key-files:
  created: []
  modified:
    - surfaces/apps/browser-extension/src/content/elastic.ts
    - surfaces/apps/browser-extension/src/content/crowdstrike.ts
    - surfaces/packages/surfaces-site-adapters/src/certification.ts

key-decisions:
  - "Used /browser sub-export instead of main package export to avoid Node.js-only certification dependencies in browser bundle"

patterns-established:
  - "Content script delegation: All vendor content scripts should be thin wrappers importing from @thrunt-surfaces/site-adapters/browser, matching sentinel.ts pattern"

requirements-completed: [ADPT-01, ADPT-02, ADPT-04]

duration: 3min
completed: 2026-04-12
---

# Phase 23 Plan 03: Content Script Consolidation + Certification Redaction Summary

**Slim content scripts delegating to shared site-adapters and vendor-specific certification redaction for Elastic/CrowdStrike**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T14:52:51Z
- **Completed:** 2026-04-12T14:55:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced Elastic content script (163 lines) with 12-line thin wrapper delegating to shared site-adapters package
- Replaced CrowdStrike content script (179 lines) with 12-line thin wrapper delegating to shared site-adapters package
- Added Elastic certification redaction patterns for deployment URLs (*.kb.elastic.co, *.cloud.elastic.co) and space IDs
- Added CrowdStrike certification redaction patterns for Falcon regional subdomains and hex hash values
- Browser extension builds successfully with all 13 content scripts passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Slim down content scripts to delegate to site-adapters package** - `eafddfe4` (feat)
2. **Task 2: Add Elastic and CrowdStrike redaction patterns to certification module** - `4baebab2` (feat)

## Files Created/Modified
- `surfaces/apps/browser-extension/src/content/elastic.ts` - Thin wrapper importing createElasticAdapter from site-adapters/browser
- `surfaces/apps/browser-extension/src/content/crowdstrike.ts` - Thin wrapper importing createCrowdStrikeAdapter from site-adapters/browser
- `surfaces/packages/surfaces-site-adapters/src/certification.ts` - Added elastic and crowdstrike vendor-specific redaction patterns in applyRedactions()

## Decisions Made
- Used `@thrunt-surfaces/site-adapters/browser` sub-export instead of root `@thrunt-surfaces/site-adapters` to avoid bundling Node.js-only certification/campaign code into browser extension (which imports node:fs, node:path, playwright-core)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used /browser sub-export instead of root package import**
- **Found during:** Task 1 (Slim down content scripts)
- **Issue:** Plan specified `import from '@thrunt-surfaces/site-adapters'` but the root export includes certification.ts which imports node:fs, node:path, and transitively pulls in playwright-core -- all fail browser bundle target
- **Fix:** Used `@thrunt-surfaces/site-adapters/browser` sub-export which is the browser-safe entrypoint (already used by sentinel.ts content script)
- **Files modified:** surfaces/apps/browser-extension/src/content/elastic.ts, surfaces/apps/browser-extension/src/content/crowdstrike.ts
- **Verification:** Browser extension build passes all 13 content scripts
- **Committed in:** eafddfe4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import path correction was necessary for browser bundle compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 23 (Certified Adapters) is now complete with all 3 plans executed
- Elastic and CrowdStrike have full adapter implementations, content script delegation, and certification redaction
- Ready for next phase in the v5.0 roadmap

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 23-certified-adapters*
*Completed: 2026-04-12*
