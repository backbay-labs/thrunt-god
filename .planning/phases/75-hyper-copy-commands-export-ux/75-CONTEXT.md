# Phase 75: Hyper Copy Commands + Export UX - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the user-facing hyper copy modal, quick export commands, and export logging. It uses the export profiles and context assembly engine from Phase 74. It does NOT build canvas features (Phase 76-77).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion — requirements are specific:
- Hyper Copy modal: Obsidian Modal subclass showing profile list, preview pane with assembled context, token estimate, "Copy to clipboard" button
- Quick export commands: 3 commands that skip the modal — copy-for-query-writer, copy-for-intel-advisor, copy-ioc-context — each assembles context for the named profile and copies to clipboard directly
- EXPORT_LOG.md: append-only log under planningDir recording source note, entities/receipts included, token estimate, target profile
- Clipboard access via `navigator.clipboard.writeText()` (works in Obsidian's Electron)
- Success feedback via Obsidian Notice
- Use assembleContextForProfile and renderAssembledContext from workspace.ts (Phase 74)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkspaceService.assembleContextForProfile()` — assembles context from Phase 74
- `WorkspaceService.renderAssembledContext()` — renders to markdown with provenance
- `WorkspaceService.getAvailableProfiles()` — lists profiles (defaults + custom)
- `McpSearchModal` pattern from Phase 73 — reference for modal implementation
- `PromptModal` inline class from Phase 73 — simple input dialogs

### Integration Points
- New `hyper-copy-modal.ts` — Modal subclass with profile list + preview
- `main.ts` — register hyper-copy-for-agent, 3 quick export commands
- `workspace.ts` — add export logging method

</code_context>

<specifics>
## Specific Ideas

- Modal should show profiles as clickable list items on the left, preview on the right
- Preview should be scrollable with the assembled markdown rendered
- Token estimate badge near the copy button

</specifics>

<deferred>
## Deferred Ideas

- Canvas visualization (Phase 76-77)
- Drag-and-drop export to external apps (future)

</deferred>
