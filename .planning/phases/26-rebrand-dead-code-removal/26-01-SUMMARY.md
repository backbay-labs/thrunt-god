---
phase: 26-rebrand-dead-code-removal
plan: 01
subsystem: terminal
tags: [dead-code-removal, hushd, beads, speculate, desktop-agent, verifier-gates]

# Dependency graph
requires:
  - phase: 25-execution-verification
    provides: THRUNT-only gate registry replacing old pytest/mypy/ruff/clawdstrike gates
  - phase: 24-hunt-observation-screens
    provides: THRUNT hunt actions replacing hushd-centric HOME_ACTIONS
  - phase: 23-bridge-foundation
    provides: .planning/ state adapter replacing Beads work graph
provides:
  - Clean codebase with zero references to deleted modules (hushd, beads, speculate, desktop-agent)
  - Old verifier gates removed (pytest, mypy, ruff, clawdstrike)
  - Stubbed hushd-dependent screens (audit, security, policy)
  - Codebase ready for rename pass in Plan 02
affects: [26-02-rename-pass]

# Tech tracking
tech-stack:
  added: []
  patterns: [dead-screen-stubbing]

key-files:
  created: []
  modified:
    - apps/terminal/src/index.ts
    - apps/terminal/src/types.ts
    - apps/terminal/src/tui/types.ts
    - apps/terminal/src/tui/app.ts
    - apps/terminal/src/tui/report-export.ts
    - apps/terminal/src/tui/components/status-bar.ts
    - apps/terminal/src/tui/screens/audit.ts
    - apps/terminal/src/tui/screens/security.ts
    - apps/terminal/src/tui/screens/policy.ts
    - apps/terminal/src/tui/screens/integrations.ts
    - apps/terminal/src/tui/screens/hunt-watch.ts
    - apps/terminal/src/tui/screens/hunt-report.ts
    - apps/terminal/src/tools/index.ts
    - apps/terminal/src/mcp/index.ts
    - apps/terminal/src/cli/index.ts
    - apps/terminal/src/health/index.ts

key-decisions:
  - "Dead hushd-dependent screens (audit, security, policy) stubbed rather than deleted -- preserves screen registry entry and navigation for Plan 02 rename"
  - "Task 1 deletions targeted untracked files (never committed to git) so no separate git commit was possible; combined with Task 2 into single atomic commit"
  - "Report export traceability set to not_configured status since hushd audit ingest removed"

patterns-established:
  - "Dead screen stubbing: replace full implementation with minimal stub that renders removal message and handles ESC to return"

requirements-completed: [BRAND-04, BRAND-05, BRAND-06, BRAND-07]

# Metrics
duration: 13min
completed: 2026-03-30
---

# Phase 26 Plan 01: Dead Code Removal Summary

**Deleted 14 dead source files across 4 module directories and 4 old verifier gates, then scrubbed ~30 import references from 16 consuming files to produce a zero-dead-reference codebase ready for the rename pass.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-30T04:44:56Z
- **Completed:** 2026-03-30T04:58:35Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Deleted all 4 dead module directories (hushd, beads, speculate, desktop-agent) and 4 old verifier gate files
- Scrubbed every import/export/type reference to deleted modules from 16 consuming files
- Gutted 3 hushd-dependent screens (audit, security, policy) to stubs
- Removed speculate tool, beads CLI subcommand, hushd health check, and desktop-agent integration code
- Verified zero remaining references with grep across the entire src/ tree

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete dead module directories and old verifier gates** - untracked files, no git delta
2. **Task 2: Scrub all import references to deleted modules** - `6272c9e` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `apps/terminal/src/index.ts` - Removed Speculate, Beads, Hushd exports and init/shutdown lifecycle
- `apps/terminal/src/tui/types.ts` - Removed hushd/desktop-agent type imports, AuditLogState, dead AppState fields, dead AppController methods
- `apps/terminal/src/tui/app.ts` - Removed Beads/Hushd/desktop-agent imports, connectHushd/scheduleReconnect/refreshAuditPreview/showBeads/refreshDesktopAgent methods, all dead state fields
- `apps/terminal/src/tui/components/status-bar.ts` - Removed HushdConnectionState import, hushd badge, beads count, deny count segments
- `apps/terminal/src/tui/report-export.ts` - Removed AuditEvent import and buildReportExportAuditEvent/severityToAuditLevel functions
- `apps/terminal/src/tui/screens/audit.ts` - Gutted to stub (depended entirely on Hushd)
- `apps/terminal/src/tui/screens/security.ts` - Gutted to stub (depended entirely on Hushd)
- `apps/terminal/src/tui/screens/policy.ts` - Gutted to stub (depended entirely on Hushd)
- `apps/terminal/src/tui/screens/integrations.ts` - Removed desktop-agent import, desktop-agent card, connectHushd/refreshDesktopAgent calls
- `apps/terminal/src/tui/screens/hunt-watch.ts` - Removed desktop-agent import, watch config resolution, nats config options
- `apps/terminal/src/tui/screens/hunt-report.ts` - Removed Hushd import and audit event submission in export flow
- `apps/terminal/src/tools/index.ts` - Removed Speculate import, speculateTool definition, hushd pre-dispatch security check
- `apps/terminal/src/cli/index.ts` - Removed Beads import, beads/speculate CLI subcommands, beads help text
- `apps/terminal/src/health/index.ts` - Removed hushd and hush-cli health check definitions

## Decisions Made
- Dead hushd-dependent screens (audit, security, policy) stubbed rather than deleted to preserve screen registry entries for Plan 02 rename pass
- Task 1 and Task 2 combined into single atomic commit because deleted files were untracked (never committed to git)
- Report export traceability defaults to "not_configured" status since hushd audit ingest is removed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed dynamic hushd import in dispatch tool pre-check**
- **Found during:** Task 2 (import scrubbing)
- **Issue:** tools/index.ts had a dynamic `import("../hushd")` in the dispatch tool handler for a pre-dispatch security check, not listed in the plan's file list
- **Fix:** Removed the entire hushd security check block (fail-open pattern, no longer needed)
- **Files modified:** apps/terminal/src/tools/index.ts
- **Verification:** grep confirms zero remaining Hushd references
- **Committed in:** 6272c9e

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness. The dynamic import would fail at runtime since the hushd module no longer exists.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Codebase has zero references to deleted modules
- All remaining code compiles without missing-module errors
- Ready for Plan 02 rename pass (ClawdStrike -> THRUNT GOD string replacements)

---
*Phase: 26-rebrand-dead-code-removal*
*Completed: 2026-03-30*
