# Roadmap: THRUNT GOD

## Milestones

- v1.0 Query Runtime & Connector SDK (Phases 1-6) -- shipped 2026-03-25
- v1.1 Hunt Packs & Technique Packs (Phases 7-11) -- shipped 2026-03-25
- v1.2 Evidence Integrity & Provenance (Phases 12-16) -- shipped 2026-03-27
- v1.3 Detection Promotion Pipeline (Phases 17-19) -- shipped 2026-03-27
- v1.4 Hunt Learning & Recommendation Engine (Phases 20-22) -- shipped 2026-03-27
- v1.5 TUI Operator Console (Phases 23-26) -- shipped 2026-03-30
- v1.6 Live Connector Integrations (Phases 27-30) -- shipped 2026-03-30
- v2.0 Developer Experience & CI (Phases 31-37) -- shipped 2026-03-30
- v2.1 Advanced Hunt Features (Phases 38-44) -- shipped 2026-03-31
- v2.2 Connector Ecosystem (Phases 45-49) -- shipped 2026-03-31
- v3.0 Hunt Program Intelligence (Phases 50-57) -- shipped 2026-04-08
- **v3.1 Sidebar Automation & Operations (Phases 58-62) -- in progress**

## v3.1 Sidebar Automation & Operations

**Milestone Goal:** Add a dedicated Automation section to the VS Code sidebar that separates artifact navigation (Investigation) from execution (Automation), with MCP runtime controls, a curated command deck, reusable YAML runbooks, and full execution history with safety guardrails.

**Mental model:** Top = evidence, Bottom = execution.

## Phases

**Phase Numbering:**
- Integer phases (58-62): Planned milestone work
- Decimal phases (e.g., 58.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 58: Sidebar Automation Section Foundation** - Second tree view in sidebar with MCP, Command Deck, Runbooks, Recent Runs root nodes (completed 2026-04-09)
- [x] **Phase 59: MCP Runtime Control Panel** - MCP status node with health checks, quick actions, and full webview control panel (completed 2026-04-09)
- [ ] **Phase 60: Command Deck Webview** - Curated action deck with pins, recents, context-aware commands, and parameterized templates
- [ ] **Phase 61: Runbook Engine & Editor** - YAML runbook format, parser, execution engine with step types, and webview panel
- [ ] **Phase 62: Execution History & Guardrails** - Logged execution history, read-only/mutating labels, confirmation dialogs, environment indicators

## Phase Details

### Phase 58: Sidebar Automation Section Foundation
**Goal**: The VS Code sidebar gains a second tree view ("Automation") below the existing Investigation tree, with four expandable root nodes (MCP, Command Deck, Runbooks, Recent Runs) that respond to workspace state changes independently from the investigation tree
**Depends on**: Nothing (first v3.1 phase — builds on existing sidebar infrastructure)
**Requirements**: SIDE-01, SIDE-02, SIDE-03
**Success Criteria** (what must be TRUE):
  1. Opening a workspace with `.hunt/MISSION.md` or `.planning/MISSION.md` shows two sidebar sections: "Investigation" (existing tree) and "Automation" (new tree)
  2. The Automation tree shows four root nodes: MCP ($(plug) icon), Command Deck ($(terminal) icon), Runbooks ($(notebook) icon), Recent Runs ($(history) icon)
  3. The Automation tree has its own `AutomationTreeDataProvider` that fires `onDidChangeTreeData` independently from `HuntTreeDataProvider`
  4. package.json `contributes.views.thruntGodSidebar` registers both `thruntGod.huntTree` and `thruntGod.automationTree` with correct `when` clauses
  5. Clicking any Automation root node shows a placeholder description (e.g., "No MCP server configured") — real content wired in subsequent phases
  6. All existing sidebar tests pass unchanged; new unit tests cover AutomationTreeDataProvider root nodes and refresh behavior
**Plans**: 2 plans
  - 58-01: AutomationTreeDataProvider, AutomationTreeItem, NodeType extensions, package.json view registration
  - 58-02: Wiring into extension.ts activate(), file watcher subscription for .planning/runbooks/, unit tests

### Phase 59: MCP Runtime Control Panel
**Goal**: The MCP tree node becomes a live runtime control panel showing connection status, health check results, and error badges, with quick actions from context menu and a full webview panel for tool inventory and testing
**Depends on**: Phase 58 (Automation tree exists with MCP root node)
**Requirements**: MCP-10, MCP-11, MCP-12, MCP-13, MCP-14
**Success Criteria** (what must be TRUE):
  1. The MCP node shows connection status (connected/disconnected) as description text with green/red icon, active server profile name, and last health check timestamp
  2. Right-clicking the MCP node offers: Start MCP, Restart MCP, Run Health Check, List Tools, Open MCP Logs
  3. "Run Health Check" spawns `node thrunt-mcp --health` and updates the MCP node with tool count, db status (intel.db size/table count), and uptime
  4. An error badge (red dot) appears on the MCP node when the last health check failed or the server process is not responding
  5. Opening the MCP webview panel shows: server status card, tool inventory table (name, description, input schema), profile/environment selector
  6. The MCP webview "Test Tool" form lets users select a tool, fill sample input JSON, execute it, and see the response rendered inline
  7. All MCP state is managed by a new `MCPStatusManager` class that emits change events consumed by the automation tree
**Plans**: 3 plans
  - 59-01: MCPStatusManager class (health check subprocess, status tracking, change events), MCP node rendering in AutomationTreeDataProvider
  - 59-02: MCP context menu commands (start, restart, health check, list tools, open logs), command registration in extension.ts
  - 59-03: MCP webview panel (McpControlPanel) with server status, tool inventory table, test tool form, profile toggle

### Phase 60: Command Deck Webview
**Goal**: A curated deck of high-value THRUNT actions lives in a webview panel accessible from the Command Deck tree node, with pinned favorites, recent history, context-aware suggestions, and parameterized command templates
**Depends on**: Phase 59 (MCP control panel pattern established for webview + tree integration)
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06
**Success Criteria** (what must be TRUE):
  1. Clicking the Command Deck tree node opens a webview panel showing a grid/list of curated THRUNT actions with icons, descriptions, and category grouping
  2. Default deck includes 10 commands: Runtime Doctor, Open Program Dashboard, Open Evidence Board, Analyze Coverage, Generate ATT&CK Layer, Query Knowledge, Run Pack, Publish Findings, Close Case, Reindex Intel/Detections
  3. Users can pin/unpin commands; pinned commands appear at the top of the deck and persist in `workspaceState` across sessions
  4. A "Recent" section shows the last 20 executed commands with timestamps and success/failure badges
  5. When a phase or case is selected in the investigation tree, the command deck highlights context-relevant commands (e.g., "Run Phase" for selected phase, "Close Case" for selected case)
  6. Users can create parameterized command templates with `{placeholder}` syntax; executing a template prompts for placeholder values before running
  7. Each command card shows a read-only or mutating badge indicating whether it changes state
**Plans**: 3 plans
  - 60-01: CommandDeckRegistry (built-in commands, user templates, pin/recent state), CommandDeckPanel webview scaffolding
  - 60-02: Command grid UI with categories, pin/unpin, recent history, context-aware highlighting, read-only/mutating badges
  - 60-03: Parameterized templates (save, prompt for values, execute), command execution bridge to CLI/MCP/extension commands

### Phase 61: Runbook Engine & Editor
**Goal**: Hunters can author reusable operator workflows as `.planning/runbooks/*.yaml` files with typed step actions (CLI, MCP tool, open artifact, append note, confirm), execute them from the sidebar with input parameter forms, and view step-by-step output in a webview panel
**Depends on**: Phase 60 (command execution patterns and webview infrastructure established)
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05, RUN-06
**Success Criteria** (what must be TRUE):
  1. A `.planning/runbooks/example.yaml` file with the defined schema (name, description, inputs, steps, dry_run, output_capture, success_conditions, failure_conditions) parses and validates without errors
  2. Runbook steps support five action types: `cli` (run CLI command), `mcp` (call MCP tool), `open` (open artifact in editor), `note` (append to finding/note file), `confirm` (pause for user confirmation before proceeding)
  3. The Runbooks tree node lists all `.yaml` files discovered in `.planning/runbooks/` with a file watcher that updates the tree when files are added/removed/renamed
  4. Executing a runbook from the tree opens a webview panel that prompts for input parameters, then shows step-by-step execution progress with captured output per step
  5. Dry-run mode executes validation, resolves all inputs, and shows planned actions for each step without executing side effects
  6. A `confirm` step pauses execution and shows a dialog in the webview; the user must click "Continue" or "Abort" before the next step runs
  7. Each completed runbook run is recorded in execution history with all step outputs and overall success/failure status
**Plans**: 3 plans
  - 61-01: Runbook YAML schema (Zod validation), parser, RunbookRegistry with filesystem discovery and watcher
  - 61-02: RunbookEngine (sequential step executor, output capture, dry-run mode, confirm step pause/resume)
  - 61-03: Runbook webview panel (input form, step progress, output viewer, run history), tree node rendering

### Phase 62: Execution History & Guardrails
**Goal**: All command deck and runbook executions are logged with full stdout/stderr capture, every action carries a visible safety classification, mutating actions require confirmation, and the Recent Runs tree node provides a browsable execution log with expandable output
**Depends on**: Phase 61 (runbook execution produces history entries)
**Requirements**: GUARD-01, GUARD-02, GUARD-03, GUARD-04, GUARD-05, GUARD-06
**Success Criteria** (what must be TRUE):
  1. Every command deck and runbook execution logs: command/runbook name, arguments, stdout, stderr, exit code, start time, duration, and success/failure status to persistent workspace storage
  2. All command deck actions and runbook steps display a visible "read-only" ($(eye)) or "mutating" ($(edit)) badge in both the tree and webview UI
  3. Executing a mutating action shows a confirmation dialog with the command, target environment/profile, and a warning about side effects — user must confirm before execution proceeds
  4. Before any command executes, the UI shows which MCP server profile and connector environment it will target (e.g., "Production: Splunk Enterprise" vs "Dev: Docker Splunk")
  5. The Recent Runs tree node expands to show the last N executions (configurable, default 100) with status icons, timestamps, and collapsible output per run
  6. Execution history persists across VS Code restarts via `workspaceState` or `.planning/.run-history.json` with configurable retention
  7. All existing tests pass; new tests cover ExecutionLogger, confirmation flow, and history persistence
**Plans**: 2 plans
  - 62-01: ExecutionLogger (persistent storage, retention policy), safety classification registry (read-only/mutating per command), confirmation dialog service
  - 62-02: Recent Runs tree node rendering, expandable output, environment indicator badge, integration tests

## Progress

**Execution Order:**
Phases execute in numeric order: 58 -> 59 -> 60 -> 61 -> 62

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 58. Sidebar Automation Section Foundation | 2/2 | Complete    | 2026-04-09 |
| 59. MCP Runtime Control Panel | 3/3 | Complete    | 2026-04-09 |
| 60. Command Deck Webview | 2/3 | In Progress|  |
| 61. Runbook Engine & Editor | 0/3 | Planned | - |
| 62. Execution History & Guardrails | 0/2 | Planned | - |
