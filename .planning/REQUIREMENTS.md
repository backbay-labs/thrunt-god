# Requirements: THRUNT God VS Code Extension

**Defined:** 2026-04-02
**Core Value:** Surface hidden structure in security telemetry so interesting events become obvious without requiring hunters to write perfect queries -- now as a live visualization layer inside VS Code.

## v2.0 Requirements

Requirements for the VS Code extension. Each maps to roadmap phases.

### Build Infrastructure

- [x] **BUILD-01**: Extension activates when workspace contains `.hunt/MISSION.md` or `.planning/MISSION.md`
- [x] **BUILD-02**: esbuild produces dual bundles -- CJS for extension host, ESM for webview -- in sub-second builds
- [x] **BUILD-03**: CI smoke test validates `require('./dist/extension.js')` succeeds (catches CJS/ESM collision)
- [x] **BUILD-04**: `.vscodeignore` excludes source, tests, and design docs from published `.vsix`
- [x] **BUILD-05**: Unit tests run via `node:test` for parsers/store; integration tests run via `@vscode/test-cli` for VS Code providers

### Artifact Parsers

- [ ] **PARSE-01**: Parser extracts YAML frontmatter and markdown body from all `.planning/` artifact types
- [ ] **PARSE-02**: Parser produces typed `ParseResult<T>` with `loaded | error | loading | missing` states
- [ ] **PARSE-03**: Parser handles malformed/half-written artifacts gracefully (partial parse, warning, no crash)
- [ ] **PARSE-04**: 8 artifact-type parsers: Mission, Hypotheses, HuntMap, State, Query, Receipt, EvidenceReview, PhaseSummary
- [ ] **PARSE-05**: Query parser extracts Drain template metadata (template_id, template text, count, event_ids) from embedded JSON/tables
- [ ] **PARSE-06**: Receipt parser extracts anomaly framing (baseline, prediction, observation, deviation score 0-6, pack progression match)

### File Watcher & Store

- [ ] **STORE-01**: ArtifactWatcher monitors `.planning/` with per-file 300ms debounce and mtime/size stability check
- [ ] **STORE-02**: HuntDataStore maintains cross-artifact indexes (receipt→query, receipt→hypothesis, query→phase)
- [ ] **STORE-03**: Store implements 500ms batch collection window to coalesce rapid file changes into single index rebuild
- [ ] **STORE-04**: Store emits typed change events that UI providers subscribe to (never subscribe to filesystem directly)
- [ ] **STORE-05**: Two-level parse cache: frontmatter always cached, body parsed on demand with LRU eviction

### Webview Bridge

- [ ] **BRIDGE-01**: Type-safe postMessage protocol between extension host and webview panels
- [ ] **BRIDGE-02**: Host→webview messages deliver pre-computed view models (webview is a dumb render surface)
- [ ] **BRIDGE-03**: Webview→host messages handle navigation requests (open artifact in editor)
- [ ] **BRIDGE-04**: Bridge cleans up event listeners on panel dispose (prevents MaxListenersExceededWarning)

### Hunt Sidebar

- [ ] **SIDE-01**: Semantic tree structure: Mission (root) → Hypotheses → Phases → Queries/Receipts (not a file tree)
- [ ] **SIDE-02**: Hypothesis nodes show verdict badges (Supported/Disproved/Inconclusive/Open) with color-coded icons
- [ ] **SIDE-03**: Receipt nodes show deviation score as color-coded badge (0-2 green, 3-4 yellow, 5-6 red)
- [ ] **SIDE-04**: Phase nodes show status indicator (planned/running/complete)
- [ ] **SIDE-05**: Double-click any tree node opens the corresponding artifact in the editor
- [ ] **SIDE-06**: Context menu on nodes: "Open Artifact", "Reveal in Explorer", "Copy Path"
- [ ] **SIDE-07**: Empty state shown when no hunt detected in workspace
- [ ] **SIDE-08**: Sidebar works at narrow widths (240px minimum)

### Evidence Integrity Diagnostics

- [ ] **DIAG-01**: 7 anti-pattern checks surfaced as VS Code diagnostics in the Problems panel
- [ ] **DIAG-02**: Anti-patterns detected: post-hoc rationalization, missing baseline, score inflation, temporal gaps, causality without evidence, missing prediction, unsupported claim
- [ ] **DIAG-03**: Diagnostic severity: Error for unsupported claims, Warning for missing sections, Info for style improvements
- [ ] **DIAG-04**: Quick-fix CodeActions insert structured scaffold templates (prediction section, baseline section)
- [ ] **DIAG-05**: Diagnostics update after store batch window completes (no false positives during rapid writes)

### Status Bar & CodeLens

- [ ] **STATUS-01**: Status bar item shows hunt identity and current phase progress (e.g., "THRUNT: Phase 3/7")
- [ ] **STATUS-02**: Status bar pulses with warning color when any receipt has deviation score 5-6 (critical alert)
- [ ] **STATUS-03**: CodeLens on receipt files shows deviation score above claim sections
- [ ] **STATUS-04**: CodeLens on query files shows template count above result summary sections
- [ ] **STATUS-05**: Clicking CodeLens annotation navigates to the relevant detail (receipt claim, query templates)

### Drain Template Viewer

- [ ] **DRAIN-01**: Webview panel opens from sidebar context menu or command palette for any query with templates
- [ ] **DRAIN-02**: Horizontal stacked bar chart shows template distribution (event count per template, proportional width)
- [ ] **DRAIN-03**: Hover on template bar segment shows tooltip: template text, event count, percentage
- [ ] **DRAIN-04**: Click on template bar segment shows detail pane with full template text, sample events, event IDs
- [ ] **DRAIN-05**: Template pinning persists across queries via VS Code workspaceState (not filesystem)
- [ ] **DRAIN-06**: Theme-aware rendering using `--vscode-*` CSS variables (Dark, Light, HC Dark, HC Light)
- [ ] **DRAIN-07**: Webview state persists across hide/show cycles via `getState()`/`setState()`
- [ ] **DRAIN-08**: CSP configured with `'unsafe-inline'` in `style-src` for Observable Plot SVG rendering

## v2.1 Requirements

Deferred to next minor release. Tracked but not in current roadmap.

### Template Comparison

- **COMP-01**: Side-by-side stacked bars from two queries showing template distribution changes
- **COMP-02**: Template presence matrix across all queries in a phase

### Evidence Graph

- **GRAPH-01**: DAG visualization of hypothesis → receipt → query lineage
- **GRAPH-02**: Node colors encode verdict/score, edge types encode "supported by"/"contradicted by"

### Multi-Source Timeline

- **TIME-01**: Unified timeline with swimlanes by connector/entity
- **TIME-02**: Drain template overlay bands showing distribution over time

### Enhanced Interactions

- **INTERACT-01**: IOC quick-entry and propagation across views
- **INTERACT-02**: Cross-hunt template search
- **INTERACT-03**: Artifact-level search within the extension

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CLI execution bridge | Extension is a viewer, not a CLI wrapper. IPC adds coupling. |
| Write operations to .planning/ | Read-only in v2.0. Keeps extension simple and reliable. |
| Multi-hunt workspace | A hunter works one hunt at a time. Single hunt scope. |
| Embedding/vector features | thrunt-god stays zero-dependency for ML/AI |
| Mobile/web extension | Desktop VS Code only for v2.0 |
| WebviewPanelSerializer | Adds startup race conditions. Panels re-opened manually. |
| Virtual scrolling | Premature -- 50 templates = 50 rows. Add if profiling shows lag. |
| Sparklines in TreeView | Infeasible: TreeItem.description accepts only plain strings. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUILD-01 | Phase 7 | Complete |
| BUILD-02 | Phase 7 | Complete |
| BUILD-03 | Phase 7 | Complete |
| BUILD-04 | Phase 7 | Complete |
| BUILD-05 | Phase 7 | Complete |
| PARSE-01 | Phase 8 | Pending |
| PARSE-02 | Phase 8 | Pending |
| PARSE-03 | Phase 8 | Pending |
| PARSE-04 | Phase 8 | Pending |
| PARSE-05 | Phase 8 | Pending |
| PARSE-06 | Phase 8 | Pending |
| STORE-01 | Phase 8 | Pending |
| STORE-02 | Phase 8 | Pending |
| STORE-03 | Phase 8 | Pending |
| STORE-04 | Phase 8 | Pending |
| STORE-05 | Phase 8 | Pending |
| SIDE-01 | Phase 9 | Pending |
| SIDE-02 | Phase 9 | Pending |
| SIDE-03 | Phase 9 | Pending |
| SIDE-04 | Phase 9 | Pending |
| SIDE-05 | Phase 9 | Pending |
| SIDE-06 | Phase 9 | Pending |
| SIDE-07 | Phase 9 | Pending |
| SIDE-08 | Phase 9 | Pending |
| STATUS-01 | Phase 9 | Pending |
| STATUS-02 | Phase 9 | Pending |
| STATUS-03 | Phase 9 | Pending |
| STATUS-04 | Phase 9 | Pending |
| STATUS-05 | Phase 9 | Pending |
| DIAG-01 | Phase 10 | Pending |
| DIAG-02 | Phase 10 | Pending |
| DIAG-03 | Phase 10 | Pending |
| DIAG-04 | Phase 10 | Pending |
| DIAG-05 | Phase 10 | Pending |
| BRIDGE-01 | Phase 11 | Pending |
| BRIDGE-02 | Phase 11 | Pending |
| BRIDGE-03 | Phase 11 | Pending |
| BRIDGE-04 | Phase 11 | Pending |
| DRAIN-01 | Phase 11 | Pending |
| DRAIN-02 | Phase 11 | Pending |
| DRAIN-03 | Phase 11 | Pending |
| DRAIN-04 | Phase 11 | Pending |
| DRAIN-05 | Phase 11 | Pending |
| DRAIN-06 | Phase 11 | Pending |
| DRAIN-07 | Phase 11 | Pending |
| DRAIN-08 | Phase 11 | Pending |

**Coverage:**
- v2.0 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation (traceability populated)*
