# Technology Stack

**Project:** v5.0 Obsidian Intelligence Platform
**Researched:** 2026-04-11
**Scope:** NEW capabilities only -- what to add/change for v5.0 features on top of the existing 12,193 LOC Obsidian plugin

---

## Current Baseline (Do Not Change)

| Component | Current State |
|-----------|--------------|
| Runtime | Obsidian plugin, esbuild bundled to CJS, target ES2018 |
| Type defs | `obsidian@1.12.3` (latest, includes `registerCliHandler` from 1.12.2) |
| Build | esbuild with `electron`, `obsidian`, and Node builtins marked external |
| Dependencies | Zero runtime deps (all pure TypeScript) |
| Dev deps | `@types/node@^20`, `esbuild@^0.25.5`, `obsidian@^1.6.0`, `typescript@^5.8.3`, `vitest@^3.1.1` |
| Testing | vitest with VaultAdapter stub pattern, 369 tests |
| Canvas | Pure-function JSON generators producing `.canvas` files, custom `CanvasData`/`CanvasNode`/`CanvasEdge` types |

---

## Recommended Stack Additions

### No New Dependencies

v5.0 requires **zero new npm packages**. Every capability is achievable with:
1. Obsidian's public API (already typed at v1.12.3)
2. Node.js builtins available in Electron (`fs`, `path` -- already marked external in esbuild)
3. Pure TypeScript modules following the existing vault-adapter pattern

This is deliberate. The zero-dependency model is a strategic asset for community plugin distribution (smaller bundle, faster review, no supply chain risk). Do not break it.

---

## Recommended Stack (By Feature Area)

### M1: UX Foundation -- Obsidian Modal Base Classes

**What to use:** `SuggestModal<T>`, `FuzzySuggestModal<T>`, `Modal`, `Setting`

| API | Import | Purpose | Confidence |
|-----|--------|---------|------------|
| `SuggestModal<T>` | `obsidian` | Command chooser modals (Copy, Canvas, MCP) with type-ahead filtering | HIGH -- verified in obsidian.d.ts at line 5896, available since 0.9.20 |
| `FuzzySuggestModal<T>` | `obsidian` | Fuzzy-match pickers for hunt paths, entity types, playbook selection | HIGH -- verified in obsidian.d.ts at line 3170, available since 0.9.20 |
| `Modal` | `obsidian` | Already used for PromptModal, CanvasTemplateModal, CompareHuntsModal | HIGH -- existing usage confirmed |
| `Setting` | `obsidian` | Form fields in modals and settings tab | HIGH -- existing usage confirmed |
| `debounce()` | `obsidian` | Debounce sidebar section collapse/expand persistence | HIGH -- verified in obsidian.d.ts at line 2144 |
| `Scope` | `obsidian` | Register keyboard shortcuts within modals (Escape, Enter, arrow keys) | HIGH -- exposed on Modal.scope |

**Migration path:** Replace `CanvasTemplateModal` (currently extends `Modal` with manual button list) with a `FuzzySuggestModal` that provides `getItems()`, `getItemText()`, `onChooseItem()`. Same for the planned Copy command consolidation.

**Pattern for command consolidation:**
```typescript
// One command -> SuggestModal with grouped items
class CopyChooserModal extends FuzzySuggestModal<ExportProfile> {
  getItems(): ExportProfile[] { return loadProfiles(); }
  getItemText(item: ExportProfile): string { return item.label; }
  onChooseItem(item: ExportProfile, evt: MouseEvent | KeyboardEvent): void {
    // execute copy for selected profile
  }
}
```

**Hotkey registration:** Use `this.addCommand({ hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'h' }] })` -- the `hotkeys` property on Command provides default suggestions that users can rebind.

**CSS variables to use (not hardcoded colors):**
- `--text-normal`, `--text-muted`, `--text-faint` for text hierarchy
- `--background-primary`, `--background-secondary` for section backgrounds
- `--interactive-normal`, `--interactive-hover`, `--interactive-accent` for buttons
- `--color-green`, `--color-red`, `--color-yellow` for status indicators (already used in view.ts for MCP dot)

**localStorage for section state:** Use `this.app.loadLocalStorage(key)` / `this.app.saveLocalStorage(key, value)` -- NOT raw `localStorage`, because Obsidian scopes storage per-vault.

**Confidence:** HIGH -- all APIs verified directly in obsidian.d.ts v1.12.3

---

### M2: Intelligence Depth -- Frontmatter Manipulation & MetadataCache

**What to use:** `app.fileManager.processFrontMatter()`, `app.metadataCache`, `app.vault.on('modify')`

| API | Purpose | Since | Confidence |
|-----|---------|-------|------------|
| `FileManager.processFrontMatter(file, fn)` | Atomically read-modify-write frontmatter for verdict lifecycle, confidence scores, schema versioning | 1.4.4 | HIGH -- verified in obsidian.d.ts line 2830, exact signature confirmed |
| `MetadataCache.getFileCache(file)` | Read cached frontmatter, tags, links without parsing file content | 0.9.21 | HIGH -- verified in obsidian.d.ts line 4272 |
| `MetadataCache.on('changed', cb)` | React to frontmatter changes for live entity updates | stable | HIGH -- verified in obsidian.d.ts line 4308 |
| `MetadataCache.resolvedLinks` | Find cross-references between entity notes for co-occurrence detection | stable | HIGH -- verified in obsidian.d.ts line 4293 |
| `getAllTags(cache)` | Extract inline tags from journal entries (`#h/`, `#ev/`, `#dp/` prefixes) | stable | HIGH -- verified in obsidian.d.ts line 3208 |

**processFrontMatter for verdict lifecycle:**
```typescript
// Atomic frontmatter mutation -- Obsidian handles YAML serialization
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm.verdict = 'confirmed_malicious';
  fm.schema_version = 2;
  fm.confidence = 0.82;
  if (!fm.verdict_history) fm.verdict_history = [];
  fm.verdict_history.push({
    from: previousVerdict,
    to: 'confirmed_malicious',
    timestamp: new Date().toISOString(),
    hunt_id: currentHuntId,
    analyst: 'manual',
  });
});
```

**Critical caveat:** `processFrontMatter` has a 2-second debounce conflict with `vault.modify` and `vault.process` (verified via forum report, Obsidian v1.10.3). Mitigation: never call `processFrontMatter` in a rapid loop. Batch updates into a single `processFrontMatter` call per file. If updating multiple files, serialize with `await` between each.

**Schema versioning strategy:** Add `schema_version: number` to every entity frontmatter template. Migration command reads all entity files, checks `schema_version`, applies transforms via `processFrontMatter`. Pure function `migrateEntitySchema(fm, fromVersion, toVersion)` is testable without Obsidian.

**Computed confidence model:** Pure TypeScript function, no new deps:
```typescript
interface ConfidenceFactors {
  independent_source_count: number;
  source_reliability: number;    // 0-1
  corroboration_depth: number;   // 0-1
  days_since_last_validation: number;
  half_life_days: number;        // configurable, default 180
}

function computeConfidence(factors: ConfidenceFactors): number {
  const decay = Math.pow(0.5, factors.days_since_last_validation / factors.half_life_days);
  const base = (factors.source_reliability * 0.4)
    + (Math.min(factors.independent_source_count / 5, 1) * 0.3)
    + (factors.corroboration_depth * 0.3);
  return base * decay;
}
```

**Confidence:** HIGH -- `processFrontMatter` signature and behavior confirmed from obsidian.d.ts v1.12.3 and forum reports

---

### M3: Live Canvas -- Canvas JSON + Vault Events (NOT Internal Canvas API)

**What to use:** Canvas JSON file format (`canvas.d.ts` types), `app.vault.on('modify')`, `app.vault.read()`/`app.vault.modify()`

| Approach | Use | Avoid | Confidence |
|----------|-----|-------|------------|
| Canvas JSON manipulation | Read `.canvas` file, parse JSON, modify nodes/edges, write back | n/a | HIGH -- canvas.d.ts types verified, this is how v4.0 already works |
| Internal Canvas API (`app.workspace.getLeavesOfType('canvas')[0].view.canvas`) | DO NOT USE | Undocumented, unstable, breaks between versions | HIGH -- forum consensus, no public API exists |
| Vault modify event for reactivity | `app.vault.on('modify')` to detect entity note changes, update canvas JSON | Polling | HIGH -- verified in obsidian.d.ts line 6599 |

**Architecture decision: File-level Canvas manipulation, not runtime Canvas API.**

The Obsidian Canvas internal API (`canvas.addNode`, `canvas.requestSave`, etc.) is undocumented, unstable, and not exported in `obsidian.d.ts`. The Advanced Canvas plugin uses it via monkey-patching, which is fragile and rejected by community review.

Instead, v5.0 Live Canvas operates at the file level:
1. **Read** `.canvas` JSON via `app.vault.read(canvasFile)`
2. **Parse** using the official `canvas.d.ts` types (`AllCanvasNodeData`, `CanvasEdgeData`)
3. **Modify** the JSON structure (add/remove/update nodes)
4. **Write** back via `app.vault.modify(canvasFile, JSON.stringify(canvasData))`
5. **Obsidian automatically re-renders** the canvas when the file changes

This is the same approach the existing `canvas-generator.ts` uses. The "live" aspect comes from vault event-driven updates, not from runtime Canvas object manipulation.

**Canvas type alignment:** The existing `types.ts` defines custom `CanvasNode`, `CanvasEdge`, `CanvasData` types. These should be aligned with the official `canvas.d.ts` types from the obsidian package:

```typescript
// Import official types for canvas file I/O
import type {
  CanvasData,
  AllCanvasNodeData,
  CanvasFileData,
  CanvasTextData,
  CanvasEdgeData,
  CanvasColor,
  NodeSide,
} from 'obsidian/canvas';
```

The official types support `'file' | 'text' | 'link' | 'group'` node types, `NodeSide` for edge connection points, `EdgeEnd` for arrow styles, and `CanvasColor` for both hex and palette-index colors. The existing custom types only support `'file' | 'text'` and lack `fromSide`/`toSide` -- upgrading to official types gets group nodes (for tactic clusters) and directional edges for free.

**Reactive update pattern:**
```typescript
// In main.ts onload():
this.registerEvent(
  this.app.metadataCache.on('changed', (file, data, cache) => {
    if (this.isEntityNote(file)) {
      void this.updateLiveCanvases(file, cache);
    }
  })
);

// updateLiveCanvases reads each open .canvas, finds nodes referencing
// the changed file, updates node properties (color, label), writes back
```

**Node-to-entity mapping:** Canvas `file` nodes reference vault paths. When an entity note's frontmatter changes (verdict, confidence), find all canvas nodes where `node.type === 'file' && node.file === entityPath`, update their color based on new verdict/confidence, write the canvas back.

**Canvas node click navigation:** Already native in Obsidian -- clicking a `file` node opens the referenced note. No plugin code needed.

**Confidence:** HIGH for file-level manipulation (verified working in v4.0). LOW for internal Canvas API (undocumented, explicitly avoided).

---

### M4: Filesystem Watcher -- Vault Events First, fs.watch Fallback

**What to use:** `app.vault.on('create')`, `app.vault.on('modify')`, `registerInterval()`, `FileSystemAdapter.getBasePath()`

| Approach | When to Use | Confidence |
|----------|-------------|------------|
| Vault events (`create`, `modify`) | Primary -- catches all changes made through Obsidian or synced in | HIGH -- already wired in main.ts |
| `registerInterval(window.setInterval(...))` | Polling fallback for external writes not caught by vault events | HIGH -- verified in obsidian.d.ts line 1907 |
| `fs.watch()` via Node.js `require('fs')` | DO NOT USE in initial implementation | MEDIUM -- works on desktop Electron but breaks mobile, adds platform coupling |

**Architecture decision: Vault events + optional polling, no raw fs.watch.**

Obsidian's `app.vault.on('create')` and `app.vault.on('modify')` fire for:
- Files created/modified by Obsidian itself
- Files created/modified externally (Obsidian's own fs watcher detects them)
- Files synced via Obsidian Sync or iCloud

This covers the primary use case (CLI writing receipts/queries to the vault directory). The events already fire for external changes -- Obsidian runs its own internal file watcher on the vault root.

**Selective watching pattern:**
```typescript
// In main.ts onload(), inside app.workspace.onLayoutReady():
this.registerEvent(
  this.app.vault.on('create', (file) => {
    if (file instanceof TFile && this.isWatchedArtifact(file.path)) {
      void this.autoIngest(file);
    }
  })
);

this.registerEvent(
  this.app.vault.on('modify', (file) => {
    if (file instanceof TFile && this.isWatchedArtifact(file.path)) {
      void this.autoIngest(file);
    }
  })
);

// isWatchedArtifact checks: path matches RECEIPTS/*.md or QUERIES/*.md
```

**Important:** Register inside `app.workspace.onLayoutReady()` to avoid spurious create events during vault load (documented in Obsidian developer docs).

**Polling fallback (optional, configurable):**
```typescript
if (this.settings.watcherPolling) {
  const id = window.setInterval(() => {
    void this.checkForNewArtifacts();
  }, this.settings.watcherIntervalMs ?? 5000);
  this.registerInterval(id);
}
```

**Hunt pulse status bar:** Update the existing `statusBarItemEl` with a pulse indicator. Track `lastArtifactTime` and show "THRUNT: 2 receipts in last 5m" or similar. Use `debounce()` from obsidian to avoid rapid status bar updates.

**Settings additions:**
```typescript
interface ThruntGodPluginSettings {
  // ... existing
  autoIngestEnabled: boolean;       // default: false (opt-in)
  watcherPolling: boolean;          // default: false
  watcherIntervalMs: number;        // default: 5000
  priorHuntSuggestions: boolean;    // default: true
  suggestionRelevanceThreshold: number; // default: 0.5
}
```

**Confidence:** HIGH -- vault events already proven in main.ts (create/delete/rename wired), modify event verified in API

---

### M4: Bidirectional MCP Event Bridge

**What to use:** Existing `HttpMcpClient` + `registerObsidianProtocolHandler()` + MCP tool polling

| Component | Approach | Confidence |
|-----------|----------|------------|
| Inbound (CLI -> Obsidian) | Polling MCP server for new events via existing `callTool()` | HIGH -- uses existing HTTP MCP client |
| Inbound (CLI -> Obsidian) alt | `registerObsidianProtocolHandler('thrunt', handler)` for `obsidian://thrunt?action=event&type=receipt_generated&...` | HIGH -- verified in obsidian.d.ts line 4875, available since 0.11.0 |
| Outbound (Obsidian -> CLI) | New MCP tools: `publish_event` via existing `callTool()` | HIGH -- uses existing HTTP MCP client |
| Event schema | Pure TypeScript types, JSON schema file in repo | HIGH -- no deps needed |

**Architecture decision: Two inbound channels, one outbound channel.**

**Inbound Channel 1 -- MCP Polling:**
The plugin already has `HttpMcpClient.callTool()`. Add a new MCP tool `get_events` that returns events since a cursor. Poll on an interval (configurable, default 10s) when MCP is connected. This requires no new transport -- it reuses the existing HTTP MCP connection.

**Inbound Channel 2 -- Obsidian Protocol Handler (preferred for real-time):**
```typescript
this.registerObsidianProtocolHandler('thrunt', (params) => {
  // obsidian://thrunt?action=hunt_started&hunt_id=H-042&phase=collection
  const { action, ...data } = params;
  void this.handleInboundEvent(action, data);
});
```
The CLI can trigger this via `open "obsidian://thrunt?action=receipt_generated&receipt_id=RCT-042"` -- works cross-platform (macOS `open`, Linux `xdg-open`, Windows `start`). No socket server, no port conflicts, no firewall issues.

**Outbound channel:** When vault events fire (entity created, verdict set), call `this.mcpClient.callTool('publish_vault_event', { type: 'entity_created', ... })`. The MCP server stores events; CLI polls for them.

**Event schema (pure TypeScript, no JSON Schema dep):**
```typescript
interface ThruntEvent {
  type: 'hunt_started' | 'phase_transitioned' | 'receipt_generated' |
        'finding_logged' | 'entity_created' | 'verdict_set' |
        'hypothesis_changed' | 'finding_added';
  timestamp: string;  // ISO 8601
  source: 'cli' | 'obsidian' | 'vscode';
  payload: Record<string, unknown>;
}
```

**Confidence:** HIGH for MCP polling (existing client), HIGH for obsidian:// protocol (verified API), MEDIUM for real-time latency (polling interval determines lag)

---

### M5: Hunt Journal -- Pure TypeScript Parsing + Dataview-Compatible Tags

**What to use:** Obsidian inline tags, `getAllTags()`, `MetadataCache`, pure TypeScript parsers

| Component | Approach | Confidence |
|-----------|----------|------------|
| Journal tag syntax | Obsidian native `#tag/subtag` (nested tags) | HIGH -- native Obsidian feature |
| Tag extraction | `getAllTags(cache)` from `obsidian` + custom regex for structured tags | HIGH -- verified in obsidian.d.ts line 3208 |
| Journal parsing | Pure TypeScript regex parser (same pattern as `parsers/receipt.ts`) | HIGH -- proven pattern in codebase |
| Playbook generation | Pure TypeScript template engine (string interpolation) | HIGH -- no deps needed |
| Dataview compatibility | Use standard Obsidian frontmatter + inline tags that Dataview indexes | HIGH -- Dataview reads standard metadata |

**Tag convention (Dataview-compatible):**
```markdown
## Entry: 2026-04-11T14:30:00Z

Observed credential reuse pattern across 3 endpoints. #h/credential-reuse #ev/strong

Decision: Escalate to IR team based on lateral movement evidence. #dp/escalate

Linked entities: [[192.168.1.100]] [[T1078]] [[APT29]]
```

Tag prefixes:
- `#h/` -- hypothesis tags (e.g., `#h/credential-reuse`, `#h/data-exfil`)
- `#ev/` -- evidence strength (`#ev/strong`, `#ev/circumstantial`, `#ev/weak`)
- `#dp/` -- decision points (`#dp/escalate`, `#dp/pivot`, `#dp/close`, `#dp/park`)

These are standard Obsidian nested tags. Dataview queries work out of the box:
```dataview
LIST
FROM #h/credential-reuse
WHERE file.folder = "journals"
```

**Journal parser (pure function, testable):**
```typescript
interface JournalEntry {
  timestamp: string;
  content: string;
  hypothesisTags: string[];
  evidenceTags: string[];
  decisionTags: string[];
  linkedEntities: string[];  // wiki-link targets
}

function parseJournalEntries(markdown: string): JournalEntry[] {
  // Split on ## Entry: headers, extract tags via regex
}
```

**Confidence:** HIGH -- uses only native Obsidian features and proven codebase patterns

---

## Dev Dependency Update

**Bump `obsidian` type package:**

```json
{
  "devDependencies": {
    "obsidian": "^1.12.3"
  }
}
```

Currently `^1.6.0` in package.json. The installed version is already 1.12.3 (semver satisfied). Bumping the floor to `^1.12.3` documents the minimum API level needed for:
- `registerCliHandler` (1.12.2) -- not required but available for future CLI integration
- `selectActiveSuggestion` (1.7.2) -- useful for SuggestModal keyboard shortcuts
- `removeCommand` (1.7.2) -- useful for dynamic command registration cleanup

However, bumping the minimum Obsidian version in `manifest.json` has user-facing implications. The `minAppVersion` in manifest.json should stay at the minimum version that works. Verify which specific APIs are actually called before bumping.

**Recommendation:** Keep `obsidian` devDep at `^1.6.0` in package.json (it resolves to latest anyway). Only bump `minAppVersion` in manifest.json if v5.0 calls an API that requires it (e.g., `processFrontMatter` needs 1.4.4, which is already below 1.6.0).

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Canvas manipulation | File-level JSON read/write | Internal Canvas API monkey-patching | Undocumented, breaks between versions, rejected in community review |
| Filesystem watching | Vault events (`create`/`modify`) | Raw `fs.watch()` via Node.js | Breaks mobile compatibility, duplicates Obsidian's own watcher, platform-specific edge cases |
| Frontmatter mutation | `processFrontMatter()` | Manual YAML parsing (`js-yaml`) | processFrontMatter is atomic, handles edge cases, integrated with MetadataCache invalidation |
| Bidirectional comms | obsidian:// protocol + MCP polling | WebSocket server in plugin | Port conflicts, firewall issues, violates Obsidian plugin guidelines |
| Bidirectional comms | obsidian:// protocol + MCP polling | Shared SQLite file | Concurrent write corruption risk, requires file locking, no mobile support |
| Confidence model | Pure TypeScript function | External ML library | Overkill for 4-factor weighted model, adds dependency, not interpretable |
| Journal tags | Native Obsidian `#tag/subtag` | Custom syntax (e.g., `@hypothesis(...)`) | Custom syntax not indexed by Obsidian, invisible to Dataview, requires post-processor |
| Modal UI | SuggestModal / FuzzySuggestModal | Custom HTML modals | Non-native feel, reinvents keyboard navigation, accessibility issues |
| State persistence | `app.loadLocalStorage` / plugin `data.json` | Raw localStorage | Raw localStorage not vault-scoped, breaks with multiple vaults |

---

## What NOT to Add

| Technology | Why Avoid |
|------------|-----------|
| `@modelcontextprotocol/sdk` (in plugin) | Plugin uses HTTP client, not MCP protocol directly. The MCP server is a separate process. |
| `js-yaml` or any YAML parser | `processFrontMatter` handles YAML internally. Manual YAML parsing is an anti-pattern in Obsidian plugins. |
| React/Preact/Svelte | Obsidian views use vanilla DOM. Adding a framework increases bundle size and fights the platform. |
| `better-sqlite3` (in plugin) | Native modules cannot be bundled into Obsidian plugins. SQLite stays in the MCP server. |
| `chokidar` or `fs-extra` | Obsidian's vault events already cover filesystem watching. External watchers would fire duplicate events. |
| `socket.io` / `ws` | No WebSocket server in plugins. Use obsidian:// protocol handler for inbound, MCP HTTP for outbound. |
| Custom CSS file | Use Obsidian CSS variables. Hardcoded styles break with user themes. Inline styles using CSS vars are acceptable (already done in view.ts). |
| `dataview` as a runtime dependency | Design journal tags and frontmatter to be Dataview-compatible, but do not import or depend on the Dataview plugin. Users who have Dataview get extra power; users without it lose nothing. |

---

## Installation

```bash
# No new packages needed. Existing install:
cd apps/obsidian
npm install

# Dev dependency update (optional, already resolved):
# npm install -D obsidian@^1.12.3
```

---

## New Source Files (Projected)

| File | Module Type | Purpose |
|------|-------------|---------|
| `src/sidebar-state.ts` | Pure | Collapsible section state, progressive disclosure logic |
| `src/command-chooser.ts` | Obsidian | SuggestModal/FuzzySuggestModal implementations for consolidated commands |
| `src/verdict-engine.ts` | Pure | Verdict lifecycle transitions, validation, history formatting |
| `src/confidence.ts` | Pure | Multi-factor confidence computation with decay |
| `src/schema-migration.ts` | Pure | Entity frontmatter schema versioning and migration transforms |
| `src/attack-memory.ts` | Pure | Hunt linkback indexing, false positive registry, coverage decay |
| `src/canvas-adapter.ts` | Obsidian | Live canvas update logic using official canvas.d.ts types |
| `src/file-watcher.ts` | Obsidian | Vault event listener for RECEIPTS/QUERIES auto-ingestion |
| `src/event-bridge.ts` | Hybrid | Inbound (obsidian:// protocol) + outbound (MCP publish) event handling |
| `src/prior-hunt.ts` | Pure | Prior-hunt suggestion matching against knowledge graph |
| `src/journal-parser.ts` | Pure | Hunt journal entry parsing, tag extraction, summary generation |
| `src/playbook.ts` | Pure | Playbook generation from journal + receipt timeline |
| `src/detection-notes.ts` | Pure | Detection note type, rule extraction, coverage overlay |

All "Pure" modules follow the existing pattern: zero Obsidian imports, fully testable with vitest, VaultAdapter stub for I/O.

---

## Integration Points with Existing Code

| Existing File | v5.0 Changes |
|--------------|-------------|
| `main.ts` | Add vault event wiring for auto-ingest, `registerObsidianProtocolHandler`, new SuggestModal commands, hotkey defaults |
| `settings.ts` | Add `autoIngestEnabled`, `watcherPolling`, `watcherIntervalMs`, `priorHuntSuggestions`, `confidenceHalfLifeDays` |
| `view.ts` | Refactor sidebar sections into collapsible components with persistent state, add hunt pulse indicator |
| `entity-schema.ts` | Add `schema_version` field to all entity types, add `verdict_history` array field |
| `types.ts` | Replace custom Canvas types with `obsidian/canvas` imports, add event bridge types, journal types |
| `canvas-generator.ts` | Refactor to use official `AllCanvasNodeData`/`CanvasEdgeData` types from `obsidian/canvas` |
| `workspace.ts` | Add methods for verdict lifecycle, confidence recomputation, journal operations |
| `vault-adapter.ts` | Add `processFrontMatter` wrapper for testability, add `getBasePath()` for diagnostic display |
| `mcp-client.ts` | Add `publishEvent()` and `getEvents()` convenience methods wrapping `callTool()` |

---

## Sources

- Obsidian API type definitions: `obsidian@1.12.3` (`obsidian.d.ts`, `canvas.d.ts`) -- read directly from `node_modules/obsidian/`
- [Obsidian API GitHub CHANGELOG](https://github.com/obsidianmd/obsidian-api/blob/master/CHANGELOG.md) -- processFrontMatter (1.4.4), Canvas metadata cache, FrontMatterCache changes
- [Canvas API forum discussion](https://forum.obsidian.md/t/any-details-on-the-canvas-api/57120) -- confirmed internal Canvas API is undocumented/unstable
- [Canvas System DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system) -- Canvas type system documentation
- [vault.process debounce issue](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862) -- 2-second debounce caveat for processFrontMatter
- [Obsidian Events documentation](https://docs.obsidian.md/Plugins/Events) -- registerEvent best practices, onLayoutReady timing
- [Advanced Canvas plugin](https://github.com/Developer-Mike/obsidian-advanced-canvas) -- reference for canvas metadata cache integration patterns
- [Obsidian MCP client plugin](https://github.com/prefrontalsys/obsidian-mcp-client) -- reference for MCP client patterns in Obsidian plugins
- Existing codebase: `apps/obsidian/src/` (25 source files, 369 tests) -- verified all integration points
