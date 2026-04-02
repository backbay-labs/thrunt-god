---
phase: 08-artifact-parsers-file-watcher-and-data-store
plan: 03
subsystem: data-layer
tags: [file-watcher, data-store, event-emitter, lru-cache, batch-coalescing, cross-artifact-indexes, typescript]

# Dependency graph
requires:
  - phase: 08-02
    provides: 8 artifact parsers, parseArtifact dispatch, extractFrontmatter
provides:
  - ArtifactWatcher with per-file 300ms debounce and mtime/size stability check
  - HuntDataStore with cross-artifact indexes (receipt-to-query, receipt-to-hypothesis, query-to-phase)
  - 500ms batch collection window coalescing rapid file changes into single index rebuild
  - Two-level parse cache (frontmatter always retained, body with 10-slot LRU eviction)
  - Typed ArtifactChangeEvent emission via VS Code EventEmitter
  - Extension activation wiring (watcher + store created after hunt root detection)
  - 22 new unit tests for store, indexes, batch coalescing, LRU cache, event emission
affects: [09-native-ui-providers, 10-diagnostics-and-commands, 11-webview-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [WatcherLike interface for testable dependency injection, mock watcher with fire() for test-driven store testing, fallback probing for readDirectory unavailability, raw content cache for on-demand re-parsing on body cache miss]

key-files:
  created:
    - thrunt-god-vscode/src/watcher.ts
    - thrunt-god-vscode/src/store.ts
    - thrunt-god-vscode/test/unit/store.test.cjs
  modified:
    - thrunt-god-vscode/src/extension.ts
    - thrunt-god-vscode/test/_setup/vscode-mock.cjs

key-decisions:
  - "WatcherLike interface decouples store from concrete ArtifactWatcher for testability"
  - "Raw content cache retained alongside body cache enables on-demand re-parsing on LRU miss without filesystem access"
  - "Fallback probing of known artifact paths when readDirectory unavailable (mock environments)"
  - "Query-to-phase index uses hypothesis ID heuristic (HYP-01 -> phase 1) through receipt chain"

patterns-established:
  - "Mock watcher pattern: EventEmitter with fire() method for test-driven store testing"
  - "populateMockFiles helper: pre-loads vscode._mockFiles from test fixtures for store tests"
  - "Two-level cache: frontmatter never evicted, body with LRU -- getters re-parse from raw on miss"

requirements-completed: [STORE-01, STORE-02, STORE-03, STORE-04, STORE-05]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 8 Plan 3: File Watcher and Data Store Summary

**Reactive data pipeline with ArtifactWatcher (300ms debounce, mtime stability), HuntDataStore (cross-artifact indexes, 500ms batch coalescing, 10-slot LRU cache), and extension activation wiring**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T15:36:19Z
- **Completed:** 2026-04-02T15:39:12Z
- **Tasks:** 3
- **Files modified:** 4 (watcher.ts, store.ts, extension.ts, store.test.cjs)

## Accomplishments
- ArtifactWatcher monitors hunt directory with per-file 300ms debounce and mtime/size stability check to avoid acting on half-written files
- HuntDataStore maintains cross-artifact indexes (receiptToQueries, receiptToHypotheses, queryToPhase) rebuilt after each batch
- 500ms batch collection window coalesces rapid file changes into single index rebuild (verified by unit test: 5 rapid changes produce 1 batch)
- Two-level parse cache: frontmatter always retained (13 entries for 13 artifacts), body with 10-slot LRU eviction
- Extension activate() creates watcher and store after hunt root detection, both added to context.subscriptions for automatic disposal
- 93 total tests pass (22 new store tests + 71 existing parser/extension tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: ArtifactWatcher with per-file debounce** - `c04c52a` (feat)
2. **Task 2 RED: Failing store tests** - `a300fa0` (test)
3. **Task 2 GREEN: HuntDataStore implementation** - `bcaea2b` (feat)
4. **Task 3: Wire watcher and store into extension** - `9bf4beb` (feat)

**Plan metadata:** (pending)

_Note: Task 2 followed TDD pattern with separate RED and GREEN commits._

## Files Created/Modified
- `thrunt-god-vscode/src/watcher.ts` - ArtifactWatcher with debounce, stability check, resolveArtifactType
- `thrunt-god-vscode/src/store.ts` - HuntDataStore with indexes, batch coalescing, LRU cache, events
- `thrunt-god-vscode/src/extension.ts` - Updated activate() to create and wire watcher + store
- `thrunt-god-vscode/test/unit/store.test.cjs` - 22 tests for store indexes, batch coalescing, LRU, events, deletion

## Decisions Made
- WatcherLike interface used instead of concrete ArtifactWatcher class for store constructor, enabling mock injection in tests
- Raw content cache added alongside body cache so that LRU eviction does not require filesystem re-reads
- Query-to-phase mapping uses receipt-to-hypothesis chain heuristic (HYP-01 -> phase 1) since huntmap phases reference plans, not queries directly
- Fallback probing of known artifact paths implemented for when readDirectory returns empty (mock environments)

## Deviations from Plan

None - plan executed exactly as written. All three source files and the test file were implemented as specified.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete data layer ready for downstream UI features (Phase 9: sidebar tree views, Phase 10: diagnostics/commands, Phase 11: webview dashboard)
- HuntDataStore.onDidChange provides reactive subscription point for all UI providers
- All exports (HuntDataStore, ArtifactWatcher, resolveArtifactType, 8 parsers, base utilities) available via CJS bundle
- Phase 8 complete: all 3 plans delivered (types/base parsers, query/receipt parsers, watcher/store)

## Self-Check: PASSED

All files verified present: watcher.ts, store.ts, extension.ts, store.test.cjs, 08-03-SUMMARY.md
All commits verified: c04c52a, a300fa0, bcaea2b, 9bf4beb, 7499236

---
*Phase: 08-artifact-parsers-file-watcher-and-data-store*
*Completed: 2026-04-02*
