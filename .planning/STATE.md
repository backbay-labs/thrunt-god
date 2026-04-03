---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Investigative Surfaces
status: in-progress
stopped_at: Completed 15-03-PLAN.md
last_updated: "2026-04-03T00:56:30.000Z"
last_activity: 2026-04-03 -- Completed 15-03 Receipt QA Inspector
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 12
  completed_plans: 12
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Surface hidden structure in security telemetry so interesting events become obvious without requiring hunters to write perfect queries
**Current focus:** v3.0 Investigative Surfaces -- Phase 13 in progress

## Current Position

Phase: 15 of 16 (Query Analysis Upgrades)
Plan: 3 of 3 complete
Status: Phase Complete
Last activity: 2026-04-03 -- Completed 15-03 Receipt QA Inspector

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 34 (v1.0: 12, v2.0: 12, v3.0: 10)

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
| Phase 14 P02 | 5min | 2 tasks | 3 files |
| Phase 14 P03 | 2min | 2 tasks | 2 files |
| Phase 15 P01 | 6min | 2 tasks | 7 files |
| Phase 15 P02 | 3min | 2 tasks | 3 files |
| Phase 15 P03 | 3min | 2 tasks | 2 files |

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
- [Phase 14-02]: d3-force computes positions only; Preact owns all SVG DOM rendering (no d3 selection/append/attr)
- [Phase 14-02]: 120 synchronous ticks for instant layout; right-click for hypothesis focus, shift+click for trace chain
- [Phase 14-03]: MatrixView uses useMemo cell lookup map (hypothesisId:receiptId key) for O(1) cell resolution
- [Phase 14-03]: Gap detection scans all cells per row/column for absent-only check via useMemo-derived sets
- [Phase 14-03]: Column click toggles hypothesis focus, shared with graph mode via existing state
- [Phase 15-01]: Inline sort logic in deriveQueryAnalysis (prototype.call() testing cannot access private methods)
- [Phase 15-01]: QueryAnalysisPanel defaults selectedQueryIds to first 2 queries from store
- [Phase 15-01]: Inspector mode opens via initialReceiptId parameter on createOrShow
- [Phase 15-02]: Added --hunt-panel-bg, --hunt-surface-raised, --hunt-text-on-accent token aliases for query analysis CSS
- [Phase 15-02]: Heatmap opacity minimum 0.15 for non-zero cells; count bar width relative to max(queryA, queryB) event counts
- [Phase 15-03]: Inspector replaces comparison/heatmap views when active (toggle pattern), not shown alongside
- [Phase 15-03]: scoreColor/scoreLevelLabel helpers for mapping 0-6 deviation scores to low/medium/high CSS variants

### Pending Todos

- Optional optimization: reduce the minified webview bundle from 263.6 KB toward the earlier sub-200 KB aspiration if startup profiling shows meaningful latency.

### Blockers/Concerns

No blocking issues.

## Session Continuity

Last session: 2026-04-03T00:56:30.000Z
Stopped at: Completed 15-03-PLAN.md
Resume file: None
