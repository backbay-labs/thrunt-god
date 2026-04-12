# Phase 69: Knowledge Base Dashboard + Sidebar Entity Summary - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds two features: (1) a KNOWLEDGE_BASE.md template with embedded Dataview queries that surface entity patterns, and (2) a collapsible Knowledge Base section in the sidebar showing entity counts by type. It does NOT build parsers (Phase 70), ingestion (Phase 71), or MCP enrichment (Phase 73). Output: updated bootstrap, updated view, new entity counting in WorkspaceService.

</domain>

<decisions>
## Implementation Decisions

### Knowledge Base Dashboard
- KNOWLEDGE_BASE.md lives under planningDir (e.g., `.planning/KNOWLEDGE_BASE.md`) — alongside other hunt artifacts, created during bootstrap
- Dataview queries use standard Dataview codeblocks (```dataview) — works natively if Dataview plugin installed, degrades to visible code if not
- Ship 6 pre-built queries: IOCs by confidence, TTPs by hunt frequency, TTPs never hunted (coverage gaps), actors by hunt count, recent sightings timeline, cross-hunt entity overlap
- KNOWLEDGE_BASE.md is NOT added to CORE_ARTIFACTS — it's a derived dashboard, not a core hunt artifact. Created by bootstrap but not tracked in 5-artifact detection.

### Sidebar Entity Summary
- Knowledge Base section appears below the hunt status card, above the core artifacts list
- Entity counts computed by scanning entity folders and counting files per folder on render — simple, uses existing VaultAdapter
- Section is collapsible using Obsidian's native collapsible pattern — default expanded
- "Open dashboard" button links to KNOWLEDGE_BASE.md — same pattern as "Open mission" button

### Claude's Discretion
- Internal implementation of collapsible sections in Obsidian's ItemView API
- How to extend the ViewModel with entity counts
- CSS styling for the entity summary section
- Whether to add a listFiles method to VaultAdapter or use existing API
- Test strategy for sidebar rendering (likely unit tests for count logic, not rendering)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VaultAdapter.listFolders()` — already exists, can be extended or complemented with file listing
- `WorkspaceService.getViewModel()` — natural place to add entity counts
- `view.ts` render methods — `renderHuntStatusCard()`, `renderField()`, `createActionButton()` patterns
- `ENTITY_FOLDERS` from `entity-schema.ts` (just shipped in Phase 68) — canonical list of entity folder paths
- `getEntityFolder()` from `paths.ts` — entity path resolution

### Established Patterns
- ViewModel pattern: service computes data, view renders from ViewModel
- Cached ViewModel with `invalidate()` on vault events
- `Setting` component for artifact list entries
- CSS classes: `thrunt-god-card`, `thrunt-god-hunt-field`, `thrunt-god-field-label`

### Integration Points
- `workspace.ts` — add entity count computation to `getViewModel()`
- `view.ts` — add `renderKnowledgeBaseSection()` after hunt status card
- `types.ts` — extend `ViewModel` with entity count data
- `workspace.ts:bootstrap()` — add KNOWLEDGE_BASE.md creation (already creates entity folders from Phase 68)
- `artifacts.ts` — optionally add KNOWLEDGE_BASE.md template (but NOT to CORE_ARTIFACTS)

</code_context>

<specifics>
## Specific Ideas

- Entity counts should show something like "23 IOCs, 14 TTPs, 3 actors, 2 tools" — compact, scannable
- KNOWLEDGE_BASE.md should have a title and brief explanation of what each query surfaces
- Dataview queries should use relative paths matching the entity folder structure from Phase 68

</specifics>

<deferred>
## Deferred Ideas

- Inline Dataview rendering in the sidebar — too complex, let users open the file
- Real-time entity count updates — already handled by vault event invalidation
- Entity type breakdown for IOCs (IPs vs domains vs hashes) — would need frontmatter parsing, deferred

</deferred>
