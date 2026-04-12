# Requirements: THRUNT GOD

**Defined:** 2026-04-12
**Core Value:** Close the loop from evidence capture to detection deployment — every hunt produces evidence chains, intelligence updates, and deployable detection rules

## v5.0 Requirements

Requirements for v5.0 Hunt Ecosystem: Evidence In, Detections Out. Each maps to roadmap phases.

### Sidepanel UI

- [x] **SIDE-01**: Hunter opens the browser extension sidepanel and sees current case identity (signal, owner, phase, status) derived from `.planning/` artifacts via the bridge
- [ ] **SIDE-02**: Hunter sees a scrollable evidence timeline showing captured clips, receipts, and queries in chronological order with vendor badges
- [x] **SIDE-03**: Hunter sees vendor connection status showing which adapters are active, certified, and extracting on the current page
- [x] **SIDE-04**: Hunter sees hypothesis cards with verdict badges (Supported/Disproved/Inconclusive/Open) and linked evidence counts
- [x] **SIDE-05**: Hunter sees recommended next actions derived from case state (e.g., "3 hypotheses have no evidence", "Phase 2 ready for execution")
- [ ] **SIDE-06**: Hunter can click any evidence item or hypothesis to navigate to the corresponding artifact in the source vendor console or open it in the bridge

### Adapter Coverage

- [x] **ADPT-01**: Elastic/Kibana adapter extracts KQL queries, result tables, and entities from Kibana Discover, Dashboard, and Security pages with real DOM selectors
- [x] **ADPT-02**: CrowdStrike Falcon adapter extracts FQL queries, detection details, and endpoint entities from Falcon console pages with real DOM selectors
- [x] **ADPT-03**: Elastic and CrowdStrike adapters have fixture-backed Playwright tests validating extraction against saved HTML snapshots
- [x] **ADPT-04**: Elastic and CrowdStrike adapters support certification campaigns (capture, replay, drift detection, reviewer approval)
- [ ] **ADPT-05**: AWS CloudTrail adapter extracts event queries, result tables, and resource entities from the AWS Console with real DOM selectors
- [ ] **ADPT-06**: Okta adapter extracts System Log queries, event details, and user/app entities from the Okta Admin Console with real DOM selectors
- [ ] **ADPT-07**: M365 Defender adapter extracts KQL queries, incident details, and device/user entities from the Microsoft Security portal with real DOM selectors
- [ ] **ADPT-08**: All stub vendors display a clear "adapter loading" or "not yet supported" message in the sidepanel rather than returning empty data silently
- [ ] **ADPT-09**: AWS, Okta, and M365 adapters have fixture-backed extraction tests (certification campaigns deferred to v6)

### Detection Promotion

- [ ] **DTCT-01**: Hunter runs `thrunt findings promote --format sigma` and gets valid Sigma rules generated from FINDINGS.md with technique IDs, log source mappings, and detection logic
- [ ] **DTCT-02**: Hunter runs `thrunt findings promote --format splunk` and gets SPL correlation searches deployable as Splunk saved searches
- [ ] **DTCT-03**: Hunter runs `thrunt findings promote --format kql` and gets Sentinel analytics rules with KQL queries and entity mappings
- [ ] **DTCT-04**: Each promoted detection includes ATT&CK technique mapping derived from hunt hypothesis tags and finding classifications
- [ ] **DTCT-05**: Each promoted detection includes a confidence tag (high/medium/low) derived from evidence strength and receipt coverage
- [ ] **DTCT-06**: Promoted detections are written to `.planning/DETECTIONS/` as versioned artifacts with provenance linking back to the source finding and hunt

### MCP Event Bridge

- [x] **MCPB-01**: Bridge broadcasts structured events (artifact created, modified, deleted, phase transition, verdict change) via WebSocket when `.planning/` files change
- [x] **MCPB-02**: Events follow a documented schema contract with event type, artifact path, timestamp, and diff summary
- [x] **MCPB-03**: Obsidian plugin can subscribe to bridge events and auto-ingest new receipts, queries, and findings into the vault
- [x] **MCPB-04**: Surfaces (browser extension, Obsidian) can send mutation requests back through the bridge (attach evidence, update hypothesis verdict, add IOC)
- [x] **MCPB-05**: Bridge validates inbound mutations against the case model and delegates to `thrunt-tools.cjs` for execution
- [x] **MCPB-06**: Event protocol supports reconnection with catch-up (missed events replayed from file watcher journal)

### Bridge Hardening

- [x] **HARD-01**: All subprocess calls to `thrunt-tools.cjs` have configurable timeouts (default 30s) with clean SIGTERM→SIGKILL escalation
- [x] **HARD-02**: Bridge emits structured JSON logs for all HTTP requests, WebSocket events, subprocess calls, and errors
- [x] **HARD-03**: Bridge exposes `/api/health` endpoint returning uptime, connected clients, active case, last file-watcher event, and subprocess health
- [x] **HARD-04**: Errors are classified (auth, timeout, subprocess, file-system, validation) with actionable messages in API responses
- [x] **HARD-05**: Bridge degrades gracefully when `thrunt-tools.cjs` is unavailable — read operations continue, write operations return clear errors

## v4.0 Requirements (Shipped)

### War Room Copy

- [x] **AIRW-01**: User can right-click a receipt in sidebar and copy a Slack-formatted finding summary to clipboard
- [x] **AIRW-02**: User can right-click a hypothesis and copy a formatted assessment with verdict and supporting evidence
- [x] **AIRW-03**: User can invoke "Copy Hunt Overview" command for a full-status summary with phase progress and top findings
- [x] **AIRW-04**: User can invoke "Copy ATT&CK Summary" for a technique-mapped finding table

### SLA Countdown Timer

- [x] **AIRW-05**: User can start an SLA timer from command palette with configurable phase durations (detect, contain, report)
- [x] **AIRW-06**: Status bar shows remaining time with color progression (green -> yellow -> orange -> red)
- [x] **AIRW-07**: Timer persists across VS Code restarts via workspaceState
- [x] **AIRW-08**: User receives notification on SLA phase expiry with snooze/advance options

### IOC Quick-Entry

- [x] **AIRW-09**: User can paste an IOC via command palette and system auto-classifies type (IPv4, hash, domain, email, etc.)
- [x] **AIRW-10**: IOC matches are highlighted via text editor decorations across all open QRY-*.md and RCT-*.md files
- [x] **AIRW-11**: Drain Template Viewer highlights template bars containing IOC matches via webview messaging
- [x] **AIRW-12**: Sidebar nodes for queries/receipts with IOC matches show visual badges

### CLI Bridge

- [x] **AIRW-13**: User can select and run a hunt phase from QuickPick with streaming output in a dedicated output channel
- [x] **AIRW-14**: Status bar shows live progress (query count, event count) parsed from CLI structured output
- [x] **AIRW-15**: Sidebar and webview panels auto-refresh when CLI writes new artifacts (via ArtifactWatcher)
- [x] **AIRW-16**: CLI errors are mapped to VS Code diagnostics with actionable quick-fix suggestions
- [x] **AIRW-17**: User can cancel a running CLI command with clean process termination

## v6+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Certification Expansion

- **CERT-01**: Certification campaigns for AWS, Okta, M365 adapters
- **CERT-02**: Automated nightly drift detection against fixture baselines

### Detection Advancement

- **DTCT-07**: Detection promotion via MCP tool (not just CLI)
- **DTCT-08**: Detection deployment templates for CI/CD pipelines

### Sidepanel Enhancement

- **SIDE-07**: Sidepanel theme customization and vendor-specific layouts

### Multi-Workspace

- **MCPB-07**: Multi-workspace bridge support (switch cases without restart)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native SIEM apps (Splunk App, Kibana plugin, Sentinel companion) | Marketplace approval overhead; browser extension covers the use case for v5.0 |
| Live query execution from browser extension | Bridge delegates to CLI; extension is evidence capture, not query engine |
| Detection auto-deployment to SIEM | Promotion generates artifacts; deployment requires org-specific CI/CD |
| Obsidian plugin implementation | Separate milestone on feat/obsidian branch; bridge provides the protocol |
| Multi-workspace bridge | Single-case focus for v5.0; multi-workspace deferred |
| Real-time query streaming from SIEM APIs | Original v5.0 MCP/SIEM connector plan; superseded by browser-first approach |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARD-01 | Phase 21 | Complete |
| HARD-02 | Phase 21 | Complete |
| HARD-03 | Phase 21 | Complete |
| HARD-04 | Phase 21 | Complete |
| HARD-05 | Phase 21 | Complete |
| MCPB-01 | Phase 22 | Complete |
| MCPB-02 | Phase 22 | Complete |
| MCPB-03 | Phase 22 | Complete |
| MCPB-04 | Phase 22 | Complete |
| MCPB-05 | Phase 22 | Complete |
| MCPB-06 | Phase 22 | Complete |
| ADPT-01 | Phase 23 | Complete |
| ADPT-02 | Phase 23 | Complete |
| ADPT-03 | Phase 23 | Complete |
| ADPT-04 | Phase 23 | Complete |
| SIDE-01 | Phase 24 | Complete |
| SIDE-02 | Phase 24 | Pending |
| SIDE-03 | Phase 24 | Complete |
| SIDE-04 | Phase 24 | Complete |
| SIDE-05 | Phase 24 | Complete |
| SIDE-06 | Phase 24 | Pending |
| ADPT-05 | Phase 25 | Pending |
| ADPT-06 | Phase 25 | Pending |
| ADPT-07 | Phase 25 | Pending |
| ADPT-08 | Phase 25 | Pending |
| ADPT-09 | Phase 25 | Pending |
| DTCT-01 | Phase 26 | Pending |
| DTCT-02 | Phase 26 | Pending |
| DTCT-03 | Phase 26 | Pending |
| DTCT-04 | Phase 26 | Pending |
| DTCT-05 | Phase 26 | Pending |
| DTCT-06 | Phase 26 | Pending |

**Coverage:**
- v5.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation (30/30 mapped)*
