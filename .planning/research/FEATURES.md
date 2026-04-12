# Feature Landscape: v5.0 Obsidian Intelligence Platform

**Domain:** Obsidian plugin UX polish, intelligence depth, live canvas, live hunt companion, hunt journals/playbooks
**Researched:** 2026-04-11
**Builds on:** v4.0 Obsidian Knowledge Weapon (19 commands, 4 sidebar sections, 4 modals, 8 entity types, ~161 ATT&CK stubs, MCP bridge with 11 tools, canvas generator, cross-hunt intelligence)
**Overall confidence:** HIGH (Obsidian API docs verified, Canvas JSON spec confirmed, vault event system documented, IOC lifecycle/decay models verified against OpenCTI/Dragos, threat hunting playbook patterns verified against OTRF/ThreatHunter-Playbook)

---

## Area 1: UX Foundation -- Progressive Disclosure Sidebar (M1.1)

### What Obsidian-Native UX Actually Looks Like

Obsidian's own core panels (File explorer, Search, Bookmarks, Tags) use a consistent pattern: collapsible `<details>` elements with persistent open/close state, Obsidian CSS variables for theming, and context-sensitive empty states. Third-party plugins that feel native (Dataview, Tasks, Kanban) follow the same conventions rather than inventing custom collapse mechanisms.

The existing v4.0 sidebar already uses `<details>` with `open` attribute for its 4 sections (Hunt Status, Knowledge Base, Agent Artifacts, Receipt Timeline). What it lacks is persistent collapse state, context-aware defaults, density toggling, and section reordering.

### Table Stakes

| Feature | Why Expected | Complexity | Deps on Existing Code |
|---------|-------------|------------|----------------------|
| Persistent collapse state via `plugin.saveData()` | Sidebar resets on every `render()` call today; frustrating after any vault event triggers refresh | Low | `view.ts` render cycle, `settings.ts` for persistence |
| Context-aware section expansion | Analysts in different hunt phases need different sections foregrounded; showing everything equally wastes vertical space | Med | `parsers/state.ts` for phase detection, `view.ts` renderContent() |
| Obsidian CSS variables throughout | Plugin currently uses some hardcoded colors (e.g., MCP dot `style.backgroundColor`); theme switches break visual consistency | Low | `view.ts` inline styles need migration |
| Empty states with action buttons | When no receipts/entities exist, blank space gives no guidance; "Run ingestion" or "Create entity" buttons accelerate new users | Low | All `render*Section()` methods in `view.ts` |
| Section density toggle (compact/detailed) | Power users want counts-only; beginners want full listings | Med | New setting in `settings.ts`, conditional rendering in `view.ts` |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Drag-to-reorder sections | Personal workflow customization; some analysts care about receipts first, others about KB | High | Would need custom drag handler or Sortable.js integration in sidebar |
| Hunt-phase auto-foreground | No other Obsidian security plugin adapts sidebar priority to workflow phase | Med | `stateSnapshot.currentPhase` already parsed; logic is the mapping |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Custom scrollbar styling | Breaks native Obsidian feel; accessibility concerns | Use Obsidian's built-in scroll behavior |
| Multi-level nested collapse (3+ depth) | Information architecture becomes confusing; Obsidian core panels use max 2 levels | Keep flat section list with optional sub-grouping |

### Complexity Assessment

LOW-MED. The sidebar is already rendering 4 sections with `<details>`. Main work is adding state persistence, migrating inline styles to CSS variables, and wiring phase-to-section mapping. No new Obsidian API surfaces needed.

---

## Area 2: UX Foundation -- Command Consolidation (M1.2)

### What Obsidian Plugins Do

The standard pattern for command consolidation in Obsidian is `FuzzySuggestModal<T>`: a single top-level command opens a fuzzy-searchable chooser listing sub-commands. Plugins like Templater, QuickAdd, and Commander all use this pattern. Obsidian's own `FuzzySuggestModal` provides built-in fuzzy matching, keyboard navigation (arrow keys, Enter, Escape), and theming.

The existing v4.0 plugin registers 19 commands individually. Several are contextual (entity-scoped `checkCallback`) so they only appear when relevant, but the palette is still crowded.

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| "THRUNT: Copy" umbrella command with `FuzzySuggestModal` | 5 copy commands (hyper copy modal + 3 quick exports + 1 IOC context) should be 1 entry point | Med | `export-profiles.ts`, `hyper-copy-modal.ts`, quick export logic in `main.ts` |
| "THRUNT: Canvas" umbrella with chooser | 4 canvas templates + "from current hunt" + dashboard = 6 sub-options behind one command | Med | `CanvasTemplateModal` already exists; need to add dashboard/current-hunt options |
| "THRUNT: MCP" umbrella with chooser | 5 MCP commands (enrich, coverage, decision, learning, search) behind one command | Med | All MCP helpers in `main.ts` |
| Default hotkey suggestions (3+) | Power users need muscle memory paths; Obsidian supports `hotkeys` in plugin manifest | Low | New entries in manifest |
| Direct commands preserved for hotkey binding | Umbrella commands reduce palette noise but power users bind specific actions to keys | Low | Keep existing `addCommand` registrations alongside umbrella |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Smart contextual chooser | "THRUNT: MCP" command automatically pre-selects "Enrich" when active file is a TTP note | Med | `checkCallback` logic already exists; needs plumbing into chooser |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Removing direct commands entirely | Breaks existing hotkey bindings from v4.0 users | Keep both: umbrella for discovery, direct for power users |
| Custom fuzzy matching algorithm | Obsidian's `FuzzySuggestModal` is already excellent | Use the built-in |

### Complexity Assessment

MED. The FuzzySuggestModal pattern is well-documented. Main effort is refactoring the 19 commands into logical groups and building 3 chooser modals. The `HyperCopyModal` already demonstrates the pattern.

---

## Area 3: UX Foundation -- Modal Polish + Onboarding (M1.3, M1.4)

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Rebuild modals on Obsidian base classes | `PromptModal`, `CanvasTemplateModal`, `CompareHuntsModal` use `Modal` directly with manual `Setting` widgets; should use `SuggestModal` where appropriate | Med | All 4 modal classes in `main.ts` |
| Full keyboard navigation | Arrow keys + Enter + Escape in every modal; currently some only support click | Low | Obsidian base classes provide this when used correctly |
| CSS variable migration | Remove any hardcoded colors/spacing; use `--text-normal`, `--background-secondary` etc. | Low | Style audit across `view.ts` and modal code |
| Welcome screen when no `.planning` exists | First-run experience; currently a blank sidebar with no guidance | Med | Check `workspaceStatus === 'missing'` in `view.ts`, render welcome content |
| "What's new" notice on plugin update | Helps returning users discover new v5.0 features | Low | Version comparison in `onload()` using `plugin.manifest.version` |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| HyperCopy split-pane preview | Profile list left, live preview right -- unique to threat hunting context assembly | Med | `HyperCopyModal` already assembles context; needs layout change |
| Post-scaffold guided tour | Brief overlay explaining each sidebar section on first render | High | Needs step-through UI component; no Obsidian primitive for this |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Persistent tutorial mode | Annoying after first use; violates Obsidian's "get out of the way" philosophy | One-time guided tour with "Don't show again" |
| Custom notification system | Obsidian's `Notice` class is the standard; custom toasts feel alien | Use `new Notice()` consistently |

### Complexity Assessment

LOW-MED. Mostly CSS/layout work plus minor refactoring of modal base classes. The guided tour is the only High complexity item and is a differentiator -- could be deferred.

---

## Area 4: Intelligence Depth -- Verdict Lifecycle Engine (M2.1)

### How IOC Lifecycle Works in Practice

IOC lifecycle management is a well-established pattern in threat intelligence platforms. OpenCTI, MISP, and Dragos all implement verdict state machines:

**Standard verdict states (verified against OpenCTI):**
- `unknown` -- default state, no determination made
- `suspicious` -- behavioral indicators suggest malicious activity, pending confirmation
- `confirmed_malicious` -- multiple independent sources or sandbox/analysis confirms
- `benign` -- false positive confirmed through investigation
- `remediated` -- was malicious, has been contained/blocked
- `resurfaced` -- previously remediated but reappeared in new context

**Critical design principle:** Transitions are **append-only**. Each state change records: new state, timestamp, attribution (hunt ID + analyst), and rationale. This creates an immutable audit trail. OpenCTI calls this "knowledge object state" and explicitly warns against overwriting previous states.

The existing v4.0 entity schema has `verdict` and `confidence` as simple string frontmatter fields. v5.0 needs to evolve these into a lifecycle log while maintaining backward compatibility (per the "frontmatter additive, never required" key decision).

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Verdict state field in frontmatter with defined enum | Standardized states instead of freeform strings | Low | `entity-schema.ts` ENTITY_TYPES definitions |
| Timestamped transition log in note body | Append-only `## Verdict History` section; each entry has date, new state, hunt_id, analyst, rationale | Med | `workspace.ts` needs `setEntityVerdict()` method; `vault-adapter.ts` for file mutation |
| "Set entity verdict" command | Prompts for new verdict + rationale, appends to lifecycle, updates frontmatter | Med | New `PromptModal` variant or enhanced existing; command registration in `main.ts` |
| Schema version field in frontmatter | `schema_version: 2` enables migration; v4.0 entities are implicitly v1 | Low | `entity-schema.ts` field additions |
| Schema migration command | Updates all entity notes to latest schema without losing analyst content | Med | New `migrateEntities()` in `workspace.ts`; needs careful frontmatter parsing |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Cross-hunt aggregation in entity notes | Computed `## Hunt History` showing every hunt that referenced this entity, its role, and outcome | High | Requires scanning all receipt/query files for entity references; `ingestion.ts` already extracts entities |
| Related infrastructure co-occurrence | "This IP was seen alongside these 4 domains in 3 separate hunts" | High | Requires entity co-occurrence matrix computation from receipt data |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Database-backed state machine | Obsidian vault is the source of truth; external DB creates sync problems | Keep everything in markdown frontmatter + body sections |
| Mandatory verdict before closing hunt | Blocks workflow; not every entity needs a verdict during every hunt | Verdict defaults to `unknown`; analysts set it when ready |
| Overwriting frontmatter verdict field | Loses history; violates audit trail principle | Frontmatter `verdict` reflects current state; history lives in body section |

### Complexity Assessment

MED-HIGH. The verdict command and frontmatter updates are straightforward. Cross-hunt aggregation is the expensive feature -- it requires scanning the vault for references, which the ingestion engine partially does already. Schema migration needs careful file manipulation to avoid data loss.

---

## Area 5: Intelligence Depth -- ATT&CK Institutional Memory (M2.2)

### How Mature Hunt Programs Track ATT&CK Coverage

The MITRE ATT&CK Navigator provides coverage heatmaps, but it's a visualization tool, not an institutional memory. Real organizational intelligence accumulates through:

1. **Hunt linkbacks** -- which hunts targeted which techniques, what queries ran, what data sources were used, and whether results were TP/FP/inconclusive. This is the "which hunts have we run against T1059.001?" question.
2. **False positive registry** -- known-benign patterns per technique. "T1059.001 fires on deployment scripts from 10.0.0.0/8 every Tuesday at 02:00 UTC." This prevents repeated false starts.
3. **Coverage decay** -- techniques not actively hunted in N months get flagged as "stale." Dragos and CrowdStrike both emphasize that "detection without validation is assumption."
4. **Detection linkbacks** -- which Sigma/KQL rules map to which techniques, which hunts produced them, and when they were last validated.

The existing v4.0 TTP entity schema has `hunt_count` and `last_hunted` frontmatter fields. The MCP bridge already provides `lookupTechnique` and `analyzeDetectionCoverage` tools. v5.0 enriches the technique notes themselves with accumulated organizational knowledge.

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Hunt linkback indexing in technique notes | Computed `## Hunt History` section per technique showing hunt ID, queries used, data sources, outcome | Med | Receipt/query parsers already extract `technique_refs`; need reverse index |
| False positive annotation command | "Add false positive pattern" appends to `## Known False Positives` in technique note | Med | New command + frontmatter-aware body section appender |
| Coverage decay tracking | Techniques not hunted in N months (configurable) flagged in KNOWLEDGE_BASE.md Dataview queries | Med | `last_hunted` already in frontmatter; need Dataview-compatible query templates |
| Detection linkback section | `## Detections` in technique notes listing rule IDs, source hunts, last validation | Med | New structured section; populated during ingestion when detection artifacts are present |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Automated hunt history computation | No other Obsidian security plugin auto-populates technique notes with organizational hunt history | High | Vault-wide scan of receipts/queries for technique refs; needs index or event-driven population |
| Stale coverage dashboard | Visual surface showing "you haven't hunted T1078 in 6 months" -- unique organizational awareness | Med | Dataview query templates that read `last_hunted` and compute staleness |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Auto-archiving technique notes | Removing technique notes when stale causes data loss | Flag as stale in frontmatter; analysts decide action |
| Custom ATT&CK matrix renderer | Obsidian's Canvas + Navigator layers serve this better; duplicating visualization is waste | Generate Navigator-compatible JSON layers from vault data |

### Complexity Assessment

MED. Most features are structured body-section management (append-only sections like `## Hunt History`, `## Known False Positives`, `## Detections`). The reverse-indexing (technique -> receipts that reference it) is the main challenge but the `ingestion.ts` entity extraction pipeline already parses technique refs.

---

## Area 6: Intelligence Depth -- Computed Confidence (M2.3)

### How IOC Confidence Decay Works

Confidence decay is a well-established pattern in threat intelligence. The key models:

**OpenCTI's approach (verified):** Polynomial decay from initial score (0-100) to zero over a configurable lifetime. Decay factor < 0.33 means slow early decay, > 0.33 means fast early decay. Reaction points trigger downstream updates. Revoke score triggers automatic indicator retirement.

**Dragos's approach (verified):** IOC types have different decay rates. IP addresses decay fast (24-72 hours without re-sighting). Domain names decay slower (weeks). YARA rules barely decay. The principle: ephemeral infrastructure decays faster than codified tradecraft.

**CIRCL/MISP scoring model:** `confidence = f(source_reliability, information_credibility, corroboration_count, age)` where each factor is independently assessable.

For an Obsidian plugin, the model must be:
1. **Inspectable** -- analyst sees WHY confidence is 0.82 (not a black box)
2. **Frontmatter-stored** -- each factor is a field, not just the computed result
3. **Recomputable** -- "Recompute confidence" command re-scans sightings and updates
4. **Decay-aware** -- older IOCs with no re-validation trend toward uncertain (0.5)

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Multi-factor confidence model | `confidence = f(source_count, source_reliability, corroboration_depth, days_since_validation)` with each factor in frontmatter | Med | `entity-schema.ts` needs new fields: `source_count`, `corroboration_depth`, `last_validated`, `confidence_score` |
| Configurable decay half-life | Per-entity-type decay rates (IP: fast, domain: medium, hash: slow) in settings | Med | New `settings.ts` fields, decay computation in new `confidence.ts` module |
| "Recompute confidence" command | Scans sightings, counts sources, computes score, updates frontmatter | Med | New command in `main.ts`; computation logic is pure math |
| Provenance chain section | `## Provenance` in entity notes recording origin (ingestion ID, MCP tool call, manual annotation) | Med | `ingestion.ts` already tracks `sourceId`; need to write provenance entries |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Factor breakdown visible in frontmatter | Analyst sees `source_count: 3`, `corroboration_depth: 2`, `days_since_validation: 45` alongside `confidence_score: 0.72` -- full transparency | Low | Schema design; no complex implementation |
| Automatic re-sighting confidence boost | When ingestion finds an existing entity in a new receipt, confidence increases automatically | Med | Hook into `ingestion.ts` update path |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Machine learning confidence model | Overkill for vault-based system; no training data; not inspectable | Deterministic formula with visible factors |
| Confidence below 0.0 or above 1.0 | Meaningless; breaks intuition | Clamp to [0.0, 1.0] range |
| Auto-deleting low-confidence entities | Destructive; analyst may disagree | Flag low confidence in frontmatter; analyst decides |

### Complexity Assessment

MED. The confidence computation is straightforward math. The main work is schema evolution (new frontmatter fields), the recompute command scanning sightings, and hooking into ingestion for automatic re-sighting boosts. A standalone `confidence.ts` module keeps this testable.

---

## Area 7: Live Canvas -- Canvas API Adapter (M3.1)

### What Obsidian's Canvas API Actually Supports

**Critical finding:** Obsidian's Canvas API is a **file format specification**, not a runtime manipulation API. The official `canvas.d.ts` defines:
- `CanvasData`: `{ nodes: AllCanvasNodeData[], edges: CanvasEdgeData[] }`
- Node types: `file` (vault reference with optional subpath), `text` (inline markdown), `link` (external URL), `group` (container)
- Edge types: directional with `fromSide`/`toSide`, `fromEnd`/`toEnd` (none/arrow), optional `color`/`label`
- Color system: palette numbers ("1"-"6") or hex strings

**There is no official runtime Canvas API** for programmatic node creation, manipulation, or event subscription. Plugins like Advanced Canvas access internal APIs via `app.workspace.getLeavesOfType('canvas')[0].view.canvas` but this is undocumented and may break between Obsidian versions.

**The v4.0 approach is correct:** Generate `.canvas` JSON files and write them to the vault. Obsidian renders them natively. The existing `canvas-generator.ts` already does this with 4 layout templates.

**For "live" behavior:** The path is to watch vault events on entity notes, regenerate the affected portions of canvas JSON, and write the updated `.canvas` file. Obsidian will reload it. This is the approach Advanced Canvas and similar plugins use.

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Entity type -> node appearance mapping | Frontmatter `type` determines color, `verdict` determines border style, `confidence_score` determines opacity | Med | Extend `canvas-generator.ts` `getEntityColor()` and `makeNode()` with verdict/confidence visual encoding |
| File-type nodes linking to entity notes | Current `makeNode()` already creates `type: 'file'` when `notePath` exists; needs to be the default | Low | `canvas-generator.ts` already supports this |
| Canvas regeneration on entity frontmatter change | `vault.on('modify')` on entity notes triggers canvas re-render | Med | New watcher in `main.ts`; regeneration logic needs to preserve analyst node positions |
| Connection suggestions from receipt co-occurrence | When entities A and B appear in same receipt, suggest/auto-create edge | Med | `ingestion.ts` already tracks co-occurrence; `canvas-generator.ts` `EdgeGroup` already models this |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Reactive node re-rendering without layout reset | When entity frontmatter changes, update node color/opacity without moving nodes the analyst has arranged | High | Requires parsing existing canvas JSON, finding the node by file path, updating properties only, writing back |
| Verdict-to-border-style visual encoding | Red border for confirmed_malicious, green for benign, yellow for suspicious -- instant visual triage on canvas | Low | CSS-style canvas node coloring |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Custom canvas renderer | Duplicates Obsidian's native Canvas; maintenance burden; breaks with Obsidian updates | Generate standard `.canvas` JSON; let Obsidian render |
| Runtime node injection via undocumented API | `canvas.addNode()` is internal and may break; no official support | Write `.canvas` files; Obsidian reloads them |
| Real-time node position streaming | Canvas layout is Obsidian's domain; fighting the platform creates fragile code | Plugin provides semantic content; Obsidian owns layout |

### Complexity Assessment

MED-HIGH. The core canvas JSON generation is already built. The hard part is **reactive updates that preserve analyst layout** -- this requires reading existing canvas JSON, matching nodes by entity ID/path, updating properties without touching positions, and writing back. This is a surgical file update pattern, not a full regeneration.

---

## Area 8: Live Canvas -- Live Hunt Canvas + Dashboard (M3.2, M3.3)

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| "Open live hunt canvas" command | Creates a canvas that auto-populates as receipts land; extends current "Canvas from current hunt" | Med | `workspace.ts` `canvasFromCurrentHunt()` already exists; needs to add file watcher for updates |
| New entities auto-appear on canvas | When ingestion discovers new entities, add them to the active hunt canvas | Med | Hook into ingestion result; append nodes to canvas JSON |
| Starter layouts applicable to live canvas | Kill chain, diamond, lateral movement, hunt progression remain as initial layout options | Low | Already built in `canvas-generator.ts`; just need to track which canvas is "live" |
| Dashboard canvas updates reactively | Knowledge dashboard reflects entity note changes without manual regeneration | Med | `vault.on('modify')` triggers dashboard regeneration |
| Drill-down navigation | Clicking canvas file nodes opens the corresponding vault note | Low | Obsidian provides this natively for `type: 'file'` canvas nodes |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Auto-layout for new entities | When a new entity appears, place it near related entities using co-occurrence data rather than at origin | High | Requires position computation based on edge graph |
| Recency-based node sizing | Nodes for recently-updated entities are larger -- visual time-awareness | Med | Read `mtime` from vault adapter; encode as width/height in canvas JSON |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Multiple live canvases simultaneously | Complexity explosion; which canvas gets which updates? | One active live hunt canvas per planning directory |
| Auto-layout that fights analyst arrangements | Once analyst moves a node, plugin should respect that position | Only auto-place NEW nodes; preserve existing positions |

### Complexity Assessment

MED. The canvas JSON format and generators are already built. Main new work is: tracking which canvas is "live," hooking ingestion results to canvas updates, and respecting analyst-placed positions for existing nodes while adding new ones.

---

## Area 9: Live Hunt Companion -- Filesystem Watcher (M4.1)

### How Obsidian Plugins Watch Files

**Obsidian provides vault-level events (verified from official docs):**
- `vault.on('create', (file: TAbstractFile) => {})` -- fires when files are created
- `vault.on('modify', (file: TAbstractFile) => {})` -- fires when contents change
- `vault.on('delete', (file: TAbstractFile) => {})` -- fires on deletion
- `vault.on('rename', (file: TAbstractFile, oldPath: string) => {})` -- fires on rename/move

**The plugin already uses these** (see `main.ts` lines 288-296): `vault.on('create')`, `vault.on('delete')`, and `vault.on('rename')` trigger cache invalidation and view refresh. Notably, `vault.on('modify')` is NOT currently registered.

**Known gotcha (verified from Obsidian forum):** When a plugin writes a file via `vault.modify()`, the vault watcher can transiently overwrite it with stale cache before self-correcting in 1-2 seconds. Mitigation: use `vault.process()` for atomic read-modify-write, or add a debounce guard.

**For watching RECEIPTS/ and QUERIES/ directories:** Use the existing `vault.on('create')` event, filter by path prefix (`planningDir + '/RECEIPTS/'` and `planningDir + '/QUERIES/'`), and trigger ingestion. No `fs.watch` needed -- Obsidian's vault events cover files created by external processes (CLI agents) as well as internal Obsidian edits.

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Auto-ingest on new receipt/query file creation | `vault.on('create')` filtered to RECEIPTS/ and QUERIES/ triggers `runIngestion()` | Med | Extend event handler in `main.ts`; `ingestion.ts` already handles the work |
| Debounced ingestion (configurable interval) | Agents may create multiple files rapidly; batch into single ingestion run | Low | `debounce()` utility wrapping ingestion trigger |
| "Hunt pulse" status bar indicator | Shows icon/text when new artifacts arrived in last N minutes | Med | Extend `updateStatusBar()` in `main.ts`; track last-ingestion timestamp |
| Real-time receipt timeline updates | Sidebar Receipt Timeline section updates without manual "Ingest" button click | Low | Already works if `render()` is called after ingestion; watcher just triggers it |
| Settings toggle for auto-ingestion | Enable/disable; some analysts want manual control | Low | New `autoIngestEnabled` in `settings.ts` |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Hunt pulse with agent activity context | "3 receipts in last 5 minutes" vs just a dot -- gives analyst awareness of agent pace | Med | Track file creation timestamps in recent window |
| Configurable watch directories | Watch additional directories beyond RECEIPTS/QUERIES for custom agent output patterns | Low | Array of watch paths in settings |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Native `fs.watch` via Node.js | Obsidian's vault events already cover this; `fs.watch` creates race conditions with vault cache | Use `vault.on('create')` exclusively |
| Watching the entire vault | Performance disaster; only watch relevant directories | Filter events by path prefix |
| Blocking ingestion (synchronous) | Would freeze the UI during large ingestion runs | Use `async`/`await` with `void` return in event handler |

### Complexity Assessment

LOW-MED. The infrastructure is almost entirely in place. The v4.0 plugin already registers vault events and has a complete ingestion engine. The watcher adds path-filtered event handling, a debounce wrapper, and the hunt-pulse status bar indicator.

---

## Area 10: Live Hunt Companion -- Bidirectional MCP Event Bridge (M4.2)

### How Bidirectional Eventing Works in This Context

The existing MCP bridge is **pull-only**: Obsidian calls MCP tools (enrich, coverage, search) and reads responses. v5.0 adds bidirectional flow:

**Inbound (CLI -> Obsidian):** The CLI writes artifacts to the vault (RECEIPTS/, QUERIES/); Obsidian's filesystem watcher detects them and creates corresponding entity notes. This is already 90% solved by the filesystem watcher (Area 9). The "event bridge" aspect is making CLI lifecycle events (hunt started, phase transitioned) visible in Obsidian.

**Outbound (Obsidian -> CLI/VS Code):** When analysts create entities, set verdicts, or add findings, these actions should be consumable by other surfaces. The MCP server can publish these as tool results.

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Event schema definition | `thrunt-events.schema.json` defining event types: hunt_started, phase_transitioned, receipt_generated, entity_created, verdict_set, finding_added | Med | New schema file; Zod schema for validation |
| Inbound: CLI hunt lifecycle -> vault artifacts | Hunt start creates MISSION.md, phase transition updates STATE.md | Med | Filesystem watcher (Area 9) + template generation for lifecycle events |
| Outbound: vault changes -> MCP tool results | Entity creation, verdict changes, findings are available via MCP `getRecentEvents` tool | Med | Extend MCP client or create event buffer in `workspace.ts` |
| Graceful degradation | If MCP is disconnected, all event features degrade silently; core plugin works normally | Low | Already the pattern in v4.0 with `mcpClient.isConnected()` checks |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Real-time hunt awareness in Obsidian | No other Obsidian plugin provides live visibility into an active CLI hunt session | High | Requires event transport mechanism beyond file watching |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| WebSocket server in Obsidian plugin | Complex networking in a note-taking app; Obsidian may block it | Use file-based event passing (event log file in `.planning/events/`) |
| Push notifications from MCP server | Obsidian plugins can't receive push; MCP stdio is request/response | Poll MCP for events on timer, or watch event log files |
| Custom IPC protocol | Fragile, non-standard | Use the vault filesystem as the event transport layer |

### Complexity Assessment

MED-HIGH. The inbound path (CLI writes files, Obsidian watches) is straightforward. The outbound path (Obsidian publishes events consumable by CLI) requires designing the event format and transport mechanism. File-based eventing (write `.planning/events/YYYY-MM-DDTHH-mm.json`) is the simplest reliable approach.

---

## Area 11: Live Hunt Companion -- Prior-Hunt Suggester (M4.3)

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Knowledge graph query on new entity ingestion | When ingestion finds a new entity, query cross-hunt intelligence for historical matches | Med | `cross-hunt.ts` already has entity-based queries; trigger on new entity creation |
| Dismissable sidebar callout | Suggestions appear in dedicated sidebar section; fade after acknowledgment | Med | New section in `view.ts` with dismiss button wired to `plugin.saveData()` |
| Configurable minimum relevance threshold | Filter noise from low-relevance matches | Low | New `suggesterThreshold` setting |
| Enable/disable toggle | Some analysts find suggestions distracting during focused work | Low | Settings toggle |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Contextualized suggestion text | "This IP was seen in Hunt-2024-037, linked to APT29 staging" -- not just "match found" | Med | Format suggestion using cross-hunt data: hunt ID, actor association, outcome |
| Entity pattern matching | "This infrastructure pattern (IP + domain + hash co-occurrence) appeared in 3 prior hunts" -- structural, not just IOC matching | High | Requires co-occurrence pattern matching in `cross-hunt.ts` |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Blocking modal for suggestions | Interrupts analyst flow; suggestions should be ambient, not modal | Non-blocking sidebar section |
| Persistent suggestions that never clear | Stale suggestions add noise | Auto-dismiss after acknowledgment or configurable timeout |

### Complexity Assessment

MED. The cross-hunt intelligence engine is already built. The main work is triggering it during ingestion, formatting suggestions, and adding a dismissable sidebar section. No new Obsidian API surfaces needed.

---

## Area 12: Hunt Journal Engine (M5.1)

### How Structured Reasoning Capture Works

The OTRF ThreatHunter-Playbook project (verified) defines the standard: hunt documentation should capture **reasoning, not just results**. The framework structures hunts into Plan (context, intent, assumptions), Execute (queries, analysis, iteration), and Report (outcomes, false positives, visibility gaps). Jupyter notebooks serve as executable reasoning documents.

For an Obsidian plugin, the key insight is that Obsidian's native features (nested tags, wiki-links, Dataview queries) provide the structured annotation infrastructure for free. Inline tags like `#h/credential-reuse` for hypotheses, `#ev/strong` for evidence strength, and `#dp/escalate` for decision points are queryable by Dataview without any plugin-side rendering.

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Hunt journal note type | New template with structured frontmatter: `hunt_id`, `hypothesis`, `status`, `linked_entities`, `started`, `closed` | Low | New template in `scaffold.ts` or entity-schema extension |
| Inline tagging syntax convention | `#h/` for hypotheses, `#ev/` for evidence strength, `#dp/` for decision points -- documented and consistent | Low | Documentation + Dataview query templates; no plugin rendering needed |
| "New journal entry" command | Appends timestamped block to active hunt journal note with auto-filled metadata | Med | New command in `main.ts`; file modification in `workspace.ts` |
| Timeline-aware insertion | Entries auto-stamp with hunt-relative timestamps (T+2h15m from hunt start) | Med | Compute delta from `started` frontmatter field |
| Evidence linking via wiki-links | Entity references in journal entries create bidirectional backlinks | Low | Obsidian handles this natively; just use `[[entity-name]]` syntax |
| Journal summary command | Extracts reasoning chain from tagged entries into structured narrative | Med | Parse journal body for `#h/`, `#ev/`, `#dp/` tags; assemble into narrative template |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Hunt-relative timestamps | "T+2h15m" instead of absolute timestamps -- communicates pace and timeline of investigation | Low | Date math from `started` field |
| Dataview query templates for reasoning chain analysis | Pre-built queries: "Show all strong evidence entries across all journals", "Show all escalation decision points" | Low | Documentation + template queries |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Custom journal rendering engine | Obsidian's native markdown rendering + Dataview queries handle this | Use standard markdown with inline tags |
| Mandatory journal entries | Forces busywork; analysts should journal when useful, not on every action | Optional, encouraged by workflow integration |
| Custom tag rendering | Obsidian's native tag rendering works; custom rendering breaks with theme changes | Use standard `#tag/subtag` syntax |

### Complexity Assessment

LOW-MED. Hunt journals are primarily a note template + append command + tagging convention. The plugin's role is minimal: provide the template, offer the "new entry" command with timestamps, and provide the summary extraction command. Obsidian's native Dataview integration does the heavy lifting for queries.

---

## Area 13: Playbook Distillation (M5.2)

### How Threat Hunt Playbooks Are Structured

The ThreatHunter-Playbook project structures playbooks as: trigger conditions, recommended query sequence, expected entity types, and decision tree with branch points. The SOAR playbook pattern (D3 Security, Cortex XSOAR) adds executable steps.

For Obsidian, a playbook is a structured markdown note that:
1. Documents trigger conditions ("Run when: lateral movement indicators from Endpoint Detection")
2. Lists a recommended query sequence with expected results
3. Maps expected entity types at each stage
4. Includes decision branches ("If > 5 unique endpoints, escalate; otherwise, add to FP registry")
5. Links to source hunts for provenance

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| "Generate playbook" post-hunt command | Walks journal + receipt timeline; produces structured playbook note | High | Needs journal parsing (Area 12), receipt timeline access (`workspace.ts`), template generation |
| Playbook note type with frontmatter | `type: playbook`, `trigger_conditions`, `source_hunt`, `techniques`, `created` | Low | Schema extension |
| Playbook library in sidebar | Section showing available playbooks with one-click apply | Med | New sidebar section in `view.ts`; scan `playbooks/` folder |
| "Apply playbook" command | Pre-populates hypotheses, hunt map, suggested data sources from selected playbook | Med | New command; reads playbook frontmatter; generates new hunt scaffold |

### Differentiators

| Feature | Value Proposition | Complexity | Deps |
|---------|------------------|------------|------|
| Executable playbook sections | One-click to spawn MCP tool call from playbook step | High | MCP bridge integration with playbook step execution |
| Auto-generated decision trees | Playbook generation analyzes journal decision points to create IF/THEN branches | High | Journal `#dp/` tag extraction + structured template |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| SOAR-style automated execution | Obsidian is "prepare, don't orchestrate"; running queries from Obsidian is out of scope | Playbooks prepare context; agents execute in terminal |
| Mandatory playbook compliance | Hunt playbooks are guides, not checklists; forcing compliance kills creativity | Playbooks suggest; analysts adapt |

### Complexity Assessment

HIGH. Playbook generation from journal + receipt data requires walking multiple file types, extracting structured data, and producing a useful template. This is the most synthesis-heavy feature in v5.0. The "apply playbook" command is simpler (read playbook, generate scaffold).

---

## Area 14: Detection Artifact Pipeline (M5.3)

### Table Stakes

| Feature | Why Expected | Complexity | Deps |
|---------|-------------|------------|------|
| Detection note type | Frontmatter linking Sigma/KQL/SPL rules to source hunts, TTPs, and entities | Low | Schema extension; new template |
| Auto-extraction of detection logic from receipts | When agents produce rule candidates in receipts, extract and create detection notes | Med | Receipt parser extension to detect Sigma/KQL/SPL code blocks |
| Coverage overlay on ATT&CK technique notes | `## Detections` section showing which rules cover this technique | Med | Cross-reference detection notes with technique `mitre_id` |
| Detection drift tracker | When KB evolves, flag detections that may need revision | Med | Compare detection `last_validated` against related entity changes |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Detection execution from Obsidian | "Prepare, don't orchestrate" -- running detections is out of scope | Create detection notes; export via hyper copy for deployment |
| Auto-deploying detections | Too dangerous; false positives in production are serious | Detection notes are review artifacts; deployment is a separate workflow |

### Complexity Assessment

MED. Detection notes are a new entity type with cross-references. Auto-extraction from receipts requires extending the parser. Coverage overlay reuses the existing technique note management pattern.

---

## Feature Dependencies

```
M1.1 Sidebar Redesign ─────────┐
M1.2 Command Consolidation ────┤
M1.3 Modal Polish ─────────────┤── M1 complete
M1.4 Onboarding ───────────────┘
        │
        v
M2.1 Verdict Lifecycle ────────┐
M2.2 ATT&CK Institutional ─────┤── M2 complete (needs entity schema from M2.1)
M2.3 Computed Confidence ───────┘── (confidence factors feed M2.1 verdicts)
        │
        v
M3.1 Canvas API Adapter ───────┐── (needs rich entity data from M2)
M3.2 Live Hunt Canvas ─────────┤── M3 complete (needs M3.1 adapter)
M3.3 Interactive Dashboard ─────┘── (needs M3.1 + entity data from M2)
        │
        v
M4.1 Filesystem Watcher ───────┐── (feeds M3 live canvases)
M4.2 MCP Event Bridge ─────────┤── M4 complete (needs M4.1 watcher)
M4.3 Prior-Hunt Suggester ──────┘── (needs entity data from M2, cross-hunt from existing)
        │
        v
M5.1 Hunt Journal Engine ──────┐── (needs live companion from M4 for real-time capture)
M5.2 Playbook Distillation ────┤── M5 complete (needs M5.1 journals)
M5.3 Detection Pipeline ───────┘── (needs ATT&CK memory from M2.2)
```

### Internal Dependencies Within Milestones

- M2.3 (Confidence) feeds M2.1 (Verdict) -- confidence score informs verdict decisions
- M3.2 (Live Hunt Canvas) requires M4.1 (Filesystem Watcher) for true "live" behavior
- M5.2 (Playbook Distillation) requires M5.1 (Hunt Journal) as primary input
- M5.3 (Detection Pipeline) requires M2.2 (ATT&CK Institutional Memory) for technique linkage

### Dependencies on Existing v4.0 Code

| v5.0 Feature | v4.0 Module | What It Uses |
|--------------|-------------|-------------|
| Verdict lifecycle | `entity-schema.ts` | Entity type definitions, frontmatter field specs |
| Verdict lifecycle | `ingestion.ts` | Entity extraction, sighting dedup |
| ATT&CK memory | `parsers/receipt.ts` | `technique_refs` extraction |
| ATT&CK memory | `mcp-enrichment.ts` | `lookupTechnique`, `analyzeDetectionCoverage` |
| Computed confidence | `entity-schema.ts` | Frontmatter field definitions |
| Canvas adapter | `canvas-generator.ts` | `makeNode()`, `getEntityColor()`, layout functions |
| Live canvas | `workspace.ts` | `canvasFromCurrentHunt()`, `generateKnowledgeDashboard()` |
| Filesystem watcher | `main.ts` | Existing vault event registration pattern |
| Filesystem watcher | `ingestion.ts` | `runIngestion()` pipeline |
| MCP event bridge | `mcp-client.ts` | HTTP MCP transport |
| Prior-hunt suggester | `cross-hunt.ts` | Entity-based cross-hunt queries |
| Hunt journal | `scaffold.ts` | Note template generation |
| Playbook distillation | `workspace.ts` | Receipt timeline, entity data access |

---

## MVP Recommendation

### Prioritize (maximum impact, manageable complexity)

1. **M1 UX Foundation** -- polish before power; without this, new features land on a rough surface
2. **M2.1 Verdict Lifecycle** -- transforms dead entity stubs into living dossiers; most visible intelligence depth upgrade
3. **M4.1 Filesystem Watcher** -- unlocks "live" behavior for everything else; low complexity with high leverage
4. **M2.3 Computed Confidence** -- makes entity intelligence quantitative and inspectable
5. **M5.1 Hunt Journal Engine** -- captures the most perishable artifact (analyst reasoning) with minimal plugin complexity

### Defer to Later in Milestone

6. **M2.2 ATT&CK Institutional Memory** -- valuable but requires vault-wide scanning; can land incrementally
7. **M3.1-M3.3 Live Canvas** -- depends on reactive file updates that are complex to get right; canvas generators already work in v4.0
8. **M4.2 MCP Event Bridge** -- bidirectional transport design needs iteration; filesystem watcher covers most use cases
9. **M4.3 Prior-Hunt Suggester** -- nice-to-have that builds on existing cross-hunt code

### Defer to Future Milestone

10. **M5.2 Playbook Distillation** -- highest complexity; needs journals to exist first and accumulate content
11. **M5.3 Detection Pipeline** -- new entity type with cross-references; ATT&CK memory needs to stabilize first

---

## Sources

### Obsidian API and Plugin Development
- [Canvas System (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system)
- [canvas.d.ts Official Type Definitions](https://github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts)
- [Event System (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-api/5.1-event-system)
- [Vault Developer Documentation](https://docs.obsidian.md/Plugins/Vault)
- [Canvas API Forum Discussion](https://forum.obsidian.md/t/any-details-on-the-canvas-api/57120)
- [SuggestModal Documentation](https://docs.obsidian.md/Reference/TypeScript+API/SuggestModal)
- [FuzzySuggestModal Documentation](https://docs.obsidian.md/Reference/TypeScript+API/FuzzySuggestModal)
- [Advanced Canvas Plugin](https://github.com/Developer-Mike/obsidian-advanced-canvas)

### Threat Intelligence Lifecycle and Confidence
- [OpenCTI Decay Rules](https://filigran.io/introducing-decay-rules-implementation-for-indicators-in-opencti/)
- [OpenCTI Knowledge Object State](https://filigran.io/knowledge-object-state-matters-in-opencti/)
- [Dragos IOC End of Life](https://www.dragos.com/blog/end-of-life-of-an-indicator-of-compromise-ioc/)
- [IOC Scoring Model (OS3 Research)](https://rp.os3.nl/2019-2020/p55/report.pdf)
- [IOC Lifecycle Behavior (Diva Portal)](https://www.diva-portal.org/smash/get/diva2:1721508/FULLTEXT02)

### Threat Hunting Playbooks and Reasoning Capture
- [OTRF ThreatHunter-Playbook](https://github.com/OTRF/ThreatHunter-Playbook)
- [Evolving ThreatHunter Playbook with Agent Skills](https://blog.openthreatresearch.com/evolving-the-threat-hunter-playbook-planning-hunts-with-agent-skills/)
- [MITRE ATT&CK Data and Tools](https://attack.mitre.org/resources/attack-data-and-tools/)

### Obsidian Tags and Structured Annotation
- [Obsidian Tags Documentation](https://help.obsidian.md/tags)
- [Dataview Query Structure](https://blacksmithgu.github.io/obsidian-dataview/queries/structure/)
- [Inline Fields vs Tags Discussion](https://forum.obsidian.md/t/inline-fields-vs-tags-for-retrieving-specific-lines-from-notes/95659)
