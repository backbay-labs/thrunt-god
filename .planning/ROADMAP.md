# Roadmap: Patent-Inspired Log Intelligence

## Milestones

- ✅ **v1.0 Patent-Inspired Log Intelligence** -- Phases 1-6 (shipped 2026-04-01). Archive: `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v2.0 THRUNT God VS Code Extension** -- Phases 7-11 (shipped 2026-04-02). Archive: `.planning/milestones/v2.0-ROADMAP.md`
- ✅ **v3.0 Investigative Surfaces** -- Phases 12-16.1 (shipped 2026-04-03). Archive: `.planning/milestones/v3.0-ROADMAP.md`
- ✅ **v4.0 Active Incident Workflow** -- Phases 17-20 (shipped 2026-04-03). Design: `design/ACTIVE-INCIDENT-WORKFLOW.md`
- 🚧 **v5.0 Hunt Ecosystem: Evidence In, Detections Out** -- Phases 21-26 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

### v3.0 Investigative Surfaces

- [x] **Phase 12: Shared Design System & Webview Infrastructure** - CSS tokens, shared Preact primitives, hooks library, esbuild multi-entry, Drain Viewer token migration (completed 2026-04-02)
- [x] **Phase 13: Hunt Overview Dashboard** - Mission cockpit, phase rail, confidence meter, blocker stack, activity feed, "what changed?" notification (completed 2026-04-02)
- [x] **Phase 14: Evidence Board** - Force-directed lineage graph with tier constraints, coverage matrix with gap detection, mode toggle in single panel (completed 2026-04-02)
- [x] **Phase 15: Query Analysis Upgrades** - Template comparison, presence matrix heatmap, sort controls, receipt QA inspector with anomaly framing (completed 2026-04-03)
- [x] **Phase 16: Cross-Surface Navigation & Session Continuity** - WebviewPanelSerializer, cross-surface artifact highlighting, contextual actions, session continuity summary (completed 2026-04-03)
- [x] **Phase 16.1: Cross-Surface Selection Rendering & Keyboard Navigation** - INSERTED gap closure: webview selection:highlight handlers, EB/QA selection emission, useRovingTabindex across all surfaces, ARIA attributes, tech debt fixes (completed 2026-04-03)

### v4.0 Active Incident Workflow

- [x] **Phase 17: War Room Copy** - Clipboard-ready formatted summaries of findings, hypotheses, hunt overviews, and ATT&CK mappings for war room chat (completed 2026-04-03)
- [x] **Phase 18: SLA Countdown Timer** - Configurable incident response timer in status bar with detect/contain/report phases, color progression, workspaceState persistence (completed 2026-04-03)
- [x] **Phase 19: IOC Quick-Entry** - Paste IOCs (IP, hash, domain, email) via command palette, auto-classify, cross-reference against all queries/receipts, highlight across editors and webviews (completed 2026-04-03)
- [x] **Phase 20: CLI Bridge** - Run hunt phases from VSCode via child_process.spawn, streaming progress in output channel, auto-refresh sidebar on new artifacts, error-to-diagnostic mapping (completed 2026-04-03)

### v5.0 Hunt Ecosystem: Evidence In, Detections Out

- [ ] **Phase 21: Bridge Hardening** - Subprocess timeouts, structured JSON logging, health endpoint, error classification, graceful degradation
- [ ] **Phase 22: MCP Event Bridge** - File watcher events, schema contract, WebSocket broadcast, bidirectional mutations, reconnection with catch-up
- [ ] **Phase 23: Certified Adapters (Elastic + CrowdStrike)** - DOM extraction, fixture-backed tests, certification campaigns for the top-3 SIEM/EDR stack
- [ ] **Phase 24: Sidepanel UI** - Live case state, evidence timeline, vendor status, hypothesis cards, recommended actions, artifact navigation
- [ ] **Phase 25: Extraction Adapters (AWS, Okta, M365)** - DOM extraction with fixture tests for CloudTrail, Okta Admin Console, and M365 Defender; stub vendor messaging
- [ ] **Phase 26: Detection Promotion** - CLI command generating Sigma/SPL/KQL rules from findings with ATT&CK mappings, confidence tags, and versioned artifacts

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
- [x] 12-01-PLAN.md -- Shared tokens, components, and hooks library
- [x] 12-02-PLAN.md -- Drain Template Viewer token migration and keyboard navigation
- [x] 12-03-PLAN.md -- esbuild multi-entry and stub webview surfaces

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
- [x] 13-02-PLAN.md -- Dashboard webview: all card sections, phase rail, activity feed, health card CSS and JSX
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
- [x] 14-02-PLAN.md -- Graph mode webview: d3-force simulation with tier constraints, SVG rendering, tooltips, focus dimming, trace animation
- [x] 14-03-PLAN.md -- Matrix mode webview: coverage grid, gap highlighting, blind spot callout, mode toggle completion

### Phase 15: Query Analysis Upgrades
**Goal**: Users can compare template distributions across queries and inspect receipt quality, turning the Drain Template Viewer from a single-query tool into a multi-query analysis surface
**Depends on**: Phase 12
**Requirements**: QANL-01, QANL-02, QANL-03, QANL-04
**Success Criteria** (what must be TRUE):
  1. User can select two queries and see their template distributions side-by-side with visual diffing of which templates appear in one but not the other
  2. User can view a heatmap grid showing template presence across 3 or more queries, with cells colored by template count
  3. User can sort templates by count, deviation, novelty, or recency and the view re-orders immediately
  4. User can open a receipt QA inspector that shows anomaly framing breakdown, prediction/baseline gaps, and score drivers for a selected receipt
**Plans**: 3 plans

Plans:
- [x] 15-01-PLAN.md -- Extension-host data pipeline: ViewModel expansion, deriveQueryAnalysis store derivation, QueryAnalysisPanel provider, command registration, unit tests
- [x] 15-02-PLAN.md -- Comparison and heatmap webview: two-column template diff, presence matrix, sort controls, CSS
- [x] 15-03-PLAN.md -- Receipt QA inspector webview: split-pane layout, deviation score card, factor table, framing breakdown, CSS

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
**Plans**: 3 plans

Plans:
- [x] 16-01-PLAN.md -- Cross-surface selection API, context menu commands, highlight wiring
- [x] 16-02-PLAN.md -- WebviewPanelSerializer registration and workspaceState persistence
- [x] 16-03-PLAN.md -- Session continuity Resume card in Hunt Overview

### Phase 16.1: Cross-Surface Selection Rendering & Keyboard Navigation
**Goal**: Close the two partial requirements from v3.0 audit — make cross-surface selection highlighting visible in all webview surfaces and wire keyboard-first navigation (roving tabindex + ARIA) into the 3 surfaces that lack it
**Depends on**: Phase 16
**Requirements**: XNAV-03, DSYS-06
**Gap Closure**: Closes gaps from v3.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. User selects an artifact in any surface and all other open surfaces visually highlight that artifact with a brief pulse and persistent subtle highlight
  2. Clicking a node in the Evidence Board graph propagates selection to other surfaces (not just opens the file)
  3. Selecting a query or receipt in Query Analysis propagates selection to other surfaces
  4. All 4 webview surfaces support keyboard navigation of interactive lists via Arrow/Home/End keys with proper ARIA roles
  5. TypeScript compiles cleanly with `npm run lint` (no TS2339 errors)
**Plans**: 2 plans

Plans:
- [x] 16.1-01-PLAN.md -- Cross-surface selection:highlight rendering in all 4 webviews, EB node:select emission, QA store.select() wiring, store.ts TS fix
- [x] 16.1-02-PLAN.md -- useRovingTabindex wiring + ARIA attributes in Hunt Overview, Evidence Board, and Query Analysis

### Phase 17: War Room Copy
**Goal**: Hunters can copy formatted summaries of any finding, hypothesis, or hunt overview to clipboard in one click, ready to paste into Slack/Teams war room chat
**Depends on**: Phase 16 (v3.0 complete)
**Requirements**: AIRW-01, AIRW-02, AIRW-03, AIRW-04
**Success Criteria** (what must be TRUE):
  1. User right-clicks a receipt in the sidebar and selects "Copy Finding Summary" to get a Slack-formatted summary on the clipboard
  2. User right-clicks a hypothesis and selects "Copy Hypothesis Summary" to get a formatted assessment with verdict and supporting evidence
  3. User invokes "Copy Hunt Overview" command to get a full-status summary with phase progress, hypothesis verdicts, and top findings
  4. User invokes "Copy ATT&CK Summary" to get a technique-mapped finding table ready for briefing
**Plans**: 1 plan

Plans:
- [x] 17-01-PLAN.md -- WarRoomFormatter class, format functions, command registration, context menus, unit tests

### Phase 18: SLA Countdown Timer
**Goal**: Hunters can track incident response SLA deadlines directly in the VS Code status bar with phase-aware countdown, color progression, and persistence across restarts
**Depends on**: Phase 17
**Requirements**: AIRW-05, AIRW-06, AIRW-07, AIRW-08
**Success Criteria** (what must be TRUE):
  1. User starts an SLA timer from the command palette with configurable phase durations (detect, contain, report)
  2. Status bar shows remaining time with color progression (green → yellow → orange → red) based on configurable thresholds
  3. Timer persists across VS Code restarts via workspaceState, resuming from the correct elapsed time
  4. User receives notification when an SLA phase expires, with options to snooze or advance to the next phase
  5. User can copy current SLA status via War Room formatter integration
**Plans**: 1 plan

Plans:
- [x] 18-01-PLAN.md -- SLATimerManager class, status bar integration, persistence, commands, unit tests

### Phase 19: IOC Quick-Entry
**Goal**: Hunters can paste an IOC and instantly see it highlighted across all open query logs, template views, and receipts, with cross-reference suggestions for related telemetry
**Depends on**: Phase 17
**Requirements**: AIRW-09, AIRW-10, AIRW-11, AIRW-12
**Success Criteria** (what must be TRUE):
  1. User invokes "Add IOC" from command palette, pastes a value, and the system auto-classifies it (IPv4, hash, domain, email, etc.)
  2. All open editors with QRY-*.md or RCT-*.md files show text decorations highlighting IOC matches
  3. The Drain Template Viewer highlights template bars containing the IOC via webview messaging
  4. Sidebar nodes for queries/receipts with IOC matches show a visual badge
  5. IOC list is ephemeral (session-scoped) and clearable via command
**Plans**: 1 plan

Plans:
- [x] 19-01-PLAN.md -- IOC Registry and classification, text editor decorations, webview integration, sidebar badges, unit tests

### Phase 20: CLI Bridge
**Goal**: Hunters can run hunt phases directly from VS Code without switching to a terminal, with streaming progress, auto-refresh, and error integration
**Depends on**: Phase 18, Phase 19
**Requirements**: AIRW-13, AIRW-14, AIRW-15, AIRW-16, AIRW-17
**Success Criteria** (what must be TRUE):
  1. User selects a phase from a QuickPick and the CLI executes via child_process.spawn with streaming output in a dedicated output channel
  2. Status bar shows live progress (query count, event count) parsed from CLI structured output
  3. Sidebar and webview panels auto-refresh when new artifacts are written by the CLI (via existing ArtifactWatcher)
  4. CLI errors are mapped to VS Code diagnostics with actionable quick-fix suggestions
  5. User can cancel a running CLI command, and the process terminates cleanly (SIGTERM, then SIGKILL after timeout)
**Plans**: 2 plans

Plans:
- [x] 20-01-PLAN.md -- CLIBridge class, spawn lifecycle, progress parsing, output channel
- [x] 20-02-PLAN.md -- QuickPick phase selector, error-to-diagnostic mapping, cancellation, integration tests

### Phase 21: Bridge Hardening
**Goal**: The surface bridge subprocess layer is production-grade — timeouts prevent hangs, structured logs enable debugging, health checks enable monitoring, and failures degrade gracefully rather than crashing
**Depends on**: Phase 20 (v4.0 complete)
**Requirements**: HARD-01, HARD-02, HARD-03, HARD-04, HARD-05
**Success Criteria** (what must be TRUE):
  1. A subprocess call to `thrunt-tools.cjs` that hangs beyond the configured timeout (default 30s) is terminated cleanly via SIGTERM escalating to SIGKILL after a grace period
  2. Every HTTP request, WebSocket event, subprocess invocation, and error produces a structured JSON log line with timestamp, level, category, and relevant metadata
  3. Hitting `/api/health` returns a JSON payload showing uptime, connected WebSocket clients count, active case ID, last file-watcher event timestamp, and subprocess availability
  4. API error responses include a machine-readable error class (auth, timeout, subprocess, file-system, validation) and a human-readable actionable message
  5. When `thrunt-tools.cjs` is unavailable, read operations (case state, evidence timeline, artifact listing) continue to work while write operations return clear "bridge degraded" errors
**Plans**: 2 plans

Plans:
- [ ] 21-01-PLAN.md -- Structured logger, error classification, subprocess timeout with SIGTERM/SIGKILL escalation
- [ ] 21-02-PLAN.md -- Extended health endpoint, subprocess health monitor, graceful degradation

### Phase 22: MCP Event Bridge
**Goal**: All surfaces (browser extension, Obsidian, future clients) receive real-time structured events when `.planning/` artifacts change, and can send mutations back through a validated protocol — making the bridge the single synchronization point for the hunt ecosystem
**Depends on**: Phase 21
**Requirements**: MCPB-01, MCPB-02, MCPB-03, MCPB-04, MCPB-05, MCPB-06
**Success Criteria** (what must be TRUE):
  1. When a file in `.planning/` is created, modified, or deleted, connected WebSocket clients receive a structured event within 500ms containing event type, artifact path, timestamp, and diff summary
  2. All events conform to a documented JSON schema contract that clients can validate against, with versioned event types (artifact.created, artifact.modified, artifact.deleted, phase.transition, verdict.changed)
  3. An Obsidian plugin (or any WebSocket client) can subscribe to the bridge and receive new receipts, queries, and findings as they appear without polling
  4. A connected surface can send a mutation request (attach evidence, update verdict, add IOC) and the bridge validates it against the case model before delegating execution to `thrunt-tools.cjs`
  5. A client that disconnects and reconnects receives missed events replayed from the file watcher journal, ensuring no data loss during transient network interruptions
**Plans**: TBD

### Phase 23: Certified Adapters (Elastic + CrowdStrike)
**Goal**: Hunters investigating in Elastic/Kibana or CrowdStrike Falcon consoles get automatic extraction of queries, results, and entities — backed by fixture tests and a certification campaign that detects when vendor UIs drift
**Depends on**: Phase 21
**Requirements**: ADPT-01, ADPT-02, ADPT-03, ADPT-04
**Success Criteria** (what must be TRUE):
  1. With the Elastic adapter active on a Kibana Discover/Dashboard/Security page, the extension extracts KQL queries, result tables, and entity values (IPs, hostnames, users) from the live DOM
  2. With the CrowdStrike adapter active on a Falcon console page, the extension extracts FQL queries, detection details, and endpoint entities from the live DOM
  3. Both adapters have Playwright test suites that run extraction against saved HTML fixture snapshots, catching regressions without needing live vendor access
  4. Both adapters support a certification campaign workflow: capture baseline fixtures, replay extraction, detect drift from baseline, and surface drift for reviewer approval before updating
**Plans**: TBD

### Phase 24: Sidepanel UI
**Goal**: Hunters have a persistent browser extension sidepanel that shows live case state, evidence captured so far, vendor connection health, hypothesis status, and recommended next actions — making the extension a full investigation companion rather than just a capture tool
**Depends on**: Phase 22, Phase 23
**Requirements**: SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06
**Success Criteria** (what must be TRUE):
  1. Hunter opens the sidepanel and immediately sees current case identity (signal name, owner, active phase, status) populated from `.planning/` artifacts via the bridge without manual configuration
  2. Hunter sees a scrollable evidence timeline showing all captured clips, receipts, and queries in chronological order with vendor badges (Splunk, Elastic, CrowdStrike, etc.) indicating source
  3. Hunter sees vendor connection status for each active adapter (connected/disconnected/extracting) and hypothesis cards showing verdict badges with linked evidence counts
  4. Hunter sees contextual recommended actions (e.g., "3 hypotheses have no evidence", "Phase 2 ready for execution") derived from case state analysis
  5. Hunter can click any evidence item, hypothesis, or action to navigate to the corresponding artifact in the vendor console or open it through the bridge
**Plans**: TBD

### Phase 25: Extraction Adapters (AWS, Okta, M365)
**Goal**: Hunters investigating in AWS CloudTrail, Okta Admin Console, or M365 Defender get extraction of queries and entities, with clear messaging for unsupported vendor pages — extending coverage beyond the certified top-3 stack
**Depends on**: Phase 23
**Requirements**: ADPT-05, ADPT-06, ADPT-07, ADPT-08, ADPT-09
**Success Criteria** (what must be TRUE):
  1. With the AWS CloudTrail adapter active, the extension extracts event queries, result tables, and resource entities (ARNs, regions, principals) from the AWS Console DOM
  2. With the Okta adapter active, the extension extracts System Log queries, event details, and user/app entities from the Okta Admin Console DOM
  3. With the M365 Defender adapter active, the extension extracts KQL queries, incident details, and device/user entities from the Microsoft Security portal DOM
  4. When navigating to a page with no matching adapter or an unsupported vendor, the sidepanel displays a clear "adapter loading" or "not yet supported" message rather than failing silently
  5. All three extraction adapters have fixture-backed test suites validating extraction against saved HTML snapshots
**Plans**: TBD

### Phase 26: Detection Promotion
**Goal**: Hunters can turn their findings into deployable detection rules — a single CLI command reads FINDINGS.md and generates Sigma, Splunk SPL, or Sentinel KQL rules with ATT&CK mappings and confidence scoring, creating a direct path from investigation to defense
**Depends on**: Phase 21 (reads `.planning/` directly, no bridge dependency)
**Requirements**: DTCT-01, DTCT-02, DTCT-03, DTCT-04, DTCT-05, DTCT-06
**Success Criteria** (what must be TRUE):
  1. Running `thrunt findings promote --format sigma` produces valid Sigma YAML rules with detection logic, log source mappings, and technique IDs derived from the hunt's FINDINGS.md
  2. Running `thrunt findings promote --format splunk` produces SPL correlation searches that are deployable as Splunk saved searches
  3. Running `thrunt findings promote --format kql` produces Sentinel analytics rules with valid KQL queries and entity mappings
  4. Each promoted detection includes ATT&CK technique mapping (from hypothesis tags) and a confidence tag (high/medium/low) derived from evidence strength and receipt coverage
  5. Promoted detections are written to `.planning/DETECTIONS/` as versioned markdown artifacts with provenance linking back to the source finding and originating hunt
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 12/12 | Complete | 2026-04-01 |
| 7-11 | v2.0 | 12/12 | Complete | 2026-04-02 |
| 12. Design System & Webview Infrastructure | v3.0 | 3/3 | Complete | 2026-04-02 |
| 13. Hunt Overview Dashboard | v3.0 | 3/3 | Complete | 2026-04-02 |
| 14. Evidence Board | v3.0 | 3/3 | Complete | 2026-04-02 |
| 15. Query Analysis Upgrades | v3.0 | 3/3 | Complete | 2026-04-03 |
| 16. Cross-Surface Navigation | v3.0 | 3/3 | Complete | 2026-04-03 |
| 16.1. Selection Rendering & Keyboard Nav | v3.0 | 2/2 | Complete | 2026-04-03 |
| 17. War Room Copy | v4.0 | 1/1 | Complete | 2026-04-03 |
| 18. SLA Countdown Timer | v4.0 | 1/1 | Complete | 2026-04-03 |
| 19. IOC Quick-Entry | v4.0 | 1/1 | Complete | 2026-04-03 |
| 20. CLI Bridge | v4.0 | 2/2 | Complete | 2026-04-03 |
| 21. Bridge Hardening | 1/2 | In Progress|  | - |
| 22. MCP Event Bridge | v5.0 | 0/? | Not started | - |
| 23. Certified Adapters (Elastic + CrowdStrike) | v5.0 | 0/? | Not started | - |
| 24. Sidepanel UI | v5.0 | 0/? | Not started | - |
| 25. Extraction Adapters (AWS, Okta, M365) | v5.0 | 0/? | Not started | - |
| 26. Detection Promotion | v5.0 | 0/? | Not started | - |
