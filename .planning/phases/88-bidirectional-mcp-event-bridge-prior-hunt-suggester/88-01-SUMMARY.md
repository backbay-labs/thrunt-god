---
phase: 88-bidirectional-mcp-event-bridge-prior-hunt-suggester
plan: 01
subsystem: mcp
tags: [mcp, events, polling, pub-sub, event-bridge, fire-and-forget]

# Dependency graph
requires:
  - phase: 87-filesystem-watcher-hunt-pulse
    provides: WatcherService, formatHuntPulse, auto-ingestion lifecycle, hunt pulse status bar
provides:
  - CliEvent, VaultEvent, EventAction types and mapCliEventToAction pure function
  - McpBridgeService.pollEvents() with cursor-based inbound polling
  - McpBridgeService.publishEvent/publishEvents() fire-and-forget outbound
  - EventBus verdict:set event type
  - main.ts enableMcpEventPolling/disableMcpEventPolling lifecycle with 500ms outbound batching
  - Hunt pulse MCP online/offline status display
  - Settings activation for MCP polling and prior-hunt suggestions
affects: [88-02-prior-hunt-suggester]

# Tech tracking
tech-stack:
  added: []
  patterns: [cursor-based polling, fire-and-forget publishing, 500ms outbound event batching, idempotent enable/disable lifecycle]

key-files:
  created:
    - apps/obsidian/src/mcp-events.ts
    - apps/obsidian/src/__tests__/mcp-events.test.ts
    - apps/obsidian/src/__tests__/mcp-bridge-events.test.ts
  modified:
    - apps/obsidian/src/services/mcp-bridge-service.ts
    - apps/obsidian/src/services/event-bus.ts
    - apps/obsidian/src/settings.ts
    - apps/obsidian/src/main.ts
    - apps/obsidian/src/hunt-pulse.ts
    - apps/obsidian/src/workspace.ts

key-decisions:
  - "mapCliEventToAction is pure function with switch dispatch, no side effects"
  - "pollEvents uses cursor-based since parameter to avoid duplicate events"
  - "publishEvent/publishEvents are fire-and-forget: swallow all errors per locked decision"
  - "Outbound events batched in 500ms debounce window before publishing as array"
  - "Hunt pulse shows MCP online/offline only when mcpEventPollingEnabled is true"
  - "WorkspaceService exposes mcpBridge as public getter for main.ts lifecycle access"

patterns-established:
  - "Cursor-based polling: McpBridgeService tracks lastEventCursor for stateful event retrieval"
  - "Outbound batching: main.ts bufferOutboundEvent + 500ms flush timeout pattern"
  - "Fire-and-forget publishing: try/catch with empty catch block for non-critical outbound"

requirements-completed: [LIVE-03, LIVE-04]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 88 Plan 01: Bidirectional MCP Event Bridge Summary

**Inbound CLI event polling with cursor tracking and outbound vault event publishing with 500ms batched fire-and-forget delivery**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-12T22:21:53Z
- **Completed:** 2026-04-12T22:27:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Pure mcp-events.ts module with CliEvent, VaultEvent, EventAction types and mapCliEventToAction mapping function
- McpBridgeService extended with pollEvents() (cursor-based, silent degradation) and publishEvent/publishEvents() (fire-and-forget)
- Settings toggles activated: MCP event polling and prior-hunt suggestions no longer disabled placeholders
- Hunt pulse status bar shows MCP connection status (online/offline) when polling is enabled
- main.ts lifecycle wiring with idempotent enable/disable and 500ms outbound event batching
- All 795 tests pass (23 new: 8 mcp-events + 15 mcp-bridge-events)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mcp-events.ts pure module** - `0c74e698` (feat) [TDD: RED -> GREEN]
2. **Task 2: Extend McpBridgeService, EventBus, settings, main.ts, hunt pulse** - `3171f2f7` (feat) [TDD: RED -> GREEN]

## Files Created/Modified
- `apps/obsidian/src/mcp-events.ts` - Pure event types (CliEvent, VaultEvent, EventAction) and mapCliEventToAction function
- `apps/obsidian/src/__tests__/mcp-events.test.ts` - 8 unit tests for event type mapping
- `apps/obsidian/src/__tests__/mcp-bridge-events.test.ts` - 15 unit tests for pollEvents, publishEvent, batching, hunt pulse MCP status
- `apps/obsidian/src/services/mcp-bridge-service.ts` - Added pollEvents(), publishEvent(), publishEvents() with cursor tracking
- `apps/obsidian/src/services/event-bus.ts` - Added verdict:set event type to EventMap
- `apps/obsidian/src/settings.ts` - Activated toggles, added mcpPollIntervalMs and suggestionMinHunts fields
- `apps/obsidian/src/main.ts` - enableMcpEventPolling/disableMcpEventPolling lifecycle with outbound batching
- `apps/obsidian/src/hunt-pulse.ts` - Optional mcpStatus parameter for MCP online/offline display
- `apps/obsidian/src/workspace.ts` - Exposed mcpBridge as public getter on WorkspaceService

## Decisions Made
- mapCliEventToAction is a pure function with switch dispatch and no side effects
- pollEvents uses cursor-based `since` parameter to track last received event timestamp, avoiding duplicates
- publishEvent/publishEvents are fire-and-forget per locked decision: swallow all errors
- Outbound events are batched in a 500ms debounce window before publishing as an array
- Hunt pulse shows MCP status only when mcpEventPollingEnabled is true
- WorkspaceService exposes mcpBridge as a public getter (matching existing `watcher` getter pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Event bridge infrastructure complete, ready for Phase 88-02 (prior-hunt suggestions)
- enablePriorHuntSuggestions/disablePriorHuntSuggestions stub methods in place for 88-02 implementation
- suggestionMinHunts setting ready for use in suggestion logic

---
*Phase: 88-bidirectional-mcp-event-bridge-prior-hunt-suggester*
*Completed: 2026-04-12*
