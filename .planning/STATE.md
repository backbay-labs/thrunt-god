---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Sidebar Automation & Operations
status: in_progress
stopped_at: Completed 60-02-PLAN.md
last_updated: "2026-04-09T21:40:37Z"
last_activity: 2026-04-09 -- Completed 60-02 (Context-aware highlighting, tree selection listener, command count)
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 8
  completed_plans: 7
  percent: 87
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v3.1 Sidebar Automation & Operations — Phase 60: Command Deck Webview

## Current Milestone: v3.1 Sidebar Automation & Operations

**Goal:** Add a dedicated Automation section to the VS Code sidebar that separates artifact navigation (Investigation) from execution (Automation), with MCP runtime controls, a curated command deck, reusable YAML runbooks, and full execution history with safety guardrails.

## Current Position

Phase: 60 of 62 (Command Deck Webview)
Plan: 2 of 3 plans in phase
Status: In progress
Last activity: 2026-04-09 -- Completed 60-02 (Context-aware highlighting, tree selection listener, command count)

Progress: [████████░░] 81% (v3.1 Phase 60: 2/3 plans)

## Accumulated Context

### Decisions

- v3.1 Architecture: Second tree view (automationTree) below existing huntTree — not integrated into investigation tree
- Mental model: Top = evidence/investigation, Bottom = execution/automation
- MCP integration via subprocess only — no in-process import of @modelcontextprotocol/sdk into the extension
- Runbooks as YAML files in .planning/runbooks/ — tree for discovery, webview for execution
- 5 runbook step types: cli, mcp, open, note, confirm
- Command deck is curated (10 built-in) + user templates, not every CLI command
- All mutating actions require confirmation dialog with environment indicator
- Execution history persisted to .planning/.run-history.json with configurable retention (default 100)
- AutomationTreeDataProvider is independent from HuntTreeDataProvider (separate event emitters)
- [Phase 58]: AutomationTreeDataProvider uses own EventEmitter, independent from HuntTreeDataProvider (confirmed in implementation)
- [Phase 58]: Root node contextValue naming convention: automationMcp, automationCommandDeck, automationRunbooks, automationRecentRuns
- [Phase 58]: AutomationTreeDataProvider and AutomationTreeItem re-exported from extension.ts for test bundle access
- [Phase 58]: File watcher for runbooks uses RelativePattern with .planning/runbooks/*.{yaml,yml} glob

- [Phase 59]: MCPStatusManager uses subprocess spawn for health checks, consistent with MCP subprocess-only integration pattern
- [Phase 59]: Health check timeout at 10 seconds with SIGTERM then SIGKILL after 2s grace period
- [Phase 59]: dbOpts declaration moved before --health/--list-tools blocks to support early-exit paths
- [Phase 59]: MCP server path resolution: prefer thruntGod.mcp.serverPath config, fall back to workspace-local apps/mcp/bin/server.cjs
- [Phase 59]: MCP command handler pattern: async try/catch with showInformationMessage on success, showErrorMessage on failure
- [Phase 59]: McpControlPanel follows ProgramDashboardPanel pattern exactly for webview host consistency
- [Phase 59]: Tool testing via --run-tool subprocess flag with 30s timeout, keeping MCP SDK out of extension host
- [Phase 59]: Profile switching updates workspace config then restarts MCPStatusManager

- [Phase 60]: CommandDeckPanel follows McpControlPanel pattern exactly for webview host consistency
- [Phase 60]: CLI command execution uses placeholder in Plan 01; full CLIBridge wiring deferred to Plan 03
- [Phase 60]: 10 built-in commands: Investigation (2), Execution (3), Intelligence (3), Maintenance (2)
- [Phase 60]: Context relevance mapping mirrored in extension host and webview for decoupled operation
- [Phase 60]: Hunt tree changed from registerTreeDataProvider to createTreeView for onDidChangeSelection events
- [Phase 60]: setCommandCount follows setRunbookCount pattern for consistency in AutomationTreeDataProvider

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-09T21:40:37Z
Stopped at: Completed 60-02-PLAN.md
Resume: Phase 60 plan 2 complete. Context-aware command highlighting via getContextRelevantIds() and tree selection listener. AutomationTreeDataProvider shows live "10 commands" count. 356 total tests passing. Ready for 60-03.
