# Phase 73: MCP Enrichment + Intelligence Features - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements 4 MCP-powered features using the McpClient adapter from Phase 72: technique enrichment, coverage analysis, decision/learning logging, and knowledge graph search. It does NOT build hyper copy (Phase 74-75) or canvas (Phase 76-77).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion — 4 clear feature requirements:

1. **Enrich from MCP** — command on TTP entity notes that calls `lookupTechnique` via McpClient, merges description/groups/detections/related techniques into note. Appends to `## MCP Enrichment` section, never overwrites analyst content above.

2. **Coverage analysis** — command that collects technique IDs from `entities/ttps/`, calls `analyzeCoverage` via McpClient, writes `COVERAGE_REPORT.md` under planningDir with per-tactic percentages and gaps.

3. **Decision/learning logging** — two commands that prompt for input, call `logDecision`/`logLearning` via McpClient, AND append to local vault (TTP entity note for decisions, `LEARNINGS.md` for learnings).

4. **Knowledge graph search** — modal (Obsidian `Modal` class) with text input, calls `queryKnowledge` via McpClient, displays results with type badges, "Create note"/"Open note" actions.

- All features must check `mcpClient.isConnected()` first and show a Notice if MCP is disabled/unreachable
- Reference MCP tools: `lookupTechnique(id)`, `analyzeCoverage(techniqueIds)`, `logDecision(technique, caseId, decision)`, `logLearning(topic, learning)`, `queryKnowledge(query)`
- These methods already exist on the McpClient interface from Phase 72

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `McpClient` interface from Phase 72 with all 6 methods
- `VaultAdapter.readFile()`, `modifyFile()`, `createFile()` for entity note updates
- `ENTITY_TYPES` and `getEntityFolder()` from entity-schema.ts/paths.ts
- Entity note templates with `## Sightings`, `## Related` sections
- Settings with `mcpEnabled` and `mcpServerUrl`

### Integration Points
- `main.ts` — register 4 new commands (enrich, coverage, log-decision, log-learning, search)
- `workspace.ts` — add enrichment/coverage/logging methods using McpClient
- New `mcp-search-modal.ts` — Obsidian Modal subclass for knowledge graph search
- `types.ts` — add CoverageReport, SearchResult types

</code_context>

<specifics>
## Specific Ideas

- "Enrich from MCP" should be available from command palette when a TTP note is active
- Coverage report should be a markdown table grouped by tactic
- Knowledge graph search modal should be simple — text input, results list, action buttons

</specifics>

<deferred>
## Deferred Ideas

- Hyper copy context assembly (Phase 74-75)
- Canvas visualization (Phase 76-77)
- Auto-enrichment on entity note open (future, not this milestone)

</deferred>
