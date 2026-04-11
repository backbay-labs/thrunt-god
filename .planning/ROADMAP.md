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
- v3.2 Obsidian Workspace Companion (Phases 63-64) -- in progress

## Phases

<details>
<summary>v3.1 Sidebar Automation & Operations (Phases 58-62) — SHIPPED 2026-04-09</summary>

- [x] Phase 58: Sidebar Automation Section Foundation (2/2 plans) — completed 2026-04-09
- [x] Phase 59: MCP Runtime Control Panel (3/3 plans) — completed 2026-04-09
- [x] Phase 60: Command Deck Webview (3/3 plans) — completed 2026-04-09
- [x] Phase 61: Runbook Engine & Editor (3/3 plans) — completed 2026-04-09
- [x] Phase 62: Execution History & Guardrails (3/3 plans) — completed 2026-04-09

</details>

### v3.2 Obsidian Workspace Companion (In Progress)

- [x] **Phase 63: Structural Foundation** - Testable module architecture, honest workspace detection, complete artifact commands, error boundaries (completed 2026-04-11)
- [ ] **Phase 64: Live Hunt Dashboard** - STATE.md/HYPOTHESES.md parsing, hunt status card, live status bar, frontmatter templates with wiki-links

## Phase Details

### Phase 63: Structural Foundation
**Goal**: Plugin codebase is decomposed into testable modules with honest workspace detection, complete command coverage, and error resilience
**Depends on**: Nothing (first phase in v3.2)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, ARCH-07, DETECT-01, DETECT-02, DETECT-03, DETECT-04, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, VIEW-03
**Success Criteria** (what must be TRUE):
  1. Plugin source has separate modules (artifacts.ts, paths.ts, vault-adapter.ts, workspace.ts, types.ts) and main.ts contains only lifecycle/registration/event wiring
  2. Status bar and sidebar distinguish three workspace states (healthy 5/5, partial N/5, missing) and update reactively on vault events without reload
  3. All 5 core artifacts (MISSION, HYPOTHESES, HUNTMAP, STATE, FINDINGS) are reachable via command palette, openable/creatable from the sidebar, and bootstrappable via a single idempotent command
  4. A rendering error in the sidebar shows an error state with retry button instead of a blank panel
  5. Pure module tests (paths.ts, artifacts.ts, workspace.ts) pass via vitest with no Obsidian runtime dependency
**Plans:** 5/5 plans complete
Plans:
- [ ] 63-01-PLAN.md — Pure modules: types.ts, artifacts.ts, paths.ts
- [ ] 63-02-PLAN.md — Vault adapter and workspace service
- [ ] 63-03-PLAN.md — Rewrite main.ts and view.ts with module integration
- [ ] 63-04-PLAN.md — Package config (pin obsidian, add vitest) and CSS updates
- [ ] 63-05-PLAN.md — Unit tests for paths, artifacts, and workspace

### Phase 64: Live Hunt Dashboard
**Goal**: Plugin parses hunt state from vault markdown files and surfaces it as a data-dense dashboard replacing marketing copy
**Depends on**: Phase 63
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06, VIEW-01, VIEW-02, VIEW-04, VIEW-05, VIEW-06
**Success Criteria** (what must be TRUE):
  1. Opening the sidebar in a workspace with populated STATE.md and HYPOTHESES.md shows current phase, blocker count, next action, and hypothesis scoreboard (validated/pending/rejected counts)
  2. Status bar shows live hunt state (phase, active hypotheses, blockers) when STATE.md is parseable, and falls back to artifact count display when it is not
  3. Malformed or missing STATE.md/HYPOTHESES.md degrades to "unknown" or zero counts -- never crashes the sidebar or status bar
  4. New artifact templates include YAML frontmatter (thrunt-artifact, hunt-id, updated) and wiki-links between related artifacts
  5. The hero marketing card is replaced with a compact, data-dense hunt status display showing phase, blockers, hypothesis scoreboard, and phase directory count
**Plans:** 1/5 plans executed
Plans:
- [ ] 64-01-PLAN.md — Types + STATE.md/HYPOTHESES.md parsers (pure functions)
- [ ] 64-02-PLAN.md — Parser unit tests (state + hypotheses)
- [ ] 64-03-PLAN.md — Workspace integration (async getViewModel, phase detection, status bar)
- [ ] 64-04-PLAN.md — View hunt card + artifact templates + CSS
- [ ] 64-05-PLAN.md — Edge case tests + full acceptance verification

## Progress

**Execution Order:**
Phases execute in numeric order: 63 -> 64

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 58. Sidebar Automation Foundation | v3.1 | 2/2 | Complete | 2026-04-09 |
| 59. MCP Runtime Control Panel | v3.1 | 3/3 | Complete | 2026-04-09 |
| 60. Command Deck Webview | v3.1 | 3/3 | Complete | 2026-04-09 |
| 61. Runbook Engine & Editor | v3.1 | 3/3 | Complete | 2026-04-09 |
| 62. Execution History & Guardrails | v3.1 | 3/3 | Complete | 2026-04-09 |
| 63. Structural Foundation | 5/5 | Complete    | 2026-04-11 | - |
| 64. Live Hunt Dashboard | 1/5 | In Progress|  | - |
