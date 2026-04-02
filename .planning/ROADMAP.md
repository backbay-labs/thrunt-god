# Roadmap: Patent-Inspired Log Intelligence

## Milestones

- ✅ **v1.0 Patent-Inspired Log Intelligence** -- Phases 1-6 (shipped 2026-04-01). Archive: `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v2.0 THRUNT God VS Code Extension** -- Phases 7-11 (shipped 2026-04-02). Archive: `.planning/milestones/v2.0-ROADMAP.md`
- **v3.0 Investigative Surfaces** -- Phases 12-16 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

### v3.0 Investigative Surfaces

- [x] **Phase 12: Shared Design System & Webview Infrastructure** - CSS tokens, shared Preact primitives, hooks library, esbuild multi-entry, Drain Viewer token migration (completed 2026-04-02)
- [x] **Phase 13: Hunt Overview Dashboard** - Mission cockpit, phase rail, confidence meter, blocker stack, activity feed, "what changed?" notification (completed 2026-04-02)
- [ ] **Phase 14: Evidence Board** - Force-directed lineage graph with tier constraints, coverage matrix with gap detection, mode toggle in single panel
- [ ] **Phase 15: Query Analysis Upgrades** - Template comparison, presence matrix heatmap, sort controls, receipt QA inspector with anomaly framing
- [ ] **Phase 16: Cross-Surface Navigation & Session Continuity** - WebviewPanelSerializer, cross-surface artifact highlighting, contextual actions, session continuity summary

## Phase Details

### Phase 12: Shared Design System & Webview Infrastructure
**Goal**: All webview surfaces share a unified design language and build pipeline so that new surfaces can be built without re-inventing tokens, components, or hooks
**Depends on**: Phase 11 (v2.0 complete)
**Requirements**: DSYS-01, DSYS-02, DSYS-03, DSYS-04, DSYS-05, DSYS-06
**Success Criteria** (what must be TRUE):
  1. A new webview surface can import `--hunt-*` CSS tokens and get correct colors in both light and dark VS Code themes without defining its own variables
  2. A new webview surface can compose StatCard, Panel, Badge, and GhostButton primitives from `webview/shared/components/` and they render correctly
  3. `useRovingTabindex`, `useTheme`, `useVsCodeApi`, and `useHostMessage` hooks are importable from `webview/shared/hooks/` and work in a minimal test surface
  4. Running `npm run build` produces 4 ESM webview bundles (Drain Template Viewer + 3 new stubs) alongside the CJS extension host bundle without format collisions
  5. The existing Drain Template Viewer renders identically after migration from `--viewer-*` to `--hunt-*` tokens, and keyboard navigation (roving tabindex, ARIA roles) works in the viewer
**Plans**: 3 plans

Plans:
- [ ] 12-01-PLAN.md -- Shared tokens, components, and hooks library
- [x] 12-02-PLAN.md -- Drain Template Viewer token migration and keyboard navigation
- [ ] 12-03-PLAN.md -- esbuild multi-entry and stub webview surfaces

### Phase 13: Hunt Overview Dashboard
**Goal**: Users can see the full state of their hunt at a glance -- mission identity, progress, hypothesis verdicts, evidence health, blockers, and recent activity -- in a single dashboard surface
**Depends on**: Phase 12
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09
**Success Criteria** (what must be TRUE):
  1. User opens the Hunt Overview panel and sees mission identity (signal, owner, date, mode, focus), phase progress rail with current stage highlighted, and hypothesis verdict counts grouped by Supported/Disproved/Inconclusive/Open
  2. User sees confidence meter, evidence count stat bar (receipts/queries/templates), and blocker stack with current blockers -- all derived from `.planning/` artifacts without manual configuration
  3. User sees an activity feed showing chronological artifact changes with diff badges indicating what was added, modified, or removed
  4. On extension activation after a previous session, user receives a "what changed since last session" notification summarizing artifact modifications
  5. User sees evidence integrity health indicator that bridges v2.0 diagnostics (warning/error counts) into the dashboard without opening the Problems panel
**Plans**: 3 plans

Plans:
- [x] 13-01-PLAN.md -- Extension-host layer: ViewModel, store derivation, panel provider, session diff, toast notification
- [ ] 13-02-PLAN.md -- Dashboard webview: all card sections, phase rail, activity feed, health card CSS and JSX
- [x] 13-03-PLAN.md -- Unit tests for store derivation and session diff logic

### Phase 14: Evidence Board
**Goal**: Users can visualize the entire evidence structure of their hunt -- hypothesis-to-receipt-to-query lineage as an interactive graph, and hypothesis-vs-receipt coverage as a color-coded matrix -- to identify gaps, trace chains, and spot weak evidence
**Depends on**: Phase 12
**Requirements**: EVBD-01, EVBD-02, EVBD-03, EVBD-04, EVBD-05, EVBD-06, EVBD-07, EVBD-08, EVBD-09, EVBD-10, EVBD-11, EVBD-12
**Success Criteria** (what must be TRUE):
  1. User opens the Evidence Board in graph mode and sees a force-directed layout with hypotheses at top, receipts in middle, and queries at bottom -- nodes colored by verdict/score, edges styled by relationship type (solid/dashed/dotted), and node size encoding deviation score
  2. User can click any graph node to open the corresponding artifact file in the editor, hover nodes for summary tooltips, and focus on a single hypothesis to dim unconnected nodes
  3. User can trace an evidence chain and see flow animation highlighting the path from hypothesis through receipts to queries
  4. User can toggle to matrix mode and see a hypothesis-columns-by-receipt-rows grid with color-coded cells, gap highlighting for uncovered rows/columns, and a blind spot callout row from the Evidence Review artifact
  5. Both graph and matrix modes live in the same panel, toggled without losing selection state
**Plans**: 3 plans

Plans:
- [x] 14-01-PLAN.md -- Extension-host layer: deriveEvidenceBoard store derivation, EvidenceBoardPanel provider, command registration, unit tests
- [ ] 14-02-PLAN.md -- Graph mode webview: d3-force simulation with tier constraints, SVG rendering, tooltips, focus dimming, trace animation
- [ ] 14-03-PLAN.md -- Matrix mode webview: coverage grid, gap highlighting, blind spot callout, mode toggle completion

### Phase 15: Query Analysis Upgrades
**Goal**: Users can compare template distributions across queries and inspect receipt quality, turning the Drain Template Viewer from a single-query tool into a multi-query analysis surface
**Depends on**: Phase 12
**Requirements**: QANL-01, QANL-02, QANL-03, QANL-04
**Success Criteria** (what must be TRUE):
  1. User can select two queries and see their template distributions side-by-side with visual diffing of which templates appear in one but not the other
  2. User can view a heatmap grid showing template presence across 3 or more queries, with cells colored by template count
  3. User can sort templates by count, deviation, novelty, or recency and the view re-orders immediately
  4. User can open a receipt QA inspector that shows anomaly framing breakdown, prediction/baseline gaps, and score drivers for a selected receipt
**Plans**: TBD

Plans:
- [ ] 15-01: TBD
- [ ] 15-02: TBD

### Phase 16: Cross-Surface Navigation & Session Continuity
**Goal**: All webview surfaces behave as a cohesive investigation tool -- artifact selection syncs across panels, contextual actions navigate between surfaces, and session state persists across VS Code restarts
**Depends on**: Phase 13, Phase 14, Phase 15
**Requirements**: XNAV-01, XNAV-02, XNAV-03, XNAV-04, XNAV-05
**Success Criteria** (what must be TRUE):
  1. User closes and reopens VS Code, and all previously open webview panels (Hunt Overview, Evidence Board, Query Analysis, Drain Template Viewer) restore their last-seen state including scroll position and selections
  2. Pinned templates and view preferences persist across VS Code restarts via workspaceState
  3. User selects an artifact in any surface (sidebar, dashboard, evidence board, template viewer) and it highlights in all other open surfaces
  4. User can right-click any artifact and invoke "Show in Evidence Board" or "Open Template Viewer" to jump to the relevant surface with that artifact focused
  5. User can view a session continuity summary driven from STATE.md plus recent file changes, showing where they left off and what to do next
**Plans**: TBD

Plans:
- [ ] 16-01: TBD
- [ ] 16-02: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 12/12 | Complete | 2026-04-01 |
| 7-11 | v2.0 | 12/12 | Complete | 2026-04-02 |
| 12. Design System & Webview Infrastructure | 3/3 | Complete    | 2026-04-02 | - |
| 13. Hunt Overview Dashboard | 3/3 | Complete    | 2026-04-02 | 2026-04-02 |
| 14. Evidence Board | v3.0 | 1/3 | In progress | - |
| 15. Query Analysis Upgrades | v3.0 | 0/2 | Not started | - |
| 16. Cross-Surface Navigation | v3.0 | 0/2 | Not started | - |
