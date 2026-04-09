---
phase: 60-command-deck-webview
plan: 02
subsystem: ui
tags: [vscode, preact, webview, command-deck, context-highlighting, tree-selection]

# Dependency graph
requires:
  - phase: 60-command-deck-webview
    provides: CommandDeckRegistry, CommandDeckPanel, shared types, Preact webview grid, extension wiring
provides:
  - getContextRelevantIds() mapping tree node types to relevant command IDs
  - Context-aware command highlighting in webview via cd-card--highlight class
  - Tree selection listener forwarding HuntTreeItem selection to CommandDeckPanel.setContext()
  - AutomationTreeDataProvider.setCommandCount() for dynamic Command Deck node description
  - 15 new unit tests for context relevance and command count
affects: [60-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [tree selection -> webview context highlighting via onDidChangeSelection, mirrored context relevance mapping in extension host and webview]

key-files:
  created: []
  modified:
    - apps/vscode/src/commandDeck.ts
    - apps/vscode/src/extension.ts
    - apps/vscode/src/automationSidebar.ts
    - apps/vscode/webview/command-deck/index.tsx
    - apps/vscode/test/unit/command-deck.test.cjs
    - apps/vscode/test/unit/automation-sidebar.test.cjs

key-decisions:
  - "Context relevance mapping mirrored in both extension host (getContextRelevantIds) and webview (getRelevantIdsFromContext) for decoupled operation"
  - "Hunt tree registration changed from registerTreeDataProvider to createTreeView to get onDidChangeSelection event"
  - "setCommandCount follows setRunbookCount pattern exactly for consistency"

patterns-established:
  - "Tree selection -> webview context: onDidChangeSelection extracts nodeType/dataId, forwards via setContext() -> postMessage"
  - "Mirrored relevance maps: same switch/case mapping in extension host and webview to avoid cross-boundary imports"

requirements-completed: [CMD-03, CMD-04, CMD-05]

# Metrics
duration: 3min
completed: 2026-04-09
---

# Phase 60 Plan 02: Context-Aware Highlighting and Command Count Summary

**Context-aware command highlighting driven by investigation tree selection, with setCommandCount for dynamic tree node description and 15 new tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-09T21:37:25Z
- **Completed:** 2026-04-09T21:40:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- getContextRelevantIds() maps 8 tree node types (phase, case, query, receipt, hypothesis, finding, mission, huntmap) to relevant command IDs
- Investigation tree selection changes forwarded to CommandDeckPanel via onDidChangeSelection listener
- Webview command cards highlighted with cd-card--highlight class when context-relevant
- AutomationTreeDataProvider shows live "10 commands" in Command Deck node description
- All 356 unit tests pass (15 new tests added)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add context-relevance logic and tree selection listener** - `99f3c747` (feat)
2. **Task 2: Enhance webview with context highlighting and update tests** - `ea4e10ac` (feat)

## Files Created/Modified
- `apps/vscode/src/commandDeck.ts` - Added getContextRelevantIds() function with node type to command ID mapping
- `apps/vscode/src/extension.ts` - Changed huntTree to createTreeView, added onDidChangeSelection listener, setCommandCount call, getContextRelevantIds re-export
- `apps/vscode/src/automationSidebar.ts` - Added commandCount field, setCommandCount() method, dynamic Command Deck description
- `apps/vscode/webview/command-deck/index.tsx` - Added getRelevantIdsFromContext(), relevantIds computation, context-aware isContextRelevant prop
- `apps/vscode/test/unit/command-deck.test.cjs` - 11 new tests for getContextRelevantIds covering all node types and null/unknown
- `apps/vscode/test/unit/automation-sidebar.test.cjs` - 4 new tests for setCommandCount and constructor commandCount option

## Decisions Made
- Context relevance mapping mirrored in both extension host and webview since webview cannot import extension-host code
- Hunt tree changed from registerTreeDataProvider to createTreeView to enable onDidChangeSelection events
- setCommandCount follows setRunbookCount pattern for consistency in AutomationTreeDataProvider

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Context-aware highlighting complete: selecting nodes in investigation tree highlights relevant commands in the deck
- Pin/unpin and recent history render correctly in webview
- Ready for Plan 03 to wire parameterized templates and full CLI execution via CLIBridge

## Self-Check: PASSED

All 6 files found. Both task commits (99f3c747, ea4e10ac) verified.

---
*Phase: 60-command-deck-webview*
*Completed: 2026-04-09*
