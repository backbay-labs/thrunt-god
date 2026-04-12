---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Obsidian Knowledge Weapon
status: planning
stopped_at: Completed 71-02-PLAN.md
last_updated: "2026-04-12T06:02:12.372Z"
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v4.0 Obsidian Knowledge Weapon -- Phase 71 complete (2/2 plans)

## Current Milestone

v4.0 Obsidian Knowledge Weapon -- Transform the Obsidian plugin into the intelligence preparation and knowledge compounding surface for threat hunting.

**Status:** Ready to plan
**Phase:** 71 of 77 (Ingestion Engine + Agent Activity Timeline)
**Plan:** 2 of 2 complete

Progress: [██████████] 100% (9/9 v4.0 plans)

## Recently Completed

- v3.3 shipped: Phases 65-67, 9 plans, 21 tasks
- v3.2 shipped: Phases 63-64, 10 plans -- Obsidian plugin with 16 TypeScript source files

## Performance Metrics

**Velocity:**
- Total plans completed: 67 phases across 14 milestones
- v4.0 plans completed: 4

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

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-12T05:58:44.442Z
Stopped at: Completed 71-02-PLAN.md
Resume file: None
