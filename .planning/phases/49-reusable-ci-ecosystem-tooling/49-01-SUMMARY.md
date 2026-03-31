---
phase: 49-reusable-ci-ecosystem-tooling
plan: 01
subsystem: infra
tags: [github-actions, workflow_call, templates, ci, connector-sdk, ecosystem]

# Dependency graph
requires:
  - phase: 47-contract-test-suite
    provides: contract-tests.cjs with runContractTests API
  - phase: 46-plugin-manifest-discovery
    provides: plugin-registry.cjs with REQUIRED_MANIFEST_FIELDS and doctor-connectors
provides:
  - Reusable GitHub Actions CI workflow for third-party connector repos
  - Starter template directory for bootstrapping standalone connector plugins
  - Ecosystem tooling structure tests validating both artifacts
affects: [49-02, connector-ecosystem-docs]

# Tech tracking
tech-stack:
  added: [c8, upload-artifact@v4]
  patterns: [workflow_call reusable workflows, peerDependencies for SDK coupling, template-driven plugin scaffolding]

key-files:
  created:
    - .github/workflows/reusable-connector-test.yml
    - thrunt-god/templates/connector-plugin/package.json.tmpl
    - thrunt-god/templates/connector-plugin/thrunt-connector.json.tmpl
    - thrunt-god/templates/connector-plugin/src/index.cjs.tmpl
    - thrunt-god/templates/connector-plugin/tests/unit.test.cjs.tmpl
    - thrunt-god/templates/connector-plugin/tests/contract.test.cjs.tmpl
    - thrunt-god/templates/connector-plugin/.gitignore.tmpl
    - thrunt-god/templates/connector-plugin/README.md.tmpl
    - tests/ecosystem-tooling.test.cjs
  modified: []

key-decisions:
  - "Standalone plugin templates use require('thrunt-god/thrunt-god/bin/lib/connector-sdk.cjs') path for SDK imports (not @thrunt/connector-sdk)"
  - "Plugin template exports createAdapter() (not create{Name}Adapter) matching plugin loading contract"
  - "REQUIRED_MANIFEST_FIELDS mirrored in test file since not exported from plugin-registry.cjs"
  - "Template uses peerDependencies for thrunt-god to avoid version conflicts in plugin consumers"

patterns-established:
  - "Reusable workflow pattern: workflow_call with thrunt-version/node-version/connector-directory inputs"
  - "Standalone plugin template structure: 7 files covering package.json, manifest, adapter, tests, gitignore, README"

requirements-completed: [ECO-05]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 49 Plan 01: Reusable CI Ecosystem Tooling Summary

**Reusable GitHub Actions connector CI workflow with manifest validation, contract tests, and c8 coverage; plus 7-file starter template for standalone connector plugin projects**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T03:39:39Z
- **Completed:** 2026-03-31T03:44:13Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Reusable CI workflow with 8 steps: checkout, setup-node, install thrunt-god, npm ci, manifest validation via doctor-connectors, unit tests, contract tests, c8 coverage with artifact upload
- Complete starter template directory with package.json (peerDependencies pattern), manifest, adapter stub, unit tests, contract tests, gitignore, and README
- 14 structure tests validating workflow content and all template files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reusable GitHub Actions connector CI workflow** - `005449f` (feat)
2. **Task 2: Create standalone connector plugin starter template directory** - `bbcc158` (feat)
3. **Task 3: Unit tests for workflow structure and template content** - `cf411e4` (test)

## Files Created/Modified
- `.github/workflows/reusable-connector-test.yml` - Reusable workflow_call CI for third-party connector repos
- `thrunt-god/templates/connector-plugin/package.json.tmpl` - Standalone plugin package.json with peerDependencies
- `thrunt-god/templates/connector-plugin/thrunt-connector.json.tmpl` - Plugin manifest template with all required fields
- `thrunt-god/templates/connector-plugin/src/index.cjs.tmpl` - createAdapter() stub with 4 TODO sections
- `thrunt-god/templates/connector-plugin/tests/unit.test.cjs.tmpl` - Unit test with adapter validation and mock server
- `thrunt-god/templates/connector-plugin/tests/contract.test.cjs.tmpl` - Contract test invoking runContractTests
- `thrunt-god/templates/connector-plugin/.gitignore.tmpl` - Standard Node.js gitignore
- `thrunt-god/templates/connector-plugin/README.md.tmpl` - README with Quick Start, CI integration, publishing guide
- `tests/ecosystem-tooling.test.cjs` - 14 structure tests for workflow and templates

## Decisions Made
- Standalone plugin templates use `require('thrunt-god/thrunt-god/bin/lib/connector-sdk.cjs')` path for SDK imports since the SDK is consumed as a peer dependency via thrunt-god
- Plugin template exports `createAdapter()` (not `create{Name}Adapter`) matching the plugin loading contract from plugin-registry.cjs
- REQUIRED_MANIFEST_FIELDS mirrored in test file since it is not exported from plugin-registry.cjs
- Template uses peerDependencies for thrunt-god to avoid version conflicts and allow plugin consumers to control SDK version

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CI workflow and template directory ready for Plan 02 (init connector-plugin CLI command and ecosystem docs)
- Templates use {{VARIABLE}} substitution matching existing pattern in cmdInitConnector
- All 14 ecosystem tooling tests passing

## Self-Check: PASSED

All 10 created files verified present. All 3 task commits verified in git log.

---
*Phase: 49-reusable-ci-ecosystem-tooling*
*Completed: 2026-03-31*
