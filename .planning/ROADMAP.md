# Roadmap: THRUNT GOD

## Milestones

- v1.0 Query Runtime & Connector SDK (Phases 1-6) -- shipped 2026-03-25
- v1.1 Hunt Packs & Technique Packs (Phases 7-11) -- shipped 2026-03-25
- v1.2 Evidence Integrity & Provenance (Phases 12-16) -- shipped 2026-03-27
- v1.3 Detection Promotion Pipeline (Phases 17-19) -- shipped 2026-03-27
- v1.4 Hunt Learning & Recommendation Engine (Phases 20-22) -- shipped 2026-03-27
- **v1.5 TUI Operator Console (Phases 23-26) -- in progress**

## v1.5 TUI Operator Console

**Milestone Goal:** Rebrand and integrate the ClawdStrike terminal POC as THRUNT GOD's operator interface, replacing raw CLI usage with a reactive TUI wired to .planning/ state and thrunt-tools.cjs.

## Phases

**Phase Numbering:**
- Integer phases (23, 24, 25, 26): Planned milestone work
- Decimal phases (e.g., 23.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 23: Bridge Foundation** - Subprocess executor, state adapter, file watcher, and streaming infrastructure (completed 2026-03-29)
- [x] **Phase 24: Hunt Observation Screens** - Domain modules and all read-only hunt screens wired to THRUNT state (completed 2026-03-29)
- [ ] **Phase 25: Execution & Verification** - Query execution trigger and post-execution gate verification
- [ ] **Phase 26: Rebrand & Dead Code Removal** - Systematic ClawdStrike-to-THRUNT rename and module cleanup

## Phase Details

### Phase 23: Bridge Foundation
**Goal**: The TUI can communicate with thrunt-tools.cjs via subprocess, translate .planning/ state into typed context, and reactively update when files change
**Depends on**: Nothing (first phase of v1.5; builds on existing apps/terminal/ POC)
**Requirements**: BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04, BRIDGE-06
**Success Criteria** (what must be TRUE):
  1. TUI can invoke any thrunt-tools.cjs command and receive parsed JSON results without loading CJS modules in-process
  2. TUI correctly handles the @file: large-output protocol for payloads exceeding 50KB
  3. TUI displays current hunt phase, plan, status, and progress by reading .planning/ files through the state adapter
  4. TUI re-renders within 500ms when an external process modifies .planning/ files (no restart required)
  5. TUI can stream subprocess stdout line-by-line for long-running commands
**Plans:** 2/2 plans complete

Plans:
- [ ] 23-01-PLAN.md — Subprocess executor with @file: protocol, path resolver, and NDJSON streaming
- [ ] 23-02-PLAN.md — State adapter, file watcher with debounce, and AppState integration

### Phase 24: Hunt Observation Screens
**Goal**: Operators can observe all hunt state -- dashboard, phase navigation, evidence, detections, connectors, and packs -- through the TUI without touching the CLI
**Depends on**: Phase 23 (bridge core, state adapter, watcher)
**Requirements**: BRIDGE-05, HUNT-01, HUNT-02, HUNT-04, HUNT-05, HUNT-06, HUNT-07
**Success Criteria** (what must be TRUE):
  1. Operator sees hunt status dashboard showing current phase, plan, progress percentage, and any blockers from STATE.md
  2. Operator can navigate through HUNTMAP phases, select any phase, and drill into its plan details
  3. Operator can open an evidence manifest, see its artifacts, and verify chain-of-custody integrity status
  4. Operator can view detection candidates with ATT&CK technique IDs and promotion scores
  5. Operator can check connector configuration status, see which connectors are healthy, and browse available hunt packs with details
**Plans:** 3/3 plans complete

Plans:
- [ ] 24-01-PLAN.md — Domain bridge modules (evidence, detection, pack, connector, huntmap) and TUI type infrastructure
- [ ] 24-02-PLAN.md — Dashboard rewrite, phase navigation screen, and evidence manifest viewer
- [ ] 24-03-PLAN.md — Detection candidates, connector status, and pack browser screens

### Phase 25: Execution & Verification
**Goal**: Operators can trigger query execution from the TUI and the system automatically verifies evidence integrity and receipt completeness after agent runs
**Depends on**: Phase 24 (domain modules, screen infrastructure)
**Requirements**: HUNT-03, GATE-01, GATE-02
**Success Criteria** (what must be TRUE):
  1. Operator can select a query, trigger execution from the console, and see results stream in as they arrive
  2. After agent execution, the gate framework automatically checks evidence manifest SHA-256 hashes and reports pass/fail
  3. After agent execution, the gate framework verifies that every query has a receipt linked to evidence and reports any gaps in the chain
**Plans:** 1/2 plans executed

Plans:
- [ ] 25-01-PLAN.md — Runtime bridge module, THRUNT gate implementations, and gate registry rewiring
- [ ] 25-02-PLAN.md — TUI execution dispatch, streaming display, gate auto-trigger, status bar indicator, and gate overlay

### Phase 26: Rebrand & Dead Code Removal
**Goal**: The codebase carries zero ClawdStrike references and all dead modules are removed, leaving a clean THRUNT GOD identity
**Depends on**: Phase 25 (all screens wired and stable before cleanup)
**Requirements**: BRAND-01, BRAND-02, BRAND-03, BRAND-04, BRAND-05, BRAND-06, BRAND-07
**Success Criteria** (what must be TRUE):
  1. Zero occurrences of "ClawdStrike", "clawdstrike", "CLAWDSTRIKE" in any source file, config, or string literal
  2. Theme renders with THRUNT GOD branding (logo, header text, color identity) on every screen
  3. All environment variables use THRUNT_* prefix; no CLAWDSTRIKE_* variables referenced anywhere
  4. The hushd/, beads/, desktop-agent/, and speculate/voting modules are deleted and no import references remain
  5. The application starts cleanly with no dead-code warnings or missing-module errors
**Plans**: TBD

Plans:
- [ ] 26-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 23 -> 24 -> 25 -> 26

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Bridge Foundation | 2/2 | Complete    | 2026-03-29 |
| 24. Hunt Observation Screens | 3/3 | Complete    | 2026-03-29 |
| 25. Execution & Verification | 1/2 | In Progress|  |
| 26. Rebrand & Dead Code Removal | 0/? | Not started | - |
