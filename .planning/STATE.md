---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Obsidian Intelligence Platform
status: executing
stopped_at: Completed 85-01-PLAN.md
last_updated: "2026-04-12T19:30:04.935Z"
progress:
  total_phases: 12
  completed_phases: 6
  total_plans: 16
  completed_plans: 15
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v5.0 Obsidian Intelligence Platform -- Phase 85 (Canvas Adapter + Reactive Nodes)

## Current Milestone

v5.0 Obsidian Intelligence Platform -- Graduate from knowledge weapon to intelligence platform.

**Status:** executing
**Phase:** 85 of 90 (Canvas Adapter + Reactive Nodes)
**Plan:** 1 of 2 in current phase complete

Progress: [█████████░] 94% (15/16 v5.0 plans)

## Recently Completed

- v4.0 shipped 2026-04-12: Phases 68-78, 23 plans, 369 tests, 12,193 LOC TypeScript
- Obsidian plugin has entity schema, ATT&CK ontology, ingestion, MCP bridge, hyper copy, canvas, cross-hunt intelligence

## Accumulated Context

### Decisions

- Plan 79-01: EventBus uses Map<string, Set<Function>> for zero-dep typed event handling
- Plan 79-01: Entity-utils extracted as pure functions preserving exact workspace.ts behavior
- Plan 79-01: Domain service shells use constructor injection with optional EventBus
- v5.0 shaped via 4-agent debate: polish first, depth, live canvas, live companion, journals/playbooks
- WorkspaceService decomposition (UX-06, UX-07) is PREREQUISITE for all M2-M5 work
- FrontmatterEditor (INTEL-10) is PREREQUISITE for verdict lifecycle and confidence
- Canvas uses file-level JSON manipulation only, no undocumented internal Canvas API
- Bidirectional MCP uses polling + outbound calls, not SSE (deprecated) or WebSockets (sandbox constraint)
- Filesystem watcher uses Obsidian vault events, not raw fs.watch (macOS unreliable, breaks mobile)
- Journal tags use #thrunt/ namespace prefix for Dataview compatibility
- [Phase 79]: EventBus uses Map<string, Set<Function>> for zero-dep typed event handling
- Plan 79-02: WorkspaceService decomposed to 493 LOC facade delegating 10 methods to 3 domain services
- Plan 79-02: Domain services receive planningDirGetter closure for settings independence
- [Phase 79]: Commands receive plugin parameter instead of this binding to avoid circular dependency
- [Phase 79]: main.ts slimmed to 138 LOC lifecycle-only orchestration with registerCommands(this) delegation
- [Phase 80]: Created obsidian API mock stub + vitest alias to enable testing modules that import from types-only obsidian package
- [Phase 80]: Pure sidebar state logic extracted to sidebar-state.ts for unit testing without obsidian dependency
- [Phase 80]: Context-aware expansion is additive: forces relevant section open without collapsing others
- [Phase 80]: Uses obsidian.debounce() for vault events: 400ms trailing, scoped to planning directory only
- [Phase 81]: FuzzySuggestModal chooser pattern with ChooserItem{id,name,description} for sub-command grouping
- [Phase 81]: Hidden aliases (name:'') preserve old command IDs for hotkey bindings without palette clutter
- [Phase 81]: CanvasTemplateChooserModal replaces button-based CanvasTemplateModal for consistent fuzzy UI
- [Phase 81]: CanvasTemplateModal uses FuzzySuggestModal with CanvasTemplateItem for consistent fuzzy keyboard nav
- [Phase 81]: Entity badge colors use color-mix(var(--color-X) 25%, transparent) with data-entity-type attribute selectors
- [Phase 82]: FrontmatterEditor uses regex line-by-line scanning, not YAML parse/serialize, to preserve comments and formatting
- [Phase 82]: splitFrontmatter/reassemble helpers extracted for DRY frontmatter manipulation
- [Phase 82]: addToArray treats non-array values as no-op (returns unchanged) rather than throwing
- [Phase 82]: Verdict update from empty string to 'unknown' preserves existing quoting style via updateFrontmatter
- [Phase 82]: Migration command uses sequential Notice pattern rather than full modal preview for simplicity
- [Phase 82]: appendVerdictEntry uses line-by-line string manipulation (no YAML parser) for pure testability
- [Phase 82]: Verdict entry format locked: - [YYYY-MM-DD HH:mm] verdict -- "rationale" (hunt: huntId)
- [Phase 82]: Hunt ID detection priority: MISSION.md hunt_id > planning dir name > manual fallback
- [Phase 82]: VerdictSuggestModal follows FuzzySuggestModal + ChooserItem pattern from Phase 81
- [Phase 83]: Hunt history and co-occurrence modules follow identical section-insert-replace pattern from verdict.ts
- [Phase 83]: Related Infrastructure uses ## Related Infrastructure heading, distinct from existing ## Related section
- [Phase 83]: Co-occurrence threshold defaults to 2 with configurable parameter; wiki-link [[entity_name]] for graph integration
- [Phase 83]: Section ordering: ## Verdict History > ## Hunt History > ## Related Infrastructure > ## Sightings > ## Related
- [Phase 83]: Confidence formula locked: (srcNorm*0.25 + reliability*0.30 + corrNorm*0.25 + recency*0.20) * decay with configurable half-life
- [Phase 83]: entity-intelligence.ts follows coordinator pattern: pure function composing modules, IntelligenceService wraps with vault I/O
- [Phase 83]: Schema migration v2: additive-only fields + sections (confidence, Hunt History, Related Infrastructure)
- [Phase 84]: Technique Hunt History uses 3-case placement (no Verdict History anchor), distinct from entity 4-case
- [Phase 84]: Coverage staleness uses UTC-normalized day diff (getUTCFullYear/getUTCMonth/getUTCDate) to avoid timezone boundary issues
- [Phase 84]: FP append is single-entry (not bulk replace) matching append-only requirement
- [Phase 84]: Coordinator extracts lastHuntedDate BEFORE replacing Hunt History section to handle empty-entries fallback
- [Phase 84]: FP counting uses regex /^- \*\*pattern\*\*:/ for locked format detection
- [Phase 84]: TechniqueSuggestModal follows VerdictSuggestModal pattern for consistent fuzzy UI
- [Phase 84]: add-false-positive chooser item delegates via executeCommandById for consistent command routing
- [Phase 84]: Technique refresh runs after entity refresh on TTP notes (additive, not replacing)
- [Phase 84]: WorkspaceService.refreshTechniqueIntelligence forwards to IntelligenceService (consistent facade pattern)
- [Phase 84]: mapClaimStatusToOutcome: supports->TP, disproves->FP, else->inconclusive per RESEARCH.md heuristic
- [Phase 85]: ENTITY_TYPE_COLORS uses 6 base type keys; IOC subtypes resolved via prefix match in resolveEntityColor
- [Phase 85]: patchCanvasNodeColors skips nodes where color already matches (no-op optimization)
- [Phase 85]: Confidence tiers: low (<0.4), medium (0.4-0.7), high (>0.7 or undefined)
- [Phase 85]: CSS verdict borders use :has() selectors on cssclasses frontmatter (Chromium 112+ compatible)
- [Phase 85]: canvas-generator ENTITY_COLORS removed; getEntityColor delegates to resolveEntityColor (single source of truth)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-12T19:30:04.928Z
Stopped at: Completed 85-01-PLAN.md
Resume file: None
