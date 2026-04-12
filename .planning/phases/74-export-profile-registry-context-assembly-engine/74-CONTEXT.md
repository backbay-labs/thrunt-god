# Phase 74: Export Profile Registry + Context Assembly Engine - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the export profile registry and the context assembly engine that traverses wiki-links to assemble multi-note context. It does NOT build the user-facing hyper copy commands or modal (Phase 75). Output: pure modules for profile definitions, link traversal, and context assembly.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion — infrastructure phase with clear requirements:
- Export profile registry: define `ExportProfile` interface with `agentId`, `label`, `includeSections`, `includeRelated` (entity types + depth), `promptTemplate`, `maxTokenEstimate`
- Ship 5 default profiles: query-writer, intel-advisor, findings-validator, signal-triager, hunt-planner
- Context assembly engine: given a source note + profile, follow `[[wiki-links]]` to related notes, extract sections, assemble with provenance markers
- Wiki-link extraction: regex `\[\[([^\]]+)\]\]` from note content, resolve to vault paths
- Provenance markers: each section tagged with `<!-- source: path/to/file.md -->` so agents know where context came from
- Depth control: configurable 1 or 2 hops, deduplication by file path
- Token estimation: rough character/4 approximation, soft cap warning
- Extensibility: custom profiles via `.planning/export-profiles.json` merged with defaults
- All assembly logic as pure functions (no Obsidian imports), vault reads via VaultAdapter

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VaultAdapter.readFile()`, `listFiles()`, `fileExists()` for reading linked notes
- Entity note frontmatter and sections (from entity-schema.ts)
- `parsers/` pattern for pure-function extraction
- `ENTITY_TYPES` for mapping entity type badges

### Integration Points
- New `export-profiles.ts` — profile registry with 5 defaults
- New `context-assembly.ts` — link traversal + context assembly engine
- `types.ts` — ExportProfile, AssembledContext, ProvenanceSection types
- `workspace.ts` — assembleContext method wiring VaultAdapter to pure functions

</code_context>

<specifics>
## Specific Ideas

- query-writer profile: needs hypothesis + environment map + data sources + technique details
- intel-advisor profile: entity note + all sightings + related entities (1 hop) + MCP enrichment
- findings-validator profile: hypothesis + supporting receipts + evidence review + contradictions
- signal-triager profile: raw signal + environment context + historical sightings
- hunt-planner profile: mission + hypotheses + coverage gaps + data sources

</specifics>

<deferred>
## Deferred Ideas

- Hyper copy modal and quick export commands (Phase 75)
- Export history logging (Phase 75)

</deferred>
