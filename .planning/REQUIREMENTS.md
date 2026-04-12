# Requirements: THRUNT GOD

**Defined:** 2026-04-11
**Core Value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.

## v4.0 Requirements

Requirements for the Obsidian Knowledge Weapon milestone. Each maps to roadmap phases.

### Ontology

- [x] **ONTO-01**: Plugin can scaffold ATT&CK technique notes (~200) with typed frontmatter from a single command
- [x] **ONTO-02**: Entity note types (IOC/IP, IOC/domain, IOC/hash, TTP, actor, tool, infrastructure, data source) each have a canonical folder and YAML frontmatter schema
- [x] **ONTO-03**: Workspace bootstrap creates entity folder structure alongside core artifacts
- [x] **ONTO-04**: KNOWLEDGE_BASE.md ships with embedded Dataview queries (IOCs by confidence, TTPs by frequency, coverage gaps, cross-hunt entity references)
- [x] **ONTO-05**: Sidebar shows a collapsible Knowledge Base section with entity counts by type

### Ingestion

- [ ] **INGEST-01**: Plugin recognizes extended artifact types (RECEIPTS/, QUERIES/, EVIDENCE_REVIEW.md, SUCCESS_CRITERIA.md, environment/, cases/)
- [ ] **INGEST-02**: Receipt parser extracts claim, claim_status, evidence summary, related_hypotheses, technique references from agent-produced receipts
- [ ] **INGEST-03**: Query log parser extracts intent, dataset, result_status, related_receipts, entity references from agent-produced query logs
- [ ] **INGEST-04**: Sidebar shows receipt timeline grouped by hypothesis with color-coded claim status
- [ ] **INGEST-05**: "Ingest agent output" command scans RECEIPTS/ and QUERIES/, extracts entities, and creates or updates entity notes with sightings and backlinks
- [ ] **INGEST-06**: Ingestion is idempotent (running twice on same artifacts does not create duplicate sightings)
- [ ] **INGEST-07**: INGESTION_LOG.md records every ingestion run with counts of created, updated, and skipped entities

### MCP Bridge

- [ ] **MCP-01**: MCP client adapter connects to THRUNT MCP server with configurable URL and explicit enable toggle
- [ ] **MCP-02**: Connection status indicator in sidebar header (green/grey/red dot)
- [ ] **MCP-03**: "Enrich from MCP" action on TTP entity notes pulls technique description, groups, detections, and related techniques
- [ ] **MCP-04**: "Analyze detection coverage" command produces COVERAGE_REPORT.md with per-tactic coverage and gaps
- [ ] **MCP-05**: "Log hunt decision" and "Log hunt learning" commands write to both MCP server and local vault
- [ ] **MCP-06**: "Search THRUNT knowledge graph" command opens a modal with results and note creation/navigation actions
- [ ] **MCP-07**: All MCP features degrade gracefully when server is unreachable

### Hyper Copy

- [ ] **HCOPY-01**: Export profile registry defines per-agent context needs (at least 5 default profiles: query-writer, intel-advisor, findings-validator, signal-triager, hunt-planner)
- [ ] **HCOPY-02**: "Hyper Copy for Agent" command assembles multi-note context by following wiki-links, shows preview with token estimate
- [ ] **HCOPY-03**: Context assembly engine follows wiki-links to related entity notes up to configurable depth
- [ ] **HCOPY-04**: Assembled prompts include provenance markers tracing each section to its source file
- [ ] **HCOPY-05**: Quick export commands skip modal for common flows (copy for query writer, copy for intel advisor, copy IOC context)
- [ ] **HCOPY-06**: Export profiles are extensible via JSON config file
- [ ] **HCOPY-07**: EXPORT_LOG.md records each export with source, context assembled, token estimate, target agent

### Canvas + Cross-Hunt

- [ ] **CANVAS-01**: "Generate hunt canvas" command creates Canvas file with entity cards positioned by ATT&CK tactic
- [ ] **CANVAS-02**: At least 4 canvas templates ship (kill chain, diamond model, lateral movement map, hunt progression)
- [ ] **CANVAS-03**: "Canvas from current hunt" reads FINDINGS.md and RECEIPTS/ to auto-generate a kill chain canvas
- [ ] **CANVAS-04**: Cross-hunt intelligence queries surface recurring IOCs, TTP coverage gaps, and actor convergence
- [ ] **CANVAS-05**: "Compare hunts" command identifies shared and divergent entities across two workspaces
- [ ] **CANVAS-06**: Knowledge dashboard canvas provides a visual program overview

## Future Requirements

Deferred beyond v4.0. Tracked but not in current roadmap.

### Advanced Integrations

- **ADV-01**: Agent-initiated note creation via MCP (right-click IOC -> "Analyze with THRUNT")
- **ADV-02**: Swarm visualization dashboard polling MCP lifecycle endpoints
- **ADV-03**: Hunt journal mode with structured reasoning capture and inline hypothesis references
- **ADV-04**: Post-hunt review templates with playbook generation

## Out of Scope

| Feature | Reason |
|---------|--------|
| CLI process orchestration from Obsidian | Obsidian is knowledge tool, not process launcher; security risk from shell injection |
| Background sync / polling | No invisible state drift; all updates are user-initiated or vault-event-driven |
| VS Code feature parity | Different platform strengths; Obsidian is intelligence surface, not execution surface |
| Custom graph renderers | Obsidian's native graph view + Dataview handle visualization; don't compete with platform |
| Real-time telemetry integration | Obsidian is not a SIEM |
| AI-generated artifact content | Agents populate via structured ingestion, not generative writing |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ONTO-01 | Phase 68 | Complete |
| ONTO-02 | Phase 68 | Complete |
| ONTO-03 | Phase 68 | Complete |
| ONTO-04 | Phase 69 | Complete |
| ONTO-05 | Phase 69 | Complete |
| INGEST-01 | Phase 70 | Pending |
| INGEST-02 | Phase 70 | Pending |
| INGEST-03 | Phase 70 | Pending |
| INGEST-04 | Phase 71 | Pending |
| INGEST-05 | Phase 71 | Pending |
| INGEST-06 | Phase 71 | Pending |
| INGEST-07 | Phase 71 | Pending |
| MCP-01 | Phase 72 | Pending |
| MCP-02 | Phase 72 | Pending |
| MCP-07 | Phase 72 | Pending |
| MCP-03 | Phase 73 | Pending |
| MCP-04 | Phase 73 | Pending |
| MCP-05 | Phase 73 | Pending |
| MCP-06 | Phase 73 | Pending |
| HCOPY-01 | Phase 74 | Pending |
| HCOPY-03 | Phase 74 | Pending |
| HCOPY-04 | Phase 74 | Pending |
| HCOPY-06 | Phase 74 | Pending |
| HCOPY-02 | Phase 75 | Pending |
| HCOPY-05 | Phase 75 | Pending |
| HCOPY-07 | Phase 75 | Pending |
| CANVAS-01 | Phase 76 | Pending |
| CANVAS-02 | Phase 76 | Pending |
| CANVAS-03 | Phase 76 | Pending |
| CANVAS-04 | Phase 77 | Pending |
| CANVAS-05 | Phase 77 | Pending |
| CANVAS-06 | Phase 77 | Pending |

**Coverage:**
- v4.0 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation*
