# Requirements: THRUNT God VS Code Extension v3.0

**Defined:** 2026-04-02
**Core Value:** Surface hidden structure in security telemetry so interesting events become obvious without requiring hunters to write perfect queries

## v3.0 Requirements

Requirements for the Investigative Surfaces milestone. Each maps to roadmap phases.

### Design System & Infrastructure

- [x] **DSYS-01**: All webview surfaces share a CSS token system (`--hunt-*` semantic layer over `--vscode-*`)
- [x] **DSYS-02**: Shared Preact card/layout primitives (StatCard, Panel, Badge, GhostButton) available to all webviews
- [x] **DSYS-03**: Shared hooks library (useRovingTabindex, useTheme, useVsCodeApi, useHostMessage) available to all webviews
- [ ] **DSYS-04**: esbuild config produces 3 new webview ESM bundles alongside existing Drain Template Viewer
- [ ] **DSYS-05**: Existing Drain Template Viewer migrated from `--viewer-*` tokens to shared `--hunt-*` tokens
- [x] **DSYS-06**: Keyboard-first navigation (roving tabindex, ARIA roles) works across all webview surfaces

### Hunt Overview Dashboard

- [ ] **DASH-01**: User can view mission identity card (signal, owner, date, mode, focus)
- [ ] **DASH-02**: User can view phase progress rail showing current stage and completion
- [ ] **DASH-03**: User can view hypothesis verdict summary (counts by Supported/Disproved/Inconclusive/Open)
- [ ] **DASH-04**: User can view confidence meter showing hunt-level confidence
- [ ] **DASH-05**: User can view evidence count stat bar (receipts, queries, templates)
- [ ] **DASH-06**: User can view blocker stack with current blockers surfaced
- [ ] **DASH-07**: User can see "what changed since last session" notification on extension activation
- [ ] **DASH-08**: User can view activity feed showing chronological artifact changes with diff badges
- [ ] **DASH-09**: User can view evidence integrity health indicator bridging v2.0 diagnostics into dashboard

### Evidence Board

- [ ] **EVBD-01**: User can view force-directed lineage graph with hypothesis->receipt->query tiers
- [ ] **EVBD-02**: User can click graph nodes to open corresponding artifact file
- [ ] **EVBD-03**: Graph nodes encode verdict/score with semantic colors
- [ ] **EVBD-04**: Graph edges encode relationship type (supports/contradicts/context) with line style
- [ ] **EVBD-05**: User can hover graph nodes to see artifact summary tooltips
- [ ] **EVBD-06**: User can view coverage matrix (hypothesis columns x receipt rows) with color-coded cells
- [ ] **EVBD-07**: Coverage matrix highlights gaps (rows/columns with no coverage)
- [ ] **EVBD-08**: User can toggle between graph and matrix modes within the same panel
- [ ] **EVBD-09**: User can trace evidence chains with flow animation highlighting
- [ ] **EVBD-10**: User can focus on a single hypothesis to dim unconnected nodes
- [ ] **EVBD-11**: Deviation scores encoded as node size for pre-attentive visual cues
- [ ] **EVBD-12**: Coverage matrix includes blind spot callout row from Evidence Review artifact

### Query Analysis

- [ ] **QANL-01**: User can compare templates from two queries side-by-side
- [ ] **QANL-02**: User can view template presence matrix across 3+ queries as a heatmap grid
- [ ] **QANL-03**: User can sort templates by count, deviation, novelty, or recency
- [ ] **QANL-04**: User can view receipt QA inspector with anomaly framing breakdown, prediction/baseline gaps, and score drivers

### Cross-Surface Navigation

- [ ] **XNAV-01**: All webview panels restore state on VS Code restart via WebviewPanelSerializer
- [ ] **XNAV-02**: Pinned template and view state persists across sessions via workspaceState
- [ ] **XNAV-03**: Selecting an artifact in any surface highlights it in all other open surfaces
- [ ] **XNAV-04**: User can invoke "Show in Evidence Board" and "Open Template Viewer" from any artifact context
- [ ] **XNAV-05**: User can view session continuity summary driven from STATE.md plus recent file changes

## Future Requirements

Deferred to v3.1+:

### Query Analysis Extensions
- **QANL-F01**: Timeline/sparkline mode for multi-query temporal data
- **QANL-F02**: Entity pivot from templates (requires event-level data parsing)
- **QANL-F03**: Template structural variant detection (pairwise similarity computation)
- **QANL-F04**: Replay/diff between time windows

### Evidence Board Extensions
- **EVBD-F01**: Entity relationship graph (separate from evidence lineage)
- **EVBD-F02**: Graph export (PNG/SVG serialization)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Entity relationship graph | Separate graph type from evidence lineage; defer to v4+ |
| Graph editing / artifact mutation | Extension is read-only; never writes to `.planning/` |
| Real-time KPI trend charts | Single hunt has too few data points for meaningful trends |
| Playbook execution from dashboard | Extension does not execute CLI commands |
| Graph export (PNG/SVG) | Defer serialization to v4+ |
| Second charting library | Observable Plot covers all chart types needed |
| CSS-in-JS / state management library | CSS custom properties and useState/useReducer sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DSYS-01 | Phase 12 | Complete |
| DSYS-02 | Phase 12 | Complete |
| DSYS-03 | Phase 12 | Complete |
| DSYS-04 | Phase 12 | Pending |
| DSYS-05 | Phase 12 | Pending |
| DSYS-06 | Phase 12 | Complete |
| DASH-01 | Phase 13 | Pending |
| DASH-02 | Phase 13 | Pending |
| DASH-03 | Phase 13 | Pending |
| DASH-04 | Phase 13 | Pending |
| DASH-05 | Phase 13 | Pending |
| DASH-06 | Phase 13 | Pending |
| DASH-07 | Phase 13 | Pending |
| DASH-08 | Phase 13 | Pending |
| DASH-09 | Phase 13 | Pending |
| EVBD-01 | Phase 14 | Pending |
| EVBD-02 | Phase 14 | Pending |
| EVBD-03 | Phase 14 | Pending |
| EVBD-04 | Phase 14 | Pending |
| EVBD-05 | Phase 14 | Pending |
| EVBD-06 | Phase 14 | Pending |
| EVBD-07 | Phase 14 | Pending |
| EVBD-08 | Phase 14 | Pending |
| EVBD-09 | Phase 14 | Pending |
| EVBD-10 | Phase 14 | Pending |
| EVBD-11 | Phase 14 | Pending |
| EVBD-12 | Phase 14 | Pending |
| QANL-01 | Phase 15 | Pending |
| QANL-02 | Phase 15 | Pending |
| QANL-03 | Phase 15 | Pending |
| QANL-04 | Phase 15 | Pending |
| XNAV-01 | Phase 16 | Pending |
| XNAV-02 | Phase 16 | Pending |
| XNAV-03 | Phase 16 | Pending |
| XNAV-04 | Phase 16 | Pending |
| XNAV-05 | Phase 16 | Pending |

**Coverage:**
- v3.0 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
