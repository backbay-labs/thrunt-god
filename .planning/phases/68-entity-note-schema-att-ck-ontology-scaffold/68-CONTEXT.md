# Phase 68: Entity Note Schema + ATT&CK Ontology Scaffold - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase defines the vault knowledge schema: 8 entity types with typed YAML frontmatter, canonical folder structure, and ~161 ATT&CK technique stubs generated from bundled MITRE data. It does NOT build the sidebar UI (Phase 69), parsers (Phase 70), or ingestion logic (Phase 71). Output: new modules (`entity-schema.ts`), updated bootstrap, and a scaffold command.

</domain>

<decisions>
## Implementation Decisions

### ATT&CK Scaffold Scope
- Generate parent techniques only (~161 notes) — sub-techniques referenced as sections within parent notes, not separate files
- Bundle `mitre-attack-enterprise.json` in the plugin package (already exists at `apps/mcp/data/`) — works offline, no MCP dependency for scaffold
- Multi-tactic techniques get a single note with `tactic` frontmatter as array (e.g., `["Initial Access", "Persistence"]`)
- Note naming: `T1059.001 -- PowerShell.md` (ID + separator + name) — human-readable, sortable, wiki-linkable

### Entity Schema Design
- Flat entity folders under `entities/` with type subfolders: `entities/iocs/`, `entities/ttps/`, `entities/actors/`, `entities/tools/`, `entities/infra/`, `entities/datasources/`
- Single `entities/iocs/` folder with IOC type differentiated by frontmatter (`type: ioc/ip`, `type: ioc/domain`, `type: ioc/hash`)
- Frontmatter fields use snake_case (`hunt_refs`, `first_seen`, `mitre_id`) — consistent with existing templates and Dataview conventions
- File name IS the entity ID (e.g., `192.168.1.100.md`, `T1059.001 -- PowerShell.md`, `APT29.md`) — no separate ID field

### Bootstrap Integration
- Entity folder structure created during `bootstrap()` alongside core artifacts — analyst gets `entities/` folders from "Create mission scaffold"
- ATT&CK scaffold is a SEPARATE command "Scaffold ATT&CK ontology" — heavier operation (~161 files), explicit opt-in, not auto-run during bootstrap
- Idempotency: skip files that already exist (content-agnostic) — simplest approach, preserves any user edits
- New `ENTITY_TYPES` registry in `entity-schema.ts` — entity types are structurally different from `CORE_ARTIFACTS` (generated vs hand-edited, many vs few)

### Claude's Discretion
- Internal module structure and function signatures for entity note generation
- Template content for the `## Sightings` and `## Related` sections in entity notes
- How sub-techniques are referenced within parent technique notes (section heading vs bullet list)
- Test strategy for scaffold (unit tests for template generation, fixture-based tests for ATT&CK parsing)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VaultAdapter` interface with `ensureFolder()`, `createFile()`, `fileExists()` — handles all vault I/O needed for scaffold generation
- `CORE_ARTIFACTS` registry pattern in `artifacts.ts` — model for the new `ENTITY_TYPES` registry
- `WorkspaceService.bootstrap()` in `workspace.ts` — extend to create entity folders
- `getPlanningDir()` and `getCoreFilePath()` in `paths.ts` — reuse for entity path resolution
- `mitre-attack-enterprise.json` (1,938 lines) at `apps/mcp/data/` — 161 parent techniques, 397 sub-techniques, 14 tactics

### Established Patterns
- YAML frontmatter with `thrunt-artifact` type identifier (in `artifacts.ts` templates)
- Pure data modules (no Obsidian imports) for registries and schemas
- Vitest for unit testing pure functions
- Error handling: graceful degradation, never throw from rendering

### Integration Points
- `workspace.ts:bootstrap()` — add entity folder creation after core artifact creation
- `main.ts:onload()` — register new "Scaffold ATT&CK ontology" command
- `paths.ts` — add entity path resolution functions (e.g., `getEntityPath(planningDir, entityType, fileName)`)
- `package.json` — may need to include the bundled ATT&CK JSON or copy it during build

</code_context>

<specifics>
## Specific Ideas

- The ATT&CK JSON already exists in the monorepo at `apps/mcp/data/mitre-attack-enterprise.json` — copy or reference it rather than duplicating
- Entity note frontmatter schema defined in MILESTONES-v2.md section 3.1 — use those exact fields
- Each technique note should include empty `## Sightings`, `## Detections`, and `## Related` sections ready for population by later milestones
- Entity notes should include `## Sightings` and `## Related` sections with wiki-links

</specifics>

<deferred>
## Deferred Ideas

- MCP-based technique enrichment (Phase 73 — MCP Enrichment)
- Entity extraction from agent output (Phase 71 — Ingestion Engine)
- Sidebar entity counts (Phase 69 — Knowledge Base Dashboard)
- Dataview query library (Phase 69 — Knowledge Base Dashboard)

</deferred>
