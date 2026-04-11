# Requirements: THRUNT God Obsidian Plugin

**Defined:** 2026-04-11
**Core Value:** Hunters can see hunt state at a glance and navigate THRUNT workspaces from Obsidian without leaving the vault.

## v3.2 Requirements

Requirements for v3.2 Obsidian Workspace Companion. Each maps to roadmap phases.

### Architecture

- [x] **ARCH-01**: Plugin codebase uses a single canonical artifact registry (artifacts.ts) with no duplicate definitions
- [x] **ARCH-02**: Path resolution is extracted into pure functions testable without Obsidian runtime
- [x] **ARCH-03**: Vault operations are abstracted behind a VaultAdapter interface with a testable stub
- [ ] **ARCH-04**: Plugin class (main.ts) contains only lifecycle, registration, and event wiring
- [ ] **ARCH-05**: View receives a ViewModel and renders it without direct vault calls
- [ ] **ARCH-06**: Pure modules (artifacts.ts, paths.ts, types.ts) have unit tests via vitest
- [ ] **ARCH-07**: Obsidian dependency is pinned to a compatible range in package.json

### Workspace Detection

- [x] **DETECT-01**: Plugin distinguishes healthy (5/5 artifacts), partial (1-4 artifacts), and missing (no folder) workspace states
- [ ] **DETECT-02**: Status bar displays workspace state with artifact count (e.g., "THRUNT .planning (3/5)")
- [ ] **DETECT-03**: Sidebar view reflects all three workspace states with appropriate guidance text
- [ ] **DETECT-04**: Workspace status updates reactively on vault events (create, delete, rename) without requiring reload

### Artifact Navigation

- [ ] **NAV-01**: All 5 core artifacts (MISSION, HYPOTHESES, HUNTMAP, STATE, FINDINGS) have command palette entries
- [ ] **NAV-02**: User can open any existing artifact from the sidebar with one click
- [ ] **NAV-03**: User can create a missing artifact from the sidebar, which opens the new file after creation
- [x] **NAV-04**: Idempotent bootstrap command creates all 5 missing artifacts without overwriting existing files
- [ ] **NAV-05**: Commands show a Notice with guidance when the target file does not exist

### Hunt State Parsing

- [ ] **PARSE-01**: Plugin parses STATE.md to extract current phase, blockers, and next actions
- [ ] **PARSE-02**: Plugin parses HYPOTHESES.md table to extract validated, pending, and rejected hypothesis counts
- [ ] **PARSE-03**: Plugin detects phase-XX/ directories under the planning directory and reports count and latest
- [ ] **PARSE-04**: Malformed or missing STATE.md/HYPOTHESES.md degrades to "unknown" / zero counts, never crashes
- [ ] **PARSE-05**: Parsers strip YAML frontmatter before scanning to prevent false positives
- [ ] **PARSE-06**: Parsers are pure functions testable without Obsidian runtime

### View & Templates

- [ ] **VIEW-01**: Sidebar displays a compact hunt status card with phase, blockers, next action, and hypothesis scoreboard
- [ ] **VIEW-02**: Status bar shows live hunt state when STATE.md is parseable (e.g., "Phase 3 | 2/5 hypotheses active | 1 blocker")
- [ ] **VIEW-03**: Rendering errors show an error state with retry button, never a blank panel
- [ ] **VIEW-04**: Starter templates include YAML frontmatter with thrunt-artifact, hunt-id, and updated properties
- [ ] **VIEW-05**: Starter templates include wiki-links between related artifacts (e.g., HUNTMAP links to STATE and HYPOTHESES)
- [ ] **VIEW-06**: Hero marketing card is replaced with data-dense hunt status display

## Future Requirements

Deferred beyond v3.2. Tracked but not in current roadmap.

### Obsidian-Native Integration

- **NATIVE-01**: Graph view integration — artifact nodes identifiable as a subgraph cluster
- **NATIVE-02**: Dataview compatibility — frontmatter properties enable Dataview queries
- **NATIVE-03**: Canvas template — pre-placed artifact cards with connection arrows
- **NATIVE-04**: Hypothesis lifecycle commands — transition rows from pending to validated/rejected

### Multi-Workspace

- **MULTI-01**: Detect multiple planning directories within a single vault
- **MULTI-02**: Switch between workspaces from the sidebar

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CLI handoff / process launching | Obsidian is a knowledge tool, not a process orchestrator. Security risk from shell injection. |
| Background sync / polling | Vault events are sufficient. Background sync creates invisible state drift. |
| VS Code extension parity | Different platform strengths. Parity leads to lowest-common-denominator design. |
| Hidden state / SQLite cache | Violates markdown-as-truth principle. Every value must trace to a vault file. |
| Bidirectional CLI sync | No silent writeback from CLI runs into vault files. |
| Live streaming dashboards | Deferred until vault model is stable. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 63 | Complete |
| ARCH-02 | Phase 63 | Complete |
| ARCH-03 | Phase 63 | Complete |
| ARCH-04 | Phase 63 | Pending |
| ARCH-05 | Phase 63 | Pending |
| ARCH-06 | Phase 63 | Pending |
| ARCH-07 | Phase 63 | Pending |
| DETECT-01 | Phase 63 | Complete |
| DETECT-02 | Phase 63 | Pending |
| DETECT-03 | Phase 63 | Pending |
| DETECT-04 | Phase 63 | Pending |
| NAV-01 | Phase 63 | Pending |
| NAV-02 | Phase 63 | Pending |
| NAV-03 | Phase 63 | Pending |
| NAV-04 | Phase 63 | Complete |
| NAV-05 | Phase 63 | Pending |
| PARSE-01 | Phase 64 | Pending |
| PARSE-02 | Phase 64 | Pending |
| PARSE-03 | Phase 64 | Pending |
| PARSE-04 | Phase 64 | Pending |
| PARSE-05 | Phase 64 | Pending |
| PARSE-06 | Phase 64 | Pending |
| VIEW-01 | Phase 64 | Pending |
| VIEW-02 | Phase 64 | Pending |
| VIEW-03 | Phase 63 | Pending |
| VIEW-04 | Phase 64 | Pending |
| VIEW-05 | Phase 64 | Pending |
| VIEW-06 | Phase 64 | Pending |

**Coverage:**
- v3.2 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation*
