---
phase: 22-mcp-event-bridge
plan: 01
subsystem: api
tags: [websocket, event-sourcing, ring-buffer, file-watcher, typescript]

requires:
  - phase: 21-bridge-hardening
    provides: "Structured logger, error classification, subprocess health monitoring"
provides:
  - "EventBridgeEnvelope versioned event type with sequence numbers"
  - "ArtifactEvent types for created/modified/deleted with content hash diffs"
  - "Semantic event types: phase.transition, verdict.changed"
  - "Ring buffer event journal (1000 capacity) with replay and overflow detection"
  - "Structured file watcher with per-file debounce and artifact classification"
affects: [22-02-broadcast-reconnection, 22-03-mutations]

tech-stack:
  added: []
  patterns: ["ring buffer for bounded in-memory event storage", "per-file debounce with content hashing", "artifact type classification from path patterns"]

key-files:
  created:
    - surfaces/apps/surface-bridge/src/event-journal.ts
    - surfaces/apps/surface-bridge/src/file-watcher.ts
    - surfaces/apps/surface-bridge/test/event-journal.test.ts
  modified:
    - surfaces/packages/surfaces-contracts/src/bridge.ts

key-decisions:
  - "Ring buffer with write pointer wrapping for O(1) append and bounded memory"
  - "Content hashing with MD5 for lightweight non-security change detection"
  - "Frontmatter key diffing for meaningful change classification without full content over WS"
  - "Exported classifyArtifactType for testability and reuse"

patterns-established:
  - "EventBridgeEnvelope: v=1 protocol version, monotonic seq, ISO ts, discriminated on type"
  - "Artifact classification by directory and filename prefix patterns"
  - "Per-file debounce at 300ms allowing independent file events"

requirements-completed: [MCPB-01, MCPB-02, MCPB-06]

duration: 3min
completed: 2026-04-12
---

# Phase 22 Plan 01: Event Types, Journal, and File Watcher Summary

**Versioned event type contracts, ring buffer journal with monotonic sequences, and structured file watcher with content hashing and artifact classification**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T13:45:42Z
- **Completed:** 2026-04-12T13:49:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Defined complete versioned event type system in contracts (artifact.created/modified/deleted, phase.transition, verdict.changed, bridge:welcome, bridge:journal_overflow)
- Implemented ring buffer event journal with configurable capacity (default 1000), monotonic sequence numbers, replay-from-seq, and overflow detection
- Built structured file watcher with MD5 content hashing, per-file 300ms debounce, artifact type classification from path patterns, frontmatter key diffing, and semantic event detection
- 17 unit tests covering journal append/replay/overflow/wrap and all artifact type classifications

## Task Commits

Each task was committed atomically:

1. **Task 1: Define versioned event types and create event journal** - `75311172` (feat)
2. **Task 2: Create structured file watcher** - `2ef483fb` (feat)
3. **Task 3: Unit tests for journal and classification** - `759ce2e5` (test)

## Files Created/Modified
- `surfaces/packages/surfaces-contracts/src/bridge.ts` - Added ArtifactType, EventBridgeEnvelope, ArtifactDiff, PhaseTransitionPayload, VerdictChangedPayload, WelcomePayload, JournalOverflowPayload types
- `surfaces/apps/surface-bridge/src/event-journal.ts` - Ring buffer journal with append, replayFrom, currentSeq, size
- `surfaces/apps/surface-bridge/src/file-watcher.ts` - Structured watcher with content hashing, artifact classification, semantic event detection
- `surfaces/apps/surface-bridge/test/event-journal.test.ts` - 17 unit tests for journal and classification

## Decisions Made
- Used ring buffer with write pointer wrapping for O(1) append and bounded memory (fixed array, not shifting)
- MD5 chosen for content hashing -- fast, non-security use, sufficient for change detection
- Frontmatter key diffing provides meaningful change metadata without sending full file content over WS
- Exported classifyArtifactType as a named export for testability and future reuse by other modules
- Semantic events (phase.transition, verdict.changed) emitted in addition to the artifact event, not instead of

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused variable in test file**
- **Found during:** Task 3 (unit tests)
- **Issue:** `const before = new Date().toISOString()` declared but never used, causing TypeScript noUnusedLocals error
- **Fix:** Removed the unused variable declaration
- **Files modified:** surfaces/apps/surface-bridge/test/event-journal.test.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 759ce2e5 (amended into Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Event types and journal ready for Plan 02 (broadcast/reconnection) to wire into WebSocket upgrade handler
- File watcher ready for Plan 02 to integrate via onEvent callback to journal.append + broadcast
- classifyArtifactType exported for Plan 03 mutation validation

---
*Phase: 22-mcp-event-bridge*
*Completed: 2026-04-12*
