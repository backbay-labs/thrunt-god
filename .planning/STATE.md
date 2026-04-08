---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Advanced Hunt Features
status: executing
stopped_at: Completed 55-01-PLAN.md
last_updated: "2026-04-08T19:14:34.371Z"
last_activity: 2026-04-08 -- Phase 55 Plan 01 complete (coverage.cjs data layer with threat profiles + comparison + suggestions)
progress:
  total_phases: 15
  completed_phases: 12
  total_plans: 26
  completed_plans: 25
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v3.0 Hunt Program Intelligence — Phase 55: Detection Coverage & Gap Analysis

## Current Milestone: v3.0 Hunt Program Intelligence

**Goal:** Restructure program/case hierarchy, build unified MCP server for ATT&CK + Sigma + detection intelligence, enable cross-case memory and knowledge graph persistence.

## Current Position

Phase: 55 of 57 (Detection Coverage & Gap Analysis)
Plan: 1 of 2 plans in phase
Status: In Progress (1/2 plans complete)
Last activity: 2026-04-08 -- Phase 55 Plan 01 complete (coverage.cjs data layer with threat profiles + comparison + suggestions)

Progress: [██████████] 96% (v3.0 Phase 55: 1/2 plans)

## Accumulated Context

### Decisions

- v3.0 Architecture: Option C — unified MCP (@thrunt/mcp-hunt-intel) + native CLI for case memory
- MCP transport: stdio for CLI, optional HTTP wrapper for VS Code extension
- SQLite: dual — per-program DB in .planning/, global ~/.thrunt/intel.db for ATT&CK/Sigma
- Sigma rules: bundle SigmaHQ core rules + support SIGMA_PATHS/SPLUNK_PATHS/ELASTIC_PATHS env vars
- Case memory: global search with program filter (cross-program discovery)
- Knowledge graph: same SQLite DB as detections (co-located for joins)
- Phase 50 MUST complete before any other v3.0 phase (cases/ path resolution is a universal dependency)
- planningDir/planningPaths: case takes precedence over workstream when both provided
- THRUNT_CASE env var checked before THRUNT_WORKSTREAM in fallback chain
- .active-case pointer file at .planning/.active-case (dot-prefixed)
- programState key always resolves to root STATE.md; state key resolves to scoped directory
- case_roster stored in STATE.md frontmatter as array-of-objects, not in separate file
- syncStateFrontmatter preserves existing case_roster to prevent data loss during state sync
- cmdCaseNew uses setActiveCase to auto-switch context to newly created case
- cmdCaseClose clears .active-case pointer if the closed case was active
- [Phase 50]: case_roster stored in STATE.md frontmatter as array-of-objects, not in separate file
- [Phase 50]: syncStateFrontmatter preserves existing case_roster to prevent data loss during sync
- [Phase 50]: cmdCaseNew auto-sets .active-case pointer; cmdCaseClose clears it if active
- [Phase 50]: migrate-case is a top-level command (not under 'case' subgroup) per CONTEXT.md decision
- [Phase 50]: Roster and active-case pointer updates are non-fatal after successful migration file moves
- [Phase 51]: stripCasePrefix applied in toArtifactRelativePath (not resolveArtifactType) so all downstream consumers automatically work for case artifacts
- [Phase 51]: cmdProgramRollup replaces entire body below frontmatter for idempotent re-generation
- [Phase 51]: Stale threshold: 14 days with no activity for active cases
- [Phase 51]: deriveProgramDashboard placed on HuntDataStore class alongside existing derive methods for consistent store-driven pattern
- [Phase 51]: uniqueTechniques set to 0 as placeholder -- technique data requires file reads the store doesn't currently do
- [Phase 51]: case:open navigates to MISSION.md file via vscode.open rather than opening a new workspace window
- [Phase 52]: IOC extraction uses cascading hash regex (SHA256 first, then SHA1, then MD5) to avoid substring false positives
- [Phase 52]: parseHypotheses splits on ## or ### headings into individual artifact rows for granular FTS matching
- [Phase 52]: All IOCs stored as single ioc artifact row with type prefixes (ip:, md5:, sha256:) rather than individual rows
- [Phase 52]: IOC extraction uses cascading hash regex (SHA256 first, then SHA1, then MD5) to avoid substring false positives
- [Phase 52]: db.cjs require made lazy in commands.cjs (try/catch) for environments without better-sqlite3
- [Phase 52]: cmdCaseNew FTS query OR-joins name tokens for broader matching (AND too restrictive)
- [Phase 52]: Parent technique IDs expanded to sub-techniques via DB LIKE query for overlap matching
- [Phase 53]: Regular FTS5 (not external content) for techniques_fts since intel.db data is write-once/immutable
- [Phase 53]: FTS5 includes id column for direct join to techniques table without rowid
- [Phase 53]: Sub-techniques inherit parent description, tactic, platforms, data_sources from bundled JSON
- [Phase 53]: openIntelDb(opts) accepts dbDir/dbPath for test isolation (never touches ~/.thrunt/ in tests)
- [Phase 53]: MCP SDK StdioServerTransport accepts newline-delimited JSON (not Content-Length framing)
- [Phase 53]: Tool handler functions exported from tools.cjs for direct unit testing
- [Phase 53]: generate_layer coverage/gap modes use try/catch on detections table for Phase 54 graceful degradation
- [Phase 53]: lookup_group supports both ID (G0007) and name/alias (APT28) via LIKE fallback
- [Phase 54]: Regular FTS5 (not external content) for detections_fts -- consistent with techniques_fts from Phase 53
- [Phase 54]: FTS search joins on rowid between detections and detections_fts for BM25-ranked retrieval
- [Phase 54]: KQL parser uses regex heuristic for generic code blocks (where|project|summarize|extend|DeviceEvents)
- [Phase 54]: Elastic TOML parser iterates all [[rule.threat]] entries including nested subtechniques
- [Phase 54]: Directory indexers skip entries with empty IDs (format prefix only) to prevent bad data
- [Phase 54]: Lazy require pattern for detections module in intel.cjs (getDetections() avoids circular dependency)
- [Phase 54]: SigmaHQ core rules bundled from r2026-01-01 release (1378 rules across 9 categories)
- [Phase 54]: populateDetectionsIfEmpty called after populateIfEmpty in openIntelDb to ensure ATT&CK data loads first
- [Phase 55]: THREAT_PROFILES defined as plain JS constant object with 6 named profiles of curated technique ID arrays
- [Phase 55]: compareDetections uses LIKE query on technique_ids column for flexible sub-technique matching
- [Phase 55]: suggestDetections finds sibling techniques in same tactic via getTechniquesByTactic, limits to 10 similar rules
- [Phase 55]: Free-text input to compareDetections uses techniques_fts for FTS lookup then compares first match

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-08T19:14:28.788Z
Stopped at: Completed 55-01-PLAN.md
Resume: Phase 55 Plan 01 complete. coverage.cjs exports 5 functions: THREAT_PROFILES (6 profiles), getThreatProfile, listThreatProfiles, compareDetections (per-source breakdown), suggestDetections (tactic-family suggestions). 21 tests pass. Ready for 55-02 to wire MCP tools (compare_detections, suggest_detections).
