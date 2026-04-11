# Phase 64: Live Hunt Dashboard - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add live hunt state parsing and display to the THRUNT God Obsidian plugin. Parse STATE.md and HYPOTHESES.md into structured snapshots. Replace the hero marketing card with a compact hunt status display. Show live hunt state in the status bar. Update artifact templates with YAML frontmatter and wiki-links. Detect phase directories.

</domain>

<decisions>
## Implementation Decisions

### Parsers
- STATE.md parser: pure function `(markdown: string) => StateSnapshot`
- Extracts `## Current phase` (first non-empty line), `## Blockers` (list items), `## Next actions` (list items)
- HYPOTHESES.md parser: pure function `(markdown: string) => HypothesisSnapshot`
- Parses first markdown table, finds Status column by header match (case-insensitive)
- Recognized status values: validated, testing, draft, pending, active, rejected, disproved
- Bucket mapping: testing/draft/pending/active → "pending"; disproved → "rejected"
- Both parsers strip YAML frontmatter before scanning via shared `stripFrontmatter` helper
- Malformed input produces fallback values ("unknown" / zero counts), never exceptions

### Phase Directory Detection
- Match regex `/^phase-(\d+)$/` as direct children of planning directory
- Non-numeric names like `phase-recon/` are ignored
- `phase-1/` and `phase-01/` are both valid
- VaultAdapter gets new `listFolders(path: string): Promise<string[]>` method

### Status Bar
- healthy + parseable STATE.md: `{phase} | {N}/{M} hypotheses active | {X} blocker(s)`
- healthy + unparseable STATE.md: `THRUNT .planning (5/5)`
- partial: `THRUNT .planning (3/5)`
- missing: `THRUNT not detected`
- Phase label is verbatim text from STATE.md, not reformatted

### View Changes
- Hero marketing card replaced with compact hunt status card
- Shows: workspace badge, current phase, blocker count, next action (first item, truncated at 60 chars), hypothesis scoreboard, phase directory count
- Artifact list remains below the status card

### Templates
- All 5 templates get YAML frontmatter: thrunt-artifact, hunt-id, updated
- Wiki-links: HUNTMAP → [[STATE]] and [[HYPOTHESES]], STATE → [[HUNTMAP]] and [[FINDINGS]], FINDINGS → [[HYPOTHESES]]
- MISSION.md gets `## Scope` and `## Success criteria` sections
- Phase 1 templates (no frontmatter) remain fully supported — frontmatter is additive

### Architecture
- getViewModel() changes from sync to async (breaking change from Phase 63)
- All call sites updated: view.ts render() adds await, main.ts updateStatusBar() becomes async
- Parsers live in `src/parsers/state.ts`, `src/parsers/hypotheses.ts`, `src/parsers/index.ts`
- Types extended: StateSnapshot, HypothesisSnapshot, PhaseDirectoryInfo added to types.ts

### Claude's Discretion
- CSS styling details for the hunt status card (color scheme, spacing, typography)
- Exact HTML element hierarchy within the compact card
- Error presentation when only one parser fails but the other succeeds

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkspaceService` from Phase 63 — extend with parsed state in ViewModel
- `VaultAdapter` interface — add `listFolders` method
- `StubVaultAdapter` in tests — add `listFolders` stub
- `CORE_ARTIFACTS` registry — templates to update with frontmatter
- Three-state view rendering from Phase 63 — extend with hunt state data

### Established Patterns
- Pure functions for all parsing (no Obsidian imports)
- ViewModel-driven rendering in view.ts
- `workspaceService.invalidate()` + `view.render()` for reactive updates
- vitest with StubVaultAdapter for testing

### Integration Points
- `workspace.ts getViewModel()` — extend to include parsed state
- `view.ts renderContent()` — extend for hunt status card
- `main.ts updateStatusBar()` — extend for live state format
- `artifacts.ts CORE_ARTIFACTS` — update template strings
- `types.ts` — add new snapshot types

</code_context>

<specifics>
## Specific Ideas

Detailed task-by-task implementation plan exists at `apps/obsidian/PHASE-2-PLAN.md` with 13 tasks across 5 waves. The plan includes exact TypeScript signatures, regex patterns, parser algorithms, template strings, and test cases. Use it as the primary implementation reference.

SPEC.md Section 4 is the authoritative specification for all Phase 2 features.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
