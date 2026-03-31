---
phase: 43-dispatch-coordinator
plan: "01"
subsystem: runtime
tags: [multi-tenant, dispatch, concurrency, fan-out, isolation, mssp]

# Dependency graph
requires:
  - phase: 42-tenant-registry
    provides: tenant config schema, validateTenantConfig, connector_profiles per tenant
provides:
  - resolveTenantTargets function for filtering tenants by tags/connector/IDs
  - cloneTenantSpec function for tenant-scoped QuerySpec generation
  - dispatchMultiTenant function for concurrent fan-out execution
  - dispatch.concurrency and dispatch.global_timeout_ms config keys
  - per-tenant token cache isolation and error containment
affects: [43-dispatch-coordinator plan 02, result-aggregation, cross-tenant-heatmap]

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-require for circular dep avoidance, Promise.race semaphore for concurrency control, per-tenant Map isolation]

key-files:
  created:
    - thrunt-god/bin/lib/dispatch.cjs
    - tests/dispatch.test.cjs
  modified:
    - thrunt-god/bin/lib/config.cjs
    - thrunt-god/bin/lib/runtime.cjs

key-decisions:
  - "Used local nowIso helper in dispatch.cjs rather than exporting internal from runtime.cjs to minimize coupling"
  - "Promise.race semaphore with .finally() cleanup instead of Promise.allSettled for concurrency control"
  - "Results pushed to shared array from .then() callbacks to avoid lost results in race pattern"
  - "Exported isValidConfigKey from config.cjs for test coverage of dispatch config keys"

patterns-established:
  - "Lazy require pattern: dispatch.cjs uses getRuntime() at call time; runtime.cjs requires dispatch.cjs at module level"
  - "Per-tenant isolation: fresh Map() per tenant for token cache, independent error containment"
  - "MultiTenantResult shape: version, dispatch_id (MTD-*), summary, tenant_results[], errors[]"

requirements-completed: [TENANT-02]

# Metrics
duration: 9min
completed: "2026-03-31"
---

# Phase 43 Plan 01: Dispatch Coordinator Summary

**Multi-tenant fan-out dispatch with Promise.race concurrency semaphore, per-tenant token cache isolation, and global timeout cancellation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-31T00:16:07Z
- **Completed:** 2026-03-31T00:25:33Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- Created dispatch.cjs with 3 exported functions: resolveTenantTargets, cloneTenantSpec, dispatchMultiTenant
- Tag-based tenant filtering with intersection semantics, connector type filtering, explicit ID selection, and disabled tenant exclusion
- Concurrency-controlled fan-out via Promise.race semaphore (default 5 concurrent, configurable)
- Per-tenant credential isolation through fresh token cache Map per execution
- Global timeout (default 600s) that marks remaining tenants as timed out
- 27 tests covering all filtering, isolation, concurrency, error containment, and re-export behaviors

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for dispatch coordinator** - `fd85cb3` (test)
2. **Task 1 (GREEN): Implement dispatch.cjs + config keys + runtime re-exports** - `8c2467b` (feat)

## Files Created/Modified
- `thrunt-god/bin/lib/dispatch.cjs` - Dispatch coordinator module with resolveTenantTargets, cloneTenantSpec, dispatchMultiTenant
- `thrunt-god/bin/lib/config.cjs` - Added dispatch.concurrency and dispatch.global_timeout_ms config keys, exported isValidConfigKey
- `thrunt-god/bin/lib/runtime.cjs` - Re-exported 3 dispatch functions at module.exports
- `tests/dispatch.test.cjs` - 27 unit tests covering all dispatch behaviors

## Decisions Made
- Used local `nowIso()` implementation in dispatch.cjs because runtime.cjs does not export it (internal function). This avoids adding to runtime's export surface unnecessarily.
- Chose Promise.race semaphore with `.finally()` cleanup over Promise.allSettled flat-map because it provides true concurrency control (limit N active at a time).
- Results are pushed to shared array inside `.then()` callbacks rather than captured from `Promise.race` return value, preventing lost results when multiple promises resolve simultaneously.
- Exported `isValidConfigKey` from config.cjs to enable direct unit testing of dispatch config key registration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed circular dependency between dispatch.cjs and runtime.cjs**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** dispatch.cjs used `getRuntime().nowIso` but `nowIso` is not exported from runtime.cjs
- **Fix:** Implemented local `nowIso()` helper in dispatch.cjs instead of depending on unexported internal
- **Files modified:** thrunt-god/bin/lib/dispatch.cjs
- **Verification:** `node -e "require('./thrunt-god/bin/lib/dispatch.cjs')"` loads without error

**2. [Rule 1 - Bug] Fixed Promise.race semaphore losing second result**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** When two fast promises resolved simultaneously, the non-winning promise's result was lost because `.then()` deleted from active map but result was never captured
- **Fix:** Restructured to push results into shared array from `.then()` callbacks, using wrapper promises for race signaling only
- **Files modified:** thrunt-god/bin/lib/dispatch.cjs
- **Verification:** summary has correct counts test passes (2/2 tenants_succeeded)

**3. [Rule 3 - Blocking] Exported isValidConfigKey from config.cjs**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Tests needed to verify dispatch config key registration but isValidConfigKey was internal
- **Fix:** Added isValidConfigKey to config.cjs module.exports
- **Files modified:** thrunt-god/bin/lib/config.cjs
- **Verification:** dispatch.concurrency and dispatch.global_timeout_ms both validate as valid keys

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Tests initially failed because `createQuerySpec` requires valid ISO time_window.start/end timestamps. Fixed by providing a helper `baseSpecInput()` function in tests that supplies valid time windows.
- `createConnectorRegistry` does not have a `.register()` method (adapters are constructor arguments). Fixed by passing adapter array to constructor.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dispatch coordinator module is ready for CLI integration (Phase 43 Plan 02)
- All 3 functions are accessible via both direct require and runtime.cjs re-export
- 31 existing tenant tests continue to pass (no regressions)

---
*Phase: 43-dispatch-coordinator*
*Completed: 2026-03-31*
