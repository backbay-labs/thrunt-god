# Roadmap: THRUNT GOD

## Milestones

- v1.0 Query Runtime & Connector SDK (Phases 1-6) -- shipped 2026-03-25
- v1.1 Hunt Packs & Technique Packs (Phases 7-11) -- shipped 2026-03-25
- v1.2 Evidence Integrity & Provenance (Phases 12-16) -- shipped 2026-03-27
- v1.3 Detection Promotion Pipeline (Phases 17-19) -- shipped 2026-03-27
- v1.4 Hunt Learning & Recommendation Engine (Phases 20-22) -- shipped 2026-03-27
- v1.5 TUI Operator Console (Phases 23-26) -- shipped 2026-03-30
- v1.6 Live Connector Integrations (Phases 27-30) -- shipped 2026-03-30
- v2.0 Developer Experience & CI (Phases 31-37) -- shipped 2026-03-30
- v2.1 Advanced Hunt Features (Phases 38-44) -- shipped 2026-03-31
- v2.2 Connector Ecosystem (Phases 45-49) -- shipped 2026-03-31
- v3.0 Hunt Program Intelligence (Phases 50-57) -- shipped 2026-04-08
- v3.1 Sidebar Automation & Operations (Phases 58-62) -- shipped 2026-04-09
- v3.2 Obsidian Workspace Companion (Phases 63-64) -- shipped 2026-04-11
- v3.3 Zero-Friction Distribution (Phases 65-67) -- shipped 2026-04-11
- v4.0 Obsidian Knowledge Weapon (Phases 68-77) -- in progress

## Phases

<details>
<summary>v3.1 Sidebar Automation & Operations (Phases 58-62) — SHIPPED 2026-04-09</summary>

- [x] Phase 58: Sidebar Automation Section Foundation (2/2 plans) — completed 2026-04-09
- [x] Phase 59: MCP Runtime Control Panel (3/3 plans) — completed 2026-04-09
- [x] Phase 60: Command Deck Webview (3/3 plans) — completed 2026-04-09
- [x] Phase 61: Runbook Engine & Editor (3/3 plans) — completed 2026-04-09
- [x] Phase 62: Execution History & Guardrails (3/3 plans) — completed 2026-04-09

</details>

<details>
<summary>v3.2 Obsidian Workspace Companion (Phases 63-64) — SHIPPED 2026-04-11</summary>

- [x] Phase 63: Structural Foundation (5/5 plans) — completed 2026-04-11
- [x] Phase 64: Live Hunt Dashboard (5/5 plans) — completed 2026-04-11

</details>

<details>
<summary>v3.3 Zero-Friction Distribution (Phases 65-67) — SHIPPED 2026-04-11</summary>

- [x] **Phase 65: Obsidian CLI Install Channel** - `--obsidian` installer, canonical bundle staging, macOS vault detection, symlink-based install/update (completed 2026-04-11)
- [x] **Phase 66: Release Artifact Pipeline** - release workflow builds Obsidian assets, validates version alignment, uploads plugin artifacts (completed 2026-04-11)
- [x] **Phase 67: Community Directory Submission Readiness** - review-safe package, public docs/screenshots, and tracked submission metadata for `obsidianmd/obsidian-releases` (completed 2026-04-11)

Detailed phase archive: `.planning/milestones/v3.3-ROADMAP.md`

</details>

### v4.0 Obsidian Knowledge Weapon (In Progress)

**Milestone Goal:** Transform the Obsidian plugin into the intelligence preparation and knowledge compounding surface for threat hunting -- where every hunt makes the next one smarter, analysts prepare context that makes agents more effective, and the knowledge graph grows organically from structured markdown.

- [x] **Phase 68: Entity Note Schema + ATT&CK Ontology Scaffold** - Define typed entity notes with YAML frontmatter schemas, scaffold ~200 ATT&CK technique stubs, and update workspace bootstrap with entity folder structure (completed 2026-04-12)
- [x] **Phase 69: Knowledge Base Dashboard + Sidebar Entity Summary** - Ship KNOWLEDGE_BASE.md with embedded Dataview queries and add collapsible Knowledge Base section to sidebar with entity counts (completed 2026-04-12)
- [ ] **Phase 70: Artifact Registry + Parsers** - Extend artifact recognition to RECEIPTS/, QUERIES/, evidence reviews, cases; build receipt and query log parsers with entity extraction
- [ ] **Phase 71: Ingestion Engine + Agent Activity Timeline** - "Ingest agent output" command with idempotent entity creation/update, ingestion logging, and receipt timeline sidebar view
- [ ] **Phase 72: MCP Client Adapter + Connection Infrastructure** - MCP client interface with configurable URL, enable toggle, connection status indicator, and graceful degradation for all MCP-dependent features
- [ ] **Phase 73: MCP Enrichment + Intelligence Features** - Technique enrichment action, detection coverage analysis command, decision/learning logging, and knowledge graph search modal
- [ ] **Phase 74: Export Profile Registry + Context Assembly Engine** - Define per-agent export profiles, build wiki-link-following context assembler with configurable depth and provenance markers
- [ ] **Phase 75: Hyper Copy Commands + Export UX** - "Hyper Copy for Agent" modal with preview and token estimate, quick export shortcuts, extensible profile config, and export audit log
- [ ] **Phase 76: Canvas Kill Chain Generator + Templates** - Canvas generation engine with entity cards positioned by ATT&CK tactic, 4 canvas templates, and auto-generation from hunt findings
- [ ] **Phase 77: Cross-Hunt Intelligence + Knowledge Dashboard** - Cross-hunt analytical queries, hunt comparison command, and knowledge dashboard canvas for program overview

## Phase Details

### Phase 68: Entity Note Schema + ATT&CK Ontology Scaffold
**Goal**: The vault has a knowledge schema -- every entity type has a canonical home with typed frontmatter, and the ATT&CK framework is navigable as linked technique notes
**Depends on**: Phase 67 (shipped v3.3 foundation)
**Requirements**: ONTO-01, ONTO-02, ONTO-03
**Success Criteria** (what must be TRUE):
  1. Running "Scaffold ATT&CK ontology" creates ~200 technique notes with correct typed frontmatter (mitre_id, tactic, platforms, data_sources, hunt_count) that Dataview can query
  2. Each of the 8 entity types (IOC/IP, IOC/domain, IOC/hash, TTP, actor, tool, infrastructure, data source) has a defined folder and YAML frontmatter schema, and creating a note from template produces well-structured output
  3. Running "Create THRUNT workspace" (bootstrap) generates the entity folder structure (entities/iocs/, entities/ttps/, entities/actors/, entities/tools/, entities/infra/, entities/datasources/) alongside existing core artifacts
  4. Scaffold command is idempotent -- running twice does not overwrite user-added content in existing technique notes
**Plans:** 3/3 plans complete

Plans:
- [ ] 68-01-PLAN.md -- Entity type registry with 8 types, frontmatter schemas, path helpers
- [ ] 68-02-PLAN.md -- ATT&CK scaffold command generating ~161 technique notes from bundled JSON
- [ ] 68-03-PLAN.md -- Bootstrap extension creating entity folder structure

### Phase 69: Knowledge Base Dashboard + Sidebar Entity Summary
**Goal**: Analysts can see what their knowledge graph contains at a glance -- both through Dataview queries and sidebar counts
**Depends on**: Phase 68
**Requirements**: ONTO-04, ONTO-05
**Success Criteria** (what must be TRUE):
  1. KNOWLEDGE_BASE.md ships with embedded Dataview queries that return results when entity notes exist (IOCs by confidence, TTPs by hunt frequency, coverage gaps, cross-hunt entity references)
  2. Sidebar shows a collapsible "Knowledge Base" section displaying entity counts by type (e.g., "23 IOCs, 14 TTPs, 3 actors") with a link to KNOWLEDGE_BASE.md
  3. Sidebar entity counts update when the analyst creates, deletes, or modifies entity notes in the vault
**Plans:** 2/2 plans complete

Plans:
- [ ] 69-01-PLAN.md -- KNOWLEDGE_BASE.md template with 6 Dataview queries, listFiles on VaultAdapter, bootstrap creation
- [ ] 69-02-PLAN.md -- Sidebar Knowledge Base section with entity counts, collapsible UI, dashboard link

### Phase 70: Artifact Registry + Parsers
**Goal**: The plugin sees everything agents produce -- receipts, query logs, evidence reviews, cases -- and can extract structured data from them
**Depends on**: Phase 69
**Requirements**: INGEST-01, INGEST-02, INGEST-03
**Success Criteria** (what must be TRUE):
  1. Sidebar artifact listing recognizes extended types: RECEIPTS/RCT-*.md, QUERIES/QRY-*.md, EVIDENCE_REVIEW.md, SUCCESS_CRITERIA.md, environment/ENVIRONMENT.md, and cases/*/MISSION.md
  2. Receipt parser extracts claim, claim_status, evidence summary, related_hypotheses, and technique references from agent-produced receipt markdown
  3. Query log parser extracts intent, dataset, result_status, related_receipts, and entity references (IPs, domains, hashes) from agent-produced query log markdown
  4. Both parsers are pure functions with unit tests and handle malformed input gracefully
**Plans**: TBD

### Phase 71: Ingestion Engine + Agent Activity Timeline
**Goal**: Agent output flows into the knowledge graph automatically -- one command scans artifacts, extracts entities, and populates entity notes with sightings and backlinks
**Depends on**: Phase 70
**Requirements**: INGEST-04, INGEST-05, INGEST-06, INGEST-07
**Success Criteria** (what must be TRUE):
  1. Sidebar shows a receipt timeline grouped by hypothesis with color-coded claim status (validated/pending/rejected), with clickable entries that open the source file
  2. "Ingest agent output" command scans RECEIPTS/ and QUERIES/, extracts entities (IPs, domains, hashes, technique IDs), and creates or updates entity notes with sightings and wiki-link backlinks
  3. Running ingestion twice on the same artifacts does not create duplicate sightings -- idempotency is enforced via content hashing or sighting deduplication
  4. INGESTION_LOG.md records every ingestion run with counts of entities created, updated, and skipped
**Plans**: TBD

### Phase 72: MCP Client Adapter + Connection Infrastructure
**Goal**: The plugin can connect to the THRUNT MCP server with clear status feedback, and every MCP-dependent feature fails gracefully when the server is unreachable
**Depends on**: Phase 71
**Requirements**: MCP-01, MCP-02, MCP-07
**Success Criteria** (what must be TRUE):
  1. MCP client adapter connects to a configurable MCP server URL with an explicit enable toggle (default: disabled)
  2. Sidebar header shows a connection status indicator -- green dot when connected, grey dot when disabled, red dot with error tooltip when enabled but unreachable
  3. When MCP is unreachable or disabled, all enrichment features show informative messages instead of errors, and all non-MCP plugin features continue working normally
**Plans**: TBD

### Phase 73: MCP Enrichment + Intelligence Features
**Goal**: Analysts can enrich entity notes with live intelligence, analyze detection coverage, log institutional decisions/learnings, and search the knowledge graph -- all from within Obsidian
**Depends on**: Phase 72
**Requirements**: MCP-03, MCP-04, MCP-05, MCP-06
**Success Criteria** (what must be TRUE):
  1. "Enrich from MCP" action on a TTP entity note pulls technique description, associated groups, detection data sources, and related techniques from the MCP server and merges them into the note without overwriting analyst-authored content
  2. "Analyze detection coverage" command produces COVERAGE_REPORT.md with per-tactic coverage percentages, detection gaps, and cross-reference with hunt_count frontmatter
  3. "Log hunt decision" and "Log hunt learning" commands write to both the MCP server (for cross-hunt surfacing) and the local vault (TTP entity note or LEARNINGS.md)
  4. "Search THRUNT knowledge graph" opens a modal with search input, displays results with entity type badges, and offers "Create note" or "Open note" actions for each result
**Plans**: TBD

### Phase 74: Export Profile Registry + Context Assembly Engine
**Goal**: The plugin can traverse vault wiki-links, assemble multi-note context, and package it according to per-agent export profiles with source provenance
**Depends on**: Phase 73
**Requirements**: HCOPY-01, HCOPY-03, HCOPY-04, HCOPY-06
**Success Criteria** (what must be TRUE):
  1. At least 5 default export profiles ship (query-writer, intel-advisor, findings-validator, signal-triager, hunt-planner) specifying which sections, entity types, and link depth each agent needs
  2. Context assembly engine follows wiki-links to related entity notes up to a configurable depth (1 = direct links, 2 = neighbors of neighbors) with deduplication
  3. Every section in assembled output includes a provenance marker identifying the source file path it was extracted from
  4. Export profiles are extensible via a JSON config file that analysts can edit to add custom profiles
**Plans**: TBD

### Phase 75: Hyper Copy Commands + Export UX
**Goal**: Analysts can hand off rich, structured context to agents with one command -- either through a preview modal or quick-action shortcuts
**Depends on**: Phase 74
**Requirements**: HCOPY-02, HCOPY-05, HCOPY-07
**Success Criteria** (what must be TRUE):
  1. "Hyper Copy for Agent" command opens a modal showing available export profiles, assembles multi-note context for the selected profile, and displays a preview with token count estimate and a "Copy to clipboard" action
  2. Quick export commands ("Copy for Query Writer", "Copy for Intel Advisor", "Copy IOC context") work from the command palette without opening a modal
  3. EXPORT_LOG.md records each export with source note, context assembled (entity/receipt counts), token estimate, and target agent profile
**Plans**: TBD

### Phase 76: Canvas Kill Chain Generator + Templates
**Goal**: Analysts can generate visual attack narratives as Obsidian Canvas files, with entity cards positioned by ATT&CK tactic and auto-generated from hunt findings
**Depends on**: Phase 75
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03
**Success Criteria** (what must be TRUE):
  1. "Generate hunt canvas" command creates a Canvas file with entity cards (IOCs, TTPs, actors, tools) positioned along the ATT&CK kill chain timeline, color-coded by entity type
  2. At least 4 canvas templates ship: ATT&CK kill chain (horizontal tactic timeline), diamond model (adversary/capability/infrastructure/victim quadrants), lateral movement map (network topology with IOC nodes), and hunt progression (vertical investigation timeline)
  3. "Canvas from current hunt" reads FINDINGS.md and RECEIPTS/ to auto-extract validated techniques and associated IOCs, then generates a kill chain canvas with connection arrows based on receipt linkage
  4. All generated canvases are standard Obsidian .canvas files that the analyst can rearrange and annotate after generation
**Plans**: TBD

### Phase 77: Cross-Hunt Intelligence + Knowledge Dashboard
**Goal**: The vault surfaces patterns no single hunt could reveal -- recurring IOCs, coverage gaps, actor convergence -- and provides a visual program overview
**Depends on**: Phase 76
**Requirements**: CANVAS-04, CANVAS-05, CANVAS-06
**Success Criteria** (what must be TRUE):
  1. Cross-hunt intelligence queries surface recurring IOCs (seen in 2+ hunts), TTP coverage gaps (hunt_count: 0 grouped by tactic), and actor convergence (hunts sharing 3+ IOCs)
  2. "Compare hunts" command identifies shared entities, divergent findings, and combined technique coverage across two hunt workspaces
  3. Knowledge dashboard canvas provides a visual program overview with hunts by recency, top entities by sighting count, and hunt-to-entity connections
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 68 -> 69 -> 70 -> 71 -> 72 -> 73 -> 74 -> 75 -> 76 -> 77

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 58. Sidebar Automation Section Foundation | v3.1 | 2/2 | Complete | 2026-04-09 |
| 59. MCP Runtime Control Panel | v3.1 | 3/3 | Complete | 2026-04-09 |
| 60. Command Deck Webview | v3.1 | 3/3 | Complete | 2026-04-09 |
| 61. Runbook Engine & Editor | v3.1 | 3/3 | Complete | 2026-04-09 |
| 62. Execution History & Guardrails | v3.1 | 3/3 | Complete | 2026-04-09 |
| 63. Structural Foundation | v3.2 | 5/5 | Complete | 2026-04-11 |
| 64. Live Hunt Dashboard | v3.2 | 5/5 | Complete | 2026-04-11 |
| 65. Obsidian CLI Install Channel | v3.3 | 3/3 | Complete | 2026-04-11 |
| 66. Release Artifact Pipeline | v3.3 | 3/3 | Complete | 2026-04-11 |
| 67. Community Directory Submission Readiness | v3.3 | 3/3 | Complete | 2026-04-11 |
| 68. Entity Note Schema + ATT&CK Ontology Scaffold | v4.0 | 3/3 | Complete | 2026-04-12 |
| 69. Knowledge Base Dashboard + Sidebar Entity Summary | 2/2 | Complete   | 2026-04-12 | - |
| 70. Artifact Registry + Parsers | v4.0 | 0/0 | Not started | - |
| 71. Ingestion Engine + Agent Activity Timeline | v4.0 | 0/0 | Not started | - |
| 72. MCP Client Adapter + Connection Infrastructure | v4.0 | 0/0 | Not started | - |
| 73. MCP Enrichment + Intelligence Features | v4.0 | 0/0 | Not started | - |
| 74. Export Profile Registry + Context Assembly Engine | v4.0 | 0/0 | Not started | - |
| 75. Hyper Copy Commands + Export UX | v4.0 | 0/0 | Not started | - |
| 76. Canvas Kill Chain Generator + Templates | v4.0 | 0/0 | Not started | - |
| 77. Cross-Hunt Intelligence + Knowledge Dashboard | v4.0 | 0/0 | Not started | - |
