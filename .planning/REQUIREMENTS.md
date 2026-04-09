# Requirements: THRUNT GOD v3.1

**Defined:** 2026-04-09
**Core Value:** Hunters get a dedicated operational surface in the VS Code sidebar — separating artifact navigation (top: Investigation) from execution (bottom: Automation) — with MCP runtime controls, a curated command deck, reusable runbooks, and full execution history with safety guardrails.

## v3.1 Requirements

Requirements for Sidebar Automation & Operations release. Each maps to roadmap phases.

### Sidebar Structure

- **SIDE-01**: VS Code sidebar splits into two distinct sections: Investigation (existing huntTree) at top, Automation (new automationTree) at bottom
- **SIDE-02**: Automation section has four root nodes: MCP, Command Deck, Runbooks, Recent Runs
- **SIDE-03**: Automation tree refreshes independently from investigation tree and responds to MCP state changes, command execution, and runbook filesystem changes

### MCP Runtime

- **MCP-10**: MCP tree node shows connection status (connected/disconnected), active server profile, last health check timestamp, and error badge when broken
- **MCP-11**: Quick actions from tree context menu: start MCP, restart MCP, run health check, list tools, open MCP logs
- **MCP-12**: MCP webview panel displays full server status, tool inventory with descriptions, and profile/environment toggle
- **MCP-13**: MCP webview supports testing a tool with sample input and viewing the response inline
- **MCP-14**: MCP health check executes via subprocess against @thrunt/mcp server and reports tool count, db status, and uptime

### Command Deck

- **CMD-01**: Curated deck of high-value THRUNT actions displayed in a webview panel (not raw CLI commands)
- **CMD-02**: Default deck includes: Runtime Doctor, Open Program Dashboard, Open Evidence Board, Analyze Coverage, Generate ATT&CK Layer, Query Knowledge, Run Pack, Publish Findings, Close Case, Reindex Intel/Detections
- **CMD-03**: Users can pin favorite commands; pins persist in workspace state across sessions
- **CMD-04**: Recent command history shows last 20 executed commands with timestamps and success/failure status
- **CMD-05**: Context-aware commands surface relevant actions based on active sidebar selection (e.g., phase selected -> Run Phase, case selected -> Close Case)
- **CMD-06**: Parameterized command templates allow saved commands with placeholders (e.g., `Run pack: {packId}`, `Query knowledge: {selectedTechnique}`)

### Runbooks

- **RUN-01**: Runbook format defined as `.planning/runbooks/*.yaml` with schema: name, description, inputs, steps, dry_run, output_capture, success_conditions, failure_conditions
- **RUN-02**: Runbook steps support: run CLI command, call MCP tool, open artifact, append note/finding, ask for confirmation before destructive step
- **RUN-03**: Runbook tree nodes discovered from filesystem with file watcher for live updates
- **RUN-04**: Runbook execution engine processes steps sequentially with output capture per step
- **RUN-05**: Runbook webview panel for selecting runbooks, filling input parameters, viewing step-by-step execution output, and browsing run history
- **RUN-06**: Dry-run mode executes validation and shows planned actions without side effects

### Execution History & Guardrails

- **GUARD-01**: All command deck and runbook executions log stdout/stderr, exit code, timestamps, and duration to persistent storage
- **GUARD-02**: Every action in command deck and runbooks carries a read-only or mutating label visible in the UI
- **GUARD-03**: Mutating actions require explicit confirmation dialog before execution
- **GUARD-04**: Clear environment/profile indicator shows which MCP server and connector target a command will hit before execution
- **GUARD-05**: Recent Runs tree node provides browsable execution history with expandable output per run
- **GUARD-06**: Execution history persisted in workspace state with configurable retention (default: 100 entries)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full runbook visual editor in webview | Tree for discovery, YAML for authoring; visual editor deferred |
| MCP HTTP transport from extension | stdio subprocess is sufficient for v3.1; HTTP wrapper deferred |
| Cross-workspace runbook sharing | Single workspace scope for v3.1; sharing deferred |
| Runbook scheduling/cron | Manual trigger only; scheduled execution deferred |
| Command deck marketplace | Curated built-in deck + user templates sufficient for v3.1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIDE-01 | Phase 58 | Planned |
| SIDE-02 | Phase 58 | Planned |
| SIDE-03 | Phase 58 | Planned |
| MCP-10 | Phase 59 | Complete |
| MCP-11 | Phase 59 | Planned |
| MCP-12 | Phase 59 | Planned |
| MCP-13 | Phase 59 | Planned |
| MCP-14 | Phase 59 | Complete |
| CMD-01 | Phase 60 | Planned |
| CMD-02 | Phase 60 | Planned |
| CMD-03 | Phase 60 | Planned |
| CMD-04 | Phase 60 | Planned |
| CMD-05 | Phase 60 | Planned |
| CMD-06 | Phase 60 | Planned |
| RUN-01 | Phase 61 | Complete |
| RUN-02 | Phase 61 | Complete |
| RUN-03 | Phase 61 | Complete |
| RUN-04 | Phase 61 | Complete |
| RUN-05 | Phase 61 | Complete |
| RUN-06 | Phase 61 | Complete |
| GUARD-01 | Phase 62 | Complete |
| GUARD-02 | Phase 62 | Planned |
| GUARD-03 | Phase 62 | Complete |
| GUARD-04 | Phase 62 | Complete |
| GUARD-05 | Phase 62 | Planned |
| GUARD-06 | Phase 62 | Complete |

**Coverage:**
- v3.1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
