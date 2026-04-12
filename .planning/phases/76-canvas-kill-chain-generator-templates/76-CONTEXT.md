# Phase 76: Canvas Kill Chain Generator + Templates - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the canvas generation engine and 4 canvas templates. It does NOT build cross-hunt intelligence queries or hunt comparison (Phase 77).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion:
- Obsidian Canvas format is JSON: `{ nodes: [...], edges: [...] }` where nodes have `id`, `x`, `y`, `width`, `height`, `type`, `file` (for note links) or `text` (for text cards), and `color`
- Kill chain template: 14 tactic columns (Reconnaissance → Impact), entities positioned by their tactic
- Diamond model: 4 quadrants (adversary top, capability right, infrastructure bottom, victim left)
- Lateral movement: network topology with host nodes and IOC connection lines
- Hunt progression: vertical timeline from signal → findings
- "Canvas from current hunt": reads FINDINGS.md + RECEIPTS/ using existing parsers, extracts validated techniques and IOCs, generates canvas
- Entity card colors: IOCs blue, TTPs red, actors purple, tools orange (per MILESTONES-v2.md)
- Output: standard `.canvas` JSON files in planningDir
- Pure canvas generation module (no Obsidian imports needed — just JSON generation)
- Canvas files opened via `app.workspace.openLinkText()`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseReceipt` from parsers/ — extracts technique refs and claim_status
- `parseQueryLog` from parsers/ — extracts entity refs
- `ENTITY_TYPES` — entity type definitions with labels
- `VaultAdapter.readFile()`, `listFiles()`, `createFile()` — vault I/O
- ATT&CK data with tactic names from bundled JSON

### Integration Points
- New `canvas-generator.ts` — pure canvas JSON generation
- `main.ts` — register generate-hunt-canvas and canvas-from-current-hunt commands
- `workspace.ts` — add canvas generation methods using parsers and VaultAdapter

</code_context>

<specifics>
## Specific Ideas

- Tactic column positions: evenly spaced across horizontal axis, ~200px per column
- Card dimensions: 200x100 for TTPs, 150x80 for IOCs
- Connection arrows between entities that appear in the same receipt (co-occurrence)

</specifics>

<deferred>
## Deferred Ideas

- Cross-hunt intelligence queries (Phase 77)
- Hunt comparison (Phase 77)
- Knowledge dashboard canvas (Phase 77)

</deferred>
