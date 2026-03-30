---
phase: 34-connector-scaffolding-cli
plan: 01
subsystem: cli
tags: [cli, scaffold, connector, template-engine, readline, node-test]

# Dependency graph
requires:
  - phase: 33-sdk-export-surface
    provides: SDK functions (normalizeBaseUrl, joinUrl, executeConnectorRequest, validateConnectorAdapter, etc.) exported from runtime.cjs for use by standalone connector adapters

provides:
  - thrunt-tools init connector CLI command (cmdInitConnector)
  - renderTemplate() engine with {{#IF_KEY}} conditional blocks and {{KEY}} substitution
  - 8 connector scaffold template files in thrunt-god/templates/connector/
  - Generated adapters pass validateConnectorAdapter() contract check immediately after scaffold
  - Interactive mode via node:readline/promises for no-args invocation
  - --dry-run mode returns JSON manifest without writing files
  - Docker integration test generation (append mode for docker-compose.yml, seed-data.cjs, helpers.cjs)
  - Port auto-assignment by scanning docker-compose.yml for next available 19xxx port

affects:
  - 35-pack-authoring-cli
  - connector-plugin-sdk-spec (Phase 45+)

# Tech tracking
tech-stack:
  added: [node:readline/promises for interactive mode]
  patterns:
    - "renderTemplate: {{VARIABLE}} substitution and {{#IF_KEY}}...{{/IF_KEY}} block conditionals"
    - "append-before-exports mode: insert content before module.exports, then patch exports object"
    - "cmdPackInit precedent: validate -> compute vars -> build manifest -> dry-run check -> write files -> post-scaffold validation -> output"

key-files:
  created:
    - thrunt-god/templates/connector/adapter.cjs.tmpl
    - thrunt-god/templates/connector/unit-test.cjs.tmpl
    - thrunt-god/templates/connector/integration-test.cjs.tmpl
    - thrunt-god/templates/connector/docker-compose.yml.tmpl
    - thrunt-god/templates/connector/seed-data.cjs.tmpl
    - thrunt-god/templates/connector/helpers-entry.cjs.tmpl
    - thrunt-god/templates/connector/smoke-spec.cjs.tmpl
    - thrunt-god/templates/connector/README.md.tmpl
  modified:
    - thrunt-god/bin/lib/commands.cjs (added renderTemplate, toPascalCase, parseConnectorArgs, toTitleCase, cmdInitConnector)
    - thrunt-god/bin/thrunt-tools.cjs (added 'connector' case in init switch, updated usage block and error message)

key-decisions:
  - "TMPL-NO-DEPS: Plain {{VARIABLE}} substitution with {{#IF_KEY}} conditionals — no third-party template library (Handlebars, EJS, Mustache). Aligns with project zero-dependency philosophy."
  - "ADAPTER-STANDALONE: Generated adapters are separate .cjs files in connectors/ directory, not inline in runtime.cjs — keeps the monolithic file manageable; scaffolder prints registration instructions"
  - "PORT-AUTOSCAN: Docker host port auto-assigned by scanning docker-compose.yml for highest 19xxx port and incrementing, starting from 19300 if none exist"
  - "APPEND-BEFORE-EXPORTS: seed-data.cjs and helpers.cjs use append-before-exports mode — insert at last module.exports boundary and patch the exports object with new symbol"

patterns-established:
  - "Connector scaffold pattern: adapter.cjs.tmpl generates factory function with all 4 required methods (preflight, prepareQuery, executeRequest, normalizeResponse) and passes validateConnectorAdapter() immediately"
  - "Template variable naming: CONNECTOR_ID, CONNECTOR_FUNCTION_NAME, ENV_PREFIX, HAS_DOCKER, HAS_SMOKE as boolean for conditionals"

requirements-completed: [INIT-01]

# Metrics
duration: 7min
completed: 2026-03-30
---

# Phase 34 Plan 01: Connector Scaffolding CLI Summary

**`thrunt-tools init connector <id>` command with 8 template files, renderTemplate engine, interactive readline mode, Docker integration test generation, and post-scaffold validateConnectorAdapter() contract check**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-30T19:31:22Z
- **Completed:** 2026-03-30T19:37:46Z
- **Tasks:** 2 of 2
- **Files modified:** 10 (8 created templates + 2 modified CLI files)

## Accomplishments
- 8 template files in thrunt-god/templates/connector/ using {{VARIABLE}} and {{#IF_KEY}} syntax, no third-party template libraries
- cmdInitConnector command with full input validation (ID format regex, collision check against built-in registry, AUTH_TYPES/DATASET_KINDS/PAGINATION_MODES enum validation), interactive readline/promises mode, --dry-run mode, Docker integration test generation with append mode for 3 existing files, post-scaffold contract validation
- Generated adapters pass validateConnectorAdapter() immediately after scaffold (contract_validation.valid === true in all tests)
- All 1,877 existing tests pass unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create template engine and 8 connector template files** - `44a98a4` (feat)
2. **Task 2: Implement cmdInitConnector command with validation, generation, interactive mode, and routing** - `f75b555` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `thrunt-god/templates/connector/adapter.cjs.tmpl` - Adapter factory template with 4 functions, runtime SDK calls, and manifest export
- `thrunt-god/templates/connector/unit-test.cjs.tmpl` - Unit test using startJsonServer mock pattern and validateConnectorAdapter check
- `thrunt-god/templates/connector/integration-test.cjs.tmpl` - Docker integration test with skipIfNoDocker/waitForHealthy pattern
- `thrunt-god/templates/connector/docker-compose.yml.tmpl` - YAML service entry fragment for append mode
- `thrunt-god/templates/connector/seed-data.cjs.tmpl` - Seed function stub that maps SEED_EVENTS to backend API
- `thrunt-god/templates/connector/helpers-entry.cjs.tmpl` - URL constant line for helpers.cjs append
- `thrunt-god/templates/connector/smoke-spec.cjs.tmpl` - Smoke spec object entry fragment
- `thrunt-god/templates/connector/README.md.tmpl` - Connector documentation with fill-in guidance for all 4 functions
- `thrunt-god/bin/lib/commands.cjs` - Added renderTemplate, toPascalCase, toTitleCase, parseConnectorArgs, cmdInitConnector (exported)
- `thrunt-god/bin/thrunt-tools.cjs` - Added 'connector' case in init switch, updated usage block and default error message

## Decisions Made
- TMPL-NO-DEPS: Plain {{VARIABLE}} substitution — no Handlebars/EJS/Mustache. Zero new dependencies.
- ADAPTER-STANDALONE: Generated adapters go in connectors/ directory as separate .cjs files. Scaffolder prints registration instructions rather than patching runtime.cjs automatically.
- PORT-AUTOSCAN: Docker host port scanning finds highest 19xxx port in docker-compose.yml and increments by 1; starts from 19300 if no 19xxx ports exist.
- APPEND-BEFORE-EXPORTS: For seed-data.cjs and helpers.cjs, content is inserted at the last module.exports boundary and the exports object is patched with the new symbol name.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `thrunt-tools init connector <id>` is fully operational
- Developers can scaffold a complete connector adapter with one command
- Generated adapters pass structural validation immediately — ready for filling in the 4 TODO functions
- Phase 35 (pack authoring CLI) can proceed without blocking on this phase

## Self-Check: PASSED

- FOUND: thrunt-god/templates/connector/adapter.cjs.tmpl
- FOUND: thrunt-god/templates/connector/unit-test.cjs.tmpl
- FOUND: thrunt-god/templates/connector/integration-test.cjs.tmpl
- FOUND: thrunt-god/templates/connector/docker-compose.yml.tmpl
- FOUND: thrunt-god/templates/connector/seed-data.cjs.tmpl
- FOUND: thrunt-god/templates/connector/helpers-entry.cjs.tmpl
- FOUND: thrunt-god/templates/connector/smoke-spec.cjs.tmpl
- FOUND: thrunt-god/templates/connector/README.md.tmpl
- FOUND: .planning/phases/34-connector-scaffolding-cli/34-01-SUMMARY.md
- FOUND commit: 44a98a4 (Task 1: 8 template files)
- FOUND commit: f75b555 (Task 2: cmdInitConnector)

---
*Phase: 34-connector-scaffolding-cli*
*Completed: 2026-03-30*
