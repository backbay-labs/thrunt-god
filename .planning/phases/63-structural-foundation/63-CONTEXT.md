# Phase 63: Structural Foundation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the THRUNT God Obsidian plugin (`apps/obsidian/`) from a 3-file scaffold into a testable module architecture. Fix dishonest workspace detection, add missing commands for STATE.md and HUNTMAP.md, add error boundaries. No new user-visible features beyond these fixes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase. Detailed implementation plans already exist in `apps/obsidian/PHASE-1-PLAN.md` and `apps/obsidian/SPEC.md` (Section 3).

Key decisions already locked:
- Module decomposition: types.ts, artifacts.ts, paths.ts, vault-adapter.ts, workspace.ts (all specified in SPEC.md 3.1)
- VaultAdapter interface specified in SPEC.md 3.3
- Three-state detection model: healthy/partial/missing (SPEC.md 3.4)
- Artifact canonical order: MISSION, HYPOTHESES, HUNTMAP, STATE, FINDINGS (SPEC.md 3.2)
- STATE.md template updated to include ## Next actions section
- bootstrap() creates all 5 artifacts (intentional behavior change)
- Error boundary: retry logic with same-error comparison
- Test runner: vitest, directory src/__tests__/
- Pin obsidian dependency to ^1.6.0

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Current CORE_ARTIFACTS array in view.ts (lines 6-72) — templates to centralize
- Current path resolution methods in main.ts (getPlanningDir, getCoreFilePath, getCoreFile)
- Current ensureFolderPath recursive folder creation (main.ts lines 187-209)
- Obsidian Setting component used in artifact list rendering

### Established Patterns
- Plugin extends Obsidian Plugin class with onload/onunload lifecycle
- ItemView subclass for sidebar panel (ThruntWorkspaceView)
- PluginSettingTab for settings UI
- vault.on('create'/'delete'/'rename') for reactive updates
- Notice class for user-facing messages
- normalizePath from obsidian for path handling

### Integration Points
- main.ts onload() registers views, commands, ribbon icon, settings tab, vault events
- view.ts render() builds DOM imperatively via createEl/createDiv
- settings.ts onChange triggers saveSettings() which calls refreshViews()
- Status bar item updated via statusBarItemEl.setText()

</code_context>

<specifics>
## Specific Ideas

Detailed task-by-task implementation plan exists at `apps/obsidian/PHASE-1-PLAN.md` with 12 tasks across 4 waves. The plan includes exact TypeScript signatures, line-by-line move/delete instructions, and acceptance criteria per task. Use it as the primary implementation reference.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
