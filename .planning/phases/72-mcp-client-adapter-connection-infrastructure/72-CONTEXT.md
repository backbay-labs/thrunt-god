# Phase 72: MCP Client Adapter + Connection Infrastructure - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the MCP client adapter interface, connection settings, and status indicator. It does NOT implement any MCP tool calls (technique enrichment, coverage analysis, decision logging, graph search — all Phase 73). The adapter is the plumbing; Phase 73 adds the features.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — infrastructure phase with clear requirements:
- MCP client adapter behind an interface (same VaultAdapter pattern): `McpClient` with `isConnected()`, `connect()`, `disconnect()`, health check
- Settings: `mcpServerUrl` (default `http://localhost:3100`), `mcpEnabled` (default `false`)
- Connection status in sidebar header: green dot (connected), grey dot (disabled), red dot with tooltip (enabled but unreachable)
- The existing MCP server at `apps/mcp/` uses stdio protocol with `--health` flag for health checks. The Obsidian plugin should use HTTP since it's a separate Electron process.
- VS Code extension already implements MCP via subprocess-only pattern (`apps/vscode/src/mcpStatusManager.ts`). Obsidian should use a different approach — HTTP/fetch since Obsidian plugins can't spawn child processes reliably.
- Graceful degradation: every method that calls MCP should catch errors and return null/fallback, never throw to callers
- Reference: `apps/mcp/lib/tools.cjs` for available MCP tools (11 total)
- Reference: `apps/mcp/bin/server.cjs --health` for health check endpoint

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VaultAdapter` pattern — interface + implementation + test stub, exact model for McpClient
- `settings.ts` — existing settings tab with `planningDir`, extend with MCP settings
- `view.ts` header rendering — add status dot next to existing elements
- VS Code `mcpStatusManager.ts` — reference for health check logic (but different transport)

### Integration Points
- New `mcp-client.ts` — McpClient interface + HttpMcpClient implementation
- `settings.ts` — add mcpServerUrl and mcpEnabled fields
- `types.ts` — McpConnectionStatus type
- `main.ts` — initialize McpClient, pass to WorkspaceService
- `view.ts` — render status dot in hunt status card header
- `workspace.ts` — accept McpClient reference for future enrichment methods

</code_context>

<specifics>
## Specific Ideas

- HTTP client should use Obsidian's `requestUrl` API (works in Electron, handles CORS)
- Health check: call the MCP server's health endpoint, parse response for status/toolCount
- Connection test on settings save (immediate feedback when user enters URL)

</specifics>

<deferred>
## Deferred Ideas

- Technique enrichment (Phase 73)
- Coverage analysis (Phase 73)
- Decision/learning logging (Phase 73)
- Knowledge graph search (Phase 73)

</deferred>
