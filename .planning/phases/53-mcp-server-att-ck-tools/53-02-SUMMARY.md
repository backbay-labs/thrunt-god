---
phase: 53-mcp-server-att-ck-tools
plan: 02
subsystem: mcp-server
tags: [mcp, att&ck, navigator, stdio, zod, coverage-analysis, threat-groups, layer-generation]

# Dependency graph
requires:
  - phase: 53-mcp-server-att-ck-tools
    plan: 01
    provides: "intel.cjs data layer with 8 query functions, openIntelDb, techniques/groups/software tables"
provides:
  - "MCP server entry point (mcp-hunt-intel/bin/server.cjs) with stdio transport"
  - "5 registered MCP tools: lookup_technique, search_techniques, lookup_group, generate_layer, analyze_coverage"
  - "ATT&CK Navigator v4.5 layer builder (mcp-hunt-intel/lib/layers.cjs)"
  - "Tool handler functions exported for direct testing"
  - "Timeout wrapper (withTimeout) enforcing 30s default / THRUNT_MCP_TIMEOUT configurable"
affects: [54-sigma-rules, mcp-server-extension]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk v1.29.0 (McpServer + StdioServerTransport)"]
  patterns: ["MCP stdio server with stdout purity (all logging via console.error)", "Tool handler functions exported separately for unit testing", "withTimeout wrapper using AbortController for tool SLA enforcement", "Navigator v4.5 layer builder with 4 modes (custom/group/coverage/gap)", "Graceful degradation pattern: try/catch around missing detections table for Phase 54 forward-compat"]

key-files:
  created:
    - mcp-hunt-intel/bin/server.cjs
    - mcp-hunt-intel/lib/tools.cjs
    - mcp-hunt-intel/lib/layers.cjs
    - tests/mcp-intel.test.cjs
  modified: []

key-decisions:
  - "MCP SDK StdioServerTransport accepts newline-delimited JSON (not Content-Length framing) for stdio mode"
  - "Tool handler functions exported from tools.cjs for direct unit testing (handleLookupTechnique, etc.)"
  - "generate_layer coverage/gap modes use try/catch on detections table query for Phase 54 graceful degradation"
  - "lookup_group supports both ID (G0007) and name/alias (APT28) lookup via fallback LIKE query"
  - "THRUNT_INTEL_DB_DIR env var supported in server.cjs for test isolation"

patterns-established:
  - "MCP tool handler pattern: async function receiving (db, args) returning { content: [{ type: 'text', text }], isError? } objects"
  - "buildNavigatorLayer(name, techniques, options) produces v4.5 layer JSON with techniqueID/score/enabled/color fields"
  - "Coverage analysis returns { group_id, group_name, total_techniques, covered, uncovered, gap_percent, by_tactic: [...] }"

requirements-completed: [MCP-01, MCP-02, MCP-03, MCP-04, MCP-05]

# Metrics
duration: 16min
completed: 2026-04-08
---

# Phase 53 Plan 02: MCP Server & ATT&CK Tools Summary

**MCP stdio server with 5 ATT&CK tools (technique lookup, FTS5 search, group intelligence, Navigator v4.5 layer generation in 4 modes, per-tactic coverage gap analysis) and timeout enforcement**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-08T16:07:16Z
- **Completed:** 2026-04-08T16:23:50Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files created:** 4

## Accomplishments
- Created MCP server entry point with stdio transport, stdout purity enforced (all logging via console.error)
- Registered 5 MCP tools with Zod input schemas: lookup_technique (ID + sub-technique enumeration), search_techniques (FTS5 + tactic/platform filters), lookup_group (ID or name/alias with techniques + software), generate_layer (4 modes: custom/group/coverage/gap producing Navigator v4.5 JSON), analyze_coverage (per-tactic breakdown with gap percentages)
- Built Navigator v4.5 layer builder producing layers with techniqueID, score, color, enabled, comment fields
- Implemented withTimeout wrapper using AbortController for 30s default tool timeout (configurable via THRUNT_MCP_TIMEOUT)
- Coverage analysis and generate_layer gracefully degrade before Phase 54 (no detections table: covered=0)
- 33 new tests covering all handlers, layer builder, timeout, stdout purity, and server smoke test; 2811 total tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for MCP tools, layers, server** - `8c2c2c2` (test)
2. **Task 1 (GREEN): Implement server.cjs, tools.cjs, layers.cjs** - `7c95e5c` (feat)

**Plan metadata:** (pending) (docs: complete plan)

_Note: TDD task has RED + GREEN commits_

## Files Created/Modified
- `mcp-hunt-intel/bin/server.cjs` - MCP server entry point with stdio transport, THRUNT_INTEL_DB_DIR env support
- `mcp-hunt-intel/lib/tools.cjs` - 5 tool handler functions with Zod schemas, registerTools, withTimeout wrapper
- `mcp-hunt-intel/lib/layers.cjs` - ATT&CK Navigator v4.5 layer builder (buildNavigatorLayer)
- `mcp-hunt-intel/package-lock.json` - Lock file for installed dependencies
- `tests/mcp-intel.test.cjs` - 33 tests for all tools, layers, timeout, server purity, smoke test

## Decisions Made
- MCP SDK StdioServerTransport accepts newline-delimited JSON (not Content-Length framing) -- smoke test updated accordingly
- Tool handler functions exported from tools.cjs for direct unit testing without spawning MCP server
- lookup_group supports both ID (G0007) and name/alias (APT28) lookup via SQL LIKE fallback
- THRUNT_INTEL_DB_DIR env var added to server.cjs for test isolation (never touches ~/.thrunt/ in tests)
- generate_layer coverage/gap modes use try/catch around detections table query for forward-compatible Phase 54 graceful degradation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Server smoke test initially used Content-Length framing for JSON-RPC messages, but MCP SDK StdioServerTransport uses newline-delimited JSON; fixed by sending request with trailing newline instead of Content-Length header

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server fully functional: `npx @thrunt/mcp-hunt-intel` starts working server over stdio
- All 5 tools callable and returning structured JSON responses
- Phase 54 (Sigma rules) can add detections table to same intel.db; coverage/gap tools will automatically pick it up
- navigator layer generation ready for VS Code extension integration

---
*Phase: 53-mcp-server-att-ck-tools*
*Completed: 2026-04-08*
