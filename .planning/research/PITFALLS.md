# Domain Pitfalls

**Domain:** Adding intelligence depth, live canvas, live hunt companion, and journal features to an existing 12K LOC Obsidian plugin
**Researched:** 2026-04-11
**Overall confidence:** HIGH (verified against Obsidian API docs, forum reports, MCP specification, and codebase analysis)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or architectural dead ends.

### Pitfall 1: Canvas API Is Undocumented Internal API -- "Live Canvas" Requires Fragile Coupling

**What goes wrong:** The v5.0 spec (M3) calls for Canvas nodes that "update live when underlying entity note changes" and "auto-populate as receipts land." Obsidian has NO public API for programmatic Canvas node manipulation at runtime. The only documented API is the `.canvas` JSON file format (`canvas.d.ts`). Plugins that manipulate live Canvas views must use undocumented internal APIs accessed via `app.workspace.getLeavesOfType('canvas')[0].view.canvas`, calling methods like `node.setData()` that can break on any Obsidian update.

**Why it happens:** The current `canvas-generator.ts` (311 LOC) generates static `.canvas` JSON files and writes them to disk. Developers assume the jump from "generate JSON" to "update live nodes" is small. It is not. Generating a file is a pure function. Making nodes reactive requires hooking into undocumented Canvas internals, managing node lifecycle when the user opens/closes canvas views, and coordinating between vault events and Canvas rendering cycles.

**Consequences:**
- Canvas features break silently on Obsidian updates (canvas internals change without notice)
- Direct property mutation on canvas nodes does NOT trigger UI updates -- you must use `node.setData()` which is undocumented
- Plugin may not pass community plugin review if it relies too heavily on internal APIs
- Race conditions between Canvas's own `requestSave` debounce (2-second window) and plugin writes

**Prevention:**
- **Tier the Canvas integration.** Tier 1: Write/update `.canvas` JSON files on disk (works today, uses documented format, survives Obsidian updates). Tier 2: Optional live node updates using internal APIs wrapped in a thin adapter that can be swapped when/if official APIs land.
- **Never mutate Canvas node properties directly.** Always use `node.setData({...node.getData(), x: 100})` pattern.
- **Wrap ALL undocumented Canvas API calls in a single `CanvasApiAdapter` module** with try/catch and fallback to file-based updates. If the internal API throws, degrade to "regenerate canvas file."
- **Pin Obsidian minimum version** in manifest.json and test against it in CI.

**Detection:** Canvas nodes stop updating after Obsidian update. Console shows "cannot read property of undefined" errors from canvas internals. Nodes appear but are not interactive.

**Phase:** M3 (Live Canvas). Must be addressed in the FIRST plan of M3 as a foundational adapter before any reactive features.

---

### Pitfall 2: `processFrontMatter` Destroys YAML Formatting and Races With Editor Saves

**What goes wrong:** M2 (Intelligence Depth) heavily relies on updating entity frontmatter: verdict lifecycle transitions, computed confidence scores, schema version fields, hunt history aggregation. Obsidian's `app.fileManager.processFrontMatter()` is the official API for this, but it destructively reformats YAML -- removing comments, altering string quotes, changing types, and stripping formatting. Worse, it fails silently during the 2-second `requestSave` debounce window after any editor modification.

**Why it happens:** The current codebase uses text manipulation (string concatenation in `ingestion.ts`) to append sighting lines. v5.0 needs to UPDATE existing frontmatter fields (verdict, confidence, schema_version), which requires `processFrontMatter` or equivalent. Developers reach for the official API and discover it munges their carefully structured YAML.

**Consequences:**
- Analyst-curated YAML comments in entity notes get silently deleted
- String values like `"192.168.1.100"` lose quotes and become ambiguous YAML
- Frontmatter updates called within 2 seconds of an editor save produce no effect (no error, no change)
- Schema migration command could corrupt hundreds of entity notes if it processes them in rapid succession

**Prevention:**
- **Use `vault.process()` with direct text manipulation for frontmatter updates** rather than `processFrontMatter()` when preserving formatting matters. Parse frontmatter as text, find the specific key, replace the value, write back.
- **Build a `FrontmatterEditor` utility** that reads the raw text, parses only the target key-value pair, replaces it surgically, and writes back. Do NOT roundtrip through a YAML parser.
- **Never batch-process frontmatter updates without delays.** When the schema migration command updates hundreds of files, insert a 50-100ms delay between writes OR use `vault.process()` which is lower-level.
- **Wrap all frontmatter mutations in a retry** that checks if the file's `dirty` flag is set and waits for it to clear before writing.

**Detection:** Entity notes lose YAML comments after ingestion. Confidence scores don't update when set from the command palette right after editing a note. Migration command reports success but files are unchanged.

**Phase:** M2 (Intelligence Depth). Must be solved in the FIRST plan as the `FrontmatterEditor` utility, before verdict lifecycle or confidence computation.

---

### Pitfall 3: Obsidian's File Watcher Does NOT Detect External Subdirectory Changes Reliably

**What goes wrong:** M4.1 (Filesystem Watcher) expects to "watch `RECEIPTS/` and `QUERIES/` directories for new files" and "auto-ingest new artifacts as they land." Obsidian's built-in file watcher detects external changes instantly for files in the vault root, but changes in subdirectories (like `.planning/RECEIPTS/`) may go unnoticed or be significantly delayed. On macOS, `fs.watch` emits duplicate events, reports most changes as "rename" regardless of actual operation, and is fundamentally unreliable.

**Why it happens:** The existing plugin uses `vault.on('create')` and `vault.on('delete')` and `vault.on('rename')` (line 293-296 in `main.ts`). These fire for Obsidian-originated changes. When the CLI writes a receipt file to `.planning/RECEIPTS/RCT-005.md` from an external process, Obsidian may not detect it for seconds, or not at all until the user switches to Obsidian and triggers a vault scan.

**Consequences:**
- "Live hunt companion" feels dead -- receipts land but nothing happens in the sidebar
- Duplicate ingestion if the file is eventually detected but the plugin already polled and ingested
- On macOS, `fs.watch` fires duplicate events, causing the ingestion engine to run twice for each file
- Race condition: plugin starts reading a file that the CLI is still writing, producing partial/corrupt parse results
- `vault.process` and `vault.modify` may conflict with Obsidian's internal file watcher, causing Obsidian to transiently overwrite files with stale cached content before self-correcting in 1-2 seconds

**Prevention:**
- **Implement a dual-strategy watcher:** (1) Listen to Obsidian vault events (`vault.on('create')`) for Obsidian-originated changes. (2) Run a configurable polling interval (default 5s) using `setInterval` + `vault.adapter.list()` for external changes. Do NOT use raw `fs.watch`.
- **Debounce file detection** with a 500ms cooldown per file path to prevent duplicate ingestion from event storms.
- **Verify file stability before ingesting:** Read file size, wait 200ms, read again. If size changed, the file is still being written -- wait longer.
- **Make the watcher opt-in** with a clear setting toggle and interval control. Default to polling (safe) not native watching (fragile).
- **Deduplication at the ingestion layer** already exists (`deduplicateSightings()` checks for `**sourceId**` in the Sightings section). Ensure watcher-triggered ingestion uses this same path.

**Detection:** Status bar "hunt pulse" never activates when CLI runs queries. Duplicate sighting lines appear in entity notes. Console shows ENOENT errors when trying to read partially-written files.

**Phase:** M4 (Live Hunt Companion). The watcher architecture must be designed in the FIRST plan of M4 and smoke-tested with external file creation before building auto-ingestion.

---

### Pitfall 4: Bidirectional MCP Event Bridge Builds on Deprecated Transport

**What goes wrong:** M4.2 calls for a "bidirectional MCP event bridge" where CLI pushes events to Obsidian and Obsidian publishes events consumable by CLI. The current `HttpMcpClient` (153 LOC) uses simple HTTP request/response. MCP's SSE transport -- the obvious choice for server push -- was deprecated in March 2025 in favor of Streamable HTTP. Building a bidirectional event system on the MCP protocol means navigating a transport layer that is actively evolving.

**Why it happens:** The spec says "Transport: MCP server as message broker (both surfaces already connect)." This sounds simple because the HTTP MCP client already exists. But request/response HTTP cannot push events from server to client. Developers must add a streaming transport, and the MCP spec just changed the recommended approach from SSE to Streamable HTTP.

**Consequences:**
- Building on SSE means building on a deprecated transport that may lose SDK support
- Streamable HTTP is newer and has less ecosystem tooling
- The Obsidian plugin runs inside Electron, which adds CORS and connection management complexity to SSE/streaming
- MCP has no standardized authentication mechanism, so the event bridge is unauthenticated on localhost
- Long-lived connections in Electron's renderer process can be killed by Chromium's network stack during background tab throttling

**Prevention:**
- **Do NOT use MCP transport for the event bridge.** Use a simpler mechanism: the MCP server writes event files to a known directory (`.planning/.events/`), and the Obsidian watcher (from M4.1) picks them up. File-based event passing is robust, debuggable, survives process restarts, and doesn't require transport protocol expertise.
- **If real-time push is required later**, use a simple localhost WebSocket (not MCP streaming) with auto-reconnect. Keep MCP for tool calls (request/response), not event streaming.
- **Define `thrunt-events.schema.json`** as specified, but use it to validate event file content, not as a transport schema.
- **Outbound events (Obsidian -> CLI)**: Write event files to `.planning/.events/outbound/`. CLI watches that directory. Symmetric with inbound.

**Detection:** Event bridge works in dev but drops events when Obsidian is backgrounded. Events arrive out of order. SSE connection dies silently after 30 seconds of inactivity.

**Phase:** M4 (Live Hunt Companion). Must be decided in the M4 architecture plan BEFORE implementation. Wrong transport choice here forces a rewrite.

---

### Pitfall 5: WorkspaceService God Object Becomes Unmanageable at 2500+ LOC

**What goes wrong:** `workspace.ts` is already 1,545 LOC and is the single largest file in the codebase. It handles view model construction, artifact detection, ingestion orchestration, MCP enrichment, canvas generation, cross-hunt intelligence, export profiles, and coverage analysis. v5.0 adds verdict lifecycle, schema migration, confidence computation, hunt journaling, playbook distillation, filesystem watching, event bridging, and live canvas coordination. Without decomposition, this file will exceed 3,000 LOC and become the bottleneck for every feature.

**Why it happens:** The WorkspaceService was the right initial pattern (single service behind a clean `getViewModel()` cache). But every new v4.0 feature added methods to it because it was the only service. v5.0 continues this pattern by default because new features need access to the vault adapter, MCP client, and settings -- all wired through WorkspaceService.

**Consequences:**
- Every feature PR touches `workspace.ts`, causing constant merge conflicts
- Testing becomes painful: the WorkspaceService constructor takes 5 parameters and growing
- Cache invalidation (`invalidate()`) clears everything even when only one domain changed, causing unnecessary re-computation
- New developers cannot understand the file without reading all 1,545 lines

**Prevention:**
- **Decompose in M1 (UX Foundation)** before adding M2-M5 features. Extract domain services:
  - `EntityService` -- verdict lifecycle, confidence computation, schema migration
  - `IntelligenceService` -- ATT&CK memory, coverage analysis, hunt linkbacks
  - `CanvasService` -- canvas generation, live canvas updates
  - `WatcherService` -- filesystem watching, event bridge
  - `JournalService` -- journal entries, playbook distillation
- **Keep WorkspaceService as the orchestrator** that delegates to domain services. It owns the ViewModel cache and calls services for each section.
- **Use granular cache invalidation** -- when an entity changes, only invalidate entity-related cached data, not the entire ViewModel.

**Detection:** PRs start touching 10+ locations in workspace.ts. Test files for workspace.ts exceed 1,000 lines. Developers add `// TODO: extract this` comments.

**Phase:** M1 (UX Foundation). Service decomposition MUST happen before M2-M5 features land, or it never will.

---

## Moderate Pitfalls

### Pitfall 6: Schema Migration Corrupts Analyst Content When Changing Frontmatter Shape

**What goes wrong:** M2.1 adds `schema_version` to entity frontmatter and a migration command to "update all entity notes to latest schema without losing analyst content." The current entity notes (8 types, 260+ LOC in `entity-schema.ts`) have no version field. Adding one to hundreds of existing notes risks overwriting analyst-added content between the frontmatter and the first heading.

**Prevention:**
- Migration must be **additive only** -- add new fields, never remove or rename existing ones. The `schema_version: 1` field gets added; missing fields get default values; existing fields are never touched.
- **Run migrations in a transaction-like pattern**: read all files first, compute diffs, show the analyst a summary ("Will update 147 entity notes: add schema_version, add verdict_history"), get confirmation, THEN write.
- **Back up the `.planning/` directory before migration** (or at minimum, write a manifest of pre-migration frontmatter checksums so changes can be audited).
- **Test migration on the actual entity template output** from v4.0's `starterTemplate()` functions, not synthetic test data.

**Detection:** After migration, entity notes have duplicate frontmatter blocks. Analyst-written prose between `---` and `# heading` disappears. Dataview queries break because field types changed.

**Phase:** M2 (Intelligence Depth). Migration infrastructure needed in the first M2 plan.

---

### Pitfall 7: Confidence Decay Math Produces Unintuitive Scores

**What goes wrong:** M2.3 specifies `confidence = f(independent_source_count, source_reliability, corroboration_depth, days_since_last_validation)` with "configurable half-life" decay. The math is straightforward (`score * 0.5^(days/half_life)`), but choosing the right half-life and weighting factors is entirely domain-specific. A misconfigured half-life (e.g., 30 days) means an IOC confirmed yesterday with 5 independent sources shows 0.82 confidence, while one confirmed 60 days ago with the same evidence shows 0.42 -- which feels wrong to analysts who know the IOC is still valid.

**Prevention:**
- **Make ALL confidence parameters user-configurable** in settings: half-life (default 90 days), minimum floor (default 0.3), factor weights.
- **Show factor breakdown in entity frontmatter** so analysts see WHY the score is what it is: `confidence_factors: {sources: 0.9, recency: 0.7, corroboration: 0.85}`.
- **Confidence is advisory, never gatekeeping** -- it shows a number, it does not hide or filter entities. Analysts override by editing frontmatter.
- **Start with exponential decay** (most natural for IOC validity) but allow disabling decay entirely as a setting.

**Detection:** Analysts complain that IOCs they know are valid show low confidence. Hunt reports cite confidence scores that contradict analyst judgment.

**Phase:** M2 (Intelligence Depth), specifically M2.3. Design the model with analyst override in mind.

---

### Pitfall 8: Inline Tag Syntax Conflicts With Obsidian's Native Tag Behavior

**What goes wrong:** M5.1 introduces inline tagging for hunt journals: `#h/credential-reuse` (hypothesis), `#ev/strong` (evidence strength), `#dp/escalate` (decision point). Obsidian treats `#anything` as a tag and indexes it globally. This means every hypothesis tag pollutes the global tag namespace, appears in tag autocomplete, and shows up in Obsidian's tag pane alongside real organizational tags. The `/` separator creates nested tags in Obsidian, which may be desired but may also create confusing tag hierarchies.

**Prevention:**
- **Embrace Obsidian's native tag system intentionally.** Use `#thrunt/h/credential-reuse` prefix to namespace all plugin tags. This ALSO makes them Dataview-queryable (`WHERE contains(file.tags, "#thrunt/h")`) which the spec requires.
- **Document the tag convention explicitly** so analysts know `#thrunt/` tags are plugin-managed and non-`#thrunt/` tags are personal.
- **Do NOT invent custom syntax** (e.g., `@h[credential-reuse]`) -- it won't be indexed by Obsidian, won't be queryable by Dataview, and won't benefit from autocomplete.
- **Consider using Dataview inline fields** (`[evidence:: strong]`) as an alternative for structured data that should NOT appear as tags. Reserve tags for categorical labels only.

**Detection:** Global tag pane shows hundreds of `#h/` and `#ev/` tags. Tag autocomplete becomes unusable. Analysts accidentally use plugin tags in non-journal notes.

**Phase:** M5 (Hunt Journal). Tag convention must be decided in the first M5 design plan and documented before journal entry creation.

---

### Pitfall 9: View Re-rendering on Every Vault Event Tanks Performance With Live Features

**What goes wrong:** The current `main.ts` (lines 288-296) calls `refresh` on EVERY `vault.on('create')`, `vault.on('delete')`, and `vault.on('rename')` event. The refresh function calls `workspaceService.invalidate()` which clears the entire cached ViewModel, then re-renders all views. With v5.0's live features (filesystem watcher, live canvas, real-time sidebar updates), vault events will fire much more frequently. A hunt with active ingestion could fire 50+ vault events per minute, each triggering a full sidebar re-render.

**Prevention:**
- **Debounce the refresh handler** with a 300-500ms trailing debounce. Multiple events within the window produce one render.
- **Implement granular cache invalidation** in WorkspaceService: invalidate only the section affected by the change (e.g., entity counts for entity folder changes, receipt timeline for receipt folder changes).
- **Use `requestAnimationFrame`** for view re-renders to avoid blocking the main thread.
- **Add a `vault.on('modify')` handler** (currently missing from main.ts) for M2's frontmatter-driven updates, but DEBOUNCE IT AGGRESSIVELY since modify fires on every keystroke in the editor.
- Note: Obsidian's built-in `debounce()` function is actually a throttle (fires on leading edge). Use a proper trailing debounce implementation or the `window.setTimeout` pattern.

**Detection:** Sidebar flickers during active ingestion. Obsidian becomes sluggish when CLI is running queries. DevTools Performance panel shows long tasks from view rendering.

**Phase:** M1 (UX Foundation). Debouncing and granular invalidation should be implemented as part of the sidebar redesign, before M4 adds high-frequency event sources.

---

### Pitfall 10: Event Schema Versioning Ignored -- Bridge Breaks on First Schema Change

**What goes wrong:** M4.2 specifies `thrunt-events.schema.json` shared across CLI, VS Code, and Obsidian. Once deployed, the event schema becomes a contract between independently-versioned surfaces. If the CLI adds a field to the "receipt_generated" event, older Obsidian plugin versions crash or silently drop data.

**Prevention:**
- **Version the event schema from day one**: `{"schema_version": 1, "event_type": "receipt_generated", ...}`.
- **All consumers must ignore unknown fields** (forward compatibility).
- **All consumers must tolerate missing optional fields** (backward compatibility).
- **Never remove or rename fields** -- only add new optional ones.
- **Validate events at the boundary**: the watcher validates inbound events against the schema and drops malformed events with a log warning rather than crashing.

**Detection:** Plugin throws on unknown event fields after CLI update. Events silently ignored because new required field is missing.

**Phase:** M4 (Live Hunt Companion). Schema must be versioned in the first M4 plan, not added retroactively.

---

## Minor Pitfalls

### Pitfall 11: Command Consolidation Breaks Existing Hotkey Bindings

**What goes wrong:** M1.2 merges 19 commands to ~10. Users who set custom hotkeys for removed command IDs will lose those bindings silently.

**Prevention:** Keep old command IDs as aliases that delegate to the new chooser modals. Log a deprecation notice on first use. Publish a migration guide in "What's new."

**Phase:** M1 (UX Foundation).

---

### Pitfall 12: Hunt Journal Timestamps Drift Without UTC Normalization

**What goes wrong:** M5.1 uses "hunt-relative timestamps" for journal entries. If the plugin uses `new Date()` without UTC normalization, timestamps shift with timezone changes. An analyst traveling or a team spanning timezones gets inconsistent timeline ordering.

**Prevention:** Store all timestamps in ISO 8601 UTC (`new Date().toISOString()`). Display in local time. The `buildSightingLine()` function in `ingestion.ts` already uses `.toISOString().slice(0, 10)` -- extend this pattern to journal entries.

**Phase:** M5 (Hunt Journal).

---

### Pitfall 13: Playbook Distillation Produces Useless Templates Without Structured Journal Data

**What goes wrong:** M5.2's "Generate playbook" command "walks the journal + receipt timeline" to produce a reusable hunt template. If journal entries are unstructured free text without the inline tags from M5.1, the distillation has nothing structured to extract.

**Prevention:** M5.1 MUST ship and be adopted before M5.2 is useful. The sequencing dependency `M5.1 -> M5.2` is strict, not soft. Consider gating the "Generate playbook" command behind a check that the journal has at least N tagged entries.

**Phase:** M5 (Hunt Journal). Sequencing is already correct in the milestone, but implementation must enforce the dependency.

---

### Pitfall 14: `main.ts` Command Registration Exceeds Plugin Review Comfort Threshold

**What goes wrong:** `main.ts` is already 736 LOC with 19 commands. v5.0 adds verdict commands, confidence recompute, journal entry, playbook generation, canvas live mode, watcher toggle, and more. Without refactoring, `main.ts` could hit 1,500+ LOC, all in `onload()`.

**Prevention:** Move command registration into a `commands.ts` module that exports a `registerCommands(plugin)` function. Keep `main.ts` under 200 LOC as the entry point that wires services and delegates registration.

**Phase:** M1 (UX Foundation). Part of the service decomposition.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| M1: Sidebar redesign | Re-render performance with collapsible state and density options | Debounce vault events (Pitfall 9), use CSS transitions not DOM rebuilds |
| M1: Command consolidation | Breaking existing user hotkeys | Keep old command IDs as aliases (Pitfall 11) |
| M1: Onboarding | Welcome screen race condition with workspace detection | Check workspace status ONCE on load, cache result |
| M2: Verdict lifecycle | processFrontMatter destroys YAML | Use surgical text manipulation (Pitfall 2) |
| M2: Schema migration | Bulk frontmatter update corrupts notes | Additive-only migration with preview (Pitfall 6) |
| M2: Computed confidence | Decay math confuses analysts | Configurable parameters with transparent breakdown (Pitfall 7) |
| M2: Cross-hunt aggregation | N+1 file reads for each entity cross-referencing all hunts | Precompute entity-hunt index during ingestion, not at query time |
| M3: Canvas API adapter | Undocumented internal APIs break on update | Tiered approach: file-based + optional live (Pitfall 1) |
| M3: Live hunt canvas | Canvas requestSave debounce conflicts with plugin writes | Use requestFrame for batch node updates, never modify canvas during save |
| M3: Dashboard drill-down | Opening notes from canvas nodes requires leaf management | Use `app.workspace.openLinkText()` which handles leaf creation |
| M4: Filesystem watcher | External subdirectory changes missed | Dual-strategy watcher: vault events + polling (Pitfall 3) |
| M4: Event bridge transport | Building on deprecated SSE transport | File-based event passing, not streaming (Pitfall 4) |
| M4: Prior-hunt suggester | Knowledge graph queries block UI during ingestion | Run suggestions async with `setTimeout(0)` to yield to render loop |
| M5: Inline tags | Tag namespace pollution | `#thrunt/` prefix namespace (Pitfall 8) |
| M5: Playbook distillation | Useless output without structured journal data | Gate command on tagged entry count (Pitfall 13) |
| M5: Detection pipeline | Sigma/KQL rule extraction from free-text receipts is unreliable | Require explicit code fences in receipts for reliable extraction |

---

## Sources

### Obsidian Canvas API
- [Canvas System -- DeepWiki](https://deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system) -- HIGH confidence
- [Canvas API Forum Discussion](https://forum.obsidian.md/t/any-details-on-the-canvas-api/57120) -- HIGH confidence
- [Unable to Move Canvas Node via Code](https://forum.obsidian.md/t/unable-to-move-canvas-node-via-code/93486) -- HIGH confidence
- [Canvas Interaction Functions](https://forum.obsidian.md/t/canvas-interaction-functions/51959) -- MEDIUM confidence
- [obsidian-api/canvas.d.ts](https://github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts) -- HIGH confidence

### Obsidian processFrontMatter
- [processFrontMatter API Reference](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter) -- HIGH confidence
- [processFrontMatter Destroys Formatting](https://forum.obsidian.md/t/yaml-properties-api-processfrontmatter-removes-alters-string-quotes-comments-types-formatting/65851/22) -- HIGH confidence
- [vault.process/modify Debounce Conflict](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862) -- HIGH confidence

### Filesystem Watching
- [Obsidian Vault File Watcher Limitation](https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174) -- HIGH confidence
- [fs.watch Event Inconsistency](https://github.com/nodejs/node/issues/47058) -- HIGH confidence
- [fs.watch macOS Rename Bug](https://github.com/nodejs/node/issues/7420) -- HIGH confidence
- [Vault Cache Truncation on Write](https://forum.obsidian.md/t/vault-cache-truncation-after-adapter-write/113139) -- MEDIUM confidence

### MCP Transport
- [Why MCP Deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) -- HIGH confidence
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) -- HIGH confidence
- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) -- HIGH confidence

### Obsidian Events and Performance
- [MetadataCache Events](https://deepwiki.com/obsidianmd/obsidian-api/2.4-metadatacache-and-link-resolution) -- HIGH confidence
- [Obsidian Debounce is Actually Throttle](https://forum.obsidian.md/t/the-debounce-function-provided-by-the-api-is-actually-a-throttle-function/79147) -- MEDIUM confidence
- [Events Performance Discussion](https://forum.obsidian.md/t/events-observation-and-control-for-performance/83574) -- MEDIUM confidence

### Codebase Analysis
- `apps/obsidian/src/main.ts` -- 736 LOC, 19 commands, event wiring at L288-296
- `apps/obsidian/src/workspace.ts` -- 1,545 LOC, single service with cached ViewModel
- `apps/obsidian/src/canvas-generator.ts` -- 311 LOC, pure JSON generation (no live Canvas)
- `apps/obsidian/src/mcp-client.ts` -- 153 LOC, HTTP request/response only
- `apps/obsidian/src/entity-schema.ts` -- 260 LOC, 8 types with no schema_version field
- `apps/obsidian/src/ingestion.ts` -- 205 LOC, text-based sighting dedup
