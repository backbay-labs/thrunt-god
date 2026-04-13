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
- v4.0 Obsidian Knowledge Weapon (Phases 68-78) -- shipped 2026-04-12
- v5.0 Obsidian Intelligence Platform (Phases 79-90) -- in progress

## Phases

<details>
<summary>v3.1 Sidebar Automation & Operations (Phases 58-62) -- SHIPPED 2026-04-09</summary>

- [x] Phase 58: Sidebar Automation Section Foundation (2/2 plans) -- completed 2026-04-09
- [x] Phase 59: MCP Runtime Control Panel (3/3 plans) -- completed 2026-04-09
- [x] Phase 60: Command Deck Webview (3/3 plans) -- completed 2026-04-09
- [x] Phase 61: Runbook Engine & Editor (3/3 plans) -- completed 2026-04-09
- [x] Phase 62: Execution History & Guardrails (3/3 plans) -- completed 2026-04-09

</details>

<details>
<summary>v3.2 Obsidian Workspace Companion (Phases 63-64) -- SHIPPED 2026-04-11</summary>

- [x] Phase 63: Structural Foundation (5/5 plans) -- completed 2026-04-11
- [x] Phase 64: Live Hunt Dashboard (5/5 plans) -- completed 2026-04-11

</details>

<details>
<summary>v3.3 Zero-Friction Distribution (Phases 65-67) -- SHIPPED 2026-04-11</summary>

- [x] **Phase 65: Obsidian CLI Install Channel** - `--obsidian` installer, canonical bundle staging, macOS vault detection, symlink-based install/update (completed 2026-04-11)
- [x] **Phase 66: Release Artifact Pipeline** - release workflow builds Obsidian assets, validates version alignment, uploads plugin artifacts (completed 2026-04-11)
- [x] **Phase 67: Community Directory Submission Readiness** - review-safe package, public docs/screenshots, and tracked submission metadata for `obsidianmd/obsidian-releases` (completed 2026-04-11)

</details>

<details>
<summary>v4.0 Obsidian Knowledge Weapon (Phases 68-78) -- SHIPPED 2026-04-12</summary>

- [x] **Phase 68: Entity Note Schema + ATT&CK Ontology Scaffold** (3/3 plans) -- completed 2026-04-12
- [x] **Phase 69: Knowledge Base Dashboard + Sidebar Entity Summary** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 70: Artifact Registry + Parsers** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 71: Ingestion Engine + Agent Activity Timeline** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 72: MCP Client Adapter + Connection Infrastructure** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 73: MCP Enrichment + Intelligence Features** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 74: Export Profile Registry + Context Assembly Engine** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 75: Hyper Copy Commands + Export UX** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 76: Canvas Kill Chain Generator + Templates** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 77: Cross-Hunt Intelligence + Knowledge Dashboard** (2/2 plans) -- completed 2026-04-12
- [x] **Phase 78: v4.0 Tech Debt Cleanup** (2/2 plans) -- completed 2026-04-12

</details>

### v5.0 Obsidian Intelligence Platform (In Progress)

**Milestone Goal:** Graduate from knowledge weapon to intelligence platform -- polish UX with service decomposition and progressive disclosure, deepen entity intelligence with verdict lifecycles and computed confidence, make canvas alive with reactive nodes, add live hunt companion with filesystem watcher and bidirectional MCP, and capture analyst reasoning in structured journals that distill into reusable playbooks.

#### M1: UX Foundation + Service Decomposition

- [x] **Phase 79: Service Decomposition + EventBus** - Extract WorkspaceService god object into domain services, create typed EventBus, extract commands to commands.ts (completed 2026-04-12)
- [x] **Phase 80: Sidebar Progressive Disclosure + Onboarding** - Collapsible sections with persistent state, welcome screen, default hotkeys, context-aware defaults (completed 2026-04-12)
- [x] **Phase 81: Command Consolidation + Modal Polish** - Merge 19 commands to ~10 via FuzzySuggestModal choosers, rebuild modals on Obsidian base classes (completed 2026-04-12)

#### M2: Intelligence Depth

- [x] **Phase 82: Verdict Lifecycle + FrontmatterEditor + Schema Versioning** - Surgical frontmatter utility, verdict state machine with append-only history, schema_version migration (completed 2026-04-12)
- [x] **Phase 83: Cross-Hunt Aggregation + Computed Confidence** - Entity hunt history, related infrastructure co-occurrence, multi-factor confidence with decay (completed 2026-04-12)
- [x] **Phase 84: ATT&CK Institutional Memory** - Technique hunt linkbacks, false positive registry, coverage decay tracking (completed 2026-04-12)

#### M3: Live Canvas

- [x] **Phase 85: Canvas Adapter + Reactive Nodes** - Frontmatter-driven node appearance, file-level JSON patching for reactive updates, click-to-navigate (completed 2026-04-12)
- [x] **Phase 86: Live Hunt Canvas + Reactive Dashboard** - Auto-populating canvas from ingestion events, dashboard that updates on entity changes (completed 2026-04-12)

#### M4: Live Hunt Companion

- [x] **Phase 87: Filesystem Watcher + Hunt Pulse** - Vault event-based auto-ingestion for RECEIPTS/QUERIES, status bar pulse indicator, opt-out settings (completed 2026-04-12)
- [x] **Phase 88: Bidirectional MCP Event Bridge + Prior-Hunt Suggester** - CLI-to-Obsidian and Obsidian-to-CLI event flow, historical intelligence suggestions (completed 2026-04-12)

#### M5: Hunt Journal + Playbooks

- [x] **Phase 89: Hunt Journal Engine** - Journal note type with frontmatter, inline tagging syntax, timestamped entries, reasoning chain summary (completed 2026-04-12)
- [x] **Phase 90: Playbook Distillation + Detection Pipeline** - Generate reusable playbooks from journals, apply playbooks to new hunts, detection note type (completed 2026-04-13)

## Phase Details

### Phase 79: Service Decomposition + EventBus
**Goal**: The plugin's architecture supports 5 new domain concerns without growing the WorkspaceService god object -- each domain has its own service, and services communicate through a typed event bus
**Depends on**: Phase 78 (v4.0 complete)
**Requirements**: UX-06, UX-07
**Success Criteria** (what must be TRUE):
  1. WorkspaceService is decomposed into domain services (IntelligenceService, CanvasService, WatcherService, McpBridgeService, JournalService) with a typed EventBus coordinating between them
  2. main.ts contains only lifecycle management and command registration at under 300 LOC, with commands extracted to a commands.ts module
  3. All 369 existing tests pass without modification after the decomposition
  4. The ViewModel cache and sidebar rendering continue to work identically from the user's perspective
**Plans:** 3/3 plans complete

Plans:
- [ ] 79-01-PLAN.md &mdash; EventBus, entity-utils extraction, domain service class shells
- [ ] 79-02-PLAN.md &mdash; WorkspaceService facade decomposition into IntelligenceService, CanvasService, McpBridgeService
- [ ] 79-03-PLAN.md &mdash; main.ts slimming, commands.ts + modals.ts extraction

### Phase 80: Sidebar Progressive Disclosure + Onboarding
**Goal**: The sidebar feels native to Obsidian with persistent collapsible sections, context-aware defaults, and a clear first-run experience that gets new users productive immediately
**Depends on**: Phase 79
**Requirements**: UX-01, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. Sidebar sections are collapsible with persistent open/close state that survives plugin reloads, and the most relevant section auto-expands based on hunt phase
  2. A new user installing the plugin sees a welcome screen with explanation text and a one-click "Initialize Hunt Workspace" button when no .planning directory exists
  3. At least 3 default hotkeys ship: hyper copy (Ctrl+Shift+H), toggle sidebar (Ctrl+Shift+T), and ingest (Ctrl+Shift+I)
  4. Vault events are debounced (300-500ms trailing) to prevent sidebar flicker during active ingestion
**Plans**: 2 plans

Plans:
- [ ] 80-01-PLAN.md &mdash; Collapsible sidebar, persistent state, welcome screen, empty states, debounced vault events
- [ ] 80-02-PLAN.md &mdash; Default hotkeys for 3 commands (Hyper Copy, Toggle Sidebar, Ingest)

### Phase 81: Command Consolidation + Modal Polish
**Goal**: The command palette is clean and discoverable with ~10 grouped entries instead of 19, and every modal uses Obsidian's native base classes with full keyboard navigation
**Depends on**: Phase 80
**Requirements**: UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. Command palette shows ~10 grouped commands using FuzzySuggestModal chooser modals (one "Copy" command, one "Canvas" command, one "MCP" command as entry points)
  2. All modals use Obsidian base classes (SuggestModal/FuzzySuggestModal) with arrow key navigation, Enter to select, Escape to close, and Obsidian CSS variables for styling
  3. Old command IDs remain as aliases that delegate to the new chooser modals, preserving any user-configured hotkey bindings
  4. Direct sub-commands remain individually accessible for power users who bind specific actions to hotkeys
**Plans**: 2 plans

Plans:
- [ ] 81-01: FuzzySuggestModal chooser modals (Copy, Canvas, MCP) and command consolidation
- [ ] 81-02: Modal rebuild on Obsidian base classes, CSS variable migration, command alias preservation

### Phase 82: Verdict Lifecycle + FrontmatterEditor + Schema Versioning
**Goal**: Entity notes become living dossiers with a traceable verdict history, and frontmatter mutations are safe and surgical across the entire plugin
**Depends on**: Phase 81
**Requirements**: INTEL-10, INTEL-01, INTEL-02, INTEL-05
**Success Criteria** (what must be TRUE):
  1. FrontmatterEditor utility performs surgical frontmatter key-value updates without destroying YAML formatting, comments, or string quoting
  2. Entity notes track verdict lifecycle (unknown -> suspicious -> confirmed_malicious -> remediated -> resurfaced) with each transition timestamped, attributed to a hunt ID, and appended to an immutable history log
  3. "Set entity verdict" command prompts for new verdict and rationale, appends to the lifecycle log, updates frontmatter, and shows a confirmation Notice
  4. Entity frontmatter includes schema_version field, and the migration command updates all entity notes to latest schema without losing analyst content or existing field values
**Plans**: 3 plans

Plans:
- [ ] 82-01: FrontmatterEditor utility with surgical text manipulation (pure module + tests)
- [ ] 82-02: Verdict engine state machine, verdict_history schema, "Set verdict" command
- [ ] 82-03: Schema versioning with additive migration, batch upgrade with preview

### Phase 83: Cross-Hunt Aggregation + Computed Confidence
**Goal**: Entity notes show their full history across hunts, surface related infrastructure, and display a transparent, computed confidence score that decays over time
**Depends on**: Phase 82
**Requirements**: INTEL-03, INTEL-04, INTEL-09
**Success Criteria** (what must be TRUE):
  1. Entity notes show a computed Hunt History section listing every hunt that referenced the entity, the role it played, and the outcome
  2. When entities co-occur across multiple hunts, the related infrastructure is surfaced in both entity notes (e.g., "This IP was seen alongside these 4 domains in 3 hunts")
  3. Entity confidence is computed from inspectable factors (source_count, reliability, corroboration, days_since_validation) with configurable half-life decay, and each factor is visible in frontmatter
  4. Confidence is advisory -- analysts can see WHY confidence is a given value and can override it by editing frontmatter
**Plans**: 2 plans

Plans:
- [ ] 83-01: Cross-hunt entity aggregation and Hunt History section builder (pure module + tests)
- [ ] 83-02: Related infrastructure co-occurrence detection and confidence model with decay

### Phase 84: ATT&CK Institutional Memory
**Goal**: ATT&CK technique notes accumulate organizational intelligence -- which hunts targeted them, what false positives are known, which techniques have stale coverage, and which have linked detections
**Depends on**: Phase 83
**Requirements**: INTEL-06, INTEL-07, INTEL-08
**Success Criteria** (what must be TRUE):
  1. ATT&CK technique notes accumulate hunt linkbacks in a Hunt History section showing queries used, data sources, and outcomes (TP/FP/inconclusive) for each hunt
  2. Analysts can add false positive annotations to technique notes via a command, building a Known False Positives section with pattern descriptions
  3. Techniques not hunted in N months (configurable, default 90 days) are flagged as stale coverage, surfaceable via Dataview queries in KNOWLEDGE_BASE.md
**Plans**: 2 plans

Plans:
- [ ] 84-01: ATT&CK hunt linkback indexing and technique Hunt History builder (pure module + tests)
- [ ] 84-02: False positive registry command, coverage decay tracker, IntelligenceService integration

### Phase 85: Canvas Adapter + Reactive Nodes
**Goal**: Entity notes on a Canvas appear as typed, colored nodes whose appearance updates automatically when the underlying entity data changes, using file-level JSON manipulation (not undocumented internal APIs)
**Depends on**: Phase 84
**Requirements**: CANVAS-07, CANVAS-08, CANVAS-11
**Success Criteria** (what must be TRUE):
  1. Entity notes added to a Canvas appear as typed, colored nodes with frontmatter-driven appearance (entity type determines color, verdict determines border style, confidence determines opacity)
  2. Modifying an entity note's frontmatter triggers a file-level JSON patch of the corresponding Canvas node, updating its appearance without disturbing analyst-arranged node positions
  3. Clicking canvas nodes navigates to the corresponding vault note (using Obsidian's native file-node behavior)
  4. All canvas manipulation uses the official canvas.d.ts types and file-level JSON read/write -- no undocumented internal Canvas API calls
**Plans**: 2 plans

Plans:
- [ ] 85-01: Canvas live adapter pure module (frontmatter-to-appearance mapping, JSON diff/patch)
- [ ] 85-02: CanvasService reactive updates via vault modify events, official canvas.d.ts type migration

### Phase 86: Live Hunt Canvas + Reactive Dashboard
**Goal**: Canvas is alive during hunts -- new entities appear automatically as they are ingested, and the knowledge dashboard updates when entity notes change
**Depends on**: Phase 85
**Requirements**: CANVAS-09, CANVAS-10
**Success Criteria** (what must be TRUE):
  1. "Open live hunt canvas" command creates a canvas that auto-populates with new entity nodes as they are ingested during a hunt, without disturbing existing node positions
  2. Dashboard canvas updates reactively when entity notes change (new hunts, new entities, verdict updates), debounced to avoid write storms during batch operations
  3. Analyst node arrangements persist across all canvas updates -- the plugin only adds or updates node content, never repositions existing nodes
**Plans**: 2 plans

Plans:
- [ ] 86-01: Live hunt canvas with auto-population from EventBus entity:created events
- [ ] 86-02: Dashboard canvas reactivity via entity:modified events with debounced writes

### Phase 87: Filesystem Watcher + Hunt Pulse
**Goal**: Obsidian detects new agent-produced artifacts automatically and shows real-time hunt activity, with all live features safely disableable
**Depends on**: Phase 86
**Requirements**: LIVE-01, LIVE-02, LIVE-06
**Success Criteria** (what must be TRUE):
  1. New receipts and queries in RECEIPTS/ and QUERIES/ directories trigger auto-ingestion within the configured interval (default 2s debounce) via Obsidian vault events
  2. Status bar shows a "hunt pulse" indicator when recent agent activity is detected (artifact count and recency)
  3. All live features (auto-ingestion, hunt pulse, MCP event polling, prior-hunt suggestions) can be individually disabled via settings with graceful degradation
  4. Duplicate ingestion is prevented -- the watcher uses the existing sighting deduplication path
**Plans**: 2 plans

Plans:
- [ ] 87-01-PLAN.md &mdash; WatcherService real implementation (path scoping, auto-ingestion delegation, activity tracking), formatHuntPulse pure function, EventBus extension
- [ ] 87-02-PLAN.md &mdash; Settings UI with live feature toggles, auto-ingestion vault event wiring, hunt pulse status bar, dynamic enable/disable in main.ts

### Phase 88: Bidirectional MCP Event Bridge + Prior-Hunt Suggester
**Goal**: Obsidian is an active participant in hunts -- CLI events flow into the vault as artifacts, vault changes publish back to CLI/VS Code, and historical intelligence surfaces automatically when new entities match past hunts
**Depends on**: Phase 87
**Requirements**: LIVE-03, LIVE-04, LIVE-05
**Success Criteria** (what must be TRUE):
  1. CLI lifecycle events (hunt started, receipt generated, finding logged) flow to Obsidian via MCP polling and create or update corresponding vault artifacts
  2. Vault changes in Obsidian (entity created, verdict set, hypothesis changed) publish events consumable by CLI and VS Code via MCP outbound calls
  3. Prior-hunt suggestions appear as dismissable sidebar callouts when newly ingested entities match historical knowledge (e.g., "This IP appeared in Hunt-037 linked to APT29 staging")
  4. Suggestions are non-blocking and appear in a dedicated sidebar section, with configurable relevance threshold
**Plans**: 2 plans

Plans:
- [ ] 88-01-PLAN.md &mdash; MCP event bridge: pure event types, McpBridgeService pollEvents/publishEvent, settings activation, main.ts lifecycle
- [ ] 88-02-PLAN.md &mdash; Prior-hunt suggester: findPriorHuntMatches pure function, sidebar section, EventBus wiring

### Phase 89: Hunt Journal Engine
**Goal**: Analysts can capture their reasoning process during hunts in a structured, queryable format with tagged hypotheses, evidence, and decision points
**Depends on**: Phase 88
**Requirements**: JOURNAL-01, JOURNAL-02, JOURNAL-03, JOURNAL-04
**Success Criteria** (what must be TRUE):
  1. Hunt journal note type ships with YAML frontmatter (hunt_id, hypothesis, status, linked_entities) and supports timestamped entries appended via command
  2. Inline tagging syntax (#thrunt/h/, #thrunt/ev/, #thrunt/dp/) works for hypotheses, evidence strength, and decision points, and tags are indexed by Obsidian and queryable by Dataview
  3. "New journal entry" command appends a timestamped block to the active hunt journal with a template for hypothesis/evidence/decision tagging
  4. Journal summary command extracts the reasoning chain from tagged entries and produces a structured narrative showing hypothesis evolution, evidence accumulation, and decision points
**Plans**: 2 plans

Plans:
- [ ] 89-01: Journal parser pure module (tag extraction, entry parsing, summary generation) with TDD
- [ ] 89-02: JournalService, journal note type, "New entry" and "Summarize" commands

### Phase 90: Playbook Distillation + Detection Pipeline
**Goal**: Completed hunts distill into reusable playbooks that accelerate future hunts, and detection artifacts link back to their source hunts and techniques
**Depends on**: Phase 89
**Requirements**: JOURNAL-05, JOURNAL-06, JOURNAL-07
**Success Criteria** (what must be TRUE):
  1. Post-hunt "Generate playbook" command produces a reusable template with trigger conditions, recommended query sequences, expected entity types, and decision trees extracted from journal and receipt timeline
  2. "Apply playbook" command pre-populates a new hunt's hypotheses and huntmap from a selected playbook, giving analysts a head start on recurring hunt patterns
  3. Detection note type links Sigma/KQL/SPL rules to source hunts, TTPs, and entities, with coverage status visible on ATT&CK technique notes
**Plans**: 2 plans

Plans:
- [ ] 90-01: Playbook generator pure module (journal + receipt timeline walking, template production) with TDD
- [ ] 90-02: "Generate playbook" and "Apply playbook" commands, detection note type and coverage overlay

## Progress

**Execution Order:**
Phases execute in numeric order: 79 -> 80 -> 81 -> 82 -> 83 -> 84 -> 85 -> 86 -> 87 -> 88 -> 89 -> 90

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
| 69. Knowledge Base Dashboard + Sidebar Entity Summary | v4.0 | 2/2 | Complete | 2026-04-12 |
| 70. Artifact Registry + Parsers | v4.0 | 2/2 | Complete | 2026-04-12 |
| 71. Ingestion Engine + Agent Activity Timeline | v4.0 | 2/2 | Complete | 2026-04-12 |
| 72. MCP Client Adapter + Connection Infrastructure | v4.0 | 2/2 | Complete | 2026-04-12 |
| 73. MCP Enrichment + Intelligence Features | v4.0 | 2/2 | Complete | 2026-04-12 |
| 74. Export Profile Registry + Context Assembly Engine | v4.0 | 2/2 | Complete | 2026-04-12 |
| 75. Hyper Copy Commands + Export UX | v4.0 | 2/2 | Complete | 2026-04-12 |
| 76. Canvas Kill Chain Generator + Templates | v4.0 | 2/2 | Complete | 2026-04-12 |
| 77. Cross-Hunt Intelligence + Knowledge Dashboard | v4.0 | 2/2 | Complete | 2026-04-12 |
| 78. v4.0 Tech Debt Cleanup | v4.0 | 2/2 | Complete | 2026-04-12 |
| 79. Service Decomposition + EventBus | 3/3 | Complete    | 2026-04-12 | - |
| 80. Sidebar Progressive Disclosure + Onboarding | 2/2 | Complete    | 2026-04-12 | - |
| 81. Command Consolidation + Modal Polish | 2/2 | Complete    | 2026-04-12 | - |
| 82. Verdict Lifecycle + FrontmatterEditor + Schema Versioning | 3/3 | Complete    | 2026-04-12 | - |
| 83. Cross-Hunt Aggregation + Computed Confidence | 2/2 | Complete    | 2026-04-12 | - |
| 84. ATT&CK Institutional Memory | 2/2 | Complete    | 2026-04-12 | - |
| 85. Canvas Adapter + Reactive Nodes | 2/2 | Complete    | 2026-04-12 | - |
| 86. Live Hunt Canvas + Reactive Dashboard | 2/2 | Complete    | 2026-04-12 | - |
| 87. Filesystem Watcher + Hunt Pulse | 2/2 | Complete    | 2026-04-12 | - |
| 88. Bidirectional MCP Event Bridge + Prior-Hunt Suggester | 2/2 | Complete    | 2026-04-12 | - |
| 89. Hunt Journal Engine | 2/2 | Complete    | 2026-04-12 | - |
| 90. Playbook Distillation + Detection Pipeline | 2/2 | Complete   | 2026-04-13 | - |
