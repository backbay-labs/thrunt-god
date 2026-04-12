---
phase: 22-mcp-event-bridge
plan: 02
subsystem: api
tags: [websocket, event-sourcing, reconnection, replay, broadcast, typescript]

requires:
  - phase: 22-mcp-event-bridge-01
    provides: "EventBridgeEnvelope types, event journal ring buffer, structured file watcher"
provides:
  - "Live WebSocket event broadcast of structured artifact events to all connected clients"
  - "bridge:welcome handshake with protocol version and current journal sequence"
  - "Reconnection replay via last_seq query parameter on WS upgrade"
  - "journal_overflow signal when requested sequence is too old for buffer"
  - "Heartbeat in versioned EventBridgeEnvelope format"
affects: [22-03-mutations, browser-extension-surface]

tech-stack:
  added: []
  patterns: ["WS upgrade with data passing for last_seq", "dual broadcast: legacy BridgeEvent + versioned EventBridgeEnvelope"]

key-files:
  created:
    - surfaces/apps/surface-bridge/test/event-bridge.test.ts
  modified:
    - surfaces/apps/surface-bridge/src/server.ts
    - surfaces/packages/surfaces-contracts/src/bridge.ts

key-decisions:
  - "Dual broadcast: legacy BridgeEvent broadcast kept for POST route backward compat alongside new envelope broadcast"
  - "Welcome message uses seq:0 (not journaled) to avoid inflating sequence numbers"
  - "Heartbeats use seq:0 to avoid consuming journal space"
  - "Replay triggered by isNaN check (not > 0) to allow last_seq=0 full replay"

patterns-established:
  - "broadcastEnvelope: separate from legacy broadcast, sends EventBridgeEnvelope to all wsClients"
  - "WS upgrade passes data via Bun's server.upgrade({data}) for per-connection state"
  - "Welcome -> replay -> live stream: connection lifecycle for event bridge clients"

requirements-completed: [MCPB-01, MCPB-03, MCPB-06]

duration: 7min
completed: 2026-04-12
---

# Phase 22 Plan 02: Event Broadcast and Reconnection Replay Summary

**Structured watcher and journal wired into bridge server with welcome handshake, live envelope broadcast, and reconnection replay via last_seq**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-12T13:52:22Z
- **Completed:** 2026-04-12T13:59:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced simple fs.watch with structured watcher that emits typed EventBridgeEnvelope events through the journal
- WebSocket clients now receive bridge:welcome on connect with protocolVersions:[1] and current journal sequence
- Reconnecting clients pass last_seq query param and receive missed events replayed from the ring buffer journal
- Stale last_seq triggers journal_overflow signal so clients know to do a full refresh
- Heartbeat upgraded from legacy BridgeEvent to versioned EventBridgeEnvelope format
- 7 integration tests covering welcome, heartbeat, envelope format, empty replay, reconnection replay, and overflow path

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire structured watcher and journal into server.ts** - `04497193` (feat)
2. **Task 2: Integration tests for event broadcast and reconnection replay** - `3ce42dc2` (test)

## Files Created/Modified
- `surfaces/apps/surface-bridge/src/server.ts` - Replaced simple watcher with structured watcher + journal, added broadcastEnvelope, welcome handshake, replay logic, overflow handling
- `surfaces/apps/surface-bridge/test/event-bridge.test.ts` - 7 integration tests for event bridge WebSocket behavior
- `surfaces/packages/surfaces-contracts/src/bridge.ts` - Added JournalOverflowPayload to EventBridgeEnvelope data union

## Decisions Made
- Kept legacy broadcast() function alongside new broadcastEnvelope() for backward compatibility with POST route handlers that still emit BridgeEvent
- Welcome and heartbeat messages use seq:0 to avoid inflating journal sequence numbers (they're ephemeral, not replayable)
- Changed replay guard from `lastSeq > 0` to `!isNaN(lastSeq)` to correctly handle last_seq=0 (replay all events)
- Used Bun's server.upgrade data passing (with type assertion) to thread last_seq from HTTP upgrade to WS open handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added JournalOverflowPayload to EventBridgeEnvelope data union**
- **Found during:** Task 1
- **Issue:** JournalOverflowPayload interface existed in contracts but was not included in the EventBridgeEnvelope data union, causing TypeScript error TS2322
- **Fix:** Added JournalOverflowPayload to the data union type in EventBridgeEnvelope
- **Files modified:** surfaces/packages/surfaces-contracts/src/bridge.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 04497193

**2. [Rule 1 - Bug] Fixed replay guard to allow last_seq=0**
- **Found during:** Task 2 (integration tests)
- **Issue:** Plan specified `lastSeq > 0` guard which incorrectly skipped replay when client sends last_seq=0 (meaning "replay everything")
- **Fix:** Changed guard to `!isNaN(lastSeq)` -- journal.replayFrom(0) correctly returns empty when no events exist, or all events when journal has entries
- **Files modified:** surfaces/apps/surface-bridge/src/server.ts
- **Verification:** All 7 integration tests pass including last_seq=0 and reconnection replay
- **Committed in:** 3ce42dc2

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bridge now serves as a live event source for any surface (browser extension, Obsidian, etc.)
- Ready for Plan 03 (mutations) to add write-side event emission through the same envelope broadcast
- Journal replay enables resilient client connections across transient disconnects

---
*Phase: 22-mcp-event-bridge*
*Completed: 2026-04-12*
