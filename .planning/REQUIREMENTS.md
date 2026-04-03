# Requirements: THRUNT God VS Code Extension v3.0

**Defined:** 2026-04-02
**Core Value:** Surface hidden structure in security telemetry so interesting events become obvious without requiring hunters to write perfect queries

## v3.0 Requirements

Requirements for the Investigative Surfaces milestone. Each maps to roadmap phases.

### Design System & Infrastructure

- [x] **DSYS-01**: All webview surfaces share a CSS token system (`--hunt-*` semantic layer over `--vscode-*`)
- [x] **DSYS-02**: Shared Preact card/layout primitives (StatCard, Panel, Badge, GhostButton) available to all webviews
- [x] **DSYS-03**: Shared hooks library (useRovingTabindex, useTheme, useVsCodeApi, useHostMessage) available to all webviews
- [x] **DSYS-04**: esbuild config produces 3 new webview ESM bundles alongside existing Drain Template Viewer
- [x] **DSYS-05**: Existing Drain Template Viewer migrated from `--viewer-*` tokens to shared `--hunt-*` tokens
- [x] **DSYS-06**: Keyboard-first navigation (roving tabindex, ARIA roles) works across all webview surfaces

### Hunt Overview Dashboard

- [x] **DASH-01**: User can view mission identity card (signal, owner, date, mode, focus)
- [x] **DASH-02**: User can view phase progress rail showing current stage and completion
- [x] **DASH-03**: User can view hypothesis verdict summary (counts by Supported/Disproved/Inconclusive/Open)
- [x] **DASH-04**: User can view confidence meter showing hunt-level confidence
- [x] **DASH-05**: User can view evidence count stat bar (receipts, queries, templates)
- [x] **DASH-06**: User can view blocker stack with current blockers surfaced
- [x] **DASH-07**: User can see "what changed since last session" notification on extension activation
- [x] **DASH-08**: User can view activity feed showing chronological artifact changes with diff badges
- [x] **DASH-09**: User can view evidence integrity health indicator bridging v2.0 diagnostics into dashboard

### Evidence Board

- [x] **EVBD-01**: User can view force-directed lineage graph with hypothesis->receipt->query tiers
- [x] **EVBD-02**: User can click graph nodes to open corresponding artifact file
- [x] **EVBD-03**: Graph nodes encode verdict/score with semantic colors
- [x] **EVBD-04**: Graph edges encode relationship type (supports/contradicts/context) with line style
- [x] **EVBD-05**: User can hover graph nodes to see artifact summary tooltips
- [x] **EVBD-06**: User can view coverage matrix (hypothesis columns x receipt rows) with color-coded cells
- [x] **EVBD-07**: Coverage matrix highlights gaps (rows/columns with no coverage)
- [x] **EVBD-08**: User can toggle between graph and matrix modes within the same panel
- [x] **EVBD-09**: User can trace evidence chains with flow animation highlighting
- [x] **EVBD-10**: User can focus on a single hypothesis to dim unconnected nodes
- [x] **EVBD-11**: Deviation scores encoded as node size for pre-attentive visual cues
- [x] **EVBD-12**: Coverage matrix includes blind spot callout row from Evidence Review artifact

### Query Analysis

- [x] **QANL-01**: User can compare templates from two queries side-by-side
- [x] **QANL-02**: User can view template presence matrix across 3+ queries as a heatmap grid
- [x] **QANL-03**: User can sort templates by count, deviation, novelty, or recency
- [x] **QANL-04**: User can view receipt QA inspector with anomaly framing breakdown, prediction/baseline gaps, and score drivers

### Cross-Surface Navigation

- [x] **XNAV-01**: All webview panels restore state on VS Code restart via WebviewPanelSerializer
- [x] **XNAV-02**: Pinned template and view state persists across sessions via workspaceState
- [x] **XNAV-03**: Selecting an artifact in any surface highlights it in all other open surfaces
- [x] **XNAV-04**: User can invoke "Show in Evidence Board" and "Open Template Viewer" from any artifact context
- [x] **XNAV-05**: User can view session continuity summary driven from STATE.md plus recent file changes

## v4.0 Requirements

Requirements for the Active Incident Workflow milestone. Design: `design/ACTIVE-INCIDENT-WORKFLOW.md`

### War Room Copy

- [ ] **AIRW-01**: User can right-click a receipt in sidebar and copy a Slack-formatted finding summary to clipboard
- [ ] **AIRW-02**: User can right-click a hypothesis and copy a formatted assessment with verdict and supporting evidence
- [ ] **AIRW-03**: User can invoke "Copy Hunt Overview" command for a full-status summary with phase progress and top findings
- [ ] **AIRW-04**: User can invoke "Copy ATT&CK Summary" for a technique-mapped finding table

### SLA Countdown Timer

- [ ] **AIRW-05**: User can start an SLA timer from command palette with configurable phase durations (detect, contain, report)
- [ ] **AIRW-06**: Status bar shows remaining time with color progression (green → yellow → orange → red)
- [ ] **AIRW-07**: Timer persists across VS Code restarts via workspaceState
- [ ] **AIRW-08**: User receives notification on SLA phase expiry with snooze/advance options

### IOC Quick-Entry

- [ ] **AIRW-09**: User can paste an IOC via command palette and system auto-classifies type (IPv4, hash, domain, email, etc.)
- [ ] **AIRW-10**: IOC matches are highlighted via text editor decorations across all open QRY-*.md and RCT-*.md files
- [ ] **AIRW-11**: Drain Template Viewer highlights template bars containing IOC matches via webview messaging
- [ ] **AIRW-12**: Sidebar nodes for queries/receipts with IOC matches show visual badges

### CLI Bridge

- [ ] **AIRW-13**: User can select and run a hunt phase from QuickPick with streaming output in a dedicated output channel
- [ ] **AIRW-14**: Status bar shows live progress (query count, event count) parsed from CLI structured output
- [ ] **AIRW-15**: Sidebar and webview panels auto-refresh when CLI writes new artifacts (via ArtifactWatcher)
- [ ] **AIRW-16**: CLI errors are mapped to VS Code diagnostics with actionable quick-fix suggestions
- [ ] **AIRW-17**: User can cancel a running CLI command with clean process termination

## v5.0 Requirements

Requirements for the MCP/SIEM Platform milestone. Design: `design/MCP-SIEM-CONNECTORS.md`

### Splunk MVP

- [ ] **SIEM-01**: Connector orchestrator manages full query lifecycle (submit → poll → paginate → normalize → cluster → emit)
- [ ] **SIEM-02**: siem_query MCP tool accepts abstract or native SPL queries with dataset/time-window parameters
- [ ] **SIEM-03**: siem_status MCP tool returns job progress with event count and estimated completion
- [ ] **SIEM-04**: siem_discover MCP tool returns available indexes, sourcetypes, and field schemas
- [ ] **SIEM-05**: Query results normalized to NormalizedEvent schema and fed through Drain clustering
- [ ] **SIEM-06**: QRY-*.md artifact emitted with template metadata compatible with existing extension parsers
- [ ] **SIEM-07**: File-based progress reporting enables VSCode status bar updates

### Sentinel + Environment Auto-Population

- [ ] **SIEM-08**: KQL query translation produces correct Sentinel queries from abstract format
- [ ] **SIEM-09**: OAuth token cache handles automatic refresh with pre-expiry, single-flight deduplication
- [ ] **SIEM-10**: Time-window splitting handles Sentinel's 500K row limit transparently
- [ ] **SIEM-11**: siem_env_populate MCP tool writes structured ENVIRONMENT.md sections from SIEM metadata
- [ ] **SIEM-12**: Token bucket rate limiter enforces Sentinel API quotas

### CrowdStrike + Hardening

- [ ] **SIEM-13**: CrowdStrike multi-surface routing (alerts, detections, devices) via FQL translation
- [ ] **SIEM-14**: Header-driven sliding window rate limiter respects X-Ratelimit headers
- [ ] **SIEM-15**: Circuit breaker opens after consecutive failures with half-open probe recovery
- [ ] **SIEM-16**: Structured error responses classify failures with actionable messages
- [ ] **SIEM-17**: CrowdStrike metadata discovery via scope-based field enumeration

### Polish + Real-Time Progress

- [ ] **SIEM-18**: MCP WebSocket notifications deliver real-time query progress
- [ ] **SIEM-19**: VSCode extension connects as MCP client with live status bar progress
- [ ] **SIEM-20**: Multi-connector queries execute same abstract query against multiple SIEMs
- [ ] **SIEM-21**: Query history panel in sidebar with re-run capability
- [ ] **SIEM-22**: Setup guide and connector configuration reference complete

## Future Requirements

Deferred to v5.1+:

### Query Analysis Extensions
- **QANL-F01**: Timeline/sparkline mode for multi-query temporal data
- **QANL-F02**: Entity pivot from templates (requires event-level data parsing)
- **QANL-F03**: Template structural variant detection (pairwise similarity computation)
- **QANL-F04**: Replay/diff between time windows

### Evidence Board Extensions
- **EVBD-F01**: Entity relationship graph (separate from evidence lineage)
- **EVBD-F02**: Graph export (PNG/SVG serialization)

### Replay & Iteration
- **REPLAY-F01**: Rewind hunt to prior phase, modify hypotheses, re-execute with delta queries
- **REPLAY-F02**: Hunt diff between two execution runs

## Out of Scope

| Feature | Reason |
|---------|--------|
| Entity relationship graph | Separate graph type from evidence lineage; defer to v5.1+ |
| Graph editing / artifact mutation | Extension is read-only; never writes to `.planning/` |
| Real-time KPI trend charts | Single hunt has too few data points for meaningful trends |
| Graph export (PNG/SVG) | Defer serialization to v5.1+ |
| Second charting library | Observable Plot covers all chart types needed |
| CSS-in-JS / state management library | CSS custom properties and useState/useReducer sufficient |
| Hunt replay / hypothesis iteration | Requires significant CLI architecture changes; v5.1+ candidate |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DSYS-01 | Phase 12 | Complete |
| DSYS-02 | Phase 12 | Complete |
| DSYS-03 | Phase 12 | Complete |
| DSYS-04 | Phase 12 | Complete |
| DSYS-05 | Phase 12 | Pending |
| DSYS-06 | Phase 12 | Complete |
| DASH-01 | Phase 13 | Complete |
| DASH-02 | Phase 13 | Complete |
| DASH-03 | Phase 13 | Complete |
| DASH-04 | Phase 13 | Complete |
| DASH-05 | Phase 13 | Complete |
| DASH-06 | Phase 13 | Complete |
| DASH-07 | Phase 13 | Complete |
| DASH-08 | Phase 13 | Complete |
| DASH-09 | Phase 13 | Complete |
| EVBD-01 | Phase 14 | Complete |
| EVBD-02 | Phase 14 | Complete |
| EVBD-03 | Phase 14 | Complete |
| EVBD-04 | Phase 14 | Complete |
| EVBD-05 | Phase 14 | Complete |
| EVBD-06 | Phase 14 | Complete |
| EVBD-07 | Phase 14 | Complete |
| EVBD-08 | Phase 14 | Complete |
| EVBD-09 | Phase 14 | Complete |
| EVBD-10 | Phase 14 | Complete |
| EVBD-11 | Phase 14 | Complete |
| EVBD-12 | Phase 14 | Complete |
| QANL-01 | Phase 15 | Complete |
| QANL-02 | Phase 15 | Complete |
| QANL-03 | Phase 15 | Complete |
| QANL-04 | Phase 15 | Complete |
| XNAV-01 | Phase 16 | Complete |
| XNAV-02 | Phase 16 | Complete |
| XNAV-03 | Phase 16 | Complete |
| XNAV-04 | Phase 16 | Complete |
| XNAV-05 | Phase 16 | Complete |
| AIRW-01 | Phase 17 | Pending |
| AIRW-02 | Phase 17 | Pending |
| AIRW-03 | Phase 17 | Pending |
| AIRW-04 | Phase 17 | Pending |
| AIRW-05 | Phase 18 | Pending |
| AIRW-06 | Phase 18 | Pending |
| AIRW-07 | Phase 18 | Pending |
| AIRW-08 | Phase 18 | Pending |
| AIRW-09 | Phase 19 | Pending |
| AIRW-10 | Phase 19 | Pending |
| AIRW-11 | Phase 19 | Pending |
| AIRW-12 | Phase 19 | Pending |
| AIRW-13 | Phase 20 | Pending |
| AIRW-14 | Phase 20 | Pending |
| AIRW-15 | Phase 20 | Pending |
| AIRW-16 | Phase 20 | Pending |
| AIRW-17 | Phase 20 | Pending |
| SIEM-01 | Phase 21 | Pending |
| SIEM-02 | Phase 21 | Pending |
| SIEM-03 | Phase 21 | Pending |
| SIEM-04 | Phase 21 | Pending |
| SIEM-05 | Phase 21 | Pending |
| SIEM-06 | Phase 21 | Pending |
| SIEM-07 | Phase 21 | Pending |
| SIEM-08 | Phase 22 | Pending |
| SIEM-09 | Phase 22 | Pending |
| SIEM-10 | Phase 22 | Pending |
| SIEM-11 | Phase 22 | Pending |
| SIEM-12 | Phase 22 | Pending |
| SIEM-13 | Phase 23 | Pending |
| SIEM-14 | Phase 23 | Pending |
| SIEM-15 | Phase 23 | Pending |
| SIEM-16 | Phase 23 | Pending |
| SIEM-17 | Phase 23 | Pending |
| SIEM-18 | Phase 24 | Pending |
| SIEM-19 | Phase 24 | Pending |
| SIEM-20 | Phase 24 | Pending |
| SIEM-21 | Phase 24 | Pending |
| SIEM-22 | Phase 24 | Pending |

**Coverage:**
- v3.0 requirements: 31 total (29 complete, 2 pending)
- v4.0 requirements: 17 total (0 complete)
- v5.0 requirements: 22 total (0 complete)
- All requirements: 70 total, mapped to phases: 70, unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 — Added v4.0 Active Incident Workflow (17 reqs) and v5.0 MCP/SIEM Platform (22 reqs)*
