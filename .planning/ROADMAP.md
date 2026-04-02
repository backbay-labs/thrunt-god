# Roadmap: Patent-Inspired Log Intelligence

## Milestones

- ✅ **v1.0 Patent-Inspired Log Intelligence** -- Phases 1-6 (shipped 2026-04-01)
- 🚧 **v2.0 THRUNT God VS Code Extension** -- Phases 7-11 (in progress)

## Phases

<details>
<summary>✅ v1.0 Patent-Inspired Log Intelligence (Phases 1-6) -- SHIPPED 2026-04-01</summary>

- [x] Phase 1: Dataset-Aware Query Defaults (2/2 plans) -- completed 2026-03-31
- [x] Phase 2: Event Deduplication (1/1 plans) -- completed 2026-03-31
- [x] Phase 3: Drain Parser (2/2 plans) -- completed 2026-03-31
- [x] Phase 4: Reduce Stage (2/2 plans) -- completed 2026-04-01
- [x] Phase 5: Anomaly Framing and Pack Progressions (2/2 plans) -- completed 2026-04-01
- [x] Phase 6: Validator Enhancement and Test Suite (3/3 plans) -- completed 2026-04-01

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v2.0 THRUNT God VS Code Extension (In Progress)

**Milestone Goal:** Build a VS Code extension that provides a read-heavy visualization layer over `.planning/` hunt artifacts -- turning raw markdown into a live investigation dashboard with template clustering, evidence graphs, and integrity diagnostics.

**Phase Numbering:**
- Integer phases (7, 8, ...): Planned milestone work
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 7: Extension Scaffold and Build Infrastructure** - Working extension skeleton with dual CJS/ESM esbuild, activation, test harness, and packaging
- [x] **Phase 8: Artifact Parsers, File Watcher, and Data Store** - Reactive data pipeline: filesystem watcher, 8 artifact parsers, cross-artifact indexed store
- [ ] **Phase 9: Hunt Sidebar, Status Bar, and CodeLens** - Native VS Code UI: semantic investigation tree, hunt progress indicator, inline score annotations
- [ ] **Phase 10: Evidence Integrity Diagnostics** - Anti-pattern detection surfaced in VS Code Problems panel with quick-fix scaffolds
- [ ] **Phase 11: Webview Bridge and Drain Template Viewer** - Type-safe host/webview messaging and Preact + Observable Plot stacked bar visualization

## Phase Details

### Phase 7: Extension Scaffold and Build Infrastructure
**Goal**: A developer can clone the repo, build the extension, install it in VS Code, and see it activate on a hunt workspace -- with dual CJS/ESM bundling and a test harness ready for all future phases
**Depends on**: Nothing (first phase of v2.0; builds on v1.0 CLI codebase)
**Requirements**: BUILD-01, BUILD-02, BUILD-03, BUILD-04, BUILD-05
**Success Criteria** (what must be TRUE):
  1. Extension activates when VS Code opens a workspace containing `.hunt/MISSION.md` or `.planning/MISSION.md`, and does nothing in other workspaces
  2. `npm run build` produces two bundles (CJS for extension host, ESM for webview) in under 1 second, and `require('./dist/extension.js')` succeeds in a CI smoke test
  3. `npm run test` executes unit tests via `node:test` and integration tests via `@vscode/test-cli` with no configuration conflicts
  4. Published `.vsix` excludes source files, tests, design docs, and research -- only dist bundles, package.json, and manifest are included
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Extension project scaffold with dual CJS/ESM esbuild bundling, activation, and .vsix packaging
- [ ] 07-02-PLAN.md -- Three-tier test harness: unit (node:test), integration (@vscode/test-cli), CI smoke test

### Phase 8: Artifact Parsers, File Watcher, and Data Store
**Goal**: The extension reactively parses all `.planning/` artifacts into typed data structures and maintains a cross-indexed, event-driven store that all UI features subscribe to
**Depends on**: Phase 7 (needs working extension scaffold, build pipeline, and test harness)
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06, STORE-01, STORE-02, STORE-03, STORE-04, STORE-05
**Success Criteria** (what must be TRUE):
  1. Each of 8 artifact types (Mission, Hypotheses, HuntMap, State, Query, Receipt, EvidenceReview, PhaseSummary) is parsed into a typed `ParseResult<T>` with correct frontmatter and body extraction
  2. Malformed or half-written artifacts produce a `ParseResult` in `error` or `loading` state with a diagnostic warning -- never a crash, never a silent swallow
  3. Query parser extracts Drain template metadata (template_id, template text, count, event_ids) and Receipt parser extracts anomaly framing fields (deviation score 0-6, baseline, prediction, observation)
  4. When a `.planning/` file changes on disk, the store updates within 800ms (300ms debounce + 500ms batch window) and emits a typed change event -- without triggering N+1 re-parses during rapid multi-file writes
  5. Cross-artifact indexes resolve receipt-to-query, receipt-to-hypothesis, and query-to-phase relationships so downstream UI providers can traverse the investigation graph
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md -- Types, base parser, 6 simple artifact parsers (Mission, Hypotheses, HuntMap, State, EvidenceReview, PhaseSummary) with unit tests
- [x] 08-02-PLAN.md -- Query parser (Drain template extraction) and Receipt parser (anomaly framing extraction) with parser barrel index
- [x] 08-03-PLAN.md -- ArtifactWatcher, HuntDataStore with cross-artifact indexes and batch coalescing, extension activation wiring

### Phase 9: Hunt Sidebar, Status Bar, and CodeLens
**Goal**: Hunters navigate the investigation through a semantic sidebar tree, see hunt progress in the status bar, and read inline deviation scores and template counts via CodeLens -- all powered by store subscriptions
**Depends on**: Phase 8 (needs parsed artifacts and reactive store)
**Requirements**: SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06, SIDE-07, SIDE-08, STATUS-01, STATUS-02, STATUS-03, STATUS-04, STATUS-05
**Success Criteria** (what must be TRUE):
  1. Sidebar shows a semantic investigation tree (Mission root, Hypotheses with verdict badges, Phases with status indicators, Queries and Receipts with deviation score badges) -- not a raw file listing
  2. Double-clicking any sidebar node opens the corresponding `.planning/` artifact in the VS Code editor, and right-click context menu provides "Open Artifact", "Reveal in Explorer", and "Copy Path"
  3. Status bar displays hunt identity and current phase progress (e.g., "THRUNT: Phase 3/7"), and pulses with warning color when any receipt has a critical deviation score (5-6)
  4. CodeLens annotations appear above claim sections in receipt files (showing deviation score) and above result summary sections in query files (showing template count), and clicking them navigates to the relevant detail
  5. When no hunt is detected in the workspace, the sidebar shows an empty state message and the status bar item is hidden
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD
- [ ] 09-03: TBD

### Phase 10: Evidence Integrity Diagnostics
**Goal**: The extension surfaces evidence quality problems as native VS Code diagnostics so hunters catch anti-patterns during active investigation rather than during review
**Depends on**: Phase 8 (needs parsed artifacts and store batch window); Phase 9 is not required but typically completes first
**Requirements**: DIAG-01, DIAG-02, DIAG-03, DIAG-04, DIAG-05
**Success Criteria** (what must be TRUE):
  1. All 7 anti-pattern checks (post-hoc rationalization, missing baseline, score inflation, temporal gaps, causality without evidence, missing prediction, unsupported claim) appear as diagnostics in the VS Code Problems panel on the relevant receipt/evidence files
  2. Diagnostic severity maps correctly: Error for unsupported claims, Warning for missing sections (baseline, prediction), Info for style improvements
  3. Quick-fix CodeActions on Warning-level diagnostics insert structured scaffold templates (e.g., a prediction section template, a baseline section template) at the correct location in the file
  4. Diagnostics update only after the store's batch window completes -- no false positives flash during rapid multi-file writes from the CLI
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

### Phase 11: Webview Bridge and Drain Template Viewer
**Goal**: Hunters can open a stacked bar visualization of Drain template clustering for any query, interact with template segments, and compare distributions -- all rendered in a theme-aware Preact webview communicating with the extension host via type-safe messaging
**Depends on**: Phase 8 (needs parsed query data with template metadata); Phase 7 (needs ESM webview bundle)
**Requirements**: BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04, DRAIN-01, DRAIN-02, DRAIN-03, DRAIN-04, DRAIN-05, DRAIN-06, DRAIN-07, DRAIN-08
**Success Criteria** (what must be TRUE):
  1. Hunter opens a Drain Template Viewer panel from the sidebar context menu or command palette for any query that has template metadata, and sees a horizontal stacked bar chart showing template distribution (event count per template, proportional width)
  2. Hovering a bar segment shows a tooltip with template text, event count, and percentage; clicking a segment opens a detail pane with full template text, sample events, and event IDs
  3. Webview renders correctly across all four VS Code themes (Dark, Light, HC Dark, HC Light) using `--vscode-*` CSS variables, and CSP is configured with `'unsafe-inline'` in `style-src` for Observable Plot SVG rendering
  4. Template pins persist across queries via VS Code `workspaceState` (not filesystem), and webview state (selected template, scroll position) persists across hide/show cycles via `getState()`/`setState()`
  5. Extension host and webview communicate via a type-safe `postMessage` protocol where host sends pre-computed view models and webview sends navigation requests, and all event listeners are cleaned up on panel dispose (no MaxListenersExceededWarning)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD
- [ ] 11-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Dataset-Aware Query Defaults | v1.0 | 2/2 | Complete | 2026-03-31 |
| 2. Event Deduplication | v1.0 | 1/1 | Complete | 2026-03-31 |
| 3. Drain Parser | v1.0 | 2/2 | Complete | 2026-03-31 |
| 4. Reduce Stage | v1.0 | 2/2 | Complete | 2026-04-01 |
| 5. Anomaly Framing and Pack Progressions | v1.0 | 2/2 | Complete | 2026-04-01 |
| 6. Validator Enhancement and Test Suite | v1.0 | 3/3 | Complete | 2026-04-01 |
| 7. Extension Scaffold and Build Infrastructure | v2.0 | 2/2 | Complete | 2026-04-02 |
| 8. Artifact Parsers, File Watcher, and Data Store | v2.0 | 2/3 | In Progress | - |
| 9. Hunt Sidebar, Status Bar, and CodeLens | v2.0 | 0/0 | Not started | - |
| 10. Evidence Integrity Diagnostics | v2.0 | 0/0 | Not started | - |
| 11. Webview Bridge and Drain Template Viewer | v2.0 | 0/0 | Not started | - |
