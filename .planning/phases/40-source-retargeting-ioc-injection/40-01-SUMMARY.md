---
phase: 40-source-retargeting-ioc-injection
plan: 01
subsystem: replay
tags: [ioc-injection, retargeting, query-sanitization, field-mapping, spl, esql, kql, sql]

# Dependency graph
requires:
  - phase: 38-replay-engine-core
    provides: ReplaySpec schema, applyMutations, resolveReplaySource
  - phase: 39-per-language-query-rewriters
    provides: TIME_REWRITERS registry, per-language time rewriting
provides:
  - CONNECTOR_LANGUAGE_MAP mapping 5 connectors to query languages
  - FIELD_MAPPING_WARNINGS for same-language connector pairs
  - validateSameLanguageRetarget for cross-connector language validation
  - retargetPackExecution for pack-based target selection
  - IOC_FIELD_MAP with per-connector field paths for ip, hash, domain, user
  - validateIocValue with IPv4/IPv6, hash hex, domain RFC, user validation
  - sanitizeIocForLanguage preventing query injection for SPL, ES|QL, KQL, SQL
  - injectIoc with append/replace modes for all 4 query languages
  - applyIocInjection for batch IOC injection from ReplaySpec mutations
affects: [41-result-diffing-replay-orchestration, 42-multi-tenant-coordination]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-language-ioc-injection, pack-based-retargeting, field-mapping-warnings]

key-files:
  created: []
  modified:
    - thrunt-god/bin/lib/replay.cjs
    - tests/replay.test.cjs

key-decisions:
  - "PACK-RETARGET-VIA-RESOLVE: retargetPackExecution delegates to resolvePack/renderPackTemplate rather than reimplementing pack resolution -- reuses existing pack infrastructure"
  - "SANITIZE-BEFORE-INJECT: IOC values validated then sanitized per-language before injection -- prevents query injection at both validation and sanitization layers"
  - "FIELD-SCAN-FIRST-MATCH: injectIoc scans statement for first matching field from IOC_FIELD_MAP rather than requiring exact field specification -- handles diverse query patterns automatically"
  - "APPEND-NO-FIELD-FALLBACK: When no matching field found in statement, injectIoc appends filter clause using first field from IOC_FIELD_MAP -- ensures IOC always gets injected"

patterns-established:
  - "IOC field mapping pattern: per-connector field arrays in IOC_FIELD_MAP enable connector-agnostic IOC injection"
  - "Per-language sanitization: sanitizeIocForLanguage applies language-specific escaping rules preventing injection"
  - "Same-language retarget warnings: FIELD_MAPPING_WARNINGS captures known field name differences between same-language connectors"

requirements-completed: [REPLAY-03]

# Metrics
duration: 11min
completed: 2026-03-30
---

# Phase 40 Plan 01: Source Retargeting & IOC Injection Summary

**Pack-based source retargeting with same-language field mapping warnings and IOC injection engine supporting append/replace modes across SPL, ES|QL, KQL, and OpenSearch SQL with per-language query injection prevention**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-30T22:19:54Z
- **Completed:** 2026-03-30T22:31:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Pack-based retargeting selects correct execution target from pack, throws CONNECTOR_NOT_IN_PACK when target connector not available, and propagates PACK_NOT_FOUND from resolvePack
- Same-language retargeting (sentinel to defender_xdr) allowed with FIELD_MAPPING_WARNING listing field name differences (TimeGenerated->Timestamp, Computer->DeviceName, Account->AccountName)
- Cross-language retargeting without pack returns clear error suggesting pack creation
- IOC_FIELD_MAP covers 5 connectors x 4 IOC types with per-connector field path arrays
- IOC validation catches malformed IPs (regex + octet range), invalid hashes (must be 32/40/64/128 hex), bad domains (RFC format), and empty users
- Per-language sanitization prevents SPL pipe injection, SQL quote injection, ES|QL/KQL injection via quote escaping and semicolon removal
- IOC injection works in both append and replace modes for all 4 query languages with correct syntax (SPL OR groups, ES|QL/KQL IN clauses, SQL IN clauses)
- Complex query warning emitted for statements containing lookups, joins, or subqueries
- Test suite grew from 60 to 109 tests with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Source retargeting -- pack-based target selection and same-language retarget** - `e474148` (feat)
2. **Task 2: IOC injection engine -- field map, validation, sanitization, per-language injection** - `1bc468e` (feat)

_Both tasks followed TDD: failing tests written first (RED), implementation added to pass (GREEN)_

## Files Created/Modified
- `thrunt-god/bin/lib/replay.cjs` - Extended with CONNECTOR_LANGUAGE_MAP, FIELD_MAPPING_WARNINGS, validateSameLanguageRetarget, retargetPackExecution, IOC_FIELD_MAP, validateIocValue, sanitizeIocForLanguage, injectIoc, applyIocInjection
- `tests/replay.test.cjs` - Added 49 new tests across 7 new describe blocks (CONNECTOR_LANGUAGE_MAP, validateSameLanguageRetarget, retargetPackExecution, IOC_FIELD_MAP, validateIocValue, sanitizeIocForLanguage, injectIoc)

## Decisions Made
- **PACK-RETARGET-VIA-RESOLVE:** Reused existing resolvePack/renderPackTemplate infrastructure rather than reimplementing pack resolution for retargeting
- **SANITIZE-BEFORE-INJECT:** Two-layer defense -- validateIocValue rejects malformed values, then sanitizeIocForLanguage escapes dangerous characters per language
- **FIELD-SCAN-FIRST-MATCH:** injectIoc scans statement for first matching field from IOC_FIELD_MAP arrays, enabling automatic field detection without requiring callers to specify exact field names
- **APPEND-NO-FIELD-FALLBACK:** When statement has no matching field, a new filter clause is appended using the first field from the connector's IOC_FIELD_MAP entry

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test pack definitions for pack registry validation**
- **Found during:** Task 1 (retargetPackExecution tests)
- **Issue:** Test pack JSON files lacked required fields (description, hypothesis_ids, required_connectors, supported_datasets, publish) causing INVALID_COMPOSED_PACK errors from loadPackRegistry's composition validation
- **Fix:** Updated writeTestPack helper to include all fields required by validatePackDefinition with requireComplete:true
- **Files modified:** tests/replay.test.cjs
- **Verification:** All retargetPackExecution tests pass
- **Committed in:** e474148

**2. [Rule 1 - Bug] Fixed test pack dataset kinds**
- **Found during:** Task 1 (retargetPackExecution tests)
- **Issue:** Test packs used 'SecurityEvent' and 'DeviceEvents' as dataset kinds, but pack validation only accepts values from DATASET_KINDS (events, alerts, entities, identity, endpoint, cloud, email, other)
- **Fix:** Changed dataset values to 'events' in test pack definitions
- **Files modified:** tests/replay.test.cjs
- **Verification:** Pack loading succeeds in tests
- **Committed in:** e474148

**3. [Rule 1 - Bug] Fixed ES|QL sanitization test assertion**
- **Found during:** Task 2 (sanitizeIocForLanguage tests)
- **Issue:** Test checked `!result.includes('"with"')` but doubled quotes `""with""` still contains the substring `"with"` -- assertion was checking wrong pattern
- **Fix:** Changed to assert exact expected output: `value""with""quotes`
- **Files modified:** tests/replay.test.cjs
- **Verification:** Test passes with correct assertion
- **Committed in:** 1bc468e

**4. [Rule 1 - Bug] Fixed injection prevention test IOC type**
- **Found during:** Task 2 (injectIoc injection prevention test)
- **Issue:** Test used type 'ip' with value '| delete index=main' but validateIocValue correctly rejects this as an invalid IP before sanitization runs
- **Fix:** Changed to type 'user' (permissive validation) so the test exercises the sanitization path as intended
- **Files modified:** tests/replay.test.cjs
- **Verification:** Test verifies pipe characters stripped from injected statement
- **Committed in:** 1bc468e

---

**Total deviations:** 4 auto-fixed (4 Rule 1 bugs in test fixtures/assertions)
**Impact on plan:** All auto-fixes corrected test fixture issues -- no production code changes. Plan functionality delivered exactly as specified.

## Issues Encountered
None -- all issues were in test setup, not implementation logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- replay.cjs now exports 22 symbols (up from 13 pre-Phase 40) covering schema, source resolution, time rewriting, retargeting, and IOC injection
- Phase 41 (result diffing and replay orchestration) can build on the mutation pipeline: applyMutations + rewriteQueryTime + injectIoc/applyIocInjection form the complete query transformation chain
- Pack-based retargeting enables cross-connector hunt replay workflows

---
*Phase: 40-source-retargeting-ioc-injection*
*Completed: 2026-03-30*
