# Requirements: THRUNT GOD

**Defined:** 2026-04-12
**Core Value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.

## v5.0 Requirements

Requirements for the Obsidian Intelligence Platform milestone. Each maps to roadmap phases.

### UX Foundation + Service Decomposition

- [x] **UX-01**: Sidebar sections are collapsible with persistent state and context-aware defaults based on hunt phase
- [x] **UX-02**: Command palette shows ~10 grouped commands (down from 19) using FuzzySuggestModal chooser modals
- [x] **UX-03**: All modals use Obsidian base classes (SuggestModal/FuzzySuggestModal) with keyboard navigation and CSS variables
- [x] **UX-04**: New user sees a welcome screen with one-click "Initialize Hunt Workspace" when no .planning directory exists
- [x] **UX-05**: At least 3 default hotkeys ship (hyper copy, toggle sidebar, ingest)
- [x] **UX-06**: WorkspaceService decomposed into domain services (IntelligenceService, CanvasService, WatcherService, McpBridgeService, JournalService) with typed EventBus
- [x] **UX-07**: main.ts reduced to lifecycle + command registration (<300 LOC), commands extracted to commands.ts module

### Intelligence Depth

- [x] **INTEL-01**: Entity notes track verdict lifecycle (unknown -> suspicious -> confirmed_malicious -> remediated -> resurfaced) with timestamped, attributed append-only history
- [x] **INTEL-02**: "Set entity verdict" command prompts for verdict + rationale, appends to lifecycle log, updates frontmatter
- [x] **INTEL-03**: Entity notes show cross-hunt aggregation (every hunt referencing the entity, its role, and outcome) in a computed Hunt History section
- [x] **INTEL-04**: Related infrastructure is surfaced when entities co-occur across multiple hunts
- [x] **INTEL-05**: Entity frontmatter includes schema_version field with additive migration command that updates notes without data loss
- [x] **INTEL-06**: ATT&CK technique notes accumulate hunt linkbacks (queries used, data sources, outcomes) in a Hunt History section
- [x] **INTEL-07**: Analysts can add false positive annotations to technique notes via command
- [x] **INTEL-08**: Techniques not hunted in N months (configurable) are flagged as stale coverage
- [x] **INTEL-09**: Entity confidence is computed from multiple inspectable factors (source_count, reliability, corroboration, days_since_validation) with configurable decay
- [x] **INTEL-10**: FrontmatterEditor utility performs surgical frontmatter updates without YAML formatting destruction

### Live Canvas

- [x] **CANVAS-07**: Entity notes added to a Canvas appear as typed, colored nodes with frontmatter-driven appearance (type -> color, verdict -> border, confidence -> opacity)
- [x] **CANVAS-08**: Modifying an entity note's frontmatter updates the corresponding Canvas node via file-level JSON patching (preserves analyst layout)
- [x] **CANVAS-09**: Live hunt canvas auto-populates with new entities as they are ingested
- [x] **CANVAS-10**: Dashboard canvas updates reactively when entity notes change
- [x] **CANVAS-11**: Clicking canvas nodes navigates to the corresponding vault note

### Live Hunt Companion

- [x] **LIVE-01**: New receipts/queries in RECEIPTS/ and QUERIES/ directories trigger auto-ingestion within configurable interval
- [x] **LIVE-02**: Status bar shows "hunt pulse" indicator when recent agent activity is detected
- [x] **LIVE-03**: Bidirectional MCP event bridge: CLI lifecycle events flow to Obsidian and create/update vault artifacts
- [x] **LIVE-04**: Vault changes in Obsidian publish events consumable by CLI and VS Code
- [ ] **LIVE-05**: Prior-hunt suggestions appear as dismissable sidebar callouts when newly ingested entities match historical knowledge
- [x] **LIVE-06**: All live features can be disabled via settings (graceful opt-out)

### Hunt Journal + Playbooks

- [ ] **JOURNAL-01**: Hunt journal note type with YAML frontmatter (hunt_id, hypothesis, status, linked_entities) and timestamped entries
- [ ] **JOURNAL-02**: Inline tagging syntax (#thrunt/h/, #thrunt/ev/, #thrunt/dp/) for hypotheses, evidence strength, and decision points
- [ ] **JOURNAL-03**: "New journal entry" command appends a timestamped block to the active hunt journal
- [ ] **JOURNAL-04**: Journal summary command extracts reasoning chain from tagged entries into structured narrative
- [ ] **JOURNAL-05**: Post-hunt "Generate playbook" command produces reusable template with trigger conditions, query sequences, and decision trees
- [ ] **JOURNAL-06**: "Apply playbook" command pre-populates new hunt hypotheses and huntmap from a selected playbook
- [ ] **JOURNAL-07**: Detection note type links Sigma/KQL/SPL rules to source hunts, TTPs, and entities

## Future Requirements

Deferred beyond v5.0.

### Ecosystem Integration

- **ECO-01**: Drag-to-reorder sidebar sections
- **ECO-02**: Post-scaffold guided tour overlay
- **ECO-03**: Executable playbook sections (MCP tool calls from playbook steps)
- **ECO-04**: VS Code cross-surface event protocol (shared JSON event schema)
- **ECO-05**: Vault template package for standalone use without plugin

## Out of Scope

| Feature | Reason |
|---------|--------|
| Canvas internal API (undocumented) | Fragile, breaks on Obsidian updates; use file-level JSON manipulation only |
| MCP SSE transport | Deprecated March 2025; use file-based events or obsidian:// protocol |
| Raw fs.watch filesystem watcher | Unreliable on macOS, breaks mobile; use Obsidian vault events + polling |
| SOAR-style orchestration | "Prepare, don't orchestrate" design philosophy |
| NLP-based entity extraction | Regex extraction sufficient; NLP adds complexity without proportional value |
| WebSocket server in plugin | Electron plugin sandbox constraints; use protocol handlers instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UX-01 | Phase 80 | Complete |
| UX-02 | Phase 81 | Complete |
| UX-03 | Phase 81 | Complete |
| UX-04 | Phase 80 | Complete |
| UX-05 | Phase 80 | Complete |
| UX-06 | Phase 79 | Complete |
| UX-07 | Phase 79 | Complete |
| INTEL-01 | Phase 82 | Complete |
| INTEL-02 | Phase 82 | Complete |
| INTEL-03 | Phase 83 | Complete |
| INTEL-04 | Phase 83 | Complete |
| INTEL-05 | Phase 82 | Complete |
| INTEL-06 | Phase 84 | Complete |
| INTEL-07 | Phase 84 | Complete |
| INTEL-08 | Phase 84 | Complete |
| INTEL-09 | Phase 83 | Complete |
| INTEL-10 | Phase 82 | Complete |
| CANVAS-07 | Phase 85 | Complete |
| CANVAS-08 | Phase 85 | Complete |
| CANVAS-09 | Phase 86 | Complete |
| CANVAS-10 | Phase 86 | Complete |
| CANVAS-11 | Phase 85 | Complete |
| LIVE-01 | Phase 87 | Complete |
| LIVE-02 | Phase 87 | Complete |
| LIVE-03 | Phase 88 | Complete |
| LIVE-04 | Phase 88 | Complete |
| LIVE-05 | Phase 88 | Pending |
| LIVE-06 | Phase 87 | Complete |
| JOURNAL-01 | Phase 89 | Pending |
| JOURNAL-02 | Phase 89 | Pending |
| JOURNAL-03 | Phase 89 | Pending |
| JOURNAL-04 | Phase 89 | Pending |
| JOURNAL-05 | Phase 90 | Pending |
| JOURNAL-06 | Phase 90 | Pending |
| JOURNAL-07 | Phase 90 | Pending |

**Coverage:**
- v5.0 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
