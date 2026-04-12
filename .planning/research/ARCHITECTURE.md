# Architecture Patterns

**Domain:** Obsidian plugin -- threat hunt intelligence platform (v5.0 integration architecture)
**Researched:** 2026-04-11
**Confidence:** HIGH (based on direct codebase inspection of all 25+ source files)

---

## Current Architecture Snapshot

### Existing Module Map (v4.0 shipped state)

| File | Lines | Obsidian Import | Responsibility |
|------|-------|-----------------|----------------|
| `workspace.ts` | 1,545 | Yes (thin -- `App` type only) | God-object orchestrator: ViewModel construction, bootstrap, ingestion, MCP enrichment, coverage analysis, decision/learning logging, context assembly, canvas generation, cross-hunt intel, knowledge dashboard, entity scanning, frontmatter parsing |
| `main.ts` | 736 | Yes | Plugin lifecycle, command registration (19 commands), event wiring (`vault.on create/delete/rename`), MCP client init, status bar, 3 inline Modal classes |
| `view.ts` | 371 | Yes | Sidebar rendering: hunt status card, KB section, agent artifacts, receipt timeline, core artifacts list |
| `vault-adapter.ts` | 98 | Yes | Thin adapter: `VaultAdapter` interface + `ObsidianVaultAdapter` implementation. 10 methods. |
| `types.ts` | 293 | No | All type definitions. Pure data. |
| `entity-schema.ts` | 260 | No | 8 entity type definitions with frontmatter schemas and starter templates |
| `canvas-generator.ts` | 311 | No | 4 canvas layout generators (kill-chain, diamond, lateral-movement, hunt-progression) |
| `cross-hunt.ts` | 365 | No | Cross-hunt analysis: recurring IOCs, coverage gaps, actor convergence, hunt comparison, dashboard canvas |
| `context-assembly.ts` | 335 | No | Wiki-link traversal, section extraction, provenance assembly for export profiles |
| `ingestion.ts` | 205 | No | Entity extraction from receipts/queries, sighting dedup, ingestion log formatting |
| `mcp-enrichment.ts` | 174 | No | Enrichment merge, coverage report builder, decision/learning formatters |
| `mcp-client.ts` | 153 | No (uses injected requestFn) | `McpClient` interface + `HttpMcpClient` + `StubMcpClient` |
| `export-profiles.ts` | 158 | No | Profile loading, 5 built-in export profiles |
| `export-log.ts` | 118 | No | Export log entry builder and formatter |
| `hyper-copy-modal.ts` | 132 | Yes | HyperCopy profile chooser modal |
| `mcp-search-modal.ts` | 126 | Yes | Knowledge graph search modal |
| `scaffold.ts` | 113 | No | ATT&CK ontology scaffolder (161 parent techniques) |
| `paths.ts` | 38 | No | `normalizePath`, `getPlanningDir`, `getCoreFilePath`, `getEntityFolder` |
| `settings.ts` | 93 | Yes | Settings tab, 3 settings (planningDir, mcpServerUrl, mcpEnabled) |
| `parsers/` | ~5 files | No | STATE.md, HYPOTHESES.md, receipt, query-log parsers |

**Total: ~5,800 LOC across 25+ source files.**

### Architecture Pattern

The codebase follows a layered pattern:

```
main.ts (Plugin lifecycle + command registration)
    |
    v
WorkspaceService (orchestrator -- too many responsibilities)
    |
    +---> VaultAdapter (filesystem abstraction)
    +---> McpClient (MCP server communication)
    +---> Pure modules (parsers, ingestion, canvas-generator, etc.)
    |
    v
view.ts (consumes ViewModel, renders sidebar)
```

**Key constraints already in place:**
- Pure modules have ZERO Obsidian imports -- testable without mocking
- `VaultAdapter` is the only seam between domain logic and Obsidian's vault API
- `main.ts` wires vault events (`create/delete/rename`) to `invalidate()` + `refreshViews()`
- ViewModel is cached, invalidated on vault events, rebuilt lazily on next `getViewModel()` call
- `McpClient` interface enables `StubMcpClient` for testing

### The WorkspaceService Problem

WorkspaceService at 1,545 lines is a god object. It handles 9 distinct concerns:

1. **ViewModel construction** (lines 74-186) -- scanning artifacts, parsing state, counting entities, building timeline
2. **Bootstrap** (lines 192-221) -- workspace scaffolding
3. **Ingestion** (lines 251-395) -- receipt/query scanning, entity creation/update, log writing
4. **MCP operations** (lines 401-634) -- enrichment, coverage analysis, decision/learning logging
5. **Context assembly** (lines 640-705) -- profile-based export assembly
6. **Canvas generation** (lines 711-965) -- hunt canvas, template canvas, entity scanning for canvas
7. **Cross-hunt intelligence** (lines 971-1282) -- reports, comparison, dashboard
8. **Entity scanning** (lines 1284-1441) -- frontmatter parsing, entity note scanning (shared helper)
9. **Infrastructure detection** (lines 1443-1514) -- extended artifacts, phase directories

Adding v5.0 features (verdict engine, confidence model, filesystem watcher, bidirectional MCP, journal engine, playbook system, live canvas) directly to WorkspaceService would push it past 3,000 lines and make it unmaintainable. Decomposition is a prerequisite.

---

## Recommended Architecture for v5.0

### Decomposition Strategy: Extract Domain Services

Extract WorkspaceService into focused domain services. Each service gets its own file, owns one concern, and communicates through the shared `VaultAdapter` and a typed `EventBus`.

```
main.ts (Plugin lifecycle, command registration, event wiring)
    |
    +---> WorkspaceService (SLIMMED: ViewModel + bootstrap + coordination ONLY)
    |       |
    |       +---> IngestionService (extracted from workspace.ts)
    |       +---> McpBridgeService (extracted + extended for bidirectional events)
    |       +---> CanvasService (extracted + extended for live canvas)
    |       +---> IntelligenceService (extracted cross-hunt + extended for M2)
    |       +---> JournalService (NEW for M5)
    |       +---> WatcherService (NEW for M4)
    |       |
    |       +---> VaultAdapter (unchanged -- shared filesystem seam)
    |       +---> McpClient (unchanged interface, extended transport)
    |       +---> EventBus (NEW -- typed internal event routing)
    |
    +---> view.ts (sidebar rendering -- extended with progressive disclosure)
    +---> modals/ (extracted from main.ts, refactored for Obsidian base classes)
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `WorkspaceService` | ViewModel construction, bootstrap, cache invalidation, service coordination | All services, VaultAdapter | **MODIFIED** (slimmed from 1,545 to ~400 lines) |
| `IngestionService` | Receipt/query scanning, entity creation/update, ingestion log, **single-file ingestion** | VaultAdapter, parsers, entity-schema | **NEW** (extracted from workspace.ts lines 251-395) |
| `McpBridgeService` | MCP enrichment, coverage analysis, decision/learning logging, **bidirectional event bridge** | McpClient, VaultAdapter, EventBus | **NEW** (extracted from workspace.ts lines 401-634, extended for M4) |
| `CanvasService` | Static canvas generation, **live canvas coordination**, canvas-from-hunt | VaultAdapter, canvas-generator, entity scanning | **NEW** (extracted from workspace.ts lines 711-965, extended for M3) |
| `IntelligenceService` | Cross-hunt reports, hunt comparison, dashboard, **verdict engine, confidence model, ATT&CK memory** | VaultAdapter, cross-hunt, entity-schema | **NEW** (extracted from workspace.ts lines 971-1441, extended for M2) |
| `JournalService` | Hunt journal CRUD, inline tag parsing, summary generation, **playbook distillation** | VaultAdapter, parsers | **NEW** (entirely new for M5) |
| `WatcherService` | Filesystem watcher for RECEIPTS/QUERIES, auto-ingestion trigger, hunt pulse tracking | Vault events (via VaultAdapter), IngestionService, EventBus | **NEW** (entirely new for M4) |
| `EventBus` | Internal event routing: vault changes, MCP events, watcher events, canvas updates | All services | **NEW** (coordination layer) |
| `view.ts` | Sidebar rendering with collapsible sections, progressive disclosure, hunt pulse indicator, intelligence suggestions | WorkspaceService (ViewModel), EventBus | **MODIFIED** (M1 redesign) |
| `main.ts` | Plugin lifecycle, command registration (~10 grouped commands), hotkey registration | All services, modals | **MODIFIED** (M1 command consolidation) |
| `settings.ts` | Plugin settings with new fields for watcher, confidence decay, auto-ingestion | -- | **MODIFIED** (new settings for M4, M2) |
| `modals/` | Extracted and refactored modals using Obsidian base classes | -- | **NEW directory** (extracted from main.ts) |

### New Pure Modules (No Obsidian Imports)

| Module | Purpose | Used By |
|--------|---------|---------|
| `verdict-engine.ts` | Verdict state machine: `unknown -> suspicious -> confirmed_malicious -> remediated -> resurfaced`. Transition validation, audit log formatting. | IntelligenceService |
| `confidence-model.ts` | `confidence = f(source_count, source_reliability, corroboration_depth, days_since_validation)`. Decay with configurable half-life. | IntelligenceService |
| `schema-versioning.ts` | Detect frontmatter `schema_version`, produce migration diffs, batch upgrade. | IntelligenceService, entity-schema |
| `journal-parser.ts` | Parse `#h/`, `#ev/`, `#dp/` inline tags. Extract reasoning chains. Build structured summaries. | JournalService |
| `playbook-generator.ts` | Walk journal + receipt timeline, produce reusable hunt template with trigger conditions and decision trees. | JournalService |
| `event-schema.ts` | Shared event type definitions for EventBus: `HuntStarted`, `PhaseTransitioned`, `ReceiptGenerated`, `EntityCreated`, `VerdictSet`, etc. | EventBus, McpBridgeService, WatcherService |
| `canvas-live-adapter.ts` | Translate entity frontmatter to canvas node appearance (type->color, verdict->border, confidence->opacity). Diff-based node updates. | CanvasService |
| `attack-memory.ts` | Hunt linkback indexing, false positive registry formatting, coverage decay calculation, detection linkback tracking. | IntelligenceService |
| `prior-hunt-suggester.ts` | Query knowledge graph for matching entities/TTPs, format suggestion callouts with relevance scoring. | WatcherService, IntelligenceService |
| `detection-pipeline.ts` | Extract detection rule candidates from receipt content, link detections to techniques, compute coverage overlay. | JournalService |

---

## Data Flow Changes

### Current Data Flow (v4.0)

```
Vault events (create/delete/rename)
    |
    v
main.ts: invalidate() + refreshViews()
    |
    v
WorkspaceService.getViewModel() -- rebuilds entire ViewModel from scratch
    |
    v
view.ts.render() -- re-renders entire sidebar from scratch
```

This is a full-rebuild-on-any-change model. Functional at current scale but does not support live features.

### v5.0 Data Flow: Event-Driven with Targeted Updates

```
                    +------------------+
                    |    EventBus      |
                    | (typed emitter)  |
                    +--------+---------+
                             |
         +-------------------+-------------------+
         |                   |                   |
    Vault events        MCP events         Watcher events
    (create/delete/     (inbound from      (vault.on('create')
     rename/modify)      CLI/VS Code)       filtered for
         |                   |               RECEIPTS/QUERIES)
         v                   v                   v
  +------+------+    +------+------+    +-------+-------+
  | Workspace   |    | McpBridge   |    | Watcher       |
  | Service     |    | Service     |    | Service       |
  | (ViewModel) |    | (events)    |    | (auto-ingest) |
  +------+------+    +------+------+    +-------+-------+
         |                   |                   |
         +-------------------+-------------------+
         |                   |                   |
         v                   v                   v
    view.ts             CanvasService       Sidebar
    (section-level      (node-level         (hunt pulse
     updates)            updates)            indicator)
```

### Key Data Flow: Filesystem Watcher -> Auto-Ingestion

```
Obsidian vault.on('create') fires for new file
    |
    v
WatcherService.onFileCreated(file)
    -> Checks: is path in {planningDir}/RECEIPTS/RCT-*.md or QUERIES/QRY-*.md?
    -> If no: ignore (let normal invalidate+refresh handle it)
    -> If yes: debounce (2000ms default)
    |
    v
IngestionService.ingestFile(path)  -- NEW single-file method (extracted from batch loop)
    -> Parse receipt/query
    -> Extract entities
    -> Create/update entity notes
    -> Append to ingestion log
    |
    v
EventBus.emit('entity:created', { name, type, sourcePath })
    |
    +---> view.ts: update receipt timeline section only (not full rebuild)
    +---> CanvasService: add node to live canvas (if one is open)
    +---> PriorHuntSuggester: query cross-hunt data, surface matches in sidebar
```

### Key Data Flow: Bidirectional MCP Event Bridge

```
Inbound (CLI -> Obsidian):
    MCP server receives event via HTTP endpoint
    -> McpBridgeService polls: GET {mcpServerUrl}/events (5000ms interval)
    -> McpBridgeService.handleInbound(event)
    -> Dispatches by event type:
       'hunt:started'           -> Creates/updates MISSION.md
       'hunt:phaseTransitioned' -> Updates STATE.md
       'hunt:receiptGenerated'  -> Triggers IngestionService.ingestFile()
       'hunt:findingLogged'     -> Updates FINDINGS.md
    -> EventBus.emit(event.type, event.data)
    -> view.ts updates relevant section

Outbound (Obsidian -> CLI):
    VerdictEngine sets verdict via IntelligenceService
    -> EventBus.emit('entity:verdictSet', { entity, verdict, rationale })
    -> McpBridgeService.publishOutbound(event)
    -> POST {mcpServerUrl}/events with event payload
    -> CLI/VS Code consumers receive on next poll
```

**IMPORTANT CONSTRAINT:** Obsidian plugins cannot open listening sockets. Inbound events MUST use polling or be triggered by MCP tool responses. The MCP server acts as message broker.

### Key Data Flow: Live Canvas Reactivity

```
Entity frontmatter changes (via vault.on('modify') event)
    |
    v
EventBus.emit('entity:modified', { path, frontmatter })
    |
    v
CanvasService.handleEntityModified(path, frontmatter)
    -> Scans open .canvas files for nodes referencing this entity
    -> If no match: ignore
    -> If match: compute new node appearance from frontmatter
       (type -> color, verdict -> border style, confidence -> opacity)
    -> Debounce 500ms (coalesce rapid updates during batch ingestion)
    |
    v
CanvasService.writeCanvasUpdate(canvasPath, updatedNodes)
    -> Read .canvas JSON
    -> Patch matching nodes
    -> Write .canvas JSON via VaultAdapter.modifyFile()
    -> Obsidian detects file change and re-renders canvas automatically
```

---

## Critical Constraint: Canvas API

**Obsidian's Canvas API is undocumented and internal.** The official public API (canvas.d.ts) only defines the `.canvas` JSON file format:

- `CanvasData` (root: nodes + edges arrays)
- `CanvasNodeData` (id, x, y, width, height, color) with 4 subtypes: file, text, link, group
- `CanvasEdgeData` (id, fromNode, toNode, fromSide, toSide, fromEnd, toEnd, label)

There is NO public API for:
- Registering custom node types
- Programmatic runtime node manipulation
- Canvas change event listeners
- Real-time node re-rendering from plugin code

**Recommended approach: file-based reactivity.** The existing `canvas-generator.ts` already writes `.canvas` JSON files. For "live" behavior:

1. Watch entity note changes via Obsidian vault events (`vault.on('modify', ...)`)
2. Detect if the modified file is referenced by any tracked `.canvas` file
3. Re-write the `.canvas` JSON with updated node properties (color, text, etc.)
4. Obsidian detects the `.canvas` file change and re-renders automatically

**Mitigations:**
- Debounce canvas writes (500ms) to avoid write storms during batch ingestion
- Only track "live" canvases (explicitly opened via command), not all .canvas files
- Canvas JSON is typically small (<50KB) so writes are cheap
- Use `CanvasFileData` node type (`type: 'file'`) for drill-down navigation -- Obsidian natively supports clicking file-type nodes to open the referenced note

**Confidence:** HIGH that file-based approach works. The existing canvas generation already uses this pattern. LOW confidence in timing tuning -- debounce values need empirical testing.

Sources:
- [Obsidian Canvas API Type Definitions (canvas.d.ts)](https://github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts)
- [Canvas API Discussion - Obsidian Forum](https://forum.obsidian.md/t/any-details-on-the-canvas-api/57120)
- [Canvas System - DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system)

---

## VaultAdapter Extensions

The current `VaultAdapter` interface (10 methods) needs one addition for v5.0:

```typescript
interface VaultAdapter {
  // Existing 10 methods -- unchanged
  fileExists(path: string): boolean;
  folderExists(path: string): boolean;
  readFile(path: string): Promise<string>;
  createFile(path: string, content: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  getFile(path: string): TFile | null;
  listFolders(path: string): Promise<string[]>;
  listFiles(path: string): Promise<string[]>;
  modifyFile(path: string, content: string): Promise<void>;
  getFileMtime(path: string): number | null;

  // NEW for v5.0
  onFileEvent(
    event: 'create' | 'modify' | 'delete' | 'rename',
    callback: (file: TAbstractFile, oldPath?: string) => void,
  ): EventRef;
}
```

**Rationale:** WatcherService needs to listen for `modify` events (main.ts currently only wires `create/delete/rename`). Rather than having WatcherService import from `obsidian`, extending VaultAdapter to expose event registration keeps the pure-module boundary clean. The `StubVaultAdapter` in tests can provide a no-op implementation.

**Alternative considered:** Having main.ts wire the `modify` event alongside existing events. Rejected because main.ts should not know about WatcherService's specific event needs -- that coupling would grow as more services need events.

---

## EventBus Design

An internal typed event bus coordinates between services without creating circular dependencies.

```typescript
// event-bus.ts -- pure module, no Obsidian imports

type EventMap = {
  // Entity lifecycle
  'entity:created': { name: string; type: string; sourcePath: string };
  'entity:modified': { path: string; frontmatter: Record<string, unknown> };
  'entity:verdictSet': { entity: string; verdict: string; rationale: string; huntId: string };

  // Hunt lifecycle
  'hunt:phaseTransitioned': { phase: string; previousPhase: string };
  'hunt:receiptGenerated': { receiptId: string; path: string };
  'hunt:started': { huntId: string; mission: string };

  // Canvas
  'canvas:nodeAdded': { canvasPath: string; nodeId: string };
  'canvas:updateRequested': { canvasPath: string; entityPath: string };

  // Watcher
  'watcher:artifactDetected': { path: string; type: 'receipt' | 'query' };
  'watcher:huntPulse': { timestamp: number; artifactCount: number };

  // Intelligence
  'suggestion:surfaced': { entity: string; relevance: number; historicalHunt: string };

  // Journal
  'journal:entryAdded': { journalPath: string; huntId: string; tags: string[] };
};

export class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event)!;
    set.add(handler);
    return () => set.delete(handler); // returns unsubscribe function
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) for (const handler of set) handler(data);
  }

  clear(): void { this.listeners.clear(); }
}
```

**Why EventBus rather than direct service-to-service calls:**
- WatcherService needs to trigger IngestionService, CanvasService, and PriorHuntSuggester without importing them (avoids circular deps)
- McpBridgeService needs to publish to view.ts and CanvasService without knowing their implementation
- Pure modules can emit events without knowing who consumes them
- Easy to add new consumers (e.g., future notification system) without modifying emitters
- EventBus is trivially testable (subscribe, emit, assert callback called)

---

## Settings Expansion

Current settings (3 fields) grow to support v5.0 features:

```typescript
interface ThruntGodPluginSettings {
  // Existing (unchanged)
  planningDir: string;
  mcpServerUrl: string;
  mcpEnabled: boolean;

  // M1: UX Foundation
  sidebarSectionOrder: string[];       // user-configurable section ordering
  sidebarDensity: 'compact' | 'detailed';

  // M2: Intelligence Depth
  confidenceDecayHalfLifeDays: number; // default 180
  coverageDecayThresholdDays: number;  // default 90

  // M4: Live Hunt Companion
  autoIngestEnabled: boolean;          // default false (opt-in)
  watcherDebounceMs: number;           // default 2000
  mcpEventPollingIntervalMs: number;   // default 5000
  priorHuntSuggestionsEnabled: boolean; // default true
  suggestionRelevanceThreshold: number; // default 0.3

  // M5: Journal
  journalTimestampFormat: string;      // default 'HH:mm:ss'
}
```

**Migration:** New settings use defaults. Old settings objects without new fields get defaults via spread: `{ ...DEFAULT_SETTINGS, ...stored }`. This is the existing pattern in `loadSettings()`.

---

## Integration Points by Milestone

### M1: UX Foundation

**Sidebar Redesign (M1.1)**
- Modifies `view.ts` only. ViewModel shape unchanged.
- Each section gets a `renderXxxSection()` method (already partially done: `renderHuntStatusCard`, `renderKBSection`, etc.)
- Collapse state stored in `localStorage` keyed by section ID
- New method: `renderWelcomeState()` for `workspaceStatus === 'missing'`

**Command Consolidation (M1.2)**
- Modifies `main.ts`: replace 19 `addCommand()` calls with ~10 grouped commands
- New file: `modals/command-chooser-modal.ts` -- generic multi-option chooser extending `SuggestModal`
- Pattern: "THRUNT: Copy" command opens chooser with all export profiles. Same for Canvas, MCP.
- Direct commands remain available for hotkey binding (keep command IDs stable)

**Modal Extraction (M1.3)**
- Extract `PromptModal`, `CanvasTemplateModal`, `CompareHuntsModal` from main.ts to `modals/` directory
- Rebuild on `SuggestModal`/`FuzzySuggestModal` base classes
- Use Obsidian CSS variables (`--text-normal`, `--text-muted`, `--background-secondary`)
- Reduces main.ts by ~150 lines

### M2: Intelligence Depth

**Verdict Engine (M2.1)**
- New pure module: `verdict-engine.ts` with state machine
- Valid transitions: `unknown -> suspicious -> confirmed_malicious -> remediated -> resurfaced`
- `IntelligenceService.setVerdict(entityPath, newVerdict, rationale, huntId)` orchestrates:
  1. Read entity note via VaultAdapter
  2. Validate transition via `isValidTransition()`
  3. Append to `## Verdict History` section
  4. Update frontmatter `verdict` field
  5. Emit `entity:verdictSet` via EventBus
- Entity schema change: add `schema_version: 2`, `verdict_history: []` to IOC frontmatter fields

**Confidence Model (M2.3)**
- New pure module: `confidence-model.ts`
- Formula: `confidence = (sourceCount * 0.3 + reliability * 0.3 + corroboration * 0.2 + recency * 0.2)`
- Decay: `decayed = base * 0.5^(daysSinceValidation / halfLifeDays)`
- Each factor stored as inspectable frontmatter field
- `IntelligenceService.recomputeConfidence(entityPath)` scans sightings, counts sources, applies decay

**Schema Versioning (M2.1)**
- New pure module: `schema-versioning.ts`
- Detects `schema_version` field (default 1 for pre-v5.0 notes)
- Migration v1->v2: add `schema_version: 2`, `verdict: ""`, `verdict_history: []`, `confidence_factors: {}`
- Batch migration command: scans all entity folders, applies migration, writes updated content
- Additive only -- never removes existing fields or analyst content

### M3: Live Canvas

**Canvas Live Adapter (M3.1)**
- New pure module: `canvas-live-adapter.ts`
- Maps frontmatter to node appearance:
  - `entityType` -> node color (extends existing `ENTITY_COLORS`)
  - `verdict` -> border style (`confirmed_malicious` = red dashed, `remediated` = green solid, etc.)
  - `confidence` -> opacity (0.3 at low confidence, 1.0 at high)
- `diffCanvasNodes(currentJson, entityUpdates)` -> minimal patch set
- `applyNodePatch(canvasJson, patches)` -> updated JSON string

**Live Hunt Canvas (M3.2)**
- `CanvasService.createLiveHuntCanvas()` creates a `.canvas` file and registers it as "live"
- When EventBus emits `entity:created`, CanvasService checks if any live canvas exists
- If yes: reads canvas JSON, appends new node (position: bottom of current layout), writes back
- Analyst arrangements persist -- only ADD nodes, never reposition existing ones
- Edge suggestion: when two entities co-occur in same receipt, suggest edge (stored in pending list, applied on next canvas update)

**Dashboard Reactivity (M3.3)**
- Extends existing `generateDashboardCanvas()` to use file-type nodes instead of text-type nodes
- File-type nodes: `{ type: 'file', file: 'path/to/entity.md' }` -- Obsidian natively handles click-to-navigate
- Dashboard regeneration triggered by `entity:created` and `entity:modified` events (debounced 5000ms)

### M4: Live Hunt Companion

**Filesystem Watcher (M4.1)**
- New module: `watcher-service.ts`
- Uses VaultAdapter's `onFileEvent('create', ...)` -- NOT raw `fs.watch`
- Obsidian already watches the vault filesystem; we filter its events
- Filter: only files matching `{planningDir}/RECEIPTS/RCT-*.md` or `{planningDir}/QUERIES/QRY-*.md`
- Debounce: configurable (default 2000ms) -- coalesce rapid file creations
- Calls `IngestionService.ingestFile(path)` for each qualifying file
- Tracks "hunt pulse": timestamp + count of artifacts in configurable window (default 5min)
- Hunt pulse displayed in status bar: "3 artifacts (2m ago)" or similar

**Bidirectional MCP Event Bridge (M4.2)**
- Extends `McpBridgeService` with `pollEvents()` method
- Polls `{mcpServerUrl}/events` at configurable interval (default 5000ms)
- Inbound event dispatch table:
  - `hunt:started` -> workspace.bootstrap() or update MISSION.md
  - `hunt:phaseTransitioned` -> update STATE.md frontmatter
  - `hunt:receiptGenerated` -> WatcherService.triggerIngest(path)
  - `hunt:findingLogged` -> append to FINDINGS.md
- Outbound events published via `McpClient.callTool('publishEvent', eventData)` when:
  - Entity created (post-ingestion)
  - Verdict set (post-command)
  - Hypothesis status changed (HYPOTHESES.md modify detected)
- Event schema: shared `event-schema.ts` with type discriminants

**Prior-Hunt Suggester (M4.3)**
- New pure module: `prior-hunt-suggester.ts`
- When `entity:created` fires, queries `IntelligenceService.scanEntityNotes()` for:
  - Same entity name in other hunt contexts (huntRefs)
  - Same entity type + similar sighting patterns
  - Co-occurring entities from past hunts
- Relevance scoring: `score = f(entity_match_count, hunt_overlap, time_proximity)`
- Suggestions rendered in new sidebar section: "Intelligence Suggestions"
- Each suggestion: dismissable callout with "Hunt-2024-037: This IP was seen alongside 4 domains linked to APT29 staging"
- Dismissed suggestions stored in session memory (reset on plugin reload)

### M5: Hunt Journal + Playbooks

**Journal Engine (M5.1)**
- New module: `journal-service.ts`
- Journal notes live in `{planningDir}/journals/{hunt_id}-journal.md`
- Frontmatter: `hunt_id`, `hypothesis`, `status`, `linked_entities`, `created`, `last_entry`
- New pure module: `journal-parser.ts` for inline tag parsing:
  - `#h/credential-reuse` (hypothesis tags)
  - `#ev/strong`, `#ev/circumstantial` (evidence strength tags)
  - `#dp/escalate`, `#dp/pivot` (decision point tags)
- "New journal entry" command: appends timestamped block with template
- "Summarize journal" command: walks tags, extracts reasoning chain, produces narrative

**Playbook Distillation (M5.2)**
- New pure module: `playbook-generator.ts`
- Walks journal + receipt timeline post-hunt
- Produces playbook note: trigger conditions, query sequence, expected entity types, decision tree
- Playbook notes in `{planningDir}/playbooks/`
- "Apply playbook" command: creates new hunt workspace pre-populated from playbook template
- Sidebar: playbook library in Knowledge Base section (count + list)

**Detection Pipeline (M5.3)**
- New pure module: `detection-pipeline.ts`
- Scans receipt content for detection rule patterns (Sigma YAML, KQL blocks, SPL queries)
- Links extracted detections to technique notes via `## Detections` section
- Coverage overlay: computed map of technique_id -> has_detection for sidebar/canvas visualization

---

## Patterns to Follow

### Pattern 1: Pure Module Extraction (established in v4.0, continue in v5.0)

Every new domain capability is a pure TypeScript module with zero Obsidian imports. The service layer (which touches Obsidian) is thin glue.

```typescript
// verdict-engine.ts -- PURE, no Obsidian imports
export type Verdict = 'unknown' | 'suspicious' | 'confirmed_malicious' | 'remediated' | 'resurfaced';

const VALID_TRANSITIONS: Record<Verdict, Verdict[]> = {
  unknown: ['suspicious', 'confirmed_malicious'],
  suspicious: ['confirmed_malicious', 'unknown'],
  confirmed_malicious: ['remediated'],
  remediated: ['resurfaced'],
  resurfaced: ['confirmed_malicious', 'remediated'],
};

export function isValidTransition(from: Verdict, to: Verdict): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

Testable with vitest without Obsidian mocks. The service layer calls these functions and handles vault I/O.

### Pattern 2: File-Based Canvas Reactivity

Since Obsidian has no public Canvas manipulation API, use file-level reactivity:

```
Entity note modified
    -> EventBus emit 'entity:modified'
    -> CanvasService receives event
    -> Reads tracked .canvas files
    -> Finds nodes referencing the entity (by file path or ID)
    -> Updates node properties in JSON
    -> Writes .canvas file via VaultAdapter
    -> Obsidian re-renders (automatic on file change)
```

**Debounce is critical.** Multiple rapid entity updates (e.g., batch ingestion) must coalesce canvas writes. Target: max 1 canvas write per 500ms.

### Pattern 3: Single-File Ingestion (extract from batch loop)

Current ingestion is batch-only: scan all RECEIPTS + QUERIES, process all. For watcher-driven auto-ingestion, extract `ingestFile(path)`:

```typescript
// ingestion-service.ts
async ingestFile(filePath: string): Promise<IngestionResult> {
  // Determine type from path pattern
  // Parse single file
  // Extract entities
  // Create/update entity notes
  // Return result for single file
}

async runBatchIngestion(): Promise<IngestionResult> {
  // Scan directories, call ingestFile() for each, aggregate results
}
```

Enables: WatcherService calls `ingestFile()` for individual new artifacts. Batch ingestion calls same method in a loop. Both share entity creation/dedup logic.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Accessing Internal Canvas API

**What:** Using `app.workspace.getLeavesOfType('canvas')[0].view.canvas` for runtime node manipulation.
**Why bad:** Undocumented internal API. Obsidian can change it without notice. Plugins relying on it break regularly on Obsidian updates.
**Instead:** Write `.canvas` JSON files. Obsidian renders them. This is the documented, stable contract.

### Anti-Pattern 2: Polling MCP Server in Tight Loop

**What:** Polling `mcpServerUrl/events` every 500ms for inbound events.
**Why bad:** Battery drain, network noise, poor UX when MCP server is unavailable.
**Instead:** Poll at 5000ms default (configurable). Show clear "MCP disconnected" state. All features work (with reduced functionality) when MCP is unavailable.

### Anti-Pattern 3: Growing WorkspaceService Further

**What:** Adding verdict engine, confidence model, journal, watcher as methods on WorkspaceService.
**Why bad:** Already at 1,545 lines. Would exceed 3,000 lines. Impossible to understand responsibility boundaries. Tests become fragile.
**Instead:** Extract domain services. WorkspaceService becomes a coordinator (~400 lines) that delegates to focused services.

### Anti-Pattern 4: Breaking Existing Frontmatter

**What:** Requiring new frontmatter fields that make v4.0 entity notes invalid.
**Why bad:** Analysts have curated notes. Breaking them destroys trust.
**Instead:** Schema versioning with additive-only changes. New fields get defaults. Migration command is opt-in. v4.0 notes work with v5.0 code.

### Anti-Pattern 5: Raw fs.watch Instead of Vault Events

**What:** Using Node.js `fs.watch()` or `chokidar` directly instead of Obsidian's vault event system.
**Why bad:** Obsidian already watches the vault. Raw watchers create duplicate event handling, potential race conditions, and break Obsidian's internal file cache.
**Instead:** Use `vault.on('create')` / `vault.on('modify')` -- Obsidian's own filesystem watching with proper debouncing and cache management.

---

## Suggested Build Order

Based on dependency analysis:

```
Phase 1: WorkspaceService Decomposition (prerequisite for everything)
    Extract IngestionService, McpBridgeService, CanvasService, IntelligenceService
    Add EventBus
    Slim WorkspaceService to ~400 lines
    ALL existing 369 tests must continue passing

Phase 2: M1 UX Foundation
    Sidebar progressive disclosure (view.ts)
    Command consolidation (main.ts -> chooser modals)
    Modal extraction to modals/ directory
    Onboarding empty states
    Settings expansion

Phase 3: M2 Intelligence Depth -- Pure Modules
    verdict-engine.ts, confidence-model.ts, schema-versioning.ts, attack-memory.ts
    Entity schema updates (schema_version field, verdict_history, confidence_factors)

Phase 4: M2 Intelligence Depth -- Service Integration
    IntelligenceService wires pure modules to VaultAdapter
    New commands: set verdict, recompute confidence, add FP annotation
    ATT&CK technique note enrichment

Phase 5: M3 Live Canvas
    canvas-live-adapter.ts (pure module)
    CanvasService live reactivity (file-based, debounced)
    Live hunt canvas (auto-populate from ingestion events)
    Dashboard reactive updates

Phase 6: M4 Live Hunt Companion
    WatcherService (vault event filtering, auto-ingestion)
    McpBridgeService bidirectional events
    Prior-hunt suggester (sidebar section)
    Hunt pulse status bar indicator

Phase 7: M5 Hunt Journal + Playbooks
    journal-parser.ts, playbook-generator.ts (pure modules)
    JournalService (journal CRUD, summary)
    Playbook distillation command
    Detection artifact pipeline
```

**Build order rationale:**
1. **Decomposition first** because every subsequent feature adds to a new service. Without decomposition, they all pile onto WorkspaceService and the god-object problem compounds.
2. **UX before intelligence** because M2's new commands and sidebar sections need the polished UI foundation (progressive disclosure, command grouping).
3. **Pure modules before service integration** because they are testable in isolation. Get domain logic right before wiring vault I/O.
4. **Canvas before companion** because live canvas provides visual feedback for the companion's auto-ingestion. Without live canvas, auto-ingestion results are invisible.
5. **Journal last** because it depends on live companion features (watcher, MCP events) for real-time journal capture during active hunts.

---

## Scalability Considerations

| Concern | At 1 hunt (current) | At 20 hunts | At 100+ hunts |
|---------|---------------------|-------------|---------------|
| ViewModel build time | <50ms | ~200ms (entity scanning) | Needs lazy loading or incremental cache |
| Canvas file size | <10KB | ~50KB | >200KB -- need pagination or multiple canvases |
| Entity scanning | <100 files | ~500 files | 2000+ files -- need folder-level caching |
| Watcher events | <5/min | ~20/min | 100+/min -- debounce critical |
| MCP event polling | negligible | 1 req/5s | Same (polling is per-connection) |
| Frontmatter parsing | In-memory regex | In-memory regex works fine | At 2000+ files consider proper YAML parser or parsed frontmatter cache |

**Key scaling inflection point:** At ~500 entity files, the full-scan-on-every-getViewModel pattern becomes noticeable. The decomposition enables targeted updates (only rescan the folder that changed) instead of full rebuilds. The EventBus enables this: `entity:created` event includes the entity's folder, so IntelligenceService can update only the affected entity count instead of rescanning all 6 entity folders.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| WorkspaceService decomposition | HIGH | Clear responsibilities, existing patterns to follow, well-defined extraction boundaries |
| Pure module extraction | HIGH | v4.0 established this pattern successfully across 10+ modules |
| File-based canvas reactivity | MEDIUM | Workable but debounce timing needs empirical tuning; untested at scale |
| Canvas API limitations | HIGH | Verified via official canvas.d.ts + community forums -- no public manipulation API |
| Bidirectional MCP events | MEDIUM | Polling transport works but 5s latency may not feel "live" enough; WebSocket is future option |
| Vault event watching | HIGH | Obsidian's `vault.on()` events are documented and stable; already used in main.ts |
| EventBus pattern | HIGH | Standard pattern, well-understood, no external dependencies, trivially testable |
| Journal tag parsing | MEDIUM | Custom inline syntax needs careful regex; Dataview compatibility unverified |
| Schema versioning | HIGH | Additive-only approach with clear migration paths; low risk of data loss |

## Sources

- Direct codebase inspection: all 25+ source files in `apps/obsidian/src/`
- [Obsidian Canvas API Type Definitions (canvas.d.ts)](https://github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts)
- [Canvas API Discussion - Obsidian Forum](https://forum.obsidian.md/t/any-details-on-the-canvas-api/57120)
- [Canvas System - DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system)
- [Vault Events API - Obsidian Developer Docs](https://docs.obsidian.md/Plugins/Vault)
- [Obsidian Events Documentation](https://docs.obsidian.md/Plugins/Events)
- [Obsidian API Type Definitions](https://github.com/obsidianmd/obsidian-api)

---
*Architecture research for: v5.0 Obsidian Intelligence Platform*
*Researched: 2026-04-11*
