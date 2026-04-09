---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Sidebar Automation & Operations
status: completed
stopped_at: Completed 62-02-PLAN.md
last_updated: "2026-04-09T23:03:39.827Z"
last_activity: 2026-04-09 -- Completed 62-02 (Wiring, Recent Runs tree, confirmation gates, 419 tests)
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v3.1 Sidebar Automation & Operations — Phase 62: Execution History & Guardrails

## Current Milestone: v3.1 Sidebar Automation & Operations

**Goal:** Add a dedicated Automation section to the VS Code sidebar that separates artifact navigation (Investigation) from execution (Automation), with MCP runtime controls, a curated command deck, reusable YAML runbooks, and full execution history with safety guardrails.

## Current Position

Phase: 62 of 62 (Execution History & Guardrails)
Plan: 2 of 2 plans in phase
Status: Phase 62 complete -- v3.1 milestone complete
Last activity: 2026-04-09 -- Completed 62-02 (Wiring, Recent Runs tree, confirmation gates, 419 tests)

Progress: [██████████] 100% (v3.1 Phase 62: 2/2 plans)

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
- [Phase 60]: CLI execution uses direct subprocess spawn with process.execPath + cliPath rather than CLIBridge instance to keep command deck self-contained
- [Phase 60]: resolveCliPath prefers thruntGod.cli.path config, falls back to workspace-local dist/thrunt-god/bin/thrunt-tools.cjs
- [Phase 60]: Template IDs generated from label via slugification with tpl- prefix for namespace separation from built-in commands

- [Phase 61]: Runtime validation (validateRunbook) instead of Zod — avoids new dependency while providing equivalent validation
- [Phase 61]: Five step action types (cli, mcp, open, note, confirm) as established in architecture decisions
- [Phase 61]: RunbookRegistry uses sync fs reads internally with async public API for pattern consistency
- [Phase 61]: RunbookEngine uses async generator to yield StepResult per step for real-time webview streaming
- [Phase 61]: CLI steps use 60s timeout with SIGTERM; MCP steps use 30s timeout with SIGTERM then SIGKILL after 2s grace
- [Phase 61]: resolveParams exported separately for direct testing and reuse outside RunbookEngine
- [Phase 61]: RunbookPanel follows CommandDeckPanel/McpControlPanel pattern exactly for webview host consistency
- [Phase 61]: confirmResolve uses Promise-based blocking: webview sends confirm:continue/abort, host resolves stored promise
- [Phase 61]: Runbook tree children use contextValue automationRunbookItem with dataId set to absolute file path
- [Phase 61]: RunbookRegistry.discover() called with void .then() pattern since activate callback is not async
- [Phase 62]: ExecutionLogger uses atomic write pattern (tmp file + fs.renameSync) for crash-safe persistence
- [Phase 62]: History file stored at .planning/.run-history.json, consistent with existing .planning/ convention
- [Phase 62]: Configurable retention via thruntGod.executionHistory.maxEntries (default 100, min 10, max 10000)
- [Phase 62]: No webview message protocol needed -- Recent Runs tree reads directly from ExecutionLogger in extension host
- [Phase 62]: Event-driven tree refresh: ExecutionLogger fires onDidAppend event, extension.ts subscribes to refresh automationProvider
- [Phase 62]: runCli returns {stdout, stderr, exitCode} tuple for full capture in ExecutionEntry logging

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-09T23:03:39.823Z
Stopped at: Completed 62-02-PLAN.md
Resume: v3.1 milestone complete. Phase 62 Plan 02 wired ExecutionLogger into CommandDeckPanel, RunbookPanel, and Recent Runs tree. Mutating actions show confirmation with environment indicator. Recent Runs tree shows children with status icons and dynamic run count. 419 tests passing.
