---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Investigative Surfaces
status: in-progress
stopped_at: Completed 14-01-PLAN.md
last_updated: "2026-04-02T23:10:43.000Z"
last_activity: 2026-04-02 -- Completed 14-01 Evidence Board data pipeline
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 9
  completed_plans: 7
  percent: 78
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Surface hidden structure in security telemetry so interesting events become obvious without requiring hunters to write perfect queries
**Current focus:** v3.0 Investigative Surfaces -- Phase 13 in progress

## Current Position

Phase: 14 of 16 (Evidence Board)
Plan: 1 of 3 complete
Status: In Progress
Last activity: 2026-04-02 -- Completed 14-01 Evidence Board data pipeline

Progress: [███████░░░] 78%

## Performance Metrics

**Velocity:**
- Total plans completed: 31 (v1.0: 12, v2.0: 12, v3.0: 7)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1-6 (v1.0) | 12 | -- | -- |
| 7-11 (v2.0) | 12 | -- | -- |
| 12 (v3.0) | 3 | 11min | 3.7min |
| Phase 12 P03 | 4min | 2 tasks | 7 files |
| Phase 13 P01 | 5min | 2 tasks | 5 files |
| Phase 13 P03 | 3min | 1 task | 2 files |
| Phase 13 P02 | 3min | 2 tasks | 2 files |
| Phase 14 P01 | 6min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: All v1.0 decisions preserved in PROJECT.md
- [v2.0]: All v2.0 decisions preserved in PROJECT.md
- [v3.0]: Evidence Board will support both lineage graph and coverage matrix modes in a single panel
- [v3.0]: d3-force with tier constraints for graph layout (zero new dependencies), spike if needed in Phase 14
- [v3.0]: Visual direction: editorial/analytical, not generic admin panel
- [v3.0]: Design system phase before dashboard phase -- build tokens/components once, use three times
- [v3.0]: "What changed?" notification ships with Hunt Overview (DASH-07), not deferred to session continuity phase
- [v3.0]: Store needs 3 new derivation functions: deriveHuntOverview, deriveEvidenceBoard, deriveQueryAnalysis
- [v3.0-12-01]: All component CSS in tokens.css (one import per webview), not colocated with components
- [v3.0-12-01]: hunt- prefix on all shared CSS classes to avoid collision during --viewer-* migration
- [v3.0-12-01]: useRovingTabindex re-queries items on every keydown for dynamic list support
- [v3.0-12-02]: Drain viewer keeps own class names (.stat-card, .ghost-button); shared hunt-* classes for new surfaces only
- [v3.0-12-02]: Drain-viewer body gradient stays in viewer's styles.css, not shared tokens.css
- [v3.0-12-02]: Kept manual message handler in drain viewer index.tsx (useHostMessage hook doesn't fit complex state deps)- [v3.0-12-03]: createWebviewConfig helper pattern for DRY multi-entry esbuild (one line to add a new webview)
- [v3.0-12-03]: webview:ready postMessage on mount in every stub to match drain-template-viewer handshake pattern
- [Phase 12]: createWebviewConfig helper pattern for DRY multi-entry esbuild (one line to add a new webview)
- [Phase 12]: webview:ready postMessage on mount in every stub to match drain-template-viewer handshake pattern
- [Phase 13]: context parameter not stored on HuntOverviewPanel (only needed in constructor for extensionUri)
- [Phase 13]: retainContextWhenHidden omitted; webview uses setState/getState pattern
- [Phase 13]: Session hashes stored via dispose() handler on context.subscriptions
- [Phase 13-03]: prototype.call() pattern for testing store derivation methods without full constructor dependencies
- [Phase 13-03]: Minimal mock store: only implement methods called inside the function under test
- [Phase 13-02]: Badge component not used in dashboard; diff badges rendered as styled spans with CSS classes for tighter control
- [Phase 13-02]: currentPhase prop preserved in PhaseRail interface for future use but segment status derived from phase.status field
- [Phase 14-01]: deriveEvidenceBoard builds edge lookup map for O(1) matrix cell resolution
- [Phase 14-01]: EvidenceBoardPanel omits diagnostics listener since evidence board ViewModel is not diagnostics-dependent

### Pending Todos

- Optional optimization: reduce the minified webview bundle from 263.6 KB toward the earlier sub-200 KB aspiration if startup profiling shows meaningful latency.

### Blockers/Concerns

No blocking issues.

## Session Continuity

Last session: 2026-04-02T23:10:43.000Z
Stopped at: Completed 14-01-PLAN.md
Resume file: None
