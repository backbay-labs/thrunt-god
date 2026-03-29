---
phase: 24-hunt-observation-screens
plan: 01
subsystem: bridge
tags: [zod, subprocess, typed-bridge, domain-modules, tui-state, typescript]

# Dependency graph
requires:
  - "23-01: runThruntCommand executor, ThruntCommandResult/Options types"
  - "23-02: loadThruntState state adapter, Zod patterns, ThruntHuntContext"
provides:
  - "auditEvidence() bridge function with Zod-validated EvidenceAuditResult type"
  - "listDetections() and detectionStatus() bridge functions with DetectionCandidate/DetectionStatusResult types"
  - "listPacks() and showPack() bridge functions with PackListEntry/PackShowResult types"
  - "listConnectors() and runtimeDoctor() bridge functions with ConnectorEntry/RuntimeDoctorResult types"
  - "analyzeHuntmap() and getPhaseDetail() bridge functions with HuntmapAnalysis/HuntmapPhaseDetail types"
  - "InputMode union with 6 new observation screen entries"
  - "6 typed state interfaces (ThruntDashboardState, ThruntPhasesState, ThruntEvidenceState, ThruntDetectionsState, ThruntPacksState, ThruntConnectorsState) with factory functions"
  - "SurfaceMeta entries for all 6 new screens"
  - "Barrel re-exports from thrunt-bridge/index.ts"
affects: [24-02, 24-03, 25-gate-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain bridge module pattern: Zod schema + inferred type + async bridge function with --raw flag"
    - "Array bridge functions return [] on failure, use safeParse for item-level validation"
    - "Object bridge functions return null on failure, use parse wrapped in try/catch"
    - "Screen state interfaces with factory functions following createInitialXxxState() naming"

key-files:
  created:
    - apps/terminal/src/thrunt-bridge/evidence.ts
    - apps/terminal/src/thrunt-bridge/detection.ts
    - apps/terminal/src/thrunt-bridge/pack.ts
    - apps/terminal/src/thrunt-bridge/connector.ts
    - apps/terminal/src/thrunt-bridge/huntmap.ts
    - apps/terminal/src/thrunt-bridge/__tests__/domain-modules.test.ts
  modified:
    - apps/terminal/src/tui/types.ts
    - apps/terminal/src/tui/surfaces.ts
    - apps/terminal/src/thrunt-bridge/index.ts
    - apps/terminal/src/tui/app.ts
    - apps/terminal/test/tui-screens.test.ts
    - apps/terminal/test/investigation.test.ts
    - apps/terminal/test/tui-dispatch-phase1.test.ts
    - apps/terminal/test/tui-interactive-run.test.ts

key-decisions:
  - "Each domain bridge module defines Zod schemas locally rather than centralizing in types.ts, keeping domain knowledge co-located with bridge functions"
  - "Array-returning functions use safeParse per item for partial data resilience; object-returning functions use parse with try/catch for all-or-nothing validation"
  - "Test mock uses bun:test module mocking (mock.module) to intercept runThruntCommand at the import level"

patterns-established:
  - "Domain bridge module structure: Zod schema, inferred type export, async function with --raw flag, error-safe return"
  - "Screen state interface pattern: typed state with ListViewport/TreeViewport, loading/error fields, factory function"

requirements-completed: [BRIDGE-05]

# Metrics
duration: 63min
completed: 2026-03-29
---

# Phase 24 Plan 01: Domain Bridge Modules and TUI Type Infrastructure Summary

**Five Zod-validated domain bridge modules (evidence, detection, pack, connector, huntmap) wrapping runThruntCommand with typed interfaces, plus 6-screen InputMode/AppState/SurfaceMeta extension for observation screens**

## Performance

- **Duration:** 63 min
- **Started:** 2026-03-29T21:54:48Z
- **Completed:** 2026-03-29T22:57:48Z
- **Tasks:** 2
- **Files created:** 6
- **Files modified:** 8

## Accomplishments
- Built 5 domain bridge modules with Zod schemas for runtime subprocess output validation, covering 10 bridge functions across evidence, detection, pack, connector, and huntmap domains
- Extended InputMode union with 6 new screen entries, added 6 typed state interfaces with factory functions to AppState, and registered SurfaceMeta for all new screens
- 13 unit tests covering all bridge functions with module-level mocking of runThruntCommand, verifying correct args, Zod validation, error handling, and partial data resilience
- Updated barrel re-exports in thrunt-bridge/index.ts for clean downstream imports
- Fixed 4 test files with missing AppState fields to prevent TypeScript regressions

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for domain bridge modules** - `eaf543f` (test)
2. **Task 1 GREEN: 5 domain bridge modules with Zod schemas** - `38776b3` (feat)
3. **Task 2: TUI type infrastructure -- InputMode, AppState, surfaces, barrel exports** - `63a9aef` (feat)

_Task 1 used TDD: tests written first (RED), implementation second (GREEN)._

## Files Created/Modified
- `apps/terminal/src/thrunt-bridge/evidence.ts` - auditEvidence() with evidenceAuditResultSchema
- `apps/terminal/src/thrunt-bridge/detection.ts` - listDetections() and detectionStatus() with candidate and status schemas
- `apps/terminal/src/thrunt-bridge/pack.ts` - listPacks() and showPack() with pack list/show schemas
- `apps/terminal/src/thrunt-bridge/connector.ts` - listConnectors() and runtimeDoctor() with connector and doctor schemas
- `apps/terminal/src/thrunt-bridge/huntmap.ts` - analyzeHuntmap() and getPhaseDetail() with analysis and phase detail schemas
- `apps/terminal/src/thrunt-bridge/__tests__/domain-modules.test.ts` - 13 tests covering all bridge functions
- `apps/terminal/src/tui/types.ts` - 6 new InputMode entries, 6 state interfaces, 6 factory functions, AppState fields
- `apps/terminal/src/tui/surfaces.ts` - 6 new SurfaceMeta entries for observation screens
- `apps/terminal/src/thrunt-bridge/index.ts` - Barrel re-exports for all 5 domain modules
- `apps/terminal/src/tui/app.ts` - Factory imports and AppState constructor initialization

## Decisions Made
- Domain Zod schemas defined locally in each bridge module rather than centralizing in types.ts -- keeps domain knowledge co-located with the functions that use it
- Array-returning bridge functions use safeParse per item (partial data resilience) while object-returning functions use parse with try/catch (all-or-nothing)
- Used bun:test mock.module() for import-level mocking of runThruntCommand in tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test mock AppState objects missing thrunt state fields**
- **Found during:** Task 2 (TUI type infrastructure)
- **Issue:** 4 test files (tui-screens, investigation, tui-dispatch-phase1, tui-interactive-run) had createState() functions missing thruntContext and the 6 new thrunt state fields, causing TypeScript errors
- **Fix:** Added thruntContext: null and all 6 new state interface default values to each test's createState function
- **Files modified:** apps/terminal/test/tui-screens.test.ts, apps/terminal/test/investigation.test.ts, apps/terminal/test/tui-dispatch-phase1.test.ts, apps/terminal/test/tui-interactive-run.test.ts
- **Verification:** TypeScript compilation clean for these files
- **Committed in:** 63a9aef (Task 2 commit)

**2. [Rule 1 - Bug] Fixed mock type inference in domain-modules.test.ts**
- **Found during:** Task 2 verification
- **Issue:** TypeScript inferred narrow return type for mock(() => ...) preventing mockResolvedValueOnce from accepting objects with data/error fields
- **Fix:** Added explicit ThruntCommandResult<unknown> return type annotation to the mock factory
- **Files modified:** apps/terminal/src/thrunt-bridge/__tests__/domain-modules.test.ts
- **Verification:** TypeScript compilation clean for test file, all 13 tests still pass
- **Committed in:** 63a9aef (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for TypeScript compilation correctness. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 10 bridge functions ready for screen modules in Plans 02 and 03
- All 6 state interfaces with factories ready for screen-level state management
- SurfaceMeta entries registered for navigation and status bar rendering
- Barrel index provides clean import surface for downstream consumers
- No regressions in existing test suite (538/544 pass; 6 pre-existing failures in state-adapter unrelated to this plan)

## Self-Check: PASSED
