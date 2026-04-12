---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Obsidian Knowledge Weapon
status: executing
stopped_at: Completed 75-01-PLAN.md
last_updated: "2026-04-12T07:21:23.784Z"
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 17
  completed_plans: 16
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v4.0 Obsidian Knowledge Weapon -- Phase 75 in progress (1/2 plans)

## Current Milestone

v4.0 Obsidian Knowledge Weapon -- Transform the Obsidian plugin into the intelligence preparation and knowledge compounding surface for threat hunting.

**Status:** Executing
**Phase:** 75 of 77 (Hyper Copy Commands & Export UX)
**Plan:** 1 of 2 complete

Progress: [█████████░] 94% (16/17 v4.0 plans)

## Recently Completed

- v3.3 shipped: Phases 65-67, 9 plans, 21 tasks
- v3.2 shipped: Phases 63-64, 10 plans -- Obsidian plugin with 16 TypeScript source files

## Performance Metrics

**Velocity:**
- Total plans completed: 67 phases across 14 milestones
- v4.0 plans completed: 6

## Accumulated Context

### Decisions

- Vault IS the knowledge graph -- leverage Obsidian's native graph/Dataview/Canvas, don't build custom renderers
- Agents populate, analysts curate -- plugin ingests agent output; analysts link, annotate, promote
- Prepare context for agents, don't orchestrate them -- Obsidian is knowledge tool, not process launcher
- MCP enriches, vault owns -- MCP unavailability degrades enrichment, not core
- Entity notes as typed frontmatter -- 8 entity types with canonical folders and YAML schemas
- Full milestone spec at apps/obsidian/MILESTONES-v2.md
- Pure data module pattern for entity-schema.ts -- zero Obsidian imports, safe for testing and CLI
- IOC subtypes share entities/iocs folder, differentiated by frontmatter type field
- [Phase 68]: Entity folders created after core artifacts, before cache invalidation in bootstrap()
- [Phase 68-02]: Physical JSON copy over symlink -- symlinks break production builds
- [Phase 68-02]: Dynamic import for scaffold module defers 85KB JSON loading until command invoked
- [Phase 68-02]: YAML array for multi-tactic techniques enables Dataview queries
- [Phase 69-01]: KNOWLEDGE_BASE.md is not a core artifact -- created during bootstrap but not tracked in 5-artifact detection
- [Phase 69-01]: listFiles returns file names only (not full paths), consistent with ObsidianVaultAdapter TFile.name
- [Phase 69-02]: EntityCounts uses folder path keys (e.g. entities/iocs) not entity type keys -- consistent with ENTITY_FOLDERS constant
- [Phase 69-02]: KB sidebar section uses native HTML details/summary for collapsible behavior -- no Obsidian API dependency
- [Phase 70-01]: Manual YAML frontmatter parsing (no library) consistent with existing parser pattern
- [Phase 70-01]: Entity extraction uses regex with validation (IPv4 octet check, TLD alpha requirement) to reduce false positives
- [Phase 70-01]: Technique refs regex matches T1234 and T1234.567 -- sub-technique consumes parent in same match
- [Phase 70-02]: Extended artifact detection reuses VaultAdapter.listFiles/fileExists/listFolders -- no direct filesystem access
- [Phase 70-02]: Receipt counting filters by /^RCT-.*\.md$/ and query counting by /^QRY-.*\.md$/ to avoid false positives
- [Phase 70-02]: Agent Artifacts section placed between Knowledge Base and Core artifacts in sidebar render order
- [Phase 71]: [Phase 71-01]: Sighting deduplication scoped to ## Sightings section only -- prevents false positives from sourceId in other sections
- [Phase 71]: [Phase 71-01]: buildSightingLine truncates claim to 80 chars -- keeps entity notes scannable
- [Phase 71]: [Phase 71-01]: deduplicateSightings returns true (is-new) for empty/missing Sightings section -- safe default for new notes
- [Phase 71]: [Phase 71-02]: Ingest button placed in receipt timeline section actions row rather than hunt status card
- [Phase 71]: [Phase 71-02]: Receipt timeline renders between Extended Artifacts and Core Artifacts in sidebar order
- [Phase 72]: [Phase 72-01]: Injectable requestFn parameter enables testing HttpMcpClient without real HTTP calls
- [Phase 72]: [Phase 72-01]: McpClient property accessed via type cast in settings.ts -- will be typed properly in Plan 02 wiring
- [Phase 72]: [Phase 72-02]: McpClient passed as optional 5th parameter to WorkspaceService -- backward-compatible with all existing tests
- [Phase 72]: [Phase 72-02]: MCP status dot is purely informational with no click handlers -- connection management stays in settings
- [Phase 72]: [Phase 72-02]: Obsidian requestUrl used as HTTP adapter via injectable requestFn pattern from Plan 01
- [Phase 73]: [Phase 73-01]: mergeEnrichment uses heading-bounded section replacement to safely edit TTP notes without overwriting analyst content
- [Phase 73]: [Phase 73-01]: Pure module pattern (zero Obsidian imports) consistent with ingestion.ts for testability
- [Phase 73]: [Phase 73-02]: PromptModal as inline class in main.ts -- lightweight enough not to warrant a separate file
- [Phase 73]: [Phase 73-02]: All MCP commands guard with isConnected() at both main.ts and workspace.ts layers for defense in depth
- [Phase 73]: [Phase 73-02]: McpSearchModal uses 300ms debounce on text input to avoid excessive MCP calls
- [Phase 73]: [Phase 73-02]: Search modal onCreateNote uses ENTITY_TYPES registry to find correct template and folder
- [Phase 74]: [Phase 74-01]: Pure data module pattern for export-profiles.ts -- zero Obsidian imports, consistent with entity-schema.ts
- [Phase 74]: [Phase 74-01]: loadProfiles validates required fields before accepting custom profiles -- silently skips invalid entries
- [Phase 74]: [Phase 74-02]: Wiki-link resolution tries direct path then .md extension -- matches Obsidian vault path conventions
- [Phase 74]: [Phase 74-02]: Entity type filtering uses folder prefix matching rather than frontmatter parsing -- faster, no file read needed
- [Phase 74]: [Phase 74-02]: Linked notes contribute ALL sections (not filtered by includeSections) -- only source note is section-filtered
- [Phase 74]: [Phase 74-02]: assembleContext uses callback-based I/O (readFile/fileExists) for pure testability without VaultAdapter dependency
- [Phase 75]: [Phase 75-01]: Export log formatter follows pure data module pattern (zero Obsidian imports) consistent with ingestion.ts
- [Phase 75]: [Phase 75-01]: Entity type counting uses sourcePath folder prefix parsing with deduplication
- [Phase 75]: [Phase 75-01]: HyperCopyModal preview uses raw markdown in pre element rather than rendered HTML

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-12T07:20:39Z
Stopped at: Completed 75-01-PLAN.md
Resume file: None
