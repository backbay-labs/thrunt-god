---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Sidebar Automation & Operations
status: in_progress
stopped_at: Completed 59-01-PLAN.md
last_updated: "2026-04-09T20:58:33Z"
last_activity: 2026-04-09 -- Completed 59-01 (MCPStatusManager, health check flags, shared types, status-driven tree)
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 13
  completed_plans: 3
  percent: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v3.1 Sidebar Automation & Operations — Phase 59: MCP Runtime Control Panel

## Current Milestone: v3.1 Sidebar Automation & Operations

**Goal:** Add a dedicated Automation section to the VS Code sidebar that separates artifact navigation (Investigation) from execution (Automation), with MCP runtime controls, a curated command deck, reusable YAML runbooks, and full execution history with safety guardrails.

## Current Position

Phase: 59 of 62 (MCP Runtime Control Panel)
Plan: 1 of 3 plans in phase
Status: In progress
Last activity: 2026-04-09 -- Completed 59-01 (MCPStatusManager, health check flags, shared types, status-driven tree)

Progress: [██--------] 23% (v3.1 Phase 59: 1/3 plans)

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

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-09T20:58:33Z
Stopped at: Completed 59-01-PLAN.md
Resume: Phase 59 plan 1 of 3 complete. MCPStatusManager class with subprocess health checks, --health/--list-tools server flags, shared MCP types, status-driven tree node rendering. 304 total tests passing. Ready for 59-02 (MCP context menu commands).
