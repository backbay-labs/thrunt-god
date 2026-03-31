---
phase: 46-plugin-manifest-discovery
plan: 01
subsystem: plugin-ecosystem
tags: [plugin, manifest, validation, semver, connector-sdk]

requires:
  - phase: 45-connector-sdk-package
    provides: "AUTH_TYPES, DATASET_KINDS, PAGINATION_MODES constants and validateConnectorAdapter()"
provides:
  - "validatePluginManifest() with 8 validation rules for thrunt-connector.json"
  - "loadPluginManifest() for reading and validating manifests from package roots"
  - "loadPlugin() for loading entry modules with adapter cross-check"
  - "BUILT_IN_CONNECTOR_IDS frozen array (10 IDs)"
affects: [46-02-plugin-discovery, 47-contract-testing, 48-builtin-migration]

tech-stack:
  added: []
  patterns: ["Minimal semver range checker without external dependency", "TDD RED-GREEN for new module"]

key-files:
  created:
    - thrunt-god/bin/lib/plugin-registry.cjs
    - tests/plugin-registry.test.cjs
  modified: []

key-decisions:
  - "Minimal semver range parser handles ^/~/>=/>= <A patterns without adding semver dependency"
  - "Built-in ID collision produces warning not error, with allowOverride escape hatch"
  - "Cross-check validates adapter capabilities are superset of manifest declarations"
  - "Permissions validation replaces generic required-field error with specific message for testability"

patterns-established:
  - "Plugin manifest structure: thrunt-connector.json with 11 required fields"
  - "Three-tier plugin loading: manifest validation -> entry module loading -> adapter cross-check"

requirements-completed: [ECO-02]

duration: 4min
completed: 2026-03-31
---

# Phase 46 Plan 01: Plugin Manifest Validation & Loading Summary

**Plugin manifest validation module with 8 rules, entry loading, and adapter capability cross-checking against manifest declarations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T01:45:38Z
- **Completed:** 2026-03-31T01:49:22Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- validatePluginManifest() enforces all 8 validation rules from spec section 3.2 with descriptive error messages
- loadPluginManifest() reads thrunt-connector.json from package root with JSON parse error handling
- loadPlugin() performs three-tier validation: manifest -> adapter structure -> capability cross-check
- Minimal semver range checker handles ^/~/>=/>= <A patterns without external semver dependency
- 22 tests covering all validation rules, happy paths, error cases, and cross-check scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Plugin registry failing tests** - `53586cc` (test)
2. **Task 1 (GREEN): Plugin registry implementation** - `84379b6` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `thrunt-god/bin/lib/plugin-registry.cjs` - Plugin manifest validation, loading, and cross-check functions (288 lines)
- `tests/plugin-registry.test.cjs` - 22 unit tests covering all validation rules and loading flows (222 lines)

## Decisions Made
- **Minimal semver parser:** Implemented in-house `isSatisfiableSemverRange()` supporting ^/~/>=/>= <A patterns rather than adding a semver npm dependency, keeping zero-dependency stance
- **Built-in collision as warning:** connector_id matching a built-in ID produces a warning (not error) with `allowOverride` option to suppress
- **Cross-check directionality:** Adapter capabilities must be a superset of manifest declarations (adapter can support more than declared, but not less)
- **Permissions error message:** Rule 8 replaces generic required-field error with specific "permissions object is required" message for clearer error reporting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- plugin-registry.cjs ready for import by discoverPlugins() in Plan 02
- All 4 exports available: BUILT_IN_CONNECTOR_IDS, validatePluginManifest, loadPluginManifest, loadPlugin
- Full test suite (2324 tests) passes with zero regressions

## Self-Check: PASSED

- FOUND: thrunt-god/bin/lib/plugin-registry.cjs
- FOUND: tests/plugin-registry.test.cjs
- FOUND: 46-01-SUMMARY.md
- FOUND: 53586cc (RED commit)
- FOUND: 84379b6 (GREEN commit)

---
*Phase: 46-plugin-manifest-discovery*
*Completed: 2026-03-31*
