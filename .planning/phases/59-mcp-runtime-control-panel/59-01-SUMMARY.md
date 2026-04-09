---
phase: 59-mcp-runtime-control-panel
plan: 01
subsystem: mcp, vscode-extension
tags: [mcp, health-check, subprocess, event-emitter, tree-view, vscode]

# Dependency graph
requires:
  - phase: 58-sidebar-automation-foundation
    provides: AutomationTreeDataProvider with MCP root node, extension lifecycle wiring
provides:
  - MCPStatusManager class with health check subprocess, status tracking, change events
  - MCP server --health flag returning structured JSON health report
  - MCP server --list-tools flag returning 10-tool JSON inventory
  - Shared mcp-control.ts types for webview communication
  - Status-driven MCP node rendering with colored icons and health check children
affects: [59-02 MCP context menu commands, 59-03 MCP webview panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [subprocess health check with timeout, MCPStatusManager EventEmitter pattern, mock mcpStatus for tree tests]

key-files:
  created:
    - apps/vscode/src/mcpStatusManager.ts
    - apps/vscode/shared/mcp-control.ts
    - apps/vscode/test/unit/mcp-status-manager.test.cjs
  modified:
    - apps/mcp/bin/server.cjs
    - apps/vscode/src/automationSidebar.ts
    - apps/vscode/src/extension.ts
    - apps/vscode/test/unit/automation-sidebar.test.cjs

key-decisions:
  - "MCPStatusManager uses subprocess spawn for health checks (no in-process MCP SDK import into extension)"
  - "Health check timeout at 10 seconds with SIGTERM then SIGKILL after 2s grace period"
  - "dbOpts moved before --health/--list-tools blocks to avoid scoping error in early-exit paths"

patterns-established:
  - "Mock MCPStatusManager pattern: simple object with getStatus() returning desired MCPStatus for tree tests"
  - "MCP server early-exit flags: --health and --list-tools process.exit(0) before McpServer creation"

requirements-completed: [MCP-10, MCP-14]

# Metrics
duration: 5min
completed: 2026-04-09
---

# Phase 59 Plan 01: MCP Status Manager Summary

**MCPStatusManager with subprocess health checks, --health/--list-tools server flags, shared MCP types, and status-driven tree node rendering with colored icons**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T20:53:25Z
- **Completed:** 2026-04-09T20:58:33Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- MCPStatusManager class with EventEmitter pattern, health check subprocess (10s timeout), start/stop/restart lifecycle, and listTools capability
- MCP server responds to --health flag with structured JSON: status, toolCount, dbSizeBytes, dbTableCount, uptimeMs, serverVersion
- MCP server responds to --list-tools flag with 10-tool JSON array including name, description, and inputSchema
- AutomationTreeDataProvider renders MCP node with green/red/spinning icons based on connection status, profile name, and health check timestamp
- MCP children show health check details (status, tool count, DB size/tables, errors)
- Shared types in mcp-control.ts for future webview communication
- 22 new tests (14 MCPStatusManager + 8 MCP status rendering), 304 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --health/--list-tools flags, shared types, MCPStatusManager** - `8052d18a` (feat)
2. **Task 2: Update AutomationTreeDataProvider with MCP status rendering + unit tests** - `647316b1` (feat)

**Bug fix:** `9987484a` (fix: move dbOpts before health check to fix scoping error)

## Files Created/Modified
- `apps/mcp/bin/server.cjs` - Added --health and --list-tools early-exit handlers before McpServer creation
- `apps/vscode/shared/mcp-control.ts` - Shared types for MCP webview (McpToolInfo, McpServerStatus, message types)
- `apps/vscode/src/mcpStatusManager.ts` - MCPStatusManager class with health check, listTools, start/stop/restart, EventEmitter
- `apps/vscode/src/automationSidebar.ts` - Status-driven MCP node with getMcpRootNode() and getMcpChildren() methods
- `apps/vscode/src/extension.ts` - Re-exports MCPStatusManager for test bundle access
- `apps/vscode/test/unit/mcp-status-manager.test.cjs` - 14 tests for MCPStatusManager exports and API
- `apps/vscode/test/unit/automation-sidebar.test.cjs` - 8 new tests for MCP status rendering with mock mcpStatus

## Decisions Made
- MCPStatusManager uses subprocess spawn for health checks, consistent with the project's MCP subprocess-only integration pattern (no in-process MCP SDK)
- Health check has 10-second timeout with SIGTERM followed by SIGKILL after 2s grace period
- dbOpts declaration moved before --health/--list-tools blocks to support early-exit paths that need database access

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dbOpts scoping error in MCP server health check**
- **Found during:** Task 1 verification (running `node server.cjs --health`)
- **Issue:** dbOpts was referenced in the --health handler but declared after McpServer creation; caused "Cannot access 'dbOpts' before initialization" error
- **Fix:** Moved dbOpts declaration before the --health/--list-tools blocks and removed the duplicate declaration
- **Files modified:** apps/mcp/bin/server.cjs
- **Verification:** `node apps/mcp/bin/server.cjs --health` returns valid JSON with status: healthy
- **Committed in:** 9987484a

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness. The plan's code snippet assumed dbOpts was already in scope at the insertion point.

## Issues Encountered
None beyond the dbOpts scoping issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCPStatusManager is ready for 59-02 (MCP context menu commands: start, restart, health check, list tools, open logs)
- Shared types in mcp-control.ts ready for 59-03 (MCP webview panel)
- AutomationTreeDataProvider accepts mcpStatus option, ready for wiring in extension.ts activate()
- All 304 tests pass

---
*Phase: 59-mcp-runtime-control-panel*
*Completed: 2026-04-09*
