# Requirements: THRUNT God VS Code Extension v4.0

**Defined:** 2026-04-02
**Core Value:** Surface hidden structure in security telemetry so interesting events become obvious without requiring hunters to write perfect queries

## v4.0 Requirements

Requirements for the Active Incident Workflow milestone. Design: `design/ACTIVE-INCIDENT-WORKFLOW.md`

### War Room Copy

- [x] **AIRW-01**: User can right-click a receipt in sidebar and copy a Slack-formatted finding summary to clipboard
- [x] **AIRW-02**: User can right-click a hypothesis and copy a formatted assessment with verdict and supporting evidence
- [x] **AIRW-03**: User can invoke "Copy Hunt Overview" command for a full-status summary with phase progress and top findings
- [x] **AIRW-04**: User can invoke "Copy ATT&CK Summary" for a technique-mapped finding table

### SLA Countdown Timer

- [x] **AIRW-05**: User can start an SLA timer from command palette with configurable phase durations (detect, contain, report)
- [x] **AIRW-06**: Status bar shows remaining time with color progression (green → yellow → orange → red)
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

## Future Milestones

- v5.0 MCP/SIEM Platform scope remains tracked in `ROADMAP.md` and `design/MCP-SIEM-CONNECTORS.md`.
- v3.0 Investigative Surfaces requirements were archived to `.planning/milestones/v3.0-REQUIREMENTS.md` during lifecycle normalization.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AIRW-01 | Phase 17 | Complete |
| AIRW-02 | Phase 17 | Complete |
| AIRW-03 | Phase 17 | Complete |
| AIRW-04 | Phase 17 | Complete |
| AIRW-05 | Phase 18 | Complete |
| AIRW-06 | Phase 18 | Complete |
| AIRW-07 | Phase 18 | Complete |
| AIRW-08 | Phase 18 | Complete |
| AIRW-09 | Phase 19 | Complete |
| AIRW-10 | Phase 19 | Complete |
| AIRW-11 | Phase 19 | Complete |
| AIRW-12 | Phase 19 | Complete |
| AIRW-13 | Phase 20 | Complete |
| AIRW-14 | Phase 20 | Complete |
| AIRW-15 | Phase 20 | Complete |
| AIRW-16 | Phase 20 | Complete |
| AIRW-17 | Phase 20 | Complete |

**Coverage:** 17 v4.0 requirements total, 17 complete, 0 pending.

---
*Last updated: 2026-04-03 — v4.0 Active Incident Workflow implemented and verified*
