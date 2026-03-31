# Deferred Items - Phase 43

## Pre-existing Issues (Out of Scope)

1. **SDK export count test expects 61 but runtime.cjs now has 64**
   - File: `tests/sdk-exports.test.cjs` line 108
   - Cause: Plan 43-01 re-exported 3 dispatch functions from runtime.cjs
   - Fix: Update expected count from 61 to 64
   - Verified pre-existing before Plan 02 changes
