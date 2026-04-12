# Phase 78: v4.0 Tech Debt Cleanup - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Gap closure phase: 4 targeted fixes from the v4.0-MILESTONE-AUDIT.md. No new features.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion — 4 specific fixes:

1. **canvasFromCurrentHunt template picker** (main.ts, workspace.ts): The `canvas-from-current-hunt` command should open CanvasTemplateModal (already exists) instead of hardcoding Kill Chain. Let analyst choose which layout to apply to their hunt findings.

2. **Wiki-link resolution for core artifacts** (context-assembly.ts): `resolveLinkedPaths()` should check `{planningDir}/{linkTarget}.md` in addition to entity folder paths. If `[[MISSION]]` appears and `.planning/MISSION.md` exists, include it.

3. **Dashboard file mtime** (workspace.ts): `generateKnowledgeDashboard` should read actual file modification time for `HuntSummary.lastModified` instead of `new Date().toISOString()`. Use VaultAdapter to get file stat.

4. **Offline coverage fallback** (workspace.ts): `analyzeCoverage` should fall back to scanning `entities/ttps/` notes directly when MCP is unreachable, building COVERAGE_REPORT.md from `hunt_count` and `tactic` frontmatter in entity notes.

</decisions>

<code_context>
## Existing Code Insights

### Files to Fix
- `apps/obsidian/src/main.ts` — canvas-from-current-hunt command (~line 213)
- `apps/obsidian/src/context-assembly.ts` — resolveLinkedPaths (~line 274)
- `apps/obsidian/src/workspace.ts` — generateKnowledgeDashboard (~line 1080), analyzeCoverage (~line 432)
- `apps/obsidian/src/vault-adapter.ts` — may need getFileStat method

### Patterns
- CanvasTemplateModal already exists in main.ts (used by generate-hunt-canvas command)
- VaultAdapter interface pattern for new methods
- buildCoverageReport from mcp-enrichment.ts can be reused for offline fallback

</code_context>

<specifics>
## Specific Ideas

No new features — just fixes to existing code.

</specifics>

<deferred>
## Deferred Ideas

None — this is the final cleanup phase.

</deferred>
